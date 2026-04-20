import { NextRequest }    from 'next/server'
import { runQueueWorker } from '@/lib/crm/queue-worker'

/**
 * POST /api/crm/queue/process
 *
 * Procesa la cola de mensajes pendientes.
 * Requiere la cabecera: Authorization: Bearer <QUEUE_PROCESS_SECRET>
 *
 * También puede ser llamado internamente desde el endpoint de cron
 * (sin necesidad de cabecera, ya que el cron lo invoca desde el mismo proceso).
 */
export async function POST(request: NextRequest) {
  // Siempre requiere autenticación — no hay acceso público al procesador de cola
  const secret = process.env.QUEUE_PROCESS_SECRET
  if (!secret) {
    // En desarrollo se puede omitir el secret, pero en producción es obligatorio
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'QUEUE_PROCESS_SECRET no configurado' }, { status: 500 })
    }
  } else {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${secret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  try {
    const result = await runQueueWorker()

    return Response.json({
      ok: true,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[QueueWorker] Error fatal:', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
