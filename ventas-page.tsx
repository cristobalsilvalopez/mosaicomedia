'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()

// ============================================================
// UTILIDADES
// ============================================================
const fmt    = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtDT  = (d: string) => new Date(d).toLocaleString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', hour:'2-digit', minute:'2-digit', timeZone:'America/Santiago' })
const fmtD   = (d: string) => new Date(d).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric', timeZone:'America/Santiago' })
const fmtT   = (d: string) => new Date(d).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone:'America/Santiago' })

const METHOD_LABELS: Record<string,string> = {
  cash: '💵 Efectivo', debit: '💳 Débito', credit: '💳 Crédito',
  transfer: '📲 Transferencia', mercadopago: '🟢 Mercado Pago', cheque: '📄 Cheque',
}
const TAX_LABELS: Record<string,string> = {
  iva: 'IVA 19%', iva_normal: 'IVA 19%',
  ila_beer: 'IVA+ILA', ila_wine: 'IVA+ILA', ila_spirits: 'IVA+ILA',
  cigars: 'Exento', exempt: 'Exento',
}

// ============================================================
// TIPOS
// ============================================================
interface Sale {
  id: string
  created_at: string
  total: number
  subtotal: number
  iva_amount: number
  ila_amount: number
  discount_amount: number
  status: string
  document_type: string
  channel: string
  items: any[]
  user_id: string
  cash_session_id: string | null
  customer_name: string | null
  // joined
  cashier_name?: string
  register_name?: string
}

interface Filters {
  dateFrom: string
  dateTo: string
  cashier: string
  method: string
  status: string
  minAmount: string
  maxAmount: string
}

