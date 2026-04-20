import { createServiceClient } from '@/lib/supabase/service'
import { sendWhatsApp }        from '@/lib/whatsapp/client'

export interface WorkerResult {
  processed:  number
  sent:       number
  failed:     number
  skipped:    number
  durationMs: number
  errors:     string[]
}

interface QueueMessage {
  id:          string
  company_id:  string
  campaign_id: string | null
  customer_id: string | null
  first_name:  string | null
  last_name:   string | null
  to_phone:    string
  message:     string
  status:      string
}

const BATCH_SIZE   = 50   // mensajes por ejecución
const MAX_ERRORS   = 10   // abortar si hay demasiados fallos seguidos

// ─── Función principal ────────────────────────────────────────────────────────

export async function runQueueWorker(): Promise<WorkerResult> {
  const startedAt = Date.now()
  const supabase  = createServiceClient()

  const result: WorkerResult = {
    processed: 0, sent: 0, failed: 0, skipped: 0, durationMs: 0, errors: [],
  }

  // 1. Intentar claim atómico con RPC (evita condiciones de carrera)
  //    Si el RPC no existe en la DB, se usa el fallback de query directa.
  const { data: claimed, error: claimErr } = await supabase
    .rpc('claim_pending_messages', { p_batch_size: BATCH_SIZE })

  const messages: QueueMessage[] = claimErr
    ? await fetchAndClaimFallback(supabase)
    : (claimed ?? [])

  if (!messages.length) {
    result.durationMs = Date.now() - startedAt
    return result
  }

  // 2. Procesar cada mensaje
  let consecutiveErrors = 0

  for (const msg of messages) {
    if (consecutiveErrors >= MAX_ERRORS) {
      result.skipped += messages.length - result.processed
      break
    }

    result.processed++

    const phone = (msg.to_phone ?? '').replace(/\D/g, '')
    if (!phone || phone.length < 8) {
      await markMessage(supabase, msg.id, 'failed')
      result.failed++
      consecutiveErrors++
      result.errors.push(`msg ${msg.id}: número inválido "${msg.to_phone}"`)
      continue
    }

    const waResult = await sendWhatsApp({
      messageId:    msg.id,
      to:           phone,
      body:         msg.message,
      customerName: [msg.first_name, msg.last_name].filter(Boolean).join(' ') || undefined,
    })

    await markMessage(supabase, msg.id, waResult.success ? 'sent' : 'failed')

    if (waResult.success) {
      result.sent++
      consecutiveErrors = 0
    } else {
      result.failed++
      consecutiveErrors++
      if (waResult.error) result.errors.push(`msg ${msg.id}: ${waResult.error}`)
    }
  }

  // 3. Actualizar sent_count en las campañas afectadas
  //    Pasamos todos los mensajes procesados (enviados + fallidos) para
  //    obtener los campaign_ids; refreshCampaignCounts consulta la DB directamente.
  const processedMessages = messages.slice(0, result.processed)
  await refreshCampaignCounts(supabase, processedMessages)

  result.durationMs = Date.now() - startedAt
  return result
}

// ─── Fallback: sin RPC de claim atómico ──────────────────────────────────────
// Seguro solo si hay un único worker activo a la vez (suficiente con cron cada 5 min).

async function fetchAndClaimFallback(
  supabase: ReturnType<typeof createServiceClient>,
): Promise<QueueMessage[]> {
  const { data, error } = await supabase
    .from('crm_message_queue')
    .select('id, company_id, campaign_id, customer_id, first_name, last_name, to_phone, message, status')
    .eq('status', 'pending')
    .order('created_at', { ascending: true })
    .limit(BATCH_SIZE)

  if (error || !data?.length) return []

  // Marcar como 'processing' en bloque antes de procesar
  const ids = data.map((m: QueueMessage) => m.id)
  await supabase
    .from('crm_message_queue')
    .update({ status: 'processing' })
    .in('id', ids)
    .eq('status', 'pending')

  return data as QueueMessage[]
}

// ─── Helpers ──────────────────────────────────────────────────────────────────

async function markMessage(
  supabase: ReturnType<typeof createServiceClient>,
  id:       string,
  status:   'sent' | 'failed',
) {
  await supabase
    .from('crm_message_queue')
    .update({
      status,
      ...(status === 'sent' ? { sent_at: new Date().toISOString() } : {}),
    })
    .eq('id', id)
}

async function refreshCampaignCounts(
  supabase:  ReturnType<typeof createServiceClient>,
  messages:  QueueMessage[],
) {
  // Obtener IDs únicos de campañas afectadas
  const campaignIds = [...new Set(messages.map(m => m.campaign_id).filter(Boolean))] as string[]
  if (!campaignIds.length) return

  for (const campaignId of campaignIds) {
    // Contar mensajes enviados para esta campaña
    const { count: sentCount } = await supabase
      .from('crm_message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .eq('status', 'sent')

    // Contar pendientes para saber si la campaña terminó
    const { count: pendingCount } = await supabase
      .from('crm_message_queue')
      .select('*', { count: 'exact', head: true })
      .eq('campaign_id', campaignId)
      .in('status', ['pending', 'processing'])

    const isComplete = (pendingCount ?? 0) === 0

    await supabase
      .from('crm_campaigns')
      .update({
        sent_count:   sentCount ?? 0,
        status:       isComplete ? 'completed' : 'running',
        ...(isComplete ? { completed_at: new Date().toISOString() } : {}),
      })
      .eq('id', campaignId)
  }
}
