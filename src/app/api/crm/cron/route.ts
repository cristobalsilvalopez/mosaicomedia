import { NextRequest }    from 'next/server'
import { runQueueWorker } from '@/lib/crm/queue-worker'

/**
 * GET /api/crm/cron
 *
 * Endpoint disparado por Vercel Cron Jobs cada 5 minutos.
 * Vercel envía automáticamente: Authorization: Bearer <CRON_SECRET>
 *
 * También puede invocarse manualmente con el mismo header para testing.
 * Ref: https://vercel.com/docs/cron-jobs
 */
export async function GET(request: NextRequest) {
  const cronSecret = process.env.CRON_SECRET

  if (!cronSecret) {
    // Sin secret configurado: solo permitir en desarrollo local
    if (process.env.NODE_ENV === 'production') {
      return Response.json({ error: 'CRON_SECRET no configurado' }, { status: 500 })
    }
  } else {
    const auth = request.headers.get('authorization')
    if (auth !== `Bearer ${cronSecret}`) {
      return Response.json({ error: 'Unauthorized' }, { status: 401 })
    }
  }

  const startedAt = new Date().toISOString()
  console.log(`[CRM Cron] Iniciando procesamiento de cola — ${startedAt}`)

  try {
    const result = await runQueueWorker()

    console.log(
      `[CRM Cron] Completado — procesados: ${result.processed}, ` +
      `enviados: ${result.sent}, fallidos: ${result.failed}, ` +
      `${result.durationMs}ms`
    )

    return Response.json({
      ok:        true,
      startedAt,
      ...result,
    })
  } catch (err) {
    const message = err instanceof Error ? err.message : 'Error desconocido'
    console.error('[CRM Cron] Error fatal:', message)
    return Response.json({ ok: false, error: message }, { status: 500 })
  }
}
