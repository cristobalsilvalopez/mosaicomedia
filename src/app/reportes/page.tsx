'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase = createClient()
const fmt    = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtDT  = (d: string) => new Date(d).toLocaleString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit' })
const fmtD   = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' })
const pct    = (a: number, b: number) => b > 0 ? Math.round((a / b) * 100) : 0

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface SaleRow {
  sale_id: string
  created_at: string
  document_type: string
  channel: string
  cashier_name: string
  subtotal: number
  iva_amount: number
  ila_amount: number
  discount_amount: number
  total: number
  status: string
  payment_methods: string
}

interface Summary {
  total_sales: number
  total_count: number
  avg_ticket: number
  subtotal_net: number
  iva_total: number
  ila_total: number
  discount_total: number
  cash_total: number
  debit_total: number
  credit_total: number
  transfer_total: number
  boleta_count: number
  factura_count: number
  by_day: { date: string; total: number; count: number }[]
  top_products: { name: string; sku: string; qty: number; revenue: number }[]
}

type TabId = 'resumen' | 'ventas' | 'impuestos' | 'productos'

// ─── Helpers ─────────────────────────────────────────────────────────────────

function todayStr() {
  return new Date().toISOString().split('T')[0]
}
function firstOfMonth() {
  const d = new Date()
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-01`
}

// Exportar a CSV y descargar
function downloadCSV(rows: SaleRow[], from: string, to: string) {
  const headers = [
    'Fecha', 'Doc', 'Canal', 'Cajero',
    'Subtotal neto', 'IVA', 'ILA', 'Descuento', 'Total',
    'Medios de pago',
  ]
  const lines = rows.map(r => [
    `"${fmtDT(r.created_at)}"`,
    r.document_type,
    r.channel,
    `"${r.cashier_name}"`,
    r.subtotal,
    r.iva_amount,
    r.ila_amount,
    r.discount_amount,
    r.total,
    `"${r.payment_methods}"`,
  ].join(','))

  const csv = [headers.join(','), ...lines].join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8;' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a')
  a.href     = url
  a.download = `reporte_ventas_${from}_${to}.csv`
  a.click()
  URL.revokeObjectURL(url)
}

// ─── Mini gráfico de barras SVG ───────────────────────────────────────────────

function DayChart({ data }: { data: Summary['by_day'] }) {
  if (!data?.length) return (
    <div style={{ textAlign: 'center', padding: '20px 0', color: '#8899BB', fontSize: 12 }}>
      Sin datos para el período
    </div>
  )
  const maxVal = Math.max(...data.map(d => d.total), 1)
  return (
    <div style={{ display: 'flex', alignItems: 'flex-end', gap: 3, height: 80, paddingTop: 4 }}>
      {data.map(d => (
        <div key={d.date} title={`${fmtD(d.date)}: ${fmt(d.total)} (${d.count} ventas)`}
          style={{ flex: 1, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
          <div style={{
            width: '100%', borderRadius: '3px 3px 0 0',
            height: `${Math.max(4, (d.total / maxVal) * 70)}px`,
            background: 'linear-gradient(180deg,#5DE0E6,#004AAD)',
          }} />
          {data.length <= 14 && (
            <span style={{ fontSize: 8, color: '#8899BB' }}>
              {new Date(d.date + 'T12:00:00').getDate()}
            </span>
          )}
        </div>
      ))}
    </div>
  )
}

// ─── Barra de porcentaje ──────────────────────────────────────────────────────

function PctBar({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const p = pct(value, max)
  return (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 4 }}>
        <span style={{ color: '#8899BB' }}>{label}</span>
        <span style={{ fontWeight: 700 }}>{fmt(value)} <span style={{ color: '#8899BB', fontWeight: 400 }}>({p}%)</span></span>
      </div>
      <div style={{ height: 6, background: 'rgba(93,224,230,.08)', borderRadius: 3, overflow: 'hidden' }}>
        <div style={{ height: '100%', width: `${p}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
      </div>
    </div>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ReportesPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Filtros
  const [from, setFrom] = useState(firstOfMonth())
  const [to,   setTo]   = useState(todayStr())

  // Datos
  const [summary,  setSummary]  = useState<Summary | null>(null)
  const [rows,     setRows]     = useState<SaleRow[]>([])
  const [fetching, setFetching] = useState(false)

  // UI
  const [tab,      setTab]      = useState<TabId>('resumen')
  const [search,   setSearch]   = useState('')

  // ── Init ──────────────────────────────────────────────────────────────────

  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      if (!ctx.isSuperAdmin && !['admin', 'supervisor', 'owner'].includes(ctx.user.role)) {
        router.push('/dashboard'); return
      }
      setUser(ctx.user as any)
      setCompany(ctx.company)
      setLoading(false)
    }
    init()
  }, [])

  // ── Cargar datos ──────────────────────────────────────────────────────────

  const loadReport = useCallback(async () => {
    if (!company) return
    setFetching(true)

    const [{ data: sumData }, { data: rowData }] = await Promise.all([
      supabase.rpc('get_report_summary', {
        p_company_id: company.id,
        p_from:       from,
        p_to:         to,
      }),
      supabase.rpc('get_sales_report', {
        p_company_id: company.id,
        p_from:       from,
        p_to:         to,
      }),
    ])

    setSummary(sumData as Summary)
    setRows((rowData as SaleRow[]) || [])
    setFetching(false)
  }, [company, from, to])

  useEffect(() => {
    if (company) loadReport() // eslint-disable-line react-hooks/set-state-in-effect
  }, [company])

  // ── Acceso rápido a períodos ───────────────────────────────────────────────

  function setPreset(preset: 'today' | 'week' | 'month' | 'prevMonth' | 'year') {
    const now = new Date()
    if (preset === 'today') {
      setFrom(todayStr()); setTo(todayStr())
    } else if (preset === 'week') {
      const mon = new Date(now)
      mon.setDate(now.getDate() - now.getDay() + 1)
      setFrom(mon.toISOString().split('T')[0]); setTo(todayStr())
    } else if (preset === 'month') {
      setFrom(firstOfMonth()); setTo(todayStr())
    } else if (preset === 'prevMonth') {
      const first = new Date(now.getFullYear(), now.getMonth() - 1, 1)
      const last  = new Date(now.getFullYear(), now.getMonth(), 0)
      setFrom(first.toISOString().split('T')[0])
      setTo(last.toISOString().split('T')[0])
    } else if (preset === 'year') {
      setFrom(`${now.getFullYear()}-01-01`); setTo(todayStr())
    }
  }

  // ── Loading / guard ───────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5DE0E6', fontFamily: 'Montserrat,sans-serif' }}>
      ⏳ Cargando...
    </div>
  )

  // ── Estilos ───────────────────────────────────────────────────────────────

  const S: Record<string, React.CSSProperties> = {
    page:   { minHeight: '100vh', background: 'var(--mp-bg, #0A1628)', fontFamily: 'Montserrat,sans-serif', color: 'var(--mp-text, #F0F4FF)', display: 'flex', flexDirection: 'column' },
    topbar: { height: 50, background: '#111827', borderBottom: '1px solid rgba(93,224,230,.12)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 },
    logo:   { width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0 },
    body:   { flex: 1, padding: 20, overflowY: 'auto' as const },
    card:   { background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 },
    btn:    { border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 } as React.CSSProperties,
    sh:     { fontSize: 11, fontWeight: 700, color: '#8899BB', marginBottom: 12, textTransform: 'uppercase' as const, letterSpacing: '.05em' },
    input:  { background: '#0A1628', border: '1px solid rgba(93,224,230,.15)', borderRadius: 7, padding: '7px 10px', fontSize: 12, color: '#F0F4FF', outline: 'none', fontFamily: 'Montserrat,sans-serif' } as React.CSSProperties,
  }

  const maxPay = summary ? Math.max(summary.cash_total, summary.debit_total, summary.credit_total, summary.transfer_total, 1) : 1

  const filteredRows = rows.filter(r => {
    const q = search.toLowerCase()
    return !search || r.cashier_name.toLowerCase().includes(q) || r.payment_methods.toLowerCase().includes(q) || r.document_type.includes(q)
  })

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight: 800, fontSize: 13 }}>Reportes</span>
        <span style={{ fontSize: 11, color: '#8899BB' }}>{company?.name}</span>
        <div style={{ flex: 1 }} />
        <button
          onClick={() => rows.length > 0 && downloadCSV(rows, from, to)}
          disabled={rows.length === 0 || fetching}
          style={{ ...S.btn, background: 'rgba(34,197,94,.1)', border: '1px solid rgba(34,197,94,.25)', color: '#22C55E', padding: '4px 14px', fontSize: 11, opacity: rows.length === 0 ? .4 : 1 }}
        >
          ⬇️ Exportar CSV
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background: 'transparent', border: '1px solid rgba(93,224,230,.2)', color: '#8899BB', padding: '4px 12px', fontSize: 11 }}>
          ← Dashboard
        </button>
      </div>

      <div style={S.body}>

        {/* FILTROS */}
        <div style={{ ...S.card, marginBottom: 16 }}>
          <div style={{ display: 'flex', gap: 12, alignItems: 'flex-end', flexWrap: 'wrap' as const }}>

            <div>
              <div style={S.sh}>Desde</div>
              <input type="date" value={from} max={to} onChange={e => setFrom(e.target.value)} style={S.input} />
            </div>
            <div>
              <div style={S.sh}>Hasta</div>
              <input type="date" value={to} min={from} max={todayStr()} onChange={e => setTo(e.target.value)} style={S.input} />
            </div>

            {/* Presets */}
            <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap' as const }}>
              {([
                ['today',     'Hoy'],
                ['week',      'Esta semana'],
                ['month',     'Este mes'],
                ['prevMonth', 'Mes anterior'],
                ['year',      'Este año'],
              ] as const).map(([p, l]) => (
                <button key={p} onClick={() => setPreset(p)}
                  style={{ ...S.btn, padding: '6px 12px', fontSize: 11, background: 'rgba(93,224,230,.06)', border: '1px solid rgba(93,224,230,.15)', color: '#8899BB' }}>
                  {l}
                </button>
              ))}
            </div>

            <button onClick={loadReport} disabled={fetching}
              style={{ ...S.btn, padding: '7px 20px', fontSize: 12, background: fetching ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
              {fetching ? '⏳ Cargando...' : '🔍 Generar reporte'}
            </button>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 4, marginBottom: 16, background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 10, padding: 4, width: 'fit-content' }}>
          {([
            ['resumen',   '📊 Resumen'],
            ['ventas',    '🧾 Detalle ventas'],
            ['impuestos', '🏛 Tributario'],
            ['productos', '🏆 Top productos'],
          ] as [TabId, string][]).map(([id, label]) => (
            <button key={id} onClick={() => setTab(id)}
              style={{ ...S.btn, padding: '6px 16px', fontSize: 12, borderRadius: 7, background: tab === id ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: tab === id ? '#fff' : '#8899BB' }}>
              {label}
            </button>
          ))}
        </div>

        {/* ── TAB: RESUMEN ── */}
        {tab === 'resumen' && summary && (
          <>
            {/* KPIs */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 14 }}>
              {[
                { icon: '💰', label: 'Total ventas',   value: fmt(summary.total_sales),  sub: `${summary.total_count} transacciones` },
                { icon: '🎯', label: 'Ticket promedio', value: fmt(summary.avg_ticket),   sub: 'por venta' },
                { icon: '🧾', label: 'IVA recaudado',  value: fmt(summary.iva_total),    sub: '19% del neto' },
                { icon: '🍺', label: 'ILA acumulado',  value: fmt(summary.ila_total),    sub: 'impuesto alcohol' },
              ].map(k => (
                <div key={k.label} style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: '14px 16px' }}>
                  <div style={{ fontSize: 20, marginBottom: 6 }}>{k.icon}</div>
                  <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 3 }}>{k.label}</div>
                  <div style={{ fontSize: 20, fontWeight: 800 }}>{k.value}</div>
                  <div style={{ fontSize: 11, color: '#8899BB', marginTop: 4 }}>{k.sub}</div>
                </div>
              ))}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
              {/* Gráfico por día */}
              <div style={S.card}>
                <div style={S.sh}>📈 Ventas diarias</div>
                <DayChart data={summary.by_day || []} />
                <div style={{ display: 'flex', justifyContent: 'space-between', marginTop: 10, fontSize: 11, color: '#8899BB' }}>
                  <span>{fmtD(from)}</span>
                  <span>{fmtD(to)}</span>
                </div>
              </div>

              {/* Por método de pago */}
              <div style={S.card}>
                <div style={S.sh}>💳 Por método de pago</div>
                <PctBar label="💵 Efectivo"     value={summary.cash_total}     max={maxPay} color="#22C55E" />
                <PctBar label="💳 Débito"       value={summary.debit_total}    max={maxPay} color="#5DE0E6" />
                <PctBar label="💳 Crédito"      value={summary.credit_total}   max={maxPay} color="#C19E4D" />
                <PctBar label="📲 Transferencia" value={summary.transfer_total} max={maxPay} color="#A78BFA" />
                <div style={{ marginTop: 12, display: 'flex', gap: 16, fontSize: 11, borderTop: '1px solid rgba(93,224,230,.08)', paddingTop: 10 }}>
                  <div><span style={{ color: '#8899BB' }}>Boletas: </span><strong>{summary.boleta_count}</strong></div>
                  <div><span style={{ color: '#8899BB' }}>Facturas: </span><strong>{summary.factura_count}</strong></div>
                  <div><span style={{ color: '#8899BB' }}>Descuentos: </span><strong>{fmt(summary.discount_total)}</strong></div>
                </div>
              </div>
            </div>
          </>
        )}

        {/* ── TAB: DETALLE VENTAS ── */}
        {tab === 'ventas' && (
          <div style={S.card}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 12 }}>
              <div style={S.sh}>🧾 {filteredRows.length} ventas — {fmtD(from)} al {fmtD(to)}</div>
              <input
                value={search} onChange={e => setSearch(e.target.value)}
                placeholder="Buscar cajero, medio de pago..."
                style={{ ...S.input, width: 220 }}
              />
            </div>

            {/* Header tabla */}
            <div style={{ display: 'grid', gridTemplateColumns: '140px 80px 80px 1fr 80px 80px 80px 90px', gap: 8, padding: '6px 10px', background: '#0D1525', borderRadius: 6, fontSize: 9, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4 }}>
              <span>Fecha</span>
              <span>Doc</span>
              <span>Cajero</span>
              <span>Medios de pago</span>
              <span style={{ textAlign: 'right' }}>IVA</span>
              <span style={{ textAlign: 'right' }}>ILA</span>
              <span style={{ textAlign: 'right' }}>Desc.</span>
              <span style={{ textAlign: 'right' }}>Total</span>
            </div>

            <div style={{ maxHeight: 520, overflowY: 'auto' as const }}>
              {filteredRows.length === 0 ? (
                <div style={{ textAlign: 'center', padding: 40, color: '#8899BB' }}>
                  Sin ventas en el período seleccionado
                </div>
              ) : filteredRows.map(r => (
                <div key={r.sale_id} style={{ display: 'grid', gridTemplateColumns: '140px 80px 80px 1fr 80px 80px 80px 90px', gap: 8, padding: '8px 10px', borderBottom: '1px solid rgba(93,224,230,.04)', fontSize: 11, alignItems: 'center' }}>
                  <span style={{ color: '#8899BB' }}>{fmtDT(r.created_at)}</span>
                  <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 6px', borderRadius: 4, background: r.document_type === 'factura' ? 'rgba(193,158,77,.15)' : 'rgba(93,224,230,.08)', color: r.document_type === 'factura' ? '#C19E4D' : '#8899BB', textAlign: 'center' as const }}>
                    {r.document_type}
                  </span>
                  <span style={{ color: '#F0F4FF' }}>{r.cashier_name.split(' ')[0]}</span>
                  <span style={{ color: '#8899BB', fontSize: 10, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>{r.payment_methods}</span>
                  <span style={{ textAlign: 'right', color: '#8899BB' }}>{r.iva_amount > 0 ? fmt(r.iva_amount) : '—'}</span>
                  <span style={{ textAlign: 'right', color: r.ila_amount > 0 ? '#F59E0B' : '#8899BB' }}>{r.ila_amount > 0 ? fmt(r.ila_amount) : '—'}</span>
                  <span style={{ textAlign: 'right', color: r.discount_amount > 0 ? '#EF4444' : '#8899BB' }}>{r.discount_amount > 0 ? `-${fmt(r.discount_amount)}` : '—'}</span>
                  <span style={{ textAlign: 'right', fontWeight: 700, color: '#5DE0E6' }}>{fmt(r.total)}</span>
                </div>
              ))}
            </div>

            {/* Totales al pie */}
            {filteredRows.length > 0 && (
              <div style={{ display: 'grid', gridTemplateColumns: '140px 80px 80px 1fr 80px 80px 80px 90px', gap: 8, padding: '10px 10px 4px', borderTop: '1px solid rgba(93,224,230,.12)', fontSize: 11, fontWeight: 700, marginTop: 4 }}>
                <span style={{ color: '#8899BB' }}>TOTAL</span>
                <span />
                <span />
                <span />
                <span style={{ textAlign: 'right', color: '#8899BB' }}>{fmt(filteredRows.reduce((a, r) => a + r.iva_amount, 0))}</span>
                <span style={{ textAlign: 'right', color: '#F59E0B' }}>{fmt(filteredRows.reduce((a, r) => a + r.ila_amount, 0))}</span>
                <span style={{ textAlign: 'right', color: '#EF4444' }}>{fmt(filteredRows.reduce((a, r) => a + r.discount_amount, 0))}</span>
                <span style={{ textAlign: 'right', color: '#5DE0E6' }}>{fmt(filteredRows.reduce((a, r) => a + r.total, 0))}</span>
              </div>
            )}
          </div>
        )}

        {/* ── TAB: TRIBUTARIO ── */}
        {tab === 'impuestos' && summary && (
          <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
            {/* Libro de ventas simplificado */}
            <div style={S.card}>
              <div style={S.sh}>📋 Libro de ventas (resumen SII)</div>
              {[
                ['Total ventas brutas',              fmt(summary.total_sales),                                '#F0F4FF'],
                ['(-) Descuentos',                   `-${fmt(summary.discount_total)}`,                      '#EF4444'],
                ['= Ventas netas',                   fmt(summary.total_sales - summary.discount_total),      '#F0F4FF'],
                ['(-) IVA 19%',                      fmt(summary.iva_total),                                 '#8899BB'],
                ['(-) ILA alcohol',                  fmt(summary.ila_total),                                 '#F59E0B'],
                ['= Base neta (sin impuestos)',       fmt(summary.subtotal_net),                              '#5DE0E6'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(93,224,230,.06)', fontSize: 12 }}>
                  <span style={{ color: '#8899BB' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: c as string }}>{v}</span>
                </div>
              ))}
              <div style={{ marginTop: 12, padding: '10px 12px', background: 'rgba(93,224,230,.05)', borderRadius: 8, fontSize: 11, color: '#8899BB' }}>
                💡 Usa estos valores para tu declaración mensual de IVA (Formulario 29 SII)
              </div>
            </div>

            {/* Desglose documentos */}
            <div style={S.card}>
              <div style={S.sh}>🧾 Documentos emitidos</div>
              {[
                ['Boletas',  summary.boleta_count,  'rgba(93,224,230,.1)',    '#5DE0E6'],
                ['Facturas', summary.factura_count, 'rgba(193,158,77,.1)',    '#C19E4D'],
              ].map(([l, v, bg, color]) => (
                <div key={l as string} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 14px', background: bg as string, borderRadius: 8, marginBottom: 8 }}>
                  <span style={{ fontSize: 13, fontWeight: 600 }}>{l}</span>
                  <span style={{ fontSize: 22, fontWeight: 800, color: color as string }}>{v}</span>
                </div>
              ))}

              <div style={{ marginTop: 8 }}>
                <div style={S.sh}>Por canal</div>
                {[
                  { canal: 'POS',       count: rows.filter(r => r.channel === 'pos').length },
                  { canal: 'Manual',    count: rows.filter(r => r.channel === 'manual').length },
                  { canal: 'WhatsApp',  count: rows.filter(r => r.channel === 'whatsapp').length },
                  { canal: 'Web',       count: rows.filter(r => r.channel === 'web').length },
                ].filter(c => c.count > 0).map(c => (
                  <div key={c.canal} style={{ display: 'flex', justifyContent: 'space-between', padding: '5px 0', borderBottom: '1px solid rgba(93,224,230,.05)', fontSize: 12 }}>
                    <span style={{ color: '#8899BB' }}>{c.canal}</span>
                    <span style={{ fontWeight: 700 }}>{c.count} ventas</span>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ── TAB: TOP PRODUCTOS ── */}
        {tab === 'productos' && summary && (
          <div style={S.card}>
            <div style={S.sh}>🏆 Top 10 productos — {fmtD(from)} al {fmtD(to)}</div>
            {!summary.top_products?.length ? (
              <div style={{ textAlign: 'center', padding: 40, color: '#8899BB' }}>Sin datos de productos para el período</div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 100px 100px', gap: 10, padding: '6px 10px', background: '#0D1525', borderRadius: 6, fontSize: 9, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4 }}>
                  <span>#</span><span>Producto</span><span style={{ textAlign: 'right' }}>Unidades</span><span style={{ textAlign: 'right' }}>Ingresos</span><span style={{ textAlign: 'right' }}>% del total</span>
                </div>
                {summary.top_products.map((p, i) => {
                  const totalRevenue = summary.top_products.reduce((a, x) => a + x.revenue, 0)
                  const share = pct(p.revenue, totalRevenue)
                  return (
                    <div key={i} style={{ display: 'grid', gridTemplateColumns: '32px 1fr 80px 100px 100px', gap: 10, padding: '10px 10px', borderBottom: '1px solid rgba(93,224,230,.04)', fontSize: 12, alignItems: 'center' }}>
                      <span style={{ fontSize: 16, fontWeight: 800, color: i < 3 ? '#C19E4D' : 'rgba(93,224,230,.3)' }}>{i + 1}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{p.name}</div>
                        {p.sku && <div style={{ fontSize: 10, color: '#8899BB' }}>SKU: {p.sku}</div>}
                      </div>
                      <span style={{ textAlign: 'right', color: '#8899BB' }}>×{Math.round(p.qty)}</span>
                      <span style={{ textAlign: 'right', fontWeight: 700, color: '#5DE0E6' }}>{fmt(p.revenue)}</span>
                      <div style={{ display: 'flex', alignItems: 'center', gap: 6 }}>
                        <div style={{ flex: 1, height: 4, background: 'rgba(93,224,230,.08)', borderRadius: 2 }}>
                          <div style={{ height: '100%', width: `${share}%`, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', borderRadius: 2 }} />
                        </div>
                        <span style={{ fontSize: 10, color: '#8899BB', minWidth: 28, textAlign: 'right' as const }}>{share}%</span>
                      </div>
                    </div>
                  )
                })}
                <div style={{ marginTop: 12, padding: '8px 10px', background: 'rgba(0,74,173,.06)', borderRadius: 8, fontSize: 11, color: '#8899BB', textAlign: 'center' as const }}>
                  Total ingresos por productos mostrados: <strong style={{ color: '#5DE0E6' }}>{fmt(summary.top_products.reduce((a, p) => a + p.revenue, 0))}</strong>
                </div>
              </>
            )}
          </div>
        )}

        {/* Estado vacío */}
        {!fetching && !summary && (
          <div style={{ textAlign: 'center', padding: 60, color: '#8899BB' }}>
            <div style={{ fontSize: 40, marginBottom: 12 }}>📊</div>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>Selecciona un período y genera el reporte</div>
            <div style={{ fontSize: 12 }}>Usa los filtros de arriba o los accesos rápidos</div>
          </div>
        )}

      </div>
    </div>
  )
}
