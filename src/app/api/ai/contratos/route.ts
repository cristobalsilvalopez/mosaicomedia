import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

const CONTRACT_LABELS: Record<string, string> = {
  indefinido:  'Contrato de Trabajo Indefinido',
  plazo_fijo:  'Contrato de Trabajo a Plazo Fijo',
  obra_faena:  'Contrato por Obra o Faena Determinada',
  part_time:   'Contrato Part-Time (jornada parcial)',
  temporada:   'Contrato de Temporada',
  aprendizaje: 'Contrato de Aprendizaje',
}

const ANNEX_LABELS: Record<string, string> = {
  salary_change:   'Modificación de Remuneración',
  position_change: 'Cambio de Cargo',
  hours_change:    'Modificación de Jornada Laboral',
  bonus:           'Bono / Incentivo',
  remote_work:     'Acuerdo de Teletrabajo',
  confidentiality: 'Cláusula de Confidencialidad y No Competencia',
  other:           'Anexo de Contrato',
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
    if (!session) {
      return NextResponse.json({ error: 'No autorizado' }, { status: 401 })
    }

    const { action, payload } = await req.json()
    if (!action || !payload) {
      return NextResponse.json({ error: 'Datos insuficientes' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })
    }

    let systemPrompt = ''
    let userMessage  = ''
    let maxTokens    = 1200

    if (action === 'generate_draft') {
      const { employee, contract, company } = payload
      const label = CONTRACT_LABELS[contract.contract_type] || 'Contrato de Trabajo'
      maxTokens = 4000

      systemPrompt = `Eres un abogado laboralista chileno experto en derecho del trabajo. \
Redactas contratos bajo el Código del Trabajo de Chile, en español formal y legal. \
Tu respuesta DEBE ser JSON válido con exactamente estos campos:
- document_text: string con el texto completo del contrato (usa \\n para separar secciones, NO uses markdown)
- validation_notes: array de strings con campos pendientes u observaciones importantes
- suggested_clauses: array de strings con cláusulas adicionales recomendadas
NO incluyas texto fuera del JSON.`

      userMessage = `Genera un ${label} con estos datos:

EMPRESA:
- Razón Social: ${company?.name || 'Por completar'}
- RUT Empresa: ${company?.rut || 'Por completar'}
- Rubro: ${company?.industry || 'Comercio / Retail'}

TRABAJADOR:
- Nombre: ${employee?.first_name || ''} ${employee?.last_name || ''}
- RUT: ${employee?.rut || 'Por completar'}
- Cargo: ${contract?.position || employee?.position || 'Por definir'}
- Departamento: ${contract?.department || employee?.department || 'General'}

CONDICIONES:
- Tipo: ${label}
- Inicio: ${contract?.start_date || 'Por definir'}${contract?.end_date ? `\n- Término: ${contract.end_date}` : ''}
- Remuneración bruta mensual: $${Number(contract?.salary || 0).toLocaleString('es-CL')} CLP
- Horas semanales: ${contract?.hours_per_week || 45}${contract?.notes ? `\n- Notas: ${contract.notes}` : ''}

Genera el contrato completo en JSON.`
    }

    else if (action === 'generate_annex') {
      const { employee, annex, contract, company } = payload
      const label = ANNEX_LABELS[annex?.annex_type] || 'Anexo de Contrato'
      maxTokens = 2500

      systemPrompt = `Eres un abogado laboralista chileno. \
Redactas anexos de contratos bajo el Código del Trabajo de Chile. \
Tu respuesta DEBE ser JSON con exactamente:
- document_text: string con el texto del anexo (\\n para separar, sin markdown)
- validation_notes: array de strings con observaciones
- suggested_clauses: array de strings con cláusulas adicionales recomendadas
NO incluyas texto fuera del JSON.`

      userMessage = `Genera un ${label}:

EMPRESA: ${company?.name || 'Empresa'} (RUT: ${company?.rut || 'Por completar'})
TRABAJADOR: ${employee?.first_name || ''} ${employee?.last_name || ''} (RUT: ${employee?.rut || 'Por completar'})
CARGO: ${employee?.position || 'Por definir'}
CONTRATO BASE: ${CONTRACT_LABELS[contract?.contract_type] || 'Indefinido'} desde ${contract?.start_date || 'N/A'}

TIPO DE ANEXO: ${label}
VIGENCIA: ${annex?.effective_date || 'Por definir'}
DETALLES: ${JSON.stringify(annex?.content || {}, null, 2)}${annex?.notes ? `\nNotas: ${annex.notes}` : ''}

Genera el anexo en JSON.`
    }

    else if (action === 'validate') {
      const { contract, employee } = payload

      systemPrompt = `Eres un abogado laboralista chileno. Valida datos de un contrato de trabajo chileno. \
Responde SOLO con JSON:
- is_valid: boolean
- errors: array de strings con errores críticos
- warnings: array de strings con advertencias
- suggestions: array de strings con mejoras
Sin texto fuera del JSON.`

      userMessage = `Valida este contrato:
Tipo: ${contract?.contract_type || 'N/A'}
Inicio: ${contract?.start_date || 'No especificado'}
Término: ${contract?.end_date || 'N/A'}
Salario: ${contract?.salary || 'No especificado'}
Horas/semana: ${contract?.hours_per_week || 'No especificado'}
RUT trabajador: ${employee?.rut || 'No especificado'}
Cargo: ${contract?.position || 'No especificado'}`
    }

    else if (action === 'summarize') {
      const { document_text } = payload

      systemPrompt = `Eres un asistente legal. Resume contratos laborales chilenos de forma concisa. \
Responde SOLO con JSON:
- summary: string resumen del contrato (máx 200 palabras)
- key_points: array de hasta 5 puntos clave
- alerts: array de alertas o puntos de atención
Sin texto fuera del JSON.`

      userMessage = `Resume este contrato:\n\n${String(document_text || '').slice(0, 3000)}`
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
      parsed = { document_text: rawText, validation_notes: [], suggested_clauses: [] }
    }

    return NextResponse.json(parsed)
  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno'
    console.error('Contratos AI route error:', err)
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
