import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const MONTH_NAMES = [
  'Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre',
]

const CAUSE_LABELS: Record<string, string> = {
  mutuo_acuerdo:    'Mutuo Acuerdo (Art. 159 N°1)',
  renuncia:         'Renuncia Voluntaria (Art. 159 N°2)',
  termino_plazo:    'Término de Contrato a Plazo Fijo (Art. 159 N°4)',
  termino_obra:     'Término de Obra o Faena (Art. 159 N°5)',
  articulo_160:     'Despido por Causal (Art. 160)',
  articulo_161_1:   'Necesidades de la Empresa (Art. 161 inc. 1)',
  articulo_161_2:   'Desahucio (Art. 161 inc. 2)',
  otro:             'Otra causal',
}

function fmt(n: number): string {
  return '$' + Math.round(n || 0).toLocaleString('es-CL')
}

export async function POST(req: NextRequest) {
  try {
    const cookieStore = await cookies()
    const supabase = createServerClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
      { cookies: { get: (n: string) => cookieStore.get(n)?.value } }
    )

    const { data: { session } } = await supabase.auth.getSession()
    if (!session) return NextResponse.json({ error: 'No autorizado' }, { status: 401 })

    const { action, payload } = await req.json()
    if (!action || !payload) return NextResponse.json({ error: 'Datos insuficientes' }, { status: 400 })

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })

    let systemPrompt = ''
    let userMessage  = ''
    let maxTokens    = 1500

    if (action === 'explain_liquidacion') {
      const { doc, period, company } = payload
      const monthName = MONTH_NAMES[(period?.period_month || 1) - 1]
      const items: Array<{ label: string; type: string; amount: number }> = doc?.items || []
      const habImpon  = items.filter((i) => i.type === 'haber_imponible')
      const habNoImp  = items.filter((i) => i.type === 'haber_no_imponible')
      const descuentos = items.filter((i) => i.type === 'descuento')

      systemPrompt = `Eres el asistente de RRHH de Mosaico Pro. Explicas liquidaciones de sueldo en español simple y claro para el trabajador chileno.
Tu respuesta DEBE ser JSON con exactamente:
- resumen: string con explicación en 3-4 oraciones del contenido de la liquidación
- haberes_explicacion: string explicando los haberes de forma clara
- descuentos_explicacion: string explicando los descuentos legales y por qué existen
- liquido_explicacion: string explicando cómo se llegó al líquido a pagar
- observaciones: array de strings con alertas o puntos de atención (puede ser vacío)
Sin texto fuera del JSON.`

      userMessage = `Explica esta liquidación de sueldo:

EMPRESA: ${company?.name || 'Empresa'}
TRABAJADOR: ${doc?.employee_name || '—'} (RUT: ${doc?.employee_rut || '—'})
CARGO: ${doc?.position || '—'} | ${doc?.contract_type || '—'} | ${doc?.hours_per_week || 45}h/semana
PERÍODO: ${monthName} ${period?.period_year || '—'}

SUELDO BASE: ${fmt(doc?.base_salary || 0)}
${habImpon.length > 0 ? 'HABERES IMPONIBLES:\n' + habImpon.map((i) => `  - ${i.label}: ${fmt(i.amount)}`).join('\n') : ''}
${habNoImp.length > 0 ? 'HABERES NO IMPONIBLES:\n' + habNoImp.map((i) => `  - ${i.label}: ${fmt(i.amount)}`).join('\n') : ''}
${descuentos.length > 0 ? 'DESCUENTOS ADICIONALES:\n' + descuentos.map((i) => `  - ${i.label}: ${fmt(i.amount)}`).join('\n') : ''}

TOTALES CALCULADOS:
- Total imponible: ${fmt(doc?.total_imponible || 0)}
- Total bruto: ${fmt(doc?.total_bruto || 0)}
- AFP: ${fmt(doc?.descuento_afp || 0)}
- Salud: ${fmt(doc?.descuento_salud || 0)}
- Cesantía: ${fmt(doc?.descuento_cesantia || 0)}
- LÍQUIDO A PAGAR: ${fmt(doc?.total_liquido || 0)}
- Costo total empresa: ${fmt(doc?.costo_total_empresa || 0)}

Explica en JSON.`
    }

    else if (action === 'compare_periods') {
      const { current, previous, employee_name } = payload
      maxTokens = 800

      systemPrompt = `Eres un analista de RRHH. Comparas liquidaciones entre dos períodos y explicas los cambios en español simple.
Responde SOLO con JSON:
- resumen: string con el análisis comparativo (2-3 oraciones)
- cambios: array de strings describiendo cada cambio significativo
- conclusion: string con conclusión sobre si el cambio es normal, favorable o preocupante
Sin texto fuera del JSON.`

      userMessage = `Compara las liquidaciones de ${employee_name || 'el trabajador'}:

PERÍODO ACTUAL:
- Bruto: ${fmt(current?.total_bruto || 0)}
- AFP: ${fmt(current?.descuento_afp || 0)}
- Salud: ${fmt(current?.descuento_salud || 0)}
- Líquido: ${fmt(current?.total_liquido || 0)}

PERÍODO ANTERIOR:
- Bruto: ${fmt(previous?.total_bruto || 0)}
- AFP: ${fmt(previous?.descuento_afp || 0)}
- Salud: ${fmt(previous?.descuento_salud || 0)}
- Líquido: ${fmt(previous?.total_liquido || 0)}

Diferencia líquido: ${fmt((current?.total_liquido || 0) - (previous?.total_liquido || 0))}`
    }

    else if (action === 'generate_finiquito') {
      const { sev, company } = payload
      const causeLabel = CAUSE_LABELS[sev?.termination_cause] || sev?.termination_cause || 'Mutuo Acuerdo'
      maxTokens = 3500

      systemPrompt = `Eres un abogado laboralista chileno. Redactas finiquitos laborales bajo el Código del Trabajo de Chile, en español formal y legal.
Tu respuesta DEBE ser JSON con exactamente:
- document_text: string con el texto completo del finiquito (usa \\n para separar secciones, sin markdown)
- legal_notes: array de strings con observaciones legales importantes
- warnings: array de strings con advertencias sobre la causal o montos
Sin texto fuera del JSON.`

      userMessage = `Genera el finiquito de trabajo para:

EMPRESA: ${company?.name || 'Empresa'} (RUT: ${company?.rut || 'Por completar'})
TRABAJADOR: ${sev?.employee_name || '—'} (RUT: ${sev?.employee_rut || '—'})
CARGO: ${sev?.position || '—'}
FECHA INGRESO: ${sev?.hire_date || '—'}
FECHA TÉRMINO: ${sev?.termination_date || '—'}
CAUSAL: ${causeLabel}
SUELDO BASE: ${fmt(sev?.base_salary || 0)}

MONTOS DEL FINIQUITO:
- Días de vacaciones pendientes: ${sev?.pending_vacation_days || 0} días = ${fmt(sev?.vacation_amount || 0)}
${(sev?.severance_months || 0) > 0 ? `- Indemnización: ${sev?.severance_months || 0} meses = ${fmt(sev?.severance_amount || 0)}` : '- Sin indemnización'}
${(sev?.pending_salary_days || 0) > 0 ? `- Días trabajados del mes: ${sev?.pending_salary_days || 0} días = ${fmt(sev?.pending_salary_amount || 0)}` : ''}
- TOTAL FINIQUITO: ${fmt(sev?.total_amount || 0)}
${sev?.notes ? `NOTAS: ${sev.notes}` : ''}

Genera el finiquito completo en JSON.`
    }

    else if (action === 'detect_inconsistencies') {
      const { docs, params } = payload
      maxTokens = 800

      systemPrompt = `Eres un analista de RRHH chileno. Detectas inconsistencias o anomalías en liquidaciones de sueldo.
Responde SOLO con JSON:
- has_issues: boolean
- issues: array de strings con inconsistencias detectadas
- suggestions: array de strings con sugerencias de corrección
Sin texto fuera del JSON.`

      const docsText = (docs || []).slice(0, 10).map((d: Record<string, unknown>) =>
        `${d.employee_name}: bruto ${fmt(Number(d.total_bruto))}, líquido ${fmt(Number(d.total_liquido))}, AFP ${fmt(Number(d.descuento_afp))}, contrato ${d.contract_type}`
      ).join('\n')

      userMessage = `Revisa estas liquidaciones del período:
${docsText}

Parámetros AFP vigentes: ${(Number(params?.afp_rate_worker || 0) * 100).toFixed(2)}%, Salud: ${(Number(params?.health_rate || 0) * 100).toFixed(2)}%, Salario mínimo: ${fmt(Number(params?.minimum_wage || 0))}

Detecta inconsistencias.`
    }

    else if (action === 'payroll_executive_summary') {
      const { periods, company } = payload
      maxTokens = 700

      systemPrompt = `Eres el analista financiero de RRHH de Mosaico Pro. Generas resúmenes ejecutivos de costos laborales.
Responde SOLO con JSON:
- resumen: string con el análisis del costo laboral (2-3 oraciones)
- tendencia: 'creciente' | 'estable' | 'decreciente'
- alertas: array de strings con alertas
- recomendaciones: array de strings con recomendaciones (máx 3)
Sin texto fuera del JSON.`

      const perStr = (periods || []).slice(0, 6).map((p: Record<string, unknown>) =>
        `${MONTH_NAMES[Number(p.period_month) - 1]} ${p.period_year}: ${p.employee_count} emp, líquido ${fmt(Number(p.total_liquido))}, costo empresa ${fmt(Number(p.costo_empresa))}`
      ).join('\n')

      userMessage = `Resumen ejecutivo de costos laborales de ${company?.name || 'la empresa'}:\n\n${perStr}`
    }

    else {
      return NextResponse.json({ error: 'Acción no reconocida' }, { status: 400 })
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-sonnet-4-6',
        max_tokens: maxTokens,
        system: systemPrompt,
        messages: [{ role: 'user', content: userMessage }],
      }),
    })

    if (!response.ok) {
      const errText = await response.text()
      console.error('Anthropic API error:', errText)
      return NextResponse.json({ error: 'Error al llamar API de IA' }, { status: 500 })
    }

    const aiResult = await response.json()
    const rawText  = (aiResult.content?.[0]?.text as string) || '{}'

    let parsed: Record<string, unknown>
    try {
      parsed = JSON.parse(rawText)
    } catch {
      const m = rawText.match(/\{[\s\S]*\}/)
      try { parsed = m ? JSON.parse(m[0]) : {} } catch { parsed = {} }
    }

    if (!parsed || Object.keys(parsed).length === 0) {
      parsed = { resumen: rawText.slice(0, 500) }
    }

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('Remuneraciones AI route error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
