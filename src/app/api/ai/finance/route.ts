import { NextRequest, NextResponse } from 'next/server'
import { createServerClient } from '@supabase/ssr'
import { cookies } from 'next/headers'

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

    const { summary, period } = await req.json()
    if (!summary) {
      return NextResponse.json({ error: 'Datos insuficientes' }, { status: 400 })
    }

    const apiKey = process.env.ANTHROPIC_API_KEY
    if (!apiKey) {
      return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })
    }

    const fmtCLP = (n: number) =>
      '$' + Math.round(n || 0).toLocaleString('es-CL')

    const netPositive = (summary.net_flow || 0) >= 0
    const ratio =
      summary.sales_total > 0
        ? Math.round((summary.expenses_total / summary.sales_total) * 100)
        : null

    const systemPrompt = `Eres el asistente financiero de Mosaico Pro, un sistema de gestión para negocios chilenos (botillerías y retail).
Analiza los datos financieros que te dan y genera un análisis conciso, directo y útil para el dueño del negocio.
Habla en español chileno informal pero profesional. Usa emojis relevantes.
Tu respuesta DEBE ser JSON válido con exactamente estos campos:
- insight: string con 2-3 oraciones resumiendo la situación financiera
- alerts: array de strings (máximo 3 alertas importantes, puede ser vacío [])
- insights_list: array de strings (máximo 4 puntos clave observados, puede ser vacío [])
- suggestions: array de strings (máximo 3 sugerencias accionables, puede ser vacío [])
NO incluyas texto fuera del JSON. NO uses bloques markdown.`

    const byCategory = (summary.by_category || [])
      .map((c: any) => `  - ${c.category}: ${fmtCLP(c.total)} (${c.count} registro${c.count !== 1 ? 's' : ''})`)
      .join('\n')

    const byDay = (summary.by_day || [])
      .slice(-7)
      .map((d: any) => `  - ${d.date}: ventas ${fmtCLP(d.sales)}, gastos ${fmtCLP(d.expenses)}, neto ${d.net >= 0 ? '+' : ''}${fmtCLP(d.net)}`)
      .join('\n')

    const userMessage = `Período analizado: ${period}

RESUMEN FINANCIERO:
- Ventas totales: ${fmtCLP(summary.sales_total)}
- Gastos totales: ${fmtCLP(summary.expenses_total)}
- Flujo neto: ${summary.net_flow >= 0 ? '+' : ''}${fmtCLP(summary.net_flow)} (${netPositive ? 'POSITIVO' : 'DÉFICIT'})
${ratio !== null ? `- Ratio gastos/ventas: ${ratio}%` : ''}

GASTOS POR CATEGORÍA:
${byCategory || '  (sin datos)'}

ÚLTIMOS 7 DÍAS (ventas vs gastos):
${byDay || '  (sin datos)'}

Genera el análisis financiero en JSON.`

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': apiKey,
        'anthropic-version': '2023-06-01',
      },
      body: JSON.stringify({
        model: 'claude-haiku-4-5-20251001',
        max_tokens: 900,
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
    const rawText  = aiResult.content?.[0]?.text || '{}'

    let parsed: any
    try {
      // Intentar parsear directamente
      parsed = JSON.parse(rawText)
    } catch {
      // Si viene envuelto en markdown, extraer el JSON
      const jsonMatch = rawText.match(/\{[\s\S]*\}/)
      try {
        parsed = jsonMatch ? JSON.parse(jsonMatch[0]) : null
      } catch {
        parsed = null
      }
    }

    if (!parsed) {
      // Fallback: devolver el texto crudo como insight
      parsed = {
        insight: rawText.slice(0, 400),
        alerts: [],
        insights_list: [],
        suggestions: [],
      }
    }

    return NextResponse.json(parsed)
  } catch (err: any) {
    console.error('Finance AI route error:', err)
    return NextResponse.json({ error: err.message || 'Error interno' }, { status: 500 })
  }
}