const TODAY = new Date().toISOString().slice(0, 10)
const DEFAULT_FILTERS: Filters = {
  dateFrom: TODAY, dateTo: TODAY,
  cashier: '', method: '', status: '', minAmount: '', maxAmount: '',
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function VentasPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Datos
  const [sales, setSales]         = useState<Sale[]>([])
  const [cashiers, setCashiers]   = useState<any[]>([])
  const [fetching, setFetching]   = useState(false)

  // Filtros
  const [filters, setFilters] = useState<Filters>(DEFAULT_FILTERS)
  const [showFilters, setShowFilters] = useState(false)

  // Detalle de venta
  const [selected, setSelected] = useState<Sale | null>(null)

  // Resumen del período
  const [summary, setSummary] = useState({ count:0, total:0, iva:0, ila:0, discount:0 })

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: userData } = await supabase
        .from('users')
        .select('id, first_name, company_id, companies(id, name)')
        .eq('auth_user_id', session.user.id)
        .single()
      if (!userData) { router.push('/login'); return }
      setUser(userData)
      setCompany((userData as any).companies)

      // Cargar cajeros disponibles
      const { data: usersData } = await supabase
        .from('users')
        .select('id, first_name, last_name')
        .eq('company_id', userData.company_id)
        .eq('is_active', true)
      setCashiers(usersData || [])

      setLoading(false)
    }
    init()
  }, [])

  // Cargar ventas cuando cambia el usuario o los filtros
  useEffect(() => {
    if (company) loadSales()
  }, [company])

  // ============================================================
  // CARGAR VENTAS
  // ============================================================
  async function loadSales() {
    if (!company) return
    setFetching(true)

    // Rango de fechas
    const from = filters.dateFrom
      ? new Date(filters.dateFrom + 'T00:00:00').toISOString()
      : new Date(TODAY + 'T00:00:00').toISOString()
    const to = filters.dateTo
      ? new Date(filters.dateTo + 'T23:59:59').toISOString()
      : new Date(TODAY + 'T23:59:59').toISOString()

    let query = supabase
      .from('sales')
      .select(`
        id, created_at, total, subtotal, iva_amount, ila_amount,
        discount_amount, status, document_type, channel, items,
        user_id, cash_session_id, customer_name,
        users(first_name, last_name),
        cash_sessions(register_name)
      `)
      .eq('company_id', company.id)
      .gte('created_at', from)
      .lte('created_at', to)
      .order('created_at', { ascending: false })
      .limit(200)

    if (filters.cashier)   query = query.eq('user_id', filters.cashier)
    if (filters.status)    query = query.eq('status', filters.status)
    if (filters.minAmount) query = query.gte('total', parseFloat(filters.minAmount))
    if (filters.maxAmount) query = query.lte('total', parseFloat(filters.maxAmount))

    const { data, error } = await query

    if (error) {
      console.error('Error cargando ventas:', error)
      setFetching(false)
      return
    }

    // Normalizar datos joined
    const normalized: Sale[] = (data || []).map((s: any) => ({
      ...s,
      cashier_name:  s.users ? `${s.users.first_name} ${s.users.last_name}` : '—',
      register_name: s.cash_sessions?.register_name || '—',
    }))

    // Filtro por método de pago (no se puede hacer en SQL fácilmente con JSONB)
    const filtered = filters.method
      ? normalized.filter(s => {
          const items = s.items || []
          // El método está en payment_summary de la caja, no en la venta
          // Por ahora filtramos por lo que tenemos
          return true
        })
      : normalized

    setSales(filtered)

    // Calcular resumen
    setSummary({
      count:    filtered.length,
      total:    filtered.reduce((a, s) => a + (s.total || 0), 0),
      iva:      filtered.reduce((a, s) => a + (s.iva_amount || 0), 0),
      ila:      filtered.reduce((a, s) => a + (s.ila_amount || 0), 0),
      discount: filtered.reduce((a, s) => a + (s.discount_amount || 0), 0),
    })

    setFetching(false)
  }

  function applyFilters() {
    loadSales()
    setShowFilters(false)
  }

  function resetFilters() {
    setFilters(DEFAULT_FILTERS)
    setTimeout(() => loadSales(), 50)
  }

  // ============================================================
  // KEYBOARD — ESC cierra el modal de detalle
  // ============================================================
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') setSelected(null)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  // ============================================================
  // ESTILOS
  // ============================================================
  const S: Record<string, React.CSSProperties> = {
    page:    { minHeight:'100vh', background:'#0A1628', fontFamily:'Montserrat,sans-serif', color:'#F0F4FF', display:'flex', flexDirection:'column' },
    topbar:  { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 20px', gap:10, flexShrink:0 },
    logo:    { width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer', flexShrink:0 },
    body:    { flex:1, display:'flex', flexDirection:'column', padding:'0 0 20px', overflow:'hidden' },
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:500, display:'flex', alignItems:'flex-start', justifyContent:'center', overflowY:'auto', padding:'20px' },
    modal:   { background:'#111827', border:'1px solid rgba(93,224,230,.25)', borderRadius:16, padding:'24px 26px', width:'100%', maxWidth:580, color:'#F0F4FF', marginTop:20 },
    card:    { background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'14px 16px' },
    btn:     { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
    input:   { background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:7, padding:'8px 10px', fontSize:12, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif' },
    label:   { fontSize:10, fontWeight:600, color:'#8899BB', marginBottom:4, display:'block' } as React.CSSProperties,
    row:     { display:'flex', justifyContent:'space-between', padding:'5px 0', borderBottom:'1px solid rgba(93,224,230,.06)', fontSize:12 } as React.CSSProperties,
  }

  const statusColor = (s: string) => s === 'completed' ? '#22C55E' : s === 'voided' ? '#EF4444' : '#F59E0B'
  const statusLabel = (s: string) => ({ completed:'Completada', voided:'Anulada', refunded:'Devuelta', draft:'Borrador', partial_refund:'Devolución parcial' }[s] || s)

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando...
    </div>
  )

  // ============================================================
  // MODAL DE DETALLE DE VENTA
  // ============================================================
  const SaleModal = ({ sale }: { sale: Sale }) => {
    const items: any[] = sale.items || []
    const totalIva = items.reduce((a, i) => a + (i.iva_amount || 0), 0)
    const totalIla = items.reduce((a, i) => a + (i.ila_amount || 0), 0)
    const totalNeto = items.reduce((a, i) => a + ((i.unit_price || 0) * (i.quantity || 0) - (i.iva_amount || 0) - (i.ila_amount || 0)), 0)

    return (
      <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setSelected(null) }}>
        <div style={S.modal}>
          {/* Header */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:18 }}>
            <div>
              <div style={{ fontSize:16, fontWeight:700, marginBottom:4 }}>Detalle de venta</div>
              <div style={{ fontSize:10, color:'#8899BB', fontFamily:'monospace' }}>
                {String(sale.id).toUpperCase()}
              </div>
            </div>
            <button onClick={() => setSelected(null)} style={{ ...S.btn, background:'rgba(255,255,255,.05)', color:'#8899BB', padding:'4px 10px', fontSize:12 }}>
              ✕ Cerrar (Esc)
            </button>
          </div>

          {/* Metadata */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8, marginBottom:16 }}>
            {[
              ['📅 Fecha', fmtD(sale.created_at)],
              ['🕐 Hora', fmtT(sale.created_at)],
              ['👤 Cajero', sale.cashier_name || '—'],
              ['🏪 Caja', sale.register_name || '—'],
              ['📄 Documento', sale.document_type === 'boleta' ? 'Boleta' : sale.document_type],
              ['Estado', statusLabel(sale.status)],
            ].map(([l, v]) => (
              <div key={l} style={{ background:'#0D1525', borderRadius:8, padding:'8px 10px' }}>
                <div style={{ fontSize:10, color:'#8899BB' }}>{l}</div>
                <div style={{ fontSize:12, fontWeight:600, marginTop:2 }}>{v}</div>
              </div>
            ))}
          </div>

          {/* Productos */}
          <div style={{ marginBottom:14 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#8899BB', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Productos</div>
            <div style={{ background:'#0D1525', borderRadius:8, overflow:'hidden' }}>
              {/* Header */}
              <div style={{ display:'grid', gridTemplateColumns:'1fr 50px 70px 70px 70px', gap:6, padding:'6px 10px', borderBottom:'1px solid rgba(93,224,230,.08)', fontSize:9, fontWeight:700, color:'#8899BB', textTransform:'uppercase' }}>
                <span>Producto</span><span style={{ textAlign:'center' }}>Cant</span>
                <span style={{ textAlign:'right' }}>P.Unit</span>
                <span style={{ textAlign:'right' }}>Imp</span>
                <span style={{ textAlign:'right' }}>Total</span>
              </div>
              {items.length === 0 ? (
                <div style={{ padding:'14px 10px', fontSize:12, color:'#8899BB', textAlign:'center' }}>Sin detalle de productos</div>
              ) : items.map((item: any, idx: number) => (
                <div key={idx} style={{ display:'grid', gridTemplateColumns:'1fr 50px 70px 70px 70px', gap:6, padding:'7px 10px', borderBottom:'1px solid rgba(93,224,230,.04)', fontSize:11 }}>
                  <div>
                    <div style={{ fontWeight:600 }}>{item.name || '—'}</div>
                    <div style={{ fontSize:9, color:'#8899BB', marginTop:1 }}>
                      {item.sku && <span>SKU: {item.sku} · </span>}
                      <span style={{ color: item.tax_type?.startsWith('ila') ? '#F59E0B' : item.tax_type === 'cigars' ? '#6B7280' : '#8899BB' }}>
                        {TAX_LABELS[item.tax_type] || 'IVA 19%'}
                      </span>
                    </div>
                  </div>
                  <div style={{ textAlign:'center', fontWeight:700 }}>{item.quantity || 0}</div>
                  <div style={{ textAlign:'right', color:'#8899BB' }}>{fmt(item.unit_price || 0)}</div>
                  <div style={{ textAlign:'right', fontSize:9 }}>
                    {item.iva_amount > 0 && <div style={{ color:'#8899BB' }}>IVA {fmt(item.iva_amount)}</div>}
                    {item.ila_amount > 0 && <div style={{ color:'#F59E0B' }}>ILA {fmt(item.ila_amount)}</div>}
                    {(item.tax_type === 'cigars' || item.tax_type === 'exempt') && <div style={{ color:'#6B7280' }}>Exento</div>}
                  </div>
                  <div style={{ textAlign:'right', fontWeight:700, color:'#5DE0E6' }}>{fmt(item.total || item.unit_price * item.quantity || 0)}</div>
                </div>
              ))}
            </div>
          </div>

          {/* Resumen tributario */}
          <div style={{ background:'#0D1525', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12 }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#8899BB', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Resumen tributario</div>
            <div style={S.row}><span style={{ color:'#8899BB' }}>Subtotal neto</span><span>{fmt(sale.subtotal || totalNeto)}</span></div>
            {(sale.iva_amount > 0 || totalIva > 0) && <div style={S.row}><span style={{ color:'#8899BB' }}>IVA (19%)</span><span>{fmt(sale.iva_amount || totalIva)}</span></div>}
            {(sale.ila_amount > 0 || totalIla > 0) && <div style={S.row}><span style={{ color:'#F59E0B' }}>ILA (alcohol)</span><span style={{ color:'#F59E0B' }}>{fmt(sale.ila_amount || totalIla)}</span></div>}
            {sale.discount_amount > 0 && <div style={S.row}><span style={{ color:'#22C55E' }}>Descuento</span><span style={{ color:'#22C55E' }}>-{fmt(sale.discount_amount)}</span></div>}
            <div style={{ display:'flex', justifyContent:'space-between', paddingTop:8, marginTop:4, borderTop:'1px solid rgba(93,224,230,.1)', fontWeight:800, fontSize:15, color:'#5DE0E6' }}>
              <span>TOTAL</span><span>{fmt(sale.total)}</span>
            </div>
          </div>

          {/* Estado */}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderRadius:8, background: sale.status === 'completed' ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border:`1px solid ${sale.status === 'completed' ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
            <span style={{ fontSize:12, fontWeight:700, color: statusColor(sale.status) }}>
              {statusLabel(sale.status)}
            </span>
            <span style={{ fontSize:11, color:'#8899BB' }}>
              {sale.channel === 'pos' ? '🖥 POS' : sale.channel}
            </span>
          </div>
        </div>
      </div>
    )
  }

  // ============================================================
  // RENDER PRINCIPAL
  // ============================================================
  return (
    <div style={S.page}>
      {/* Modal de detalle */}
      {selected && <SaleModal sale={selected} />}

      {/* Topbar */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Historial de Ventas</span>
        <span style={{ fontSize:11, color:'#8899BB' }}>{company?.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => router.push('/pos')} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
          💳 POS
        </button>
        <button onClick={() => router.push('/caja')} style={{ ...S.btn, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', padding:'4px 12px', fontSize:11 }}>
          🏪 Caja
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>
          ← Dashboard
        </button>
      </div>

      {/* Barra de filtros rápidos */}
      <div style={{ background:'#111827', borderBottom:'1px solid rgba(93,224,230,.08)', padding:'10px 20px', display:'flex', gap:10, alignItems:'center', flexShrink:0, flexWrap:'wrap' as 'wrap' }}>
        {/* Rango de fechas */}
        <div style={{ display:'flex', alignItems:'center', gap:6 }}>
          <span style={{ fontSize:11, color:'#8899BB' }}>Desde</span>
          <input type="date" value={filters.dateFrom}
            onChange={e => setFilters(f => ({ ...f, dateFrom: e.target.value }))}
            style={{ ...S.input, padding:'5px 8px', fontSize:11 }}
          />
          <span style={{ fontSize:11, color:'#8899BB' }}>hasta</span>
          <input type="date" value={filters.dateTo}
            onChange={e => setFilters(f => ({ ...f, dateTo: e.target.value }))}
            style={{ ...S.input, padding:'5px 8px', fontSize:11 }}
          />
        </div>

        {/* Cajero */}
        <select value={filters.cashier} onChange={e => setFilters(f => ({ ...f, cashier: e.target.value }))}
          style={{ ...S.input, padding:'5px 8px', fontSize:11 }}>
          <option value="">Todos los cajeros</option>
          {cashiers.map(c => (
            <option key={c.id} value={c.id}>{c.first_name} {c.last_name}</option>
          ))}
        </select>

        {/* Estado */}
        <select value={filters.status} onChange={e => setFilters(f => ({ ...f, status: e.target.value }))}
          style={{ ...S.input, padding:'5px 8px', fontSize:11 }}>
          <option value="">Todos los estados</option>
          <option value="completed">Completadas</option>
          <option value="voided">Anuladas</option>
          <option value="refunded">Devueltas</option>
        </select>

        {/* Acciones */}
        <button onClick={applyFilters} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'6px 16px', fontSize:11 }}>
          🔍 Buscar
        </button>
        <button onClick={resetFilters} style={{ ...S.btn, background:'rgba(255,255,255,.05)', border:'1px solid rgba(93,224,230,.15)', color:'#8899BB', padding:'6px 12px', fontSize:11 }}>
          ✕ Limpiar
        </button>

        <div style={{ marginLeft:'auto', fontSize:11, color:'#8899BB' }}>
          {fetching ? '⏳ Cargando...' : `${summary.count} ventas`}
        </div>
      </div>

      {/* Cards de resumen */}
      <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, padding:'14px 20px', flexShrink:0 }}>
        {[
          { label:'Total ventas', value: fmt(summary.total), color:'#5DE0E6', icon:'💰' },
          { label:'IVA recaudado', value: fmt(summary.iva), color:'#8899BB', icon:'📊' },
          { label:'ILA (alcohol)', value: fmt(summary.ila), color:'#F59E0B', icon:'🍺' },
          { label:'Descuentos', value: fmt(summary.discount), color:'#22C55E', icon:'🏷️' },
        ].map(c => (
          <div key={c.label} style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'12px 14px' }}>
            <div style={{ fontSize:11, color:'#8899BB', marginBottom:4 }}>{c.icon} {c.label}</div>
            <div style={{ fontSize:18, fontWeight:800, color: c.color }}>{c.value}</div>
          </div>
        ))}
      </div>

      {/* Tabla de ventas */}
      <div style={{ flex:1, overflowY:'auto', padding:'0 20px' }}>
        {fetching ? (
          <div style={{ textAlign:'center', padding:60, color:'#8899BB', fontSize:13 }}>
            ⏳ Cargando ventas...
          </div>
        ) : sales.length === 0 ? (
          <div style={{ textAlign:'center', padding:60, color:'#8899BB' }}>
            <div style={{ fontSize:36, marginBottom:12 }}>📋</div>
            <div style={{ fontSize:14, fontWeight:600, marginBottom:6 }}>Sin ventas en este período</div>
            <div style={{ fontSize:12 }}>Ajusta los filtros o cambia el rango de fechas</div>
          </div>
        ) : (
          <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, overflow:'hidden' }}>
            {/* Header de tabla */}
            <div style={{ display:'grid', gridTemplateColumns:'140px 1fr 1fr 120px 100px 80px 80px', gap:8, padding:'8px 14px', background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.1)', fontSize:9, fontWeight:700, color:'#8899BB', textTransform:'uppercase', letterSpacing:'.5px' }}>
              <span>Fecha / Hora</span>
              <span>Cajero</span>
              <span>Caja</span>
              <span style={{ textAlign:'right' }}>Total</span>
              <span style={{ textAlign:'center' }}>Impuestos</span>
              <span style={{ textAlign:'center' }}>Estado</span>
              <span></span>
            </div>

            {/* Filas */}
            {sales.map((sale, idx) => (
              <div
                key={sale.id}
                onClick={() => setSelected(sale)}
                style={{
                  display:'grid', gridTemplateColumns:'140px 1fr 1fr 120px 100px 80px 80px',
                  gap:8, padding:'10px 14px', cursor:'pointer',
                  background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)',
                  borderBottom:'1px solid rgba(93,224,230,.04)',
                  transition:'background .1s',
                }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,74,173,.12)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)'}
              >
                {/* Fecha/hora */}
                <div>
                  <div style={{ fontSize:11, fontWeight:600 }}>{fmtD(sale.created_at)}</div>
                  <div style={{ fontSize:10, color:'#8899BB' }}>{fmtT(sale.created_at)}</div>
                </div>

                {/* Cajero */}
                <div style={{ fontSize:12, color:'#F0F4FF', alignSelf:'center' }}>
                  {sale.cashier_name || '—'}
                </div>

                {/* Caja */}
                <div style={{ fontSize:12, color:'#8899BB', alignSelf:'center' }}>
                  {sale.register_name || '—'}
                </div>

                {/* Total */}
                <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6', textAlign:'right', alignSelf:'center' }}>
                  {fmt(sale.total)}
                </div>

                {/* Impuestos */}
                <div style={{ textAlign:'center', alignSelf:'center', fontSize:10 }}>
                  {sale.iva_amount > 0 && <div style={{ color:'#8899BB' }}>IVA {fmt(sale.iva_amount)}</div>}
                  {sale.ila_amount > 0 && <div style={{ color:'#F59E0B' }}>ILA {fmt(sale.ila_amount)}</div>}
                  {sale.iva_amount === 0 && sale.ila_amount === 0 && <span style={{ color:'#6B7280' }}>Exento</span>}
                </div>

                {/* Estado */}
                <div style={{ textAlign:'center', alignSelf:'center' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: sale.status === 'completed' ? 'rgba(34,197,94,.12)' : 'rgba(239,68,68,.12)', color: statusColor(sale.status) }}>
                    {statusLabel(sale.status)}
                  </span>
                </div>

                {/* Ver detalle */}
                <div style={{ textAlign:'center', alignSelf:'center' }}>
                  <span style={{ fontSize:10, color:'#5DE0E6', fontWeight:600 }}>Ver →</span>
                </div>
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  )
}
