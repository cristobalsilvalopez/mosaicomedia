'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()
const fmt  = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtT = (d: string) => new Date(d).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit' })
const fmtD = (d: string) => new Date(d).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit' })

// ============================================================
// TIPOS
// ============================================================
interface DashData {
  period: string
  sales_total: number; sales_count: number; avg_ticket: number
  iva_total: number;   ila_total: number
  prev_total: number;  prev_count: number; growth_pct: number | null
  cash_sales: number;  debit_sales: number
  credit_sales: number; transfer_sales: number
  low_stock: any[]; top_products: any[]
  sales_by_hour: any[]; recent_sales: any[]
  cash_session: any | null
}

type Period = 'today' | 'week' | 'month'

// ============================================================
// COMPONENTES AUXILIARES
// ============================================================

// Tarjeta KPI
function KpiCard({ icon, label, value, sub, subColor, growth, onClick }: {
  icon: string; label: string; value: string
  sub?: string; subColor?: string; growth?: number | null; onClick?: () => void
}) {
  const hasGrowth = growth !== null && growth !== undefined
  const positive  = (growth || 0) >= 0
  return (
    <div onClick={onClick} style={{
      background:'#111827', border:'1px solid rgba(93,224,230,.1)',
      borderRadius:12, padding:'16px 18px', cursor: onClick ? 'pointer' : 'default',
      transition:'all .15s', position:'relative', overflow:'hidden',
    }}
      onMouseEnter={e => { if (onClick) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(93,224,230,.35)' }}
      onMouseLeave={e => { (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(93,224,230,.1)' }}
    >
      <div style={{ position:'absolute', top:0, right:0, width:60, height:60, background:'linear-gradient(135deg,rgba(0,74,173,.08),rgba(93,224,230,.04))', borderRadius:'0 12px 0 60px' }} />
      <div style={{ fontSize:20, marginBottom:8 }}>{icon}</div>
      <div style={{ fontSize:11, color:'#8899BB', fontWeight:600, marginBottom:4 }}>{label}</div>
      <div style={{ fontSize:22, fontWeight:800, color:'#F0F4FF', lineHeight:1 }}>{value}</div>
      {sub && <div style={{ fontSize:11, color: subColor || '#8899BB', marginTop:5 }}>{sub}</div>}
      {hasGrowth && (
        <div style={{ position:'absolute', top:14, right:14, fontSize:10, fontWeight:700, color: positive ? '#22C55E' : '#EF4444', background: positive ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', padding:'2px 7px', borderRadius:20 }}>
          {positive ? '▲' : '▼'} {Math.abs(growth || 0)}%
        </div>
      )}
    </div>
  )
}

// Barra de progreso simple
function BarRow({ label, value, max, color }: { label: string; value: number; max: number; color: string }) {
  const pct = max > 0 ? Math.min(100, (value / max) * 100) : 0
  return (
    <div style={{ marginBottom:10 }}>
      <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, marginBottom:4 }}>
        <span style={{ color:'#8899BB' }}>{label}</span>
        <span style={{ fontWeight:700, color:'#F0F4FF' }}>{fmt(value)}</span>
      </div>
      <div style={{ height:6, background:'rgba(93,224,230,.08)', borderRadius:3, overflow:'hidden' }}>
        <div style={{ height:'100%', width:`${pct}%`, background: color, borderRadius:3, transition:'width .4s' }} />
      </div>
    </div>
  )
}

// Gráfico de barras por hora (SVG simple)
function HourChart({ data }: { data: any[] }) {
  if (!data.length) return (
    <div style={{ textAlign:'center', padding:'20px 0', color:'#8899BB', fontSize:12 }}>
      Sin ventas por hora hoy
    </div>
  )
  const maxVal = Math.max(...data.map(d => d.total), 1)
  const hours  = Array.from({ length: 24 }, (_, i) => {
    const found = data.find(d => d.hour === i)
    return { hour: i, total: found?.total || 0 }
  }).filter(h => h.hour >= 8 && h.hour <= 22)

  return (
    <div style={{ display:'flex', alignItems:'flex-end', gap:3, height:70, paddingTop:4 }}>
      {hours.map(h => (
        <div key={h.hour} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:3 }}>
          <div
            style={{
              width:'100%', borderRadius:'3px 3px 0 0',
              height: `${Math.max(3, (h.total / maxVal) * 60)}px`,
              background: h.total > 0 ? 'linear-gradient(180deg,#5DE0E6,#004AAD)' : 'rgba(93,224,230,.08)',
              transition:'height .4s',
            }}
            title={`${h.hour}:00 — ${fmt(h.total)}`}
          />
          {h.hour % 3 === 0 && <span style={{ fontSize:8, color:'#8899BB' }}>{h.hour}h</span>}
        </div>
      ))}
    </div>
  )
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function DashboardPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [period, setPeriod]   = useState<Period>('today')
  const [data, setData]       = useState<DashData | null>(null)
  const [fetching, setFetching] = useState(false)
  const [lastUpdate, setLastUpdate] = useState<Date | null>(null)

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: userData } = await supabase
        .from('users')
        .select('id, first_name, company_id, companies(id, name, slug)')
        .eq('auth_user_id', session.user.id)
        .single()
      if (!userData) { router.push('/login'); return }
      setUser(userData)
      setCompany((userData as any).companies)
      setLoading(false)
    }
    init()
  }, [])

  // Cargar datos cuando cambia la empresa o el período
  useEffect(() => {
    if (company) loadData()
  }, [company, period])

  // Auto-refresh cada 2 minutos
  useEffect(() => {
    const interval = setInterval(() => {
      if (company) loadData(true)
    }, 120000)
    return () => clearInterval(interval)
  }, [company, period])

  // ============================================================
  // CARGAR DATOS
  // ============================================================
  async function loadData(silent = false) {
    if (!company) return
    if (!silent) setFetching(true)

    const { data: dashData, error } = await supabase.rpc('get_dashboard_data', {
      p_company_id: company.id,
      p_period:     period,
    })

    if (error) {
      // Fallback: cargar datos básicos directamente si el RPC falla
      await loadFallback()
      if (!silent) setFetching(false)
      return
    }

    setData(dashData as DashData)
    setLastUpdate(new Date())
    if (!silent) setFetching(false)
  }

  // Fallback si el RPC no está disponible
  async function loadFallback() {
    if (!company) return
    const today = new Date()
    today.setHours(0, 0, 0, 0)

    const { data: salesData } = await supabase
      .from('sales')
      .select('id, total, iva_amount, ila_amount, created_at, status, user_id, items')
      .eq('company_id', company.id)
      .gte('created_at', today.toISOString())
      .eq('status', 'completed')

    const sales = salesData || []
    const total = sales.reduce((a, s) => a + (s.total || 0), 0)
    const iva   = sales.reduce((a, s) => a + (s.iva_amount || 0), 0)
    const ila   = sales.reduce((a, s) => a + (s.ila_amount || 0), 0)

    const { data: payData } = await supabase
      .from('sale_payments')
      .select('payment_method, amount')
      .in('sale_id', sales.map(s => s.id))

    const payments = payData || []
    const cashSales = payments.filter(p => p.payment_method === 'cash').reduce((a, p) => a + parseFloat(p.amount), 0)
    const debitSales = payments.filter(p => p.payment_method === 'debit').reduce((a, p) => a + parseFloat(p.amount), 0)
    const creditSales = payments.filter(p => p.payment_method === 'credit').reduce((a, p) => a + parseFloat(p.amount), 0)
    const transferSales = payments.filter(p => p.payment_method === 'transfer').reduce((a, p) => a + parseFloat(p.amount), 0)

    const { data: lowStockData } = await supabase
      .from('products')
      .select('id, name, sku, min_stock_alert, inventory(quantity), categories(name)')
      .eq('company_id', company.id)
      .eq('is_active', true)
      .limit(10)

    const lowStock = (lowStockData || [])
      .filter((p: any) => (p.inventory?.[0]?.quantity || 0) <= (p.min_stock_alert || 5))
      .map((p: any) => ({
        id: p.id, name: p.name, sku: p.sku,
        stock: p.inventory?.[0]?.quantity || 0,
        min_stock: p.min_stock_alert || 5,
        category: p.categories?.name,
      }))

    const cashSess = await supabase.rpc('get_active_cash_session', { p_company_id: company.id })

    setData({
      period, sales_total: total, sales_count: sales.length,
      avg_ticket: sales.length > 0 ? total / sales.length : 0,
      iva_total: iva, ila_total: ila,
      prev_total: 0, prev_count: 0, growth_pct: null,
      cash_sales: cashSales, debit_sales: debitSales,
      credit_sales: creditSales, transfer_sales: transferSales,
      low_stock: lowStock, top_products: [],
      sales_by_hour: [], recent_sales: [],
      cash_session: cashSess.data || null,
    })
    setLastUpdate(new Date())
  }

  // ============================================================
  // LOADING
  // ============================================================
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando...
    </div>
  )

  const periodLabel = { today:'Hoy', week:'Esta semana', month:'Este mes' }[period]
  const maxPayment  = data ? Math.max(data.cash_sales, data.debit_sales, data.credit_sales, data.transfer_sales, 1) : 1

  // ============================================================
  // ESTILOS
  // ============================================================
  const S: Record<string, React.CSSProperties> = {
    page:   { minHeight:'100vh', background:'#0A1628', fontFamily:'Montserrat,sans-serif', color:'#F0F4FF', display:'flex', flexDirection:'column' },
    topbar: { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 20px', gap:10, flexShrink:0 },
    logo:   { width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer', flexShrink:0 },
    body:   { flex:1, padding:'20px', overflowY:'auto' },
    card:   { background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, padding:'16px 18px' },
    btn:    { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
    section:{ marginBottom:20 },
    sh:     { fontSize:12, fontWeight:700, color:'#8899BB', marginBottom:12, textTransform:'uppercase', letterSpacing:'.5px' } as React.CSSProperties,
  }

  return (
    <div style={S.page}>

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:800, fontSize:13 }}>Dashboard</span>
        <span style={{ fontSize:11, color:'#8899BB' }}>{company?.name}</span>
        <div style={{ flex:1 }} />
        {lastUpdate && <span style={{ fontSize:10, color:'#8899BB' }}>Actualizado {fmtT(lastUpdate.toISOString())}</span>}
        <button onClick={() => loadData()} disabled={fetching} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 10px', fontSize:10 }}>
          {fetching ? '⏳' : '🔄'} Actualizar
        </button>
        <button onClick={() => router.push('/pos')} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
          💳 POS
        </button>
        <button onClick={() => router.push('/caja')} style={{ ...S.btn, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', padding:'4px 12px', fontSize:11 }}>
          🏪 Caja
        </button>
        <button onClick={() => router.push('/ventas')} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.15)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
          📋 Ventas
        </button>
        <button onClick={() => router.push('/crm')} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.15)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
          👥 CRM
        </button>
      </div>

      <div style={S.body}>

        {/* HEADER — bienvenida + selector de período */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:18, fontWeight:800 }}>
              Hola, {user?.first_name} 👋
            </div>
            <div style={{ fontSize:12, color:'#8899BB', marginTop:2 }}>
              {new Date().toLocaleDateString('es-CL', { weekday:'long', day:'numeric', month:'long', year:'numeric' })}
            </div>
          </div>
          <div style={{ display:'flex', gap:4, background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:4 }}>
            {(['today','week','month'] as Period[]).map(p => (
              <button key={p} onClick={() => setPeriod(p)} style={{ ...S.btn, padding:'5px 14px', fontSize:11, borderRadius:7, background: period === p ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: period === p ? '#fff' : '#8899BB' }}>
                {{ today:'Hoy', week:'Semana', month:'Mes' }[p]}
              </button>
            ))}
          </div>
        </div>

        {/* ALERTA: caja sin abrir */}
        {data && !data.cash_session && (
          <div onClick={() => router.push('/caja')} style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.25)', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', gap:10, cursor:'pointer' }}>
            <span style={{ fontSize:18 }}>⚠️</span>
            <div>
              <div style={{ fontSize:12, fontWeight:700, color:'#EF4444' }}>No hay caja abierta</div>
              <div style={{ fontSize:11, color:'#8899BB' }}>Haz clic para ir al módulo de caja</div>
            </div>
          </div>
        )}

        {/* ALERTA: caja abierta */}
        {data?.cash_session && (
          <div onClick={() => router.push('/caja')} style={{ background:'rgba(34,197,94,.06)', border:'1px solid rgba(34,197,94,.2)', borderRadius:10, padding:'10px 16px', marginBottom:16, display:'flex', alignItems:'center', justifyContent:'space-between', cursor:'pointer' }}>
            <div style={{ display:'flex', alignItems:'center', gap:10 }}>
              <div style={{ width:8, height:8, borderRadius:'50%', background:'#22C55E', boxShadow:'0 0 6px rgba(34,197,94,.6)' }} />
              <div>
                <div style={{ fontSize:12, fontWeight:700, color:'#22C55E' }}>{data.cash_session.register_name} — En línea</div>
                <div style={{ fontSize:11, color:'#8899BB' }}>Cajero: {data.cash_session.opened_by_name}</div>
              </div>
            </div>
            <div style={{ textAlign:'right' }}>
              <div style={{ fontSize:11, color:'#8899BB' }}>Ventas de la sesión</div>
              <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6' }}>{fmt(data.cash_session.total_sales || 0)}</div>
            </div>
          </div>
        )}

        {fetching && !data ? (
          <div style={{ textAlign:'center', padding:60, color:'#8899BB' }}>⏳ Cargando datos...</div>
        ) : data ? (
          <>
            {/* KPIs PRINCIPALES */}
            <div style={{ ...S.section }}>
              <div style={S.sh}>📊 KPIs principales — {periodLabel}</div>
              <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12 }}>
                <KpiCard icon="💰" label="Total ventas" value={fmt(data.sales_total)}
                  sub={`vs ${fmt(data.prev_total)} período anterior`}
                  growth={data.growth_pct}
                  onClick={() => router.push('/ventas')}
                />
                <KpiCard icon="🧾" label="Transacciones" value={String(data.sales_count)}
                  sub={`${data.prev_count} período anterior`}
                />
                <KpiCard icon="🎯" label="Ticket promedio" value={fmt(data.avg_ticket)}
                  sub="por venta"
                />
                <KpiCard icon="📊" label="IVA recaudado" value={fmt(data.iva_total)}
                  sub={data.ila_total > 0 ? `+ ILA ${fmt(data.ila_total)}` : 'Sin ILA en el período'}
                  subColor={data.ila_total > 0 ? '#F59E0B' : undefined}
                />
              </div>
            </div>

            {/* SEGUNDA FILA KPIs */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
              <KpiCard icon="💵" label="Efectivo" value={fmt(data.cash_sales)} />
              <KpiCard icon="💳" label="Débito" value={fmt(data.debit_sales)} />
              <KpiCard icon="💳" label="Crédito" value={fmt(data.credit_sales)} />
              <KpiCard icon="📲" label="Transferencia" value={fmt(data.transfer_sales)} />
            </div>

            {/* FILA PRINCIPAL: métodos + horas + stock */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:12, marginBottom:20 }}>

              {/* Ventas por método */}
              <div style={S.card}>
                <div style={S.sh}>💳 Por método de pago</div>
                <BarRow label="💵 Efectivo"      value={data.cash_sales}     max={maxPayment} color="#22C55E" />
                <BarRow label="💳 Débito"         value={data.debit_sales}    max={maxPayment} color="#5DE0E6" />
                <BarRow label="💳 Crédito"        value={data.credit_sales}   max={maxPayment} color="#C19E4D" />
                <BarRow label="📲 Transferencia"  value={data.transfer_sales} max={maxPayment} color="#A78BFA" />
              </div>

              {/* Ventas por hora */}
              <div style={S.card}>
                <div style={S.sh}>🕐 Actividad por hora (hoy)</div>
                <HourChart data={data.sales_by_hour} />
                {data.sales_by_hour.length > 0 && (
                  <div style={{ fontSize:11, color:'#8899BB', marginTop:8 }}>
                    Hora pico: {data.sales_by_hour.reduce((a, b) => a.total > b.total ? a : b, data.sales_by_hour[0])?.hour}:00
                  </div>
                )}
              </div>

              {/* Top productos */}
              <div style={S.card}>
                <div style={S.sh}>🏆 Top productos</div>
                {data.top_products.length === 0 ? (
                  <div style={{ fontSize:12, color:'#8899BB', textAlign:'center', padding:'16px 0' }}>
                    Sin ventas en este período
                  </div>
                ) : data.top_products.map((p: any, i: number) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid rgba(93,224,230,.05)', fontSize:12 }}>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <span style={{ fontSize:14, fontWeight:800, color:'rgba(93,224,230,.3)', minWidth:18 }}>{i + 1}</span>
                      <span style={{ color:'#F0F4FF', fontWeight:600 }}>{p.name}</span>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:11, fontWeight:700, color:'#5DE0E6' }}>{fmt(p.total_amount)}</div>
                      <div style={{ fontSize:10, color:'#8899BB' }}>×{Math.round(p.total_qty)}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>

            {/* FILA: stock bajo + ventas recientes */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>

              {/* Stock bajo */}
              <div style={S.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={S.sh}>⚠️ Stock bajo</div>
                  <button onClick={() => router.push('/inventario')} style={{ ...S.btn, background:'none', color:'#5DE0E6', fontSize:10, padding:0 }}>
                    Ver inventario →
                  </button>
                </div>
                {data.low_stock.length === 0 ? (
                  <div style={{ fontSize:12, color:'#22C55E', textAlign:'center', padding:'16px 0' }}>
                    ✅ Todo el inventario en niveles normales
                  </div>
                ) : data.low_stock.map((p: any, i: number) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(93,224,230,.05)', fontSize:12 }}>
                    <div>
                      <div style={{ fontWeight:600, color:'#F0F4FF' }}>{p.name}</div>
                      <div style={{ fontSize:10, color:'#8899BB' }}>{p.category} · SKU: {p.sku}</div>
                    </div>
                    <div style={{ textAlign:'right' }}>
                      <div style={{ fontSize:13, fontWeight:800, color: p.stock <= 0 ? '#EF4444' : p.stock <= 3 ? '#F59E0B' : '#F0F4FF' }}>
                        {p.stock <= 0 ? '❌ Sin stock' : `${p.stock} uds`}
                      </div>
                      <div style={{ fontSize:10, color:'#8899BB' }}>mín: {p.min_stock}</div>
                    </div>
                  </div>
                ))}
              </div>

              {/* Ventas recientes */}
              <div style={S.card}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:12 }}>
                  <div style={S.sh}>🕐 Ventas recientes</div>
                  <button onClick={() => router.push('/ventas')} style={{ ...S.btn, background:'none', color:'#5DE0E6', fontSize:10, padding:0 }}>
                    Ver historial →
                  </button>
                </div>
                {data.recent_sales.length === 0 ? (
                  <div style={{ fontSize:12, color:'#8899BB', textAlign:'center', padding:'16px 0' }}>
                    Sin ventas recientes
                  </div>
                ) : data.recent_sales.map((s: any, i: number) => (
                  <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(93,224,230,.05)', fontSize:12 }}>
                    <div>
                      <div style={{ fontWeight:600, color:'#F0F4FF' }}>{s.cashier}</div>
                      <div style={{ fontSize:10, color:'#8899BB' }}>{fmtD(s.created_at)} {fmtT(s.created_at)}</div>
                    </div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6' }}>{fmt(s.total)}</div>
                  </div>
                ))}
              </div>
            </div>

            {/* IMPUESTOS */}
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
              <div style={S.card}>
                <div style={S.sh}>🧾 Resumen tributario — {periodLabel}</div>
                {[
                  ['Subtotal neto', fmt(data.sales_total - data.iva_total - data.ila_total), '#8899BB'],
                  ['IVA (19%)',     fmt(data.iva_total), '#8899BB'],
                  ['ILA (alcohol)', fmt(data.ila_total), '#F59E0B'],
                  ['Total bruto',   fmt(data.sales_total), '#5DE0E6'],
                ].map(([l, v, c]) => (
                  <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid rgba(93,224,230,.05)', fontSize:12 }}>
                    <span style={{ color:'#8899BB' }}>{l}</span>
                    <span style={{ fontWeight:700, color: c }}>{v}</span>
                  </div>
                ))}
              </div>

              {/* Accesos rápidos */}
              <div style={S.card}>
                <div style={S.sh}>⚡ Accesos rápidos</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                  {[
                    { icon:'💳', label:'Nueva venta', path:'/pos',        color:'rgba(0,74,173,.3)' },
                    { icon:'🏪', label:'Abrir caja',  path:'/caja',       color:'rgba(34,197,94,.15)' },
                    { icon:'📋', label:'Historial',   path:'/ventas',     color:'rgba(93,224,230,.08)' },
                    { icon:'📦', label:'Inventario',  path:'/inventario', color:'rgba(193,158,77,.1)' },
                    { icon:'👥', label:'CRM',          path:'/crm',        color:'rgba(93,224,230,.08)' },
                  ].map(q => (
                    <button key={q.path} onClick={() => router.push(q.path)} style={{ ...S.btn, padding:'12px 10px', background: q.color, border:'1px solid rgba(93,224,230,.1)', borderRadius:10, fontSize:12, color:'#F0F4FF', textAlign:'center' as 'center' }}>
                      <div style={{ fontSize:20, marginBottom:4 }}>{q.icon}</div>
                      {q.label}
                    </button>
                  ))}
                </div>
              </div>
            </div>

            {/* FOOTER INFO */}
            <div style={{ background:'rgba(0,74,173,.05)', border:'1px solid rgba(0,74,173,.15)', borderRadius:10, padding:'10px 16px', display:'flex', justifyContent:'space-between', alignItems:'center' }}>
              <div style={{ fontSize:11, color:'#8899BB' }}>
                💡 Los datos se actualizan automáticamente cada 2 minutos
              </div>
              <div style={{ display:'flex', gap:16, fontSize:11, color:'#8899BB' }}>
                <span>Período: <strong style={{ color:'#5DE0E6' }}>{periodLabel}</strong></span>
                <span>Empresa: <strong style={{ color:'#5DE0E6' }}>{company?.name}</strong></span>
              </div>
            </div>
          </>
        ) : null}
      </div>
    </div>
  )
}
