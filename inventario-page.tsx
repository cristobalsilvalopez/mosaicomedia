'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()
const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')

// ============================================================
// TIPOS
// ============================================================
interface Product {
  id: string; name: string; sku: string; barcode: string
  sale_price: number; cost_price: number; margin_percent: number
  tax_type: string; min_stock_alert: number; is_active: boolean
  description: string; category_id: string; category_name: string
  stock: number; available_stock: number; stock_status: 'ok'|'low'|'critical'|'out'
  sold_30d: number; revenue_30d: number; last_updated: string
}

interface Movement {
  id: string; movement_type: string; quantity: number
  quantity_before: number; quantity_after: number
  notes: string; created_at: string; user_name: string
}

const STOCK_STATUS = {
  ok:       { label:'OK',       color:'#22C55E', bg:'rgba(34,197,94,.1)' },
  low:      { label:'Bajo',     color:'#F59E0B', bg:'rgba(245,158,11,.1)' },
  critical: { label:'Crítico',  color:'#EF4444', bg:'rgba(239,68,68,.1)' },
  out:      { label:'Sin stock',color:'#EF4444', bg:'rgba(239,68,68,.15)' },
}

const TAX_OPTIONS = [
  { value:'iva',         label:'IVA 19%' },
  { value:'ila_beer',    label:'IVA + ILA Cerveza (31.5%)' },
  { value:'ila_wine',    label:'IVA + ILA Vino (20.5%)' },
  { value:'ila_spirits', label:'IVA + ILA Destilados (31.5%)' },
  { value:'exempt',      label:'Exento IVA' },
  { value:'cigars',      label:'Cigarros (Exento IVA)' },
]

const MOVE_TYPES = {
  sale:     { label:'Venta',         icon:'🛒', color:'#EF4444' },
  purchase: { label:'Compra',        icon:'📦', color:'#22C55E' },
  adjustment:{ label:'Ajuste',       icon:'🔧', color:'#F59E0B' },
  return:   { label:'Devolución',    icon:'↩️', color:'#5DE0E6' },
  void:     { label:'Anulación',     icon:'🗑', color:'#8899BB' },
  opening:  { label:'Stock inicial', icon:'🏁', color:'#C19E4D' },
  count:    { label:'Conteo',        icon:'📊', color:'#A78BFA' },
}

