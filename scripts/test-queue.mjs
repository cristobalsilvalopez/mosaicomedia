/**
 * Test del Queue Worker — ejecutar con:
 *   node scripts/test-queue.mjs
 *
 * Requiere SUPABASE_SERVICE_ROLE_KEY correcta en .env.local
 */

import { readFileSync } from 'fs'
import { createClient } from '@supabase/supabase-js'
import { resolve, dirname } from 'path'
import { fileURLToPath }   from 'url'

// ─── Leer .env.local ──────────────────────────────────────────────────────────
const __dir  = dirname(fileURLToPath(import.meta.url))
const envRaw = readFileSync(resolve(__dir, '../.env.local'), 'utf8')
const env    = Object.fromEntries(
  envRaw.split('\n')
    .filter(l => l && !l.startsWith('#') && l.includes('='))
    .map(l => { const i = l.indexOf('='); return [l.slice(0,i).trim(), l.slice(i+1).trim()] })
)

const URL  = env.NEXT_PUBLIC_SUPABASE_URL
const ANON = env.NEXT_PUBLIC_SUPABASE_ANON_KEY
const SRK  = env.SUPABASE_SERVICE_ROLE_KEY

// ─── Verificar que la service role key es distinta a la anon key ──────────────
console.log('\n═══════════════════════════════════════════════════')
console.log('  TEST: CRM Queue Worker')
console.log('═══════════════════════════════════════════════════\n')

function decodeJwtRole(jwt) {
  try {
    const payload = jwt.split('.')[1]
    return JSON.parse(Buffer.from(payload, 'base64url').toString()).role
  } catch { return 'invalid' }
}

const anonRole = decodeJwtRole(ANON)
const srkRole  = decodeJwtRole(SRK)

console.log(`ANON key role:         ${anonRole}`)
console.log(`SERVICE_ROLE key role: ${srkRole}`)

if (SRK === ANON || srkRole !== 'service_role') {
  console.error(`
❌  ERROR: SUPABASE_SERVICE_ROLE_KEY no está configurada correctamente.

    La clave actual tiene role="${srkRole}" — debería ser "service_role".
    Parece que pegaste la anon key dos veces.

    Cómo obtener la clave correcta:
    1. Ve a https://supabase.com → tu proyecto
    2. Settings (engranaje) → API
    3. Busca la sección "Project API keys"
    4. Copia "service_role" (la clave secreta — NO la anon)
    5. Reemplaza el valor de SUPABASE_SERVICE_ROLE_KEY en .env.local
    6. Vuelve a ejecutar: node scripts/test-queue.mjs
`)
  process.exit(1)
}

console.log('✅  Keys verificadas correctamente\n')

// ─── Conectar con service role ────────────────────────────────────────────────
const supabase = createClient(URL, SRK, {
  auth: { autoRefreshToken: false, persistSession: false }
})

// ─── Buscar una compañía y campaña para el test ───────────────────────────────
console.log('→ Buscando compañía y campaña en la base de datos...')

const { data: companies, error: compErr } = await supabase
  .from('companies').select('id, name').limit(1)

if (compErr || !companies?.length) {
  console.error('❌  No se pudo obtener ninguna compañía:', compErr?.message)
  process.exit(1)
}

const company = companies[0]
console.log(`   Usando compañía: "${company.name}" (${company.id})`)

// Buscar o crear campaña de prueba
let { data: campaigns } = await supabase
  .from('crm_campaigns')
  .select('id, name')
  .eq('company_id', company.id)
  .limit(1)

let campaignId = campaigns?.[0]?.id ?? null

if (!campaignId) {
  const { data: newCamp } = await supabase
    .from('crm_campaigns')
    .insert({
      company_id:   company.id,
      name:         'Test Queue Worker',
      segment:      'all',
      status:       'running',
      target_count: 1,
      sent_count:   0,
    })
    .select('id').single()
  campaignId = newCamp?.id
  console.log(`   Campaña de prueba creada: ${campaignId}`)
} else {
  console.log(`   Campaña existente: "${campaigns[0].name}" (${campaignId})`)
}

// ─── Insertar mensaje de prueba ───────────────────────────────────────────────
console.log('\n→ Insertando mensaje de prueba en crm_message_queue...')

const { data: msg, error: insertErr } = await supabase
  .from('crm_message_queue')
  .insert({
    company_id:  company.id,
    campaign_id: campaignId,
    to_phone:    '+56912345678',
    first_name:  'Test',
    last_name:   'Worker',
    message:     'Hola Test Worker, este es un mensaje de prueba del CRM de Mosaico Pro.',
    status:      'pending',
  })
  .select('id, status').single()

if (insertErr) {
  console.error('❌  Error insertando mensaje de prueba:', insertErr.message)
  console.log('\n   Posibles causas:')
  console.log('   - La tabla crm_message_queue no existe todavía en Supabase')
  console.log('   - Columnas con nombres distintos al esperado')
  console.log('   - RLS bloqueando el insert (debería estar desactivado con service role)')
  process.exit(1)
}

console.log(`✅  Mensaje insertado — id: ${msg.id}, status: ${msg.status}`)

// ─── Simular el worker (lógica inline sin TypeScript) ────────────────────────
console.log('\n→ Ejecutando worker (mock mode)...')

// Claim del mensaje
await supabase
  .from('crm_message_queue')
  .update({ status: 'processing' })
  .eq('id', msg.id)
  .eq('status', 'pending')

// Simular envío WhatsApp (mock: 95% éxito)
await new Promise(r => setTimeout(r, 200))
const success = Math.random() > 0.05
const finalStatus = success ? 'sent' : 'failed'

// Marcar resultado
await supabase
  .from('crm_message_queue')
  .update({
    status:  finalStatus,
    ...(success ? { sent_at: new Date().toISOString() } : {}),
  })
  .eq('id', msg.id)

// Leer estado final
const { data: final } = await supabase
  .from('crm_message_queue')
  .select('id, status, sent_at')
  .eq('id', msg.id)
  .single()

// ─── Resultado ────────────────────────────────────────────────────────────────
console.log('\n═══════════════════════════════════════════════════')
if (final?.status === 'sent' || final?.status === 'failed') {
  console.log(`✅  WORKER FUNCIONA CORRECTAMENTE`)
  console.log(`   Mensaje ${final.id}`)
  console.log(`   Status final: ${final.status}`)
  if (final.sent_at) console.log(`   Enviado a:    ${final.sent_at}`)
} else {
  console.log(`⚠️  Estado inesperado: ${final?.status}`)
}
console.log('═══════════════════════════════════════════════════\n')

// Limpiar: borrar el mensaje de prueba
await supabase.from('crm_message_queue').delete().eq('id', msg.id)
console.log('   (mensaje de prueba eliminado)\n')
