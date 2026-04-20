import Anthropic from '@anthropic-ai/sdk'
import { NextRequest, NextResponse } from 'next/server'

const client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY })

const TYPE_PROMPTS: Record<string, string> = {
  hook:        'Genera 3 hooks de apertura impactantes (primera frase que detiene el scroll). Deben ser directos, generar curiosidad o identificación emocional. Máximo 1 línea cada uno.',
  titulo:      'Genera 3 títulos atractivos para una pieza de contenido. Claros, específicos y orientados a la acción o al beneficio.',
  descripcion: 'Genera 1 descripción/guión completo para esta pieza de contenido. Incluye desarrollo del tema, datos o historia, y llamado a la acción al final. Tono profesional pero cercano.',
  cta:         'Genera 3 CTAs (llamados a la acción) poderosos y específicos. Deben crear urgencia o deseo sin sonar desesperados.',
  promocion:   'Genera 2 ideas de promociones o packs con nombre, precio orientativo, elementos incluidos y fecha límite sugerida. Orientadas a conversión inmediata.',
  campana:     'Genera 1 concepto de campaña completa: nombre de campaña, concepto rector, 3 piezas de contenido que la forman, objetivo, y métricas de éxito.',
  eslogan:     'Genera 5 slogans creativos y memorables. Deben ser cortos (máx 7 palabras), diferenciadores y representar el valor único del negocio.',
  dialogo:     'Genera 1 guión de diálogo para video o reel. Incluye tono, situación, locución narrada y textos en pantalla sugeridos.',
}

export async function POST(req: NextRequest) {
  try {
    const body = await req.json()
    const { type, pillar, format, service, companyName, context, platform, funnel } = body

    if (!type || !TYPE_PROMPTS[type]) {
      return NextResponse.json({ error: 'Tipo inválido' }, { status: 400 })
    }

    const systemPrompt = `Eres un experto en marketing digital para PYMES latinoamericanas.
Escribes contenido en español, con tono profesional pero cercano, adaptado a redes sociales (Instagram, TikTok, Facebook).
Conoces estrategias de embudo de conversión TOFU-MOFU-BOFU y marketing de contenidos.
Nunca uses emojis en exceso. Sé específico, directo y orientado a resultados.
No uses frases genéricas como "¡Hola a todos!" o "Espero que estén bien".`

    const userPrompt = `${TYPE_PROMPTS[type]}

CONTEXTO:
- Empresa/Marca: ${companyName || 'la empresa'}
- Pilar de contenido: ${pillar || 'no especificado'}
- Formato: ${format || 'no especificado'}
- Plataforma: ${platform || 'Instagram'}
- Etapa del funnel: ${funnel || 'TOFU'}
- Servicio o tema: ${service || 'no especificado'}
${context ? `- Contexto adicional: ${context}` : ''}

Responde solo con el contenido solicitado, sin explicaciones previas ni encabezados innecesarios.`

    const message = await client.messages.create({
      model: 'claude-haiku-4-5-20251001',
      max_tokens: 800,
      messages: [{ role: 'user', content: userPrompt }],
      system: systemPrompt,
    })

    const text = message.content[0].type === 'text' ? message.content[0].text : ''
    return NextResponse.json({ result: text })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
