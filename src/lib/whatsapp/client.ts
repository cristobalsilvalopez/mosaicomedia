/**
 * WhatsApp client — mock en desarrollo, reemplazable por
 * Meta WhatsApp Business API / Twilio en producción.
 *
 * Para activar el modo real, define WHATSAPP_API_URL y
 * WHATSAPP_API_TOKEN en las variables de entorno.
 */

export interface WhatsAppSendParams {
  messageId: string
  to: string       // número internacional solo dígitos, ej: "56912345678"
  body: string
  customerName?: string
}

export interface WhatsAppResult {
  messageId: string
  success:   boolean
  status:    'sent' | 'failed'
  mock:      boolean
  error?:    string
  sentAt:    string
}

// ─── Modo real (Meta Cloud API) ──────────────────────────────────────────────

async function sendReal(params: WhatsAppSendParams): Promise<WhatsAppResult> {
  const url   = process.env.WHATSAPP_API_URL!
  const token = process.env.WHATSAPP_API_TOKEN!

  const res = await fetch(url, {
    method:  'POST',
    headers: {
      'Content-Type':  'application/json',
      'Authorization': `Bearer ${token}`,
    },
    body: JSON.stringify({
      messaging_product: 'whatsapp',
      to:                params.to,
      type:              'text',
      text:              { body: params.body },
    }),
  })

  const sentAt = new Date().toISOString()

  if (!res.ok) {
    const err = await res.text()
    return { messageId: params.messageId, success: false, status: 'failed', mock: false, error: err, sentAt }
  }

  return { messageId: params.messageId, success: true, status: 'sent', mock: false, sentAt }
}

// ─── Modo mock ────────────────────────────────────────────────────────────────

async function sendMock(params: WhatsAppSendParams): Promise<WhatsAppResult> {
  // Simula latencia de red (100 – 400 ms)
  await new Promise(r => setTimeout(r, 100 + Math.random() * 300))

  const phone = params.to.replace(/\D/g, '')
  if (!phone || phone.length < 8) {
    return {
      messageId: params.messageId,
      success:   false,
      status:    'failed',
      mock:      true,
      error:     'Número de teléfono inválido',
      sentAt:    new Date().toISOString(),
    }
  }

  // 95 % de tasa de éxito simulada
  const success = Math.random() > 0.05
  const sentAt  = new Date().toISOString()

  console.log(
    `[WhatsApp Mock] ${success ? '✅' : '❌'} → +${phone} | ` +
    `${params.body.slice(0, 60)}${params.body.length > 60 ? '…' : ''}`
  )

  return {
    messageId: params.messageId,
    success,
    status:    success ? 'sent' : 'failed',
    mock:      true,
    error:     success ? undefined : 'Entrega simulada fallida',
    sentAt,
  }
}

// ─── Función pública ──────────────────────────────────────────────────────────

export async function sendWhatsApp(params: WhatsAppSendParams): Promise<WhatsAppResult> {
  const isReal = !!(process.env.WHATSAPP_API_URL && process.env.WHATSAPP_API_TOKEN)
  return isReal ? sendReal(params) : sendMock(params)
}
