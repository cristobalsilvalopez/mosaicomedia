'use client'

import { useEffect, useState, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase = createClient()
const fmt  = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtD = (d: string) => new Date(d + 'T12:00:00').toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })

// ─── Tipos ───────────────────────────────────────────────────────────────────

interface Supplier {
  id: string; name: string; rut: string; contact_name: string
  phone: string; email: string; address: string; city: string
  category: string; notes: string; is_active: boolean; created_at: string
}

interface PurchaseOrder {
  id: string; order_number: string; status: string
  order_date: string; expected_date: string | null; received_date: string | null
  supplier_id: string; supplier_name: string
  subtotal: number; tax_amount: number; total: number
  notes: string; item_count: number; created_at: string
}

interface OrderItem {
  product_id: string; product_name: string; sku: string
  quantity_ordered: number; unit_cost: number
}

interface Product { id: string; name: string; sku: string; cost_price: number }

// ─── Constantes ───────────────────────────────────────────────────────────────

const CATEGORIES: Record<string, { label: string; color: string }> = {
  bebidas:  { label: 'Bebidas',   color: '#5DE0E6' },
  almacen:  { label: 'Almacén',   color: '#C19E4D' },
  limpieza: { label: 'Limpieza',  color: '#22C55E' },
  general:  { label: 'General',   color: '#8899BB' },
}

const STATUS: Record<string, { label: string; color: string; bg: string }> = {
  pending:   { label: 'Pendiente',  color: '#F59E0B', bg: 'rgba(245,158,11,.12)' },
  received:  { label: 'Recibida',   color: '#22C55E', bg: 'rgba(34,197,94,.12)'  },
  partial:   { label: 'Parcial',    color: '#5DE0E6', bg: 'rgba(93,224,230,.12)' },
  cancelled: { label: 'Cancelada',  color: '#EF4444', bg: 'rgba(239,68,68,.12)'  },
}

const EMPTY_SUPPLIER = {
  id: '', name: '', rut: '', contact_name: '', phone: '', email: '',
  address: '', city: '', category: 'general', notes: '',
}

// ─── Componente principal ─────────────────────────────────────────────────────

