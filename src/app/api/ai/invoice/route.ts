import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'

export async function POST(req: NextRequest) {
  // ── 1. Verificar sesión ───────────────────────────────────────────────────
  const serverClient = await createClient()
  const { data: { user } } = await serverClient.auth.getUser()
  if (!user) {
    return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
  }

  // ── 2. Verificar API key configurada ─────────────────────────────────────
  const apiKey = process.env.ANTHROPIC_API_KEY
  if (!apiKey) {
    return NextResponse.json({ error: 'API key no configurada' }, { status: 500 })
  }

  // ── 3. Leer payload ───────────────────────────────────────────────────────
  const { base64, mediaType } = await req.json() as {
    base64: string
    mediaType: string
  }

  if (!base64 || !mediaType) {
    return NextResponse.json({ error: 'Faltan parámetros' }, { status: 400 })
  }

  const isImage = mediaType.startsWith('image/')
  const isPDF   = mediaType === 'application/pdf'

  if (!isImage && !isPDF) {
    return NextResponse.json({ error: 'Tipo de archivo no soportado' }, { status: 400 })
  }

  // ── 4. Llamar a Anthropic ─────────────────────────────────────────────────
  const anthropicRes = await fetch('https://api.anthropic.com/v1/messages', {
    method: 'POST',
    headers: {
      'Content-Type':      'application/json',
      'x-api-key':         apiKey,
      'anthropic-version': '2023-06-01',
    },
    body: JSON.stringify({
      model:      'claude-haiku-4-5-20251001',
      max_tokens: 1024,
      messages: [{
        role: 'user',
        content: [
          {
            type:   isImage ? 'image' : 'document',
            source: { type: 'base64', media_type: mediaType, data: base64 },
          },
          {
            type: 'text',
            text: `Analiza esta factura o documento comercial y extrae todos los productos que aparecen.
Responde ÚNICAMENTE con un array JSON válido, sin texto adicional ni backticks.
Formato exacto requerido:
[
  {
    "name": "nombre del producto",
    "sku": "código si existe o vacío",
    "quantity": número,
    "unit_price": precio unitario neto,
    "total": total de la línea
  }
]
Si no puedes identificar productos, responde con: []`,
          },
        ],
      }],
    }),
  })

  if (!anthropicRes.ok) {
    const err = await anthropicRes.text()
    console.error('Anthropic error:', err)
    return NextResponse.json({ error: 'Error al procesar con IA' }, { status: 502 })
  }

  const result = await anthropicRes.json()
  const text   = result.content?.find((c: { type: string }) => c.type === 'text')?.text || '[]'
  const clean  = text.replace(/```json|```/g, '').trim()

  try {
    const parsed = JSON.parse(clean)
    return NextResponse.json({ products: Array.isArray(parsed) ? parsed : [] })
  } catch {
    return NextResponse.json({ products: [] })
  }
}