const EMPTY_PRODUCT = {
  id:'', name:'', sku:'', barcode:'', category_id:'',
  sale_price:'', cost_price:'', tax_type:'iva',
  min_stock_alert:'5', description:'', initial_stock:'0',
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function InventarioPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [warehouse, setWarehouse] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Datos
  const [products, setProducts]     = useState<Product[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [fetching, setFetching]     = useState(false)

  // Filtros
  const [search, setSearch]               = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus]   = useState('')

  // Vista activa
  const [view, setView] = useState<'list'|'edit'|'movements'>('list')

  // Producto seleccionado
  const [selected, setSelected]     = useState<Product | null>(null)
  const [movements, setMovements]   = useState<Movement[]>([])
  const [movFetching, setMovFetching] = useState(false)

  // Formulario producto
  const [form, setForm]   = useState<any>(EMPTY_PRODUCT)
  const [saving, setSaving] = useState(false)
  const [formError, setFormError] = useState('')

  // Modal ajuste de stock
  const [showAdjust, setShowAdjust] = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [adjustType, setAdjustType]   = useState<'purchase'|'adjustment'|'return'|'count'>('purchase')
  const [adjustQty, setAdjustQty]     = useState('')
  const [adjustNote, setAdjustNote]   = useState('')
  const [adjusting, setAdjusting]     = useState(false)

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }
      const { data: userData } = await supabase
        .from('users').select('id, first_name, company_id, companies(id, name)')
        .eq('auth_user_id', session.user.id).single()
      if (!userData) { router.push('/login'); return }
      setUser(userData)
      setCompany((userData as any).companies)

      // Cargar bodega principal
      const { data: wh } = await supabase
        .from('warehouses').select('id, name')
        .eq('company_id', userData.company_id)
        .eq('is_active', true).limit(1).single()
      setWarehouse(wh)

      // Cargar categorías
      const { data: cats } = await supabase
        .from('categories').select('id, name')
        .eq('company_id', userData.company_id)
        .eq('is_active', true).order('name')
      setCategories(cats || [])

      await loadInventory(userData.company_id)
      setLoading(false)
    }
    init()
  }, [])

  // ============================================================
  // CARGAR INVENTARIO
  // ============================================================
  async function loadInventory(companyId?: string) {
    const cId = companyId || company?.id
    if (!cId) return
    setFetching(true)
    const { data, error } = await supabase.rpc('get_inventory', { p_company_id: cId })
    if (!error) setProducts((data as Product[]) || [])
    setFetching(false)
  }

  // ============================================================
  // FILTROS
  // ============================================================
  const filtered = products.filter(p => {
    const matchSearch   = !search || p.name.toLowerCase().includes(search.toLowerCase()) || (p.sku||'').toLowerCase().includes(search.toLowerCase())
    const matchCat      = !filterCategory || p.category_id === filterCategory
    const matchStatus   = !filterStatus   || p.stock_status === filterStatus
    return matchSearch && matchCat && matchStatus
  })

  // Métricas del inventario filtrado
  const totalProducts  = filtered.length
  const outOfStock     = filtered.filter(p => p.stock_status === 'out').length
  const lowStock       = filtered.filter(p => p.stock_status === 'low' || p.stock_status === 'critical').length
  const totalStockValue = filtered.reduce((a, p) => a + (p.stock * p.cost_price), 0)

  // ============================================================
  // ABRIR FORMULARIO
  // ============================================================
  function openNew() {
    setForm({ ...EMPTY_PRODUCT })
    setFormError('')
    setView('edit')
    setSelected(null)
  }

  function openEdit(p: Product) {
    setForm({
      id: p.id, name: p.name, sku: p.sku || '', barcode: p.barcode || '',
      category_id: p.category_id || '', description: p.description || '',
      sale_price: String(p.sale_price), cost_price: String(p.cost_price),
      tax_type: p.tax_type, min_stock_alert: String(p.min_stock_alert),
      initial_stock: '0',
    })
    setFormError('')
    setSelected(p)
    setView('edit')
  }

  async function openMovements(p: Product) {
    setSelected(p)
    setView('movements')
    setMovFetching(true)
    const { data } = await supabase.rpc('get_product_movements', {
      p_company_id: company.id,
      p_product_id: p.id,
      p_limit:      50,
    })
    setMovements((data as Movement[]) || [])
    setMovFetching(false)
  }

  // ============================================================
  // GUARDAR PRODUCTO
  // ============================================================
  async function saveProduct() {
    if (!form.name.trim()) { setFormError('El nombre es obligatorio'); return }
    if (!form.sale_price || parseFloat(form.sale_price) <= 0) { setFormError('El precio de venta es obligatorio'); return }
    setSaving(true)
    setFormError('')

    const payload = {
      ...form,
      company_id:      company.id,
      sale_price:      parseFloat(form.sale_price) || 0,
      cost_price:      parseFloat(form.cost_price) || 0,
      min_stock_alert: parseInt(form.min_stock_alert) || 5,
      initial_stock:   parseFloat(form.initial_stock) || 0,
    }

    const { data, error } = await supabase.rpc('upsert_product', { p_data: payload })
    setSaving(false)

    if (error || !data?.success) {
      setFormError(error?.message || 'Error al guardar el producto')
      return
    }

    await loadInventory()
    setView('list')
  }

  // ============================================================
  // AJUSTE DE STOCK
  // ============================================================
  function openAdjust(p: Product) {
    setAdjustProduct(p)
    setAdjustType('purchase')
    setAdjustQty('')
    setAdjustNote('')
    setShowAdjust(true)
  }

  async function confirmAdjust() {
    if (!adjustProduct || !adjustQty || parseFloat(adjustQty) === 0) return
    if (!adjustNote.trim()) { alert('El motivo es obligatorio'); return }
    if (!warehouse) { alert('No hay bodega configurada'); return }
    setAdjusting(true)

    const delta = adjustType === 'adjustment' || adjustType === 'count'
      ? parseFloat(adjustQty) - adjustProduct.stock  // ajuste = nueva cantidad
      : adjustType === 'return'
        ? Math.abs(parseFloat(adjustQty))
        : Math.abs(parseFloat(adjustQty)) // purchase = positivo

    const { data, error } = await supabase.rpc('adjust_stock', {
      p_company_id:   company.id,
      p_product_id:   adjustProduct.id,
      p_warehouse_id: warehouse.id,
      p_type:         adjustType,
      p_quantity:     adjustType === 'adjustment' || adjustType === 'count'
                       ? parseFloat(adjustQty) - adjustProduct.stock
                       : Math.abs(parseFloat(adjustQty)),
      p_notes:        adjustNote,
      p_user_id:      user.id,
    })

    setAdjusting(false)

    if (error || !data?.success) {
      alert(error?.message || data?.error || 'Error al ajustar stock')
      return
    }

    setShowAdjust(false)
    await loadInventory()
  }

  // ============================================================
  // LOADING
  // ============================================================
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando inventario...
    </div>
  )

  // ============================================================
  // ESTILOS
  // ============================================================
  const S: Record<string, React.CSSProperties> = {
    page:   { minHeight:'100vh', background:'#0A1628', fontFamily:'Montserrat,sans-serif', color:'#F0F4FF', display:'flex', flexDirection:'column' },
    topbar: { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 20px', gap:10, flexShrink:0 },
    logo:   { width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer', flexShrink:0 },
    body:   { flex:1, padding:20, overflowY:'auto' },
    card:   { background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, padding:'16px 18px', marginBottom:14 },
    btn:    { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
    input:  { background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:7, padding:'8px 10px', fontSize:13, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif', width:'100%', boxSizing:'border-box' as 'border-box' },
    label:  { fontSize:11, fontWeight:600, color:'#8899BB', marginBottom:4, display:'block' } as React.CSSProperties,
    overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center' } as React.CSSProperties,
  }

  const margin = (sale: number, cost: number) =>
    sale > 0 ? Math.round(((sale - cost) / sale) * 100) : 0

  // ============================================================
  // VISTA EDIT
  // ============================================================
  if (view === 'edit') return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>{selected ? 'Editar producto' : 'Nuevo producto'}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView('list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={{ ...S.body, maxWidth:640, margin:'0 auto', width:'100%' }}>
        <div style={S.card}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:18, color:'#5DE0E6' }}>
            {selected ? `✏️ ${selected.name}` : '📦 Agregar producto'}
          </div>

          {formError && (
            <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#EF4444', marginBottom:14 }}>
              {formError}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Nombre del producto *</label>
              <input value={form.name} onChange={e => setForm((f:any) => ({...f, name: e.target.value}))}
                placeholder="Ej: Cerveza Budweiser 350ml" style={S.input} autoFocus />
            </div>

            <div>
              <label style={S.label}>SKU / Código interno</label>
              <input value={form.sku} onChange={e => setForm((f:any) => ({...f, sku: e.target.value}))}
                placeholder="Ej: CERV-001" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Código de barras</label>
              <input value={form.barcode} onChange={e => setForm((f:any) => ({...f, barcode: e.target.value}))}
                placeholder="EAN13 / UPC" style={S.input} />
            </div>

            <div>
              <label style={S.label}>Precio de venta * (con impuestos)</label>
              <input type="number" min="0" value={form.sale_price}
                onChange={e => setForm((f:any) => ({...f, sale_price: e.target.value}))}
                placeholder="0" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Costo (precio de compra)</label>
              <input type="number" min="0" value={form.cost_price}
                onChange={e => setForm((f:any) => ({...f, cost_price: e.target.value}))}
                placeholder="0" style={S.input} />
            </div>

            {form.sale_price && form.cost_price && parseFloat(form.sale_price) > 0 && (
              <div style={{ gridColumn:'1/-1', background:'rgba(0,74,173,.08)', border:'1px solid rgba(0,74,173,.2)', borderRadius:8, padding:'8px 12px', display:'flex', gap:20, fontSize:12 }}>
                <div><span style={{ color:'#8899BB' }}>Margen: </span><span style={{ fontWeight:700, color: margin(parseFloat(form.sale_price), parseFloat(form.cost_price)) > 20 ? '#22C55E' : '#F59E0B' }}>{margin(parseFloat(form.sale_price), parseFloat(form.cost_price))}%</span></div>
                <div><span style={{ color:'#8899BB' }}>Utilidad: </span><span style={{ fontWeight:700, color:'#5DE0E6' }}>{fmt(parseFloat(form.sale_price) - parseFloat(form.cost_price || '0'))}</span></div>
              </div>
            )}

            <div>
              <label style={S.label}>Tipo de impuesto</label>
              <select value={form.tax_type} onChange={e => setForm((f:any) => ({...f, tax_type: e.target.value}))} style={S.input}>
                {TAX_OPTIONS.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Categoría</label>
              <select value={form.category_id} onChange={e => setForm((f:any) => ({...f, category_id: e.target.value}))} style={S.input}>
                <option value="">Sin categoría</option>
                {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
              </select>
            </div>

            <div>
              <label style={S.label}>Stock mínimo (alerta)</label>
              <input type="number" min="0" value={form.min_stock_alert}
                onChange={e => setForm((f:any) => ({...f, min_stock_alert: e.target.value}))}
                placeholder="5" style={S.input} />
            </div>
            {!selected && (
              <div>
                <label style={S.label}>Stock inicial</label>
                <input type="number" min="0" value={form.initial_stock}
                  onChange={e => setForm((f:any) => ({...f, initial_stock: e.target.value}))}
                  placeholder="0" style={S.input} />
              </div>
            )}

            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Descripción (opcional)</label>
              <textarea value={form.description} onChange={e => setForm((f:any) => ({...f, description: e.target.value}))}
                placeholder="Descripción del producto..." rows={2}
                style={{ ...S.input, resize:'vertical' as 'vertical' }} />
            </div>
          </div>

          <div style={{ display:'flex', gap:10, marginTop:20 }}>
            <button onClick={() => setView('list')} style={{ ...S.btn, flex:1, padding:12, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>
              Cancelar
            </button>
            <button onClick={saveProduct} disabled={saving} style={{ ...S.btn, flex:2, padding:12, fontSize:13, background: saving ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
              {saving ? '⏳ Guardando...' : selected ? '💾 Actualizar producto' : '➕ Crear producto'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // VISTA MOVIMIENTOS
  // ============================================================
  if (view === 'movements' && selected) return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Movimientos — {selected.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => openAdjust(selected)} style={{ ...S.btn, background:'rgba(93,224,230,.1)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>+ Ajustar stock</button>
        <button onClick={() => setView('list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={{ ...S.body, maxWidth:760, margin:'0 auto', width:'100%' }}>
        {/* Info del producto */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:16 }}>
          {[
            ['📦 Stock actual', `${selected.stock} uds`],
            ['💰 Precio venta', fmt(selected.sale_price)],
            ['📊 Vendido 30d', `${selected.sold_30d} uds`],
            ['💵 Ingresos 30d', fmt(selected.revenue_30d)],
          ].map(([l, v]) => (
            <div key={l} style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'10px 14px' }}>
              <div style={{ fontSize:10, color:'#8899BB' }}>{l}</div>
              <div style={{ fontSize:16, fontWeight:700, marginTop:3 }}>{v}</div>
            </div>
          ))}
        </div>

        <div style={S.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:'#5DE0E6' }}>Historial de movimientos</div>
          {movFetching ? (
            <div style={{ textAlign:'center', padding:30, color:'#8899BB' }}>⏳ Cargando...</div>
          ) : movements.length === 0 ? (
            <div style={{ textAlign:'center', padding:30, color:'#8899BB' }}>Sin movimientos registrados</div>
          ) : movements.map((m, i) => {
            const mt = MOVE_TYPES[m.movement_type as keyof typeof MOVE_TYPES] || { label: m.movement_type, icon:'•', color:'#8899BB' }
            const positive = m.quantity > 0
            return (
              <div key={m.id} style={{ display:'grid', gridTemplateColumns:'32px 1fr auto auto', gap:10, alignItems:'center', padding:'8px 0', borderBottom:'1px solid rgba(93,224,230,.05)', fontSize:12 }}>
                <div style={{ fontSize:18, textAlign:'center' }}>{mt.icon}</div>
                <div>
                  <div style={{ fontWeight:600, color: mt.color }}>{mt.label}</div>
                  <div style={{ fontSize:10, color:'#8899BB', marginTop:1 }}>
                    {m.user_name} · {new Date(m.created_at).toLocaleString('es-CL')}
                    {m.notes && <span> · {m.notes}</span>}
                  </div>
                </div>
                <div style={{ textAlign:'center', fontSize:11, color:'#8899BB' }}>
                  {m.quantity_before} → {m.quantity_after}
                </div>
                <div style={{ fontWeight:800, color: positive ? '#22C55E' : '#EF4444', minWidth:50, textAlign:'right' }}>
                  {positive ? '+' : ''}{m.quantity}
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )

  // ============================================================
  // VISTA LISTA (PRINCIPAL)
  // ============================================================
  return (
    <div style={S.page}>
      {/* Modal ajuste de stock */}
      {showAdjust && adjustProduct && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setShowAdjust(false) }}>
          <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.25)', borderRadius:14, padding:'22px 24px', width:400, color:'#F0F4FF' }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:16 }}>🔧 Ajustar stock — {adjustProduct.name}</div>
            <div style={{ fontSize:12, color:'#8899BB', marginBottom:14 }}>Stock actual: <strong style={{ color:'#F0F4FF' }}>{adjustProduct.stock} unidades</strong></div>

            <label style={S.label}>Tipo de movimiento</label>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
              {([
                ['purchase',   '📦 Ingreso (compra)'],
                ['adjustment', '🔧 Ajuste manual'],
                ['return',     '↩️ Devolución'],
                ['count',      '📊 Conteo físico'],
              ] as [typeof adjustType, string][]).map(([t, l]) => (
                <button key={t} onClick={() => setAdjustType(t)} style={{ ...S.btn, padding:'8px 10px', fontSize:11, background: adjustType === t ? 'rgba(0,74,173,.3)' : '#1A2540', border:`1px solid ${adjustType === t ? 'rgba(93,224,230,.4)' : 'rgba(93,224,230,.1)'}`, color: adjustType === t ? '#5DE0E6' : '#8899BB' }}>
                  {l}
                </button>
              ))}
            </div>

            <label style={S.label}>{adjustType === 'count' ? 'Nueva cantidad total' : adjustType === 'adjustment' ? 'Nueva cantidad total' : 'Cantidad a agregar/quitar'}</label>
            <input type="number" min="0" value={adjustQty} onChange={e => setAdjustQty(e.target.value)}
              placeholder={adjustType === 'count' ? `Stock actual: ${adjustProduct.stock}` : 'Cantidad'}
              style={{ ...S.input, marginBottom:14 }} autoFocus />

            {adjustQty && adjustType === 'count' && (
              <div style={{ fontSize:12, color: parseFloat(adjustQty) >= adjustProduct.stock ? '#22C55E' : '#EF4444', marginBottom:10 }}>
                Diferencia: {parseFloat(adjustQty) >= adjustProduct.stock ? '+' : ''}{parseFloat(adjustQty) - adjustProduct.stock} unidades
              </div>
            )}

            <label style={S.label}>Motivo * (obligatorio)</label>
            <input value={adjustNote} onChange={e => setAdjustNote(e.target.value)}
              placeholder="Ej: Compra a proveedor, merma, conteo físico..."
              style={{ ...S.input, marginBottom:16 }} />

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowAdjust(false)} style={{ ...S.btn, flex:1, padding:11, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>
                Cancelar
              </button>
              <button onClick={confirmAdjust} disabled={adjusting || !adjustQty || !adjustNote}
                style={{ ...S.btn, flex:2, padding:11, fontSize:13, background: !adjustQty || !adjustNote ? 'rgba(0,74,173,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', opacity: !adjustQty || !adjustNote ? .5 : 1 }}>
                {adjusting ? '⏳ Guardando...' : '✅ Confirmar ajuste'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Inventario</span>
        <span style={{ fontSize:11, color:'#8899BB' }}>{company?.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Dashboard</button>
        <button onClick={openNew} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
          + Nuevo producto
        </button>
      </div>

      <div style={S.body}>
        {/* KPIs inventario */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
          {[
            { icon:'📦', label:'Total productos', value: totalProducts, color:'#5DE0E6' },
            { icon:'❌', label:'Sin stock', value: outOfStock, color: outOfStock > 0 ? '#EF4444' : '#22C55E' },
            { icon:'⚠️', label:'Stock bajo', value: lowStock, color: lowStock > 0 ? '#F59E0B' : '#22C55E' },
            { icon:'💰', label:'Valor en bodega', value: fmt(totalStockValue), color:'#C19E4D' },
          ].map(k => (
            <div key={k.label} style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:11, color:'#8899BB' }}>{k.icon} {k.label}</div>
              <div style={{ fontSize:typeof k.value === 'number' ? 22 : 16, fontWeight:800, color: k.color, marginTop:4 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Filtros */}
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' as 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Buscar por nombre o SKU..."
            style={{ ...S.input, maxWidth:280, padding:'7px 10px', fontSize:12 }} />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)} style={{ ...S.input, width:'auto', padding:'7px 10px', fontSize:12 }}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)} style={{ ...S.input, width:'auto', padding:'7px 10px', fontSize:12 }}>
            <option value="">Todos los estados</option>
            <option value="ok">✅ OK</option>
            <option value="low">⚠️ Bajo</option>
            <option value="critical">🔴 Crítico</option>
            <option value="out">❌ Sin stock</option>
          </select>
          <button onClick={() => { setSearch(''); setFilterCategory(''); setFilterStatus('') }}
            style={{ ...S.btn, background:'rgba(255,255,255,.05)', border:'1px solid rgba(93,224,230,.15)', color:'#8899BB', padding:'7px 12px', fontSize:11 }}>
            ✕ Limpiar
          </button>
          <div style={{ marginLeft:'auto', fontSize:11, color:'#8899BB', alignSelf:'center' }}>
            {fetching ? '⏳ Actualizando...' : `${filtered.length} productos`}
          </div>
        </div>

        {/* Tabla de productos */}
        <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, overflow:'hidden' }}>
          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 90px 90px 80px 80px 100px 120px', gap:8, padding:'8px 16px', background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.08)', fontSize:9, fontWeight:700, color:'#8899BB', textTransform:'uppercase', letterSpacing:'.5px' }}>
            <span>Producto</span>
            <span style={{ textAlign:'right' }}>P. Venta</span>
            <span style={{ textAlign:'right' }}>Costo</span>
            <span style={{ textAlign:'center' }}>Margen</span>
            <span style={{ textAlign:'center' }}>Stock</span>
            <span style={{ textAlign:'center' }}>30d</span>
            <span style={{ textAlign:'center' }}>Estado</span>
            <span style={{ textAlign:'center' }}>Acciones</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign:'center', padding:50, color:'#8899BB' }}>
              <div style={{ fontSize:32, marginBottom:10 }}>📦</div>
              <div style={{ fontSize:14, fontWeight:600 }}>Sin productos</div>
              <div style={{ fontSize:12, marginTop:6 }}>Agrega tu primer producto con el botón de arriba</div>
            </div>
          ) : filtered.map((p, idx) => {
            const st = STOCK_STATUS[p.stock_status]
            const mg = margin(p.sale_price, p.cost_price)
            return (
              <div key={p.id}
                style={{ display:'grid', gridTemplateColumns:'1fr 100px 90px 90px 80px 80px 100px 120px', gap:8, padding:'10px 16px', borderBottom:'1px solid rgba(93,224,230,.04)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)', transition:'background .1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,74,173,.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)'}
              >
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize:10, color:'#8899BB', marginTop:1, display:'flex', gap:6 }}>
                    {p.sku && <span>SKU: {p.sku}</span>}
                    {p.category_name && <span>· {p.category_name}</span>}
                    <span style={{ color: p.tax_type?.startsWith('ila') ? '#F59E0B' : '#8899BB' }}>
                      · {TAX_OPTIONS.find(t => t.value === p.tax_type)?.label?.split(' ')[0] || 'IVA'}
                    </span>
                  </div>
                </div>
                <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', textAlign:'right', alignSelf:'center' }}>{fmt(p.sale_price)}</div>
                <div style={{ fontSize:12, color:'#8899BB', textAlign:'right', alignSelf:'center' }}>{p.cost_price > 0 ? fmt(p.cost_price) : '—'}</div>
                <div style={{ textAlign:'center', alignSelf:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color: mg > 30 ? '#22C55E' : mg > 15 ? '#F59E0B' : '#EF4444' }}>
                    {p.cost_price > 0 ? `${mg}%` : '—'}
                  </span>
                </div>
                <div style={{ textAlign:'center', fontSize:14, fontWeight:800, alignSelf:'center', color: p.stock <= 0 ? '#EF4444' : '#F0F4FF' }}>
                  {p.stock}
                </div>
                <div style={{ textAlign:'center', fontSize:11, color:'#8899BB', alignSelf:'center' }}>
                  {p.sold_30d > 0 ? `×${Math.round(p.sold_30d)}` : '—'}
                </div>
                <div style={{ textAlign:'center', alignSelf:'center' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background: st.bg, color: st.color }}>
                    {st.label}
                  </span>
                </div>
                <div style={{ display:'flex', gap:4, justifyContent:'center', alignSelf:'center' }}>
                  <button onClick={() => openEdit(p)} title="Editar" style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.15)', color:'#5DE0E6', padding:'3px 8px', fontSize:10 }}>✏️</button>
                  <button onClick={() => openAdjust(p)} title="Ajustar stock" style={{ ...S.btn, background:'rgba(193,158,77,.08)', border:'1px solid rgba(193,158,77,.2)', color:'#C19E4D', padding:'3px 8px', fontSize:10 }}>📦</button>
                  <button onClick={() => openMovements(p)} title="Ver movimientos" style={{ ...S.btn, background:'rgba(93,224,230,.05)', border:'1px solid rgba(93,224,230,.1)', color:'#8899BB', padding:'3px 8px', fontSize:10 }}>📋</button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