export default function ProveedoresPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Datos
  const [suppliers, setSuppliers]   = useState<Supplier[]>([])
  const [orders,    setOrders]      = useState<PurchaseOrder[]>([])
  const [products,  setProducts]    = useState<Product[]>([])
  const [fetching,  setFetching]    = useState(false)

  // UI
  const [tab,    setTab]    = useState<'proveedores' | 'ordenes'>('proveedores')
  const [search, setSearch] = useState('')

  // Modal proveedor
  const [showSupplier, setShowSupplier] = useState(false)
  const [supplierForm, setSupplierForm] = useState<any>(EMPTY_SUPPLIER)
  const [savingSupplier, setSavingSupplier] = useState(false)
  const [supplierError, setSupplierError]   = useState('')

  // Modal nueva OC
  const [showOrder,   setShowOrder]   = useState(false)
  const [orderSupplier, setOrderSupplier] = useState('')
  const [orderItems, setOrderItems]   = useState<OrderItem[]>([{
    product_id: '', product_name: '', sku: '', quantity_ordered: 1, unit_cost: 0,
  }])
  const [orderNotes,    setOrderNotes]    = useState('')
  const [orderExpected, setOrderExpected] = useState('')
  const [savingOrder,   setSavingOrder]   = useState(false)
  const [orderError,    setOrderError]    = useState('')

  // Modal detalle OC
  const [detailOrder, setDetailOrder] = useState<PurchaseOrder | null>(null)
  const [orderDetail, setOrderDetail] = useState<any[]>([])
  const [receiving,   setReceiving]   = useState(false)

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

  const loadData = useCallback(async () => {
    if (!company) return
    setFetching(true)
    const [{ data: sups }, { data: ords }, { data: prods }] = await Promise.all([
      supabase.from('suppliers').select('*').eq('company_id', company.id).order('name'),
      supabase.rpc('get_purchase_orders', { p_company_id: company.id }),
      supabase.from('products').select('id, name, sku, cost_price').eq('company_id', company.id).eq('is_active', true).order('name'),
    ])
    setSuppliers((sups as Supplier[]) || [])
    setOrders((ords as PurchaseOrder[]) || [])
    setProducts((prods as Product[]) || [])
    setFetching(false)
  }, [company])

  // eslint-disable-next-line react-hooks/set-state-in-effect
  useEffect(() => { if (company) loadData() }, [company])

  // ── Proveedor ─────────────────────────────────────────────────────────────

  function openNewSupplier() {
    setSupplierForm(EMPTY_SUPPLIER)
    setSupplierError('')
    setShowSupplier(true)
  }
  function openEditSupplier(s: Supplier) {
    setSupplierForm({ ...s })
    setSupplierError('')
    setShowSupplier(true)
  }
  async function saveSupplier() {
    if (!supplierForm.name.trim()) { setSupplierError('El nombre es obligatorio'); return }
    setSavingSupplier(true); setSupplierError('')
    const { data, error } = await supabase.rpc('upsert_supplier', { p_data: supplierForm })
    setSavingSupplier(false)
    if (error || !data?.success) { setSupplierError(error?.message || data?.error || 'Error al guardar'); return }
    setShowSupplier(false)
    await loadData()
  }

  // ── Nueva OC ──────────────────────────────────────────────────────────────

  function openNewOrder() {
    setOrderSupplier('')
    setOrderItems([{ product_id: '', product_name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])
    setOrderNotes('')
    setOrderExpected('')
    setOrderError('')
    setShowOrder(true)
  }

  function setItem(i: number, key: keyof OrderItem, val: string | number) {
    setOrderItems(prev => {
      const next = [...prev]
      if (key === 'product_id' && typeof val === 'string') {
        const prod = products.find(p => p.id === val)
        next[i] = { ...next[i], product_id: val, product_name: prod?.name || '', sku: prod?.sku || '', unit_cost: prod?.cost_price || 0 }
      } else {
        next[i] = { ...next[i], [key]: val }
      }
      return next
    })
  }

  function addItem() {
    setOrderItems(prev => [...prev, { product_id: '', product_name: '', sku: '', quantity_ordered: 1, unit_cost: 0 }])
  }
  function removeItem(i: number) {
    setOrderItems(prev => prev.filter((_, idx) => idx !== i))
  }

  const orderSubtotal = orderItems.reduce((a, it) => a + (it.quantity_ordered * it.unit_cost), 0)
  const orderTax      = Math.round(orderSubtotal * 0.19)
  const orderTotal    = orderSubtotal + orderTax

  async function saveOrder() {
    if (!orderSupplier) { setOrderError('Selecciona un proveedor'); return }
    if (orderItems.some(it => !it.product_name.trim() || it.quantity_ordered <= 0 || it.unit_cost <= 0)) {
      setOrderError('Completa todos los ítems con nombre, cantidad y costo'); return
    }
    setSavingOrder(true); setOrderError('')
    const { data, error } = await supabase.rpc('create_purchase_order', {
      p_data: {
        supplier_id: orderSupplier,
        expected_date: orderExpected,
        notes: orderNotes,
        items: orderItems,
      },
    })
    setSavingOrder(false)
    if (error || !data?.success) { setOrderError(error?.message || data?.error || 'Error al crear OC'); return }
    setShowOrder(false)
    await loadData()
  }

  // ── Detalle OC ────────────────────────────────────────────────────────────

  async function openDetail(o: PurchaseOrder) {
    setDetailOrder(o)
    const { data } = await supabase
      .from('purchase_order_items')
      .select('*')
      .eq('order_id', o.id)
    setOrderDetail(data || [])
  }

  async function receiveOrder() {
    if (!detailOrder) return
    if (!confirm(`¿Confirmar recepción de la OC ${detailOrder.order_number}?\nEsto actualizará el stock de todos los productos.`)) return
    setReceiving(true)
    const { data, error } = await supabase.rpc('receive_purchase_order', { p_order_id: detailOrder.id })
    setReceiving(false)
    if (error || !data?.success) { alert(error?.message || data?.error || 'Error'); return }
    setDetailOrder(null)
    await loadData()
  }

  // ── Loading / guard ───────────────────────────────────────────────────────

  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5DE0E6', fontFamily: 'Montserrat,sans-serif' }}>
      ⏳ Cargando...
    </div>
  )

  // ── Estilos ───────────────────────────────────────────────────────────────

  const S: Record<string, React.CSSProperties> = {
    page:    { minHeight: '100vh', background: 'var(--mp-bg, #0A1628)', fontFamily: 'Montserrat,sans-serif', color: 'var(--mp-text, #F0F4FF)', display: 'flex', flexDirection: 'column' },
    topbar:  { height: 50, background: '#111827', borderBottom: '1px solid rgba(93,224,230,.12)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 },
    logo:    { width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0 },
    body:    { flex: 1, padding: 20, overflowY: 'auto' as const },
    card:    { background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 },
    btn:     { border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 } as React.CSSProperties,
    input:   { background: '#0A1628', border: '1px solid rgba(93,224,230,.15)', borderRadius: 7, padding: '8px 10px', fontSize: 12, color: '#F0F4FF', outline: 'none', fontFamily: 'Montserrat,sans-serif', width: '100%', boxSizing: 'border-box' as const } as React.CSSProperties,
    label:   { fontSize: 11, fontWeight: 600, color: '#8899BB', marginBottom: 4, display: 'block' } as React.CSSProperties,
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as React.CSSProperties,
    sh:      { fontSize: 11, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, letterSpacing: '.05em' },
  }

  const filteredSuppliers = suppliers.filter(s =>
    !search || s.name.toLowerCase().includes(search.toLowerCase()) ||
    (s.rut || '').includes(search) || (s.contact_name || '').toLowerCase().includes(search.toLowerCase())
  )
  const filteredOrders = orders.filter(o =>
    !search || o.order_number.includes(search) ||
    o.supplier_name.toLowerCase().includes(search.toLowerCase())
  )

  // ── Render ────────────────────────────────────────────────────────────────

  return (
    <div style={S.page}>

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight: 800, fontSize: 13 }}>Proveedores</span>
        <span style={{ fontSize: 11, color: '#8899BB' }}>{company?.name}</span>
        <div style={{ flex: 1 }} />
        <button onClick={() => { openNewOrder(); setTab('ordenes') }} style={{ ...S.btn, background: 'rgba(0,74,173,.2)', border: '1px solid rgba(93,224,230,.2)', color: '#5DE0E6', padding: '4px 14px', fontSize: 11 }}>
          + Nueva OC
        </button>
        <button onClick={openNewSupplier} style={{ ...S.btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '4px 14px', fontSize: 11 }}>
          + Proveedor
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background: 'transparent', border: '1px solid rgba(93,224,230,.2)', color: '#8899BB', padding: '4px 12px', fontSize: 11 }}>
          ← Dashboard
        </button>
      </div>

      <div style={S.body}>

        {/* KPIs */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(4,1fr)', gap: 12, marginBottom: 16 }}>
          {[
            { icon: '🏢', label: 'Proveedores activos', value: suppliers.filter(s => s.is_active).length, color: '#5DE0E6' },
            { icon: '📋', label: 'OC pendientes',       value: orders.filter(o => o.status === 'pending').length, color: '#F59E0B' },
            { icon: '✅', label: 'OC recibidas (mes)',  value: orders.filter(o => o.status === 'received' && new Date(o.created_at).getMonth() === new Date().getMonth()).length, color: '#22C55E' },
            { icon: '💰', label: 'Compras pendientes',  value: fmt(orders.filter(o => o.status === 'pending').reduce((a, o) => a + o.total, 0)), color: '#C19E4D' },
          ].map(k => (
            <div key={k.label} style={{ background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 10, padding: '12px 16px' }}>
              <div style={{ fontSize: 18, marginBottom: 4 }}>{k.icon}</div>
              <div style={{ fontSize: 10, color: '#8899BB' }}>{k.label}</div>
              <div style={{ fontSize: typeof k.value === 'number' ? 22 : 16, fontWeight: 800, color: k.color, marginTop: 4 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* TABS + BÚSQUEDA */}
        <div style={{ display: 'flex', alignItems: 'center', gap: 10, marginBottom: 14 }}>
          <div style={{ display: 'flex', gap: 4, background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 10, padding: 4 }}>
            {(['proveedores', 'ordenes'] as const).map(t => (
              <button key={t} onClick={() => setTab(t)}
                style={{ ...S.btn, padding: '6px 16px', fontSize: 12, borderRadius: 7, background: tab === t ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: tab === t ? '#fff' : '#8899BB' }}>
                {t === 'proveedores' ? `🏢 Proveedores (${suppliers.length})` : `📋 Órdenes de compra (${orders.length})`}
              </button>
            ))}
          </div>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar..."
            style={{ ...S.input, width: 220 }} />
          <button onClick={() => setSearch('')} style={{ ...S.btn, background: 'transparent', border: '1px solid rgba(93,224,230,.15)', color: '#8899BB', padding: '7px 10px', fontSize: 11 }}>✕</button>
        </div>

        {/* ── TAB PROVEEDORES ── */}
        {tab === 'proveedores' && (
          <div style={S.card}>
            {filteredSuppliers.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 50, color: '#8899BB' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>🏢</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Sin proveedores registrados</div>
                <div style={{ fontSize: 12 }}>Agrega tu primer proveedor con el botón de arriba</div>
              </div>
            ) : (
              <>
                {/* Header */}
                <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 130px 130px 90px 100px', gap: 8, padding: '6px 12px', background: '#0D1525', borderRadius: 6, fontSize: 9, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4 }}>
                  <span>Proveedor</span><span>RUT</span><span>Contacto</span><span>Teléfono</span><span>Categoría</span><span style={{ textAlign: 'center' as const }}>Acciones</span>
                </div>
                {filteredSuppliers.map(s => {
                  const cat = CATEGORIES[s.category] || CATEGORIES.general
                  return (
                    <div key={s.id} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 130px 130px 90px 100px', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(93,224,230,.04)', fontSize: 12, alignItems: 'center' }}>
                      <div>
                        <div style={{ fontWeight: 600 }}>{s.name}</div>
                        {s.email && <div style={{ fontSize: 10, color: '#8899BB' }}>{s.email}</div>}
                      </div>
                      <span style={{ color: '#8899BB', fontSize: 11 }}>{s.rut || '—'}</span>
                      <span style={{ color: '#F0F4FF' }}>{s.contact_name || '—'}</span>
                      <span style={{ color: '#8899BB' }}>{s.phone || '—'}</span>
                      <span style={{ fontSize: 10, fontWeight: 700, padding: '2px 8px', borderRadius: 20, background: 'rgba(93,224,230,.08)', color: cat.color }}>
                        {cat.label}
                      </span>
                      <div style={{ display: 'flex', gap: 4, justifyContent: 'center' as const }}>
                        <button onClick={() => openEditSupplier(s)} style={{ ...S.btn, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.2)', color: '#5DE0E6', padding: '5px 8px', fontSize: 12 }}>✏️</button>
                        <button onClick={() => { setOrderSupplier(s.id); openNewOrder(); setTab('ordenes') }}
                          style={{ ...S.btn, background: 'rgba(0,74,173,.15)', border: '1px solid rgba(93,224,230,.15)', color: '#5DE0E6', padding: '5px 8px', fontSize: 11 }}>
                          + OC
                        </button>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}

        {/* ── TAB ÓRDENES ── */}
        {tab === 'ordenes' && (
          <div style={S.card}>
            {filteredOrders.length === 0 ? (
              <div style={{ textAlign: 'center', padding: 50, color: '#8899BB' }}>
                <div style={{ fontSize: 36, marginBottom: 10 }}>📋</div>
                <div style={{ fontWeight: 700, marginBottom: 6 }}>Sin órdenes de compra</div>
                <div style={{ fontSize: 12 }}>Crea la primera desde el botón &ldquo;Nueva OC&rdquo;</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 90px 90px 90px 80px 90px', gap: 8, padding: '6px 12px', background: '#0D1525', borderRadius: 6, fontSize: 9, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 4 }}>
                  <span>N° OC</span><span>Proveedor</span><span>Fecha</span><span>Ítems</span><span style={{ textAlign: 'right' as const }}>Subtotal</span><span style={{ textAlign: 'right' as const }}>IVA</span><span style={{ textAlign: 'right' as const }}>Total</span><span style={{ textAlign: 'center' as const }}>Estado</span>
                </div>
                {filteredOrders.map(o => {
                  const st = STATUS[o.status] || STATUS.pending
                  return (
                    <div key={o.id}
                      onClick={() => openDetail(o)}
                      style={{ display: 'grid', gridTemplateColumns: '120px 1fr 100px 90px 90px 90px 80px 90px', gap: 8, padding: '10px 12px', borderBottom: '1px solid rgba(93,224,230,.04)', fontSize: 12, alignItems: 'center', cursor: 'pointer' }}
                      onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,74,173,.08)'}
                      onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = 'transparent'}
                    >
                      <span style={{ fontWeight: 700, color: '#5DE0E6', fontSize: 11 }}>{o.order_number}</span>
                      <div>
                        <div style={{ fontWeight: 600 }}>{o.supplier_name}</div>
                        {o.expected_date && <div style={{ fontSize: 10, color: '#8899BB' }}>Esperada: {fmtD(o.expected_date)}</div>}
                      </div>
                      <span style={{ color: '#8899BB' }}>{fmtD(o.order_date)}</span>
                      <span style={{ textAlign: 'center' as const, color: '#8899BB' }}>{o.item_count}</span>
                      <span style={{ textAlign: 'right' as const, color: '#8899BB' }}>{fmt(o.subtotal)}</span>
                      <span style={{ textAlign: 'right' as const, color: '#8899BB' }}>{fmt(o.tax_amount)}</span>
                      <span style={{ textAlign: 'right' as const, fontWeight: 700 }}>{fmt(o.total)}</span>
                      <div style={{ textAlign: 'center' as const }}>
                        <span style={{ fontSize: 10, fontWeight: 700, padding: '3px 8px', borderRadius: 20, background: st.bg, color: st.color }}>{st.label}</span>
                      </div>
                    </div>
                  )
                })}
              </>
            )}
          </div>
        )}
      </div>

      {/* ── MODAL: PROVEEDOR ── */}
      {showSupplier && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setShowSupplier(false) }}>
          <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.25)', borderRadius: 14, padding: '24px 26px', width: 520, maxHeight: '85vh', overflowY: 'auto' as const }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>
              {supplierForm.id ? '✏️ Editar proveedor' : '🏢 Nuevo proveedor'}
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Nombre *</label>
                <input value={supplierForm.name} onChange={e => setSupplierForm((f: any) => ({ ...f, name: e.target.value }))} placeholder="Distribuidora CCU S.A." style={S.input} autoFocus />
              </div>
              <div>
                <label style={S.label}>RUT</label>
                <input value={supplierForm.rut} onChange={e => setSupplierForm((f: any) => ({ ...f, rut: e.target.value }))} placeholder="78.123.456-7" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Categoría</label>
                <select value={supplierForm.category} onChange={e => setSupplierForm((f: any) => ({ ...f, category: e.target.value }))} style={S.input}>
                  <option value="bebidas">Bebidas</option>
                  <option value="almacen">Almacén</option>
                  <option value="limpieza">Limpieza</option>
                  <option value="general">General</option>
                </select>
              </div>
              <div>
                <label style={S.label}>Nombre de contacto</label>
                <input value={supplierForm.contact_name} onChange={e => setSupplierForm((f: any) => ({ ...f, contact_name: e.target.value }))} placeholder="Pedro González" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Teléfono</label>
                <input value={supplierForm.phone} onChange={e => setSupplierForm((f: any) => ({ ...f, phone: e.target.value }))} placeholder="+56 9 1234 5678" style={S.input} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Email</label>
                <input type="email" value={supplierForm.email} onChange={e => setSupplierForm((f: any) => ({ ...f, email: e.target.value }))} placeholder="ventas@proveedor.cl" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Dirección</label>
                <input value={supplierForm.address} onChange={e => setSupplierForm((f: any) => ({ ...f, address: e.target.value }))} placeholder="Av. Industria 123" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Ciudad</label>
                <input value={supplierForm.city} onChange={e => setSupplierForm((f: any) => ({ ...f, city: e.target.value }))} placeholder="Santiago" style={S.input} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Notas</label>
                <textarea value={supplierForm.notes} onChange={e => setSupplierForm((f: any) => ({ ...f, notes: e.target.value }))}
                  placeholder="Días de entrega, condiciones de pago..." rows={2}
                  style={{ ...S.input, resize: 'vertical' as const }} />
              </div>
            </div>

            {supplierError && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#EF4444', marginTop: 12 }}>
                {supplierError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setShowSupplier(false)} style={{ ...S.btn, flex: 1, padding: 11, fontSize: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#8899BB' }}>
                Cancelar
              </button>
              <button onClick={saveSupplier} disabled={savingSupplier} style={{ ...S.btn, flex: 2, padding: 11, fontSize: 13, background: savingSupplier ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
                {savingSupplier ? '⏳ Guardando...' : supplierForm.id ? '💾 Actualizar' : '+ Crear proveedor'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: NUEVA OC ── */}
      {showOrder && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setShowOrder(false) }}>
          <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.25)', borderRadius: 14, padding: '24px 26px', width: 680, maxHeight: '88vh', overflowY: 'auto' as const }}>
            <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 20 }}>📋 Nueva orden de compra</div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12, marginBottom: 16 }}>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Proveedor *</label>
                <select value={orderSupplier} onChange={e => setOrderSupplier(e.target.value)} style={S.input}>
                  <option value="">Seleccionar proveedor...</option>
                  {suppliers.filter(s => s.is_active).map(s => (
                    <option key={s.id} value={s.id}>{s.name}</option>
                  ))}
                </select>
              </div>
              <div>
                <label style={S.label}>Fecha esperada de entrega</label>
                <input type="date" value={orderExpected} onChange={e => setOrderExpected(e.target.value)} style={S.input} />
              </div>
              <div>
                <label style={S.label}>Notas</label>
                <input value={orderNotes} onChange={e => setOrderNotes(e.target.value)} placeholder="Instrucciones de entrega..." style={S.input} />
              </div>
            </div>

            {/* Ítems */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 8 }}>Productos</div>
            <div style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 36px', gap: 6, padding: '5px 8px', background: '#0D1525', borderRadius: 6, fontSize: 9, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, letterSpacing: '.05em', marginBottom: 6 }}>
              <span>Producto</span><span style={{ textAlign: 'center' as const }}>Cantidad</span><span style={{ textAlign: 'right' as const }}>Costo unit.</span><span />
            </div>

            {orderItems.map((item, i) => (
              <div key={i} style={{ display: 'grid', gridTemplateColumns: '1fr 120px 100px 36px', gap: 6, marginBottom: 6, alignItems: 'center' }}>
                <select value={item.product_id} onChange={e => setItem(i, 'product_id', e.target.value)} style={S.input}>
                  <option value="">Seleccionar producto...</option>
                  {products.map(p => <option key={p.id} value={p.id}>{p.name}{p.sku ? ` (${p.sku})` : ''}</option>)}
                </select>
                <input type="number" min="1" value={item.quantity_ordered}
                  onChange={e => setItem(i, 'quantity_ordered', parseFloat(e.target.value) || 0)}
                  style={{ ...S.input, textAlign: 'center' as const }} />
                <input type="number" min="0" value={item.unit_cost}
                  onChange={e => setItem(i, 'unit_cost', parseFloat(e.target.value) || 0)}
                  placeholder="0" style={{ ...S.input, textAlign: 'right' as const }} />
                <button onClick={() => removeItem(i)} disabled={orderItems.length === 1}
                  style={{ ...S.btn, background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.2)', color: '#EF4444', padding: '7px', fontSize: 12, opacity: orderItems.length === 1 ? .3 : 1 }}>
                  ✕
                </button>
              </div>
            ))}

            <button onClick={addItem} style={{ ...S.btn, width: '100%', padding: '8px', fontSize: 12, background: 'rgba(93,224,230,.06)', border: '1px dashed rgba(93,224,230,.2)', color: '#5DE0E6', marginBottom: 16 }}>
              + Agregar producto
            </button>

            {/* Totales */}
            <div style={{ background: '#0A1628', borderRadius: 8, padding: '10px 14px', marginBottom: 14 }}>
              {[
                ['Subtotal neto', fmt(orderSubtotal), '#8899BB'],
                ['IVA (19%)',     fmt(orderTax),      '#8899BB'],
                ['Total',        fmt(orderTotal),     '#5DE0E6'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                  <span style={{ color: '#8899BB' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: c }}>{v}</span>
                </div>
              ))}
            </div>

            {orderError && (
              <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 7, padding: '8px 12px', fontSize: 12, color: '#EF4444', marginBottom: 12 }}>
                {orderError}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10 }}>
              <button onClick={() => setShowOrder(false)} style={{ ...S.btn, flex: 1, padding: 11, fontSize: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#8899BB' }}>
                Cancelar
              </button>
              <button onClick={saveOrder} disabled={savingOrder} style={{ ...S.btn, flex: 2, padding: 11, fontSize: 13, background: savingOrder ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
                {savingOrder ? '⏳ Creando...' : '📋 Crear orden de compra'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ── MODAL: DETALLE OC ── */}
      {detailOrder && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setDetailOrder(null) }}>
          <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.25)', borderRadius: 14, padding: '24px 26px', width: 560, maxHeight: '85vh', overflowY: 'auto' as const }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700 }}>{detailOrder.order_number}</div>
                <div style={{ fontSize: 12, color: '#8899BB', marginTop: 2 }}>{detailOrder.supplier_name} · {fmtD(detailOrder.order_date)}</div>
              </div>
              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: STATUS[detailOrder.status]?.bg, color: STATUS[detailOrder.status]?.color }}>
                {STATUS[detailOrder.status]?.label}
              </span>
            </div>

            {/* Ítems */}
            <div style={{ fontSize: 11, fontWeight: 700, color: '#8899BB', textTransform: 'uppercase' as const, marginBottom: 8 }}>Productos</div>
            {orderDetail.map((it: any, i: number) => (
              <div key={i} style={{ display: 'flex', justifyContent: 'space-between', padding: '8px 0', borderBottom: '1px solid rgba(93,224,230,.05)', fontSize: 12 }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{it.product_name}</div>
                  {it.sku && <div style={{ fontSize: 10, color: '#8899BB' }}>SKU: {it.sku}</div>}
                </div>
                <div style={{ textAlign: 'right' as const }}>
                  <div style={{ fontWeight: 700 }}>{fmt(it.unit_cost)} × {it.quantity_ordered}</div>
                  <div style={{ fontSize: 11, color: '#5DE0E6' }}>{fmt(it.total_cost)}</div>
                </div>
              </div>
            ))}

            {/* Totales */}
            <div style={{ marginTop: 12, background: '#0A1628', borderRadius: 8, padding: '10px 14px' }}>
              {[
                ['Subtotal', fmt(detailOrder.subtotal), '#8899BB'],
                ['IVA',      fmt(detailOrder.tax_amount), '#8899BB'],
                ['Total',    fmt(detailOrder.total),    '#5DE0E6'],
              ].map(([l, v, c]) => (
                <div key={l} style={{ display: 'flex', justifyContent: 'space-between', padding: '4px 0', fontSize: 12 }}>
                  <span style={{ color: '#8899BB' }}>{l}</span>
                  <span style={{ fontWeight: 700, color: c }}>{v}</span>
                </div>
              ))}
            </div>

            {detailOrder.notes && (
              <div style={{ marginTop: 10, fontSize: 12, color: '#8899BB', background: 'rgba(93,224,230,.04)', borderRadius: 7, padding: '8px 12px' }}>
                📝 {detailOrder.notes}
              </div>
            )}

            <div style={{ display: 'flex', gap: 10, marginTop: 20 }}>
              <button onClick={() => setDetailOrder(null)} style={{ ...S.btn, flex: 1, padding: 11, fontSize: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#8899BB' }}>
                Cerrar
              </button>
              {detailOrder.status === 'pending' && (
                <button onClick={receiveOrder} disabled={receiving}
                  style={{ ...S.btn, flex: 2, padding: 11, fontSize: 13, background: receiving ? 'rgba(34,197,94,.2)' : 'rgba(34,197,94,.15)', border: '1px solid rgba(34,197,94,.3)', color: '#22C55E' }}>
                  {receiving ? '⏳ Procesando...' : '✅ Marcar como recibida y actualizar stock'}
                </button>
              )}
            </div>
          </div>
        </div>
      )}

    </div>
  )
}
