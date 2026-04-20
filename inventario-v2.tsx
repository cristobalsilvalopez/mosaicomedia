'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()
const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')

// ============================================================
// CONSTANTES
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
  ok:       { label:'OK',        color:'#22C55E', bg:'rgba(34,197,94,.1)' },
  low:      { label:'Bajo',      color:'#F59E0B', bg:'rgba(245,158,11,.1)' },
  critical: { label:'Crítico',   color:'#EF4444', bg:'rgba(239,68,68,.1)' },
  out:      { label:'Sin stock', color:'#EF4444', bg:'rgba(239,68,68,.15)' },
}

// Badge de impuesto con color correcto
function TaxBadge({ taxType }: { taxType: string }) {
  if (taxType === 'cigars' || taxType === 'exempt') {
    return <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(239,68,68,.12)', color:'#FCA5A5' }}>Exento</span>
  }
  if (taxType?.startsWith('ila')) {
    const label = taxType === 'ila_wine' ? 'ILA Vino' : taxType === 'ila_beer' ? 'ILA Cerv' : 'ILA Dest'
    return <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(193,158,77,.12)', color:'#C19E4D' }}>{label}</span>
  }
  return <span style={{ fontSize:9, fontWeight:700, padding:'1px 5px', borderRadius:4, background:'rgba(93,224,230,.08)', color:'#8899BB' }}>IVA</span>
}

const TAX_OPTIONS = [
  { value:'iva',         label:'IVA 19%' },
  { value:'ila_beer',    label:'IVA + ILA Cerveza (31.5%)' },
  { value:'ila_wine',    label:'IVA + ILA Vino (20.5%)' },
  { value:'ila_spirits', label:'IVA + ILA Destilados (31.5%)' },
  { value:'exempt',      label:'Exento IVA' },
  { value:'cigars',      label:'Cigarros (Exento IVA)' },
]

// ILA rates for price calculator
const ILA_RATES: Record<string, number> = {
  ila_beer: 0.315, ila_spirits: 0.315, ila_wine: 0.205,
}

const MOVE_TYPES = {
  sale:       { label:'Venta',         icon:'🛒', color:'#EF4444' },
  purchase:   { label:'Compra',        icon:'📦', color:'#22C55E' },
  adjustment: { label:'Ajuste',        icon:'🔧', color:'#F59E0B' },
  return:     { label:'Devolución',    icon:'↩️', color:'#5DE0E6' },
  void:       { label:'Anulación',     icon:'🗑', color:'#8899BB' },
  opening:    { label:'Stock inicial', icon:'🏁', color:'#C19E4D' },
  merma:      { label:'Merma',         icon:'⚠️', color:'#EF4444' },
  count:      { label:'Conteo',        icon:'📊', color:'#A78BFA' },
}

// Label dinámico del input según tipo
const ADJUST_INPUT_LABEL: Record<string, string> = {
  purchase:   'CANTIDAD A AGREGAR',
  return:     'CANTIDAD A AGREGAR (devolución)',
  adjustment: 'NUEVA CANTIDAD FINAL',
  merma:      'CANTIDAD MERMADA O PERDIDA',
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
  const [user, setUser]           = useState<any>(null)
  const [company, setCompany]     = useState<any>(null)
  const [warehouse, setWarehouse] = useState<any>(null)
  const [loading, setLoading]     = useState(true)

  // Datos
  const [products, setProducts]     = useState<Product[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [fetching, setFetching]     = useState(false)

  // Filtros
  const [search, setSearch]                 = useState('')
  const [filterCategory, setFilterCategory] = useState('')
  const [filterStatus, setFilterStatus]     = useState('')

  // Vista activa
  const [view, setView] = useState<'list'|'edit'|'movements'>('list')

  // Producto seleccionado
  const [selected, setSelected]   = useState<Product | null>(null)
  const [movements, setMovements] = useState<Movement[]>([])
  const [movFetching, setMovFetching] = useState(false)

  // Formulario producto
  const [form, setForm]       = useState<any>(EMPTY_PRODUCT)
  const [saving, setSaving]   = useState(false)
  const [formError, setFormError] = useState('')
  // Modo precio: 'from_cost' (costo+margen→precio) | 'from_price' (costo+precio→margen)
  const [priceMode, setPriceMode] = useState<'from_cost'|'from_price'>('from_price')
  const [targetMargin, setTargetMargin] = useState('')

  // Modal ajuste de stock
  const [showAdjust, setShowAdjust]       = useState(false)
  const [adjustProduct, setAdjustProduct] = useState<Product | null>(null)
  const [adjustType, setAdjustType]       = useState<'purchase'|'adjustment'|'return'|'merma'>('purchase')
  const [adjustQty, setAdjustQty]         = useState('')
  const [adjustNote, setAdjustNote]       = useState('')
  const [adjusting, setAdjusting]         = useState(false)
  const adjustQtyRef = useRef<HTMLInputElement>(null)

  // Modal escáner de barcode (JS puro, sin IA)
  const [showScanner, setShowScanner]   = useState(false)
  const [scanResult, setScanResult]     = useState('')

  // Modal lectura de factura con IA
  const [showInvoice, setShowInvoice]   = useState(false)
  const [invoiceFile, setInvoiceFile]   = useState<File | null>(null)
  const [invoiceLoading, setInvoiceLoading] = useState(false)
  const [invoiceResult, setInvoiceResult]   = useState<any[]>([])

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

      const { data: wh } = await supabase
        .from('warehouses').select('id, name')
        .eq('company_id', userData.company_id)
        .eq('is_active', true).limit(1).single()
      setWarehouse(wh)

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
  // FILTROS — búsqueda por nombre, SKU y barcode
  // ============================================================
  const filtered = products.filter(p => {
    const q = search.toLowerCase()
    const matchSearch = !search
      || p.name.toLowerCase().includes(q)
      || (p.sku || '').toLowerCase().includes(q)
      || (p.barcode || '').includes(search)
    const matchCat    = !filterCategory || p.category_id === filterCategory
    const matchStatus = !filterStatus   || p.stock_status === filterStatus
    return matchSearch && matchCat && matchStatus
  })

  const totalProducts   = filtered.length
  const outOfStock      = filtered.filter(p => p.stock_status === 'out').length
  const lowStock        = filtered.filter(p => p.stock_status === 'low' || p.stock_status === 'critical').length
  const totalStockValue = filtered.reduce((a, p) => a + (p.stock * p.cost_price), 0)

  // ============================================================
  // CÁLCULO DE PRECIOS INTELIGENTE
  // ============================================================
  function calcPriceFromMargin(cost: number, marginPct: number, taxType: string): number {
    // Precio = costo / (1 - margen%) con impuestos incluidos
    const ilaRate = ILA_RATES[taxType] || 0
    const netPrice = cost / (1 - marginPct / 100)
    return Math.round(netPrice * (1 + 0.19) * (1 + ilaRate))
  }

  const saleP = parseFloat(form.sale_price) || 0
  const costP = parseFloat(form.cost_price) || 0
  const mg    = saleP > 0 && costP > 0 ? Math.round(((saleP - costP) / saleP) * 100) : 0
  const util  = saleP - costP

  // Cuando el usuario cambia el margen objetivo en modo from_cost
  useEffect(() => {
    if (priceMode === 'from_cost' && targetMargin && costP > 0) {
      const newPrice = calcPriceFromMargin(costP, parseFloat(targetMargin), form.tax_type)
      if (newPrice > 0) setForm((f: any) => ({ ...f, sale_price: String(newPrice) }))
    }
  }, [targetMargin, costP, form.tax_type, priceMode])

  // ============================================================
  // ABRIR FORMULARIO
  // ============================================================
  function openNew() {
    setForm({ ...EMPTY_PRODUCT })
    setFormError('')
    setPriceMode('from_price')
    setTargetMargin('')
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
    setPriceMode('from_price')
    setTargetMargin('')
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
      p_limit: 50,
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
    setSaving(true); setFormError('')
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
    if (error || !data?.success) { setFormError(error?.message || 'Error al guardar el producto'); return }
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
    setTimeout(() => adjustQtyRef.current?.focus(), 100)
  }

  async function confirmAdjust() {
    if (!adjustProduct || !adjustQty || parseFloat(adjustQty) === 0) return
    if (!adjustNote.trim()) { alert('El motivo es obligatorio'); return }
    if (!warehouse) { alert('No hay bodega configurada'); return }
    setAdjusting(true)

    // Calcular delta según el tipo
    let delta: number
    let dbType: string = adjustType
    if (adjustType === 'adjustment') {
      delta = parseFloat(adjustQty) - adjustProduct.stock // nueva cantidad final
    } else if (adjustType === 'merma') {
      delta = -Math.abs(parseFloat(adjustQty)) // resta
      dbType = 'adjustment' // merma se guarda como adjustment negativo
    } else {
      delta = Math.abs(parseFloat(adjustQty)) // purchase/return = positivo
    }

    const { data, error } = await supabase.rpc('adjust_stock', {
      p_company_id:   company.id,
      p_product_id:   adjustProduct.id,
      p_warehouse_id: warehouse.id,
      p_type:         dbType,
      p_quantity:     delta,
      p_notes:        (adjustType === 'merma' ? '[MERMA] ' : '') + adjustNote,
      p_user_id:      user.id,
    })

    setAdjusting(false)
    if (error || !data?.success) { alert(error?.message || data?.error || 'Error al ajustar stock'); return }
    setShowAdjust(false)
    await loadInventory()
  }

  // ============================================================
  // LECTURA DE FACTURA CON IA (Claude API)
  // ============================================================
  async function readInvoiceWithAI() {
    if (!invoiceFile) return
    setInvoiceLoading(true)
    setInvoiceResult([])

    try {
      const base64 = await new Promise<string>((res, rej) => {
        const reader = new FileReader()
        reader.onload = () => res((reader.result as string).split(',')[1])
        reader.onerror = rej
        reader.readAsDataURL(invoiceFile)
      })

      const isImage = invoiceFile.type.startsWith('image/')
      const isPDF   = invoiceFile.type === 'application/pdf'

      const response = await fetch('https://api.anthropic.com/v1/messages', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          model: 'claude-sonnet-4-20250514',
          max_tokens: 1000,
          messages: [{
            role: 'user',
            content: [
              {
                type: isImage ? 'image' : 'document',
                source: {
                  type: 'base64',
                  media_type: invoiceFile.type,
                  data: base64,
                },
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

      const result = await response.json()
      const text   = result.content?.find((c: any) => c.type === 'text')?.text || '[]'
      const clean  = text.replace(/```json|```/g, '').trim()
      const parsed = JSON.parse(clean)
      setInvoiceResult(Array.isArray(parsed) ? parsed : [])
    } catch (err) {
      console.error('Error leyendo factura:', err)
      setInvoiceResult([])
      alert('No se pudo leer la factura. Intenta con una imagen más clara.')
    }

    setInvoiceLoading(false)
  }

  // ============================================================
  // ATAJOS DE TECLADO
  // ============================================================
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (showAdjust)  { setShowAdjust(false); return }
        if (showInvoice) { setShowInvoice(false); return }
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [showAdjust, showInvoice])

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
    page:    { minHeight:'100vh', background:'#0A1628', fontFamily:'Montserrat,sans-serif', color:'#F0F4FF', display:'flex', flexDirection:'column' },
    topbar:  { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 20px', gap:10, flexShrink:0 },
    logo:    { width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer', flexShrink:0 },
    body:    { flex:1, padding:20, overflowY:'auto' as 'auto' },
    card:    { background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, padding:'16px 18px', marginBottom:14 },
    btn:     { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
    input:   { background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:7, padding:'8px 10px', fontSize:13, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif', width:'100%', boxSizing:'border-box' as 'border-box' },
    label:   { fontSize:11, fontWeight:600, color:'#8899BB', marginBottom:4, display:'block' } as React.CSSProperties,
    overlay: { position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:500, display:'flex', alignItems:'center', justifyContent:'center', padding:20 } as React.CSSProperties,
  }

  // ============================================================
  // MODAL DE AJUSTE — conteo físico siempre visible
  // ============================================================
  const adjStock    = adjustProduct?.stock || 0
  const adjNewQty   = parseFloat(adjustQty) || 0
  const adjDelta    = adjustType === 'adjustment'
    ? adjNewQty - adjStock
    : adjustType === 'merma'
      ? -Math.abs(adjNewQty)
      : Math.abs(adjNewQty)
  const adjFinal    = adjustType === 'adjustment' ? adjNewQty : adjStock + adjDelta
  const adjPositive = adjDelta >= 0

  // ============================================================
  // VISTA EDIT
  // ============================================================
  if (view === 'edit') return (
    <div style={S.page}>
      {/* Modal ajuste desde editar */}
      {showAdjust && adjustProduct && (
        <AdjustModal
          product={adjustProduct} type={adjustType} qty={adjustQty} note={adjustNote}
          adjDelta={adjDelta} adjFinal={adjFinal} adjPositive={adjPositive}
          adjusting={adjusting} adjustQtyRef={adjustQtyRef}
          onTypeChange={setAdjustType} onQtyChange={setAdjustQty} onNoteChange={setAdjustNote}
          onClose={() => setShowAdjust(false)} onConfirm={confirmAdjust}
          S={S}
        />
      )}

      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>{selected ? 'Editar producto' : 'Nuevo producto'}</span>
        <div style={{ flex:1 }} />
        {/* Botón ajustar stock desde el editor */}
        {selected && (
          <button onClick={() => openAdjust(selected)} style={{ ...S.btn, background:'rgba(193,158,77,.1)', border:'1px solid rgba(193,158,77,.3)', color:'#C19E4D', padding:'4px 14px', fontSize:11 }}>
            📦 Ajustar stock
          </button>
        )}
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
                onKeyDown={e => { if (e.key === 'Enter') saveProduct() }}
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

            {/* Editor de precios inteligente */}
            <div style={{ gridColumn:'1/-1', background:'rgba(0,74,173,.06)', border:'1px solid rgba(0,74,173,.15)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:10 }}>
                <span style={{ fontSize:12, fontWeight:700, color:'#5DE0E6' }}>💡 Editor de precios inteligente</span>
                <div style={{ display:'flex', gap:4 }}>
                  {(['from_price','from_cost'] as const).map(m => (
                    <button key={m} onClick={() => { setPriceMode(m); setTargetMargin('') }}
                      style={{ ...S.btn, padding:'3px 10px', fontSize:10, background: priceMode === m ? 'rgba(93,224,230,.2)' : 'transparent', border:'1px solid rgba(93,224,230,.2)', color: priceMode === m ? '#5DE0E6' : '#8899BB' }}>
                      {m === 'from_price' ? 'Costo + Precio → Margen' : 'Costo + Margen → Precio'}
                    </button>
                  ))}
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={S.label}>Costo (precio de compra)</label>
                  <input type="number" min="0" value={form.cost_price}
                    onChange={e => setForm((f:any) => ({...f, cost_price: e.target.value}))}
                    placeholder="0" style={S.input} />
                </div>

                {priceMode === 'from_price' ? (
                  <div>
                    <label style={S.label}>Precio de venta * (con IVA/ILA)</label>
                    <input type="number" min="0" value={form.sale_price}
                      onChange={e => setForm((f:any) => ({...f, sale_price: e.target.value}))}
                      placeholder="0" style={S.input} />
                  </div>
                ) : (
                  <div>
                    <label style={S.label}>Margen deseado (%)</label>
                    <input type="number" min="0" max="99" value={targetMargin}
                      onChange={e => setTargetMargin(e.target.value)}
                      placeholder="30" style={S.input} />
                  </div>
                )}
              </div>

              {saleP > 0 && costP > 0 && (
                <div style={{ display:'flex', gap:16, marginTop:10, padding:'8px 0', borderTop:'1px solid rgba(93,224,230,.08)', fontSize:12 }}>
                  <div>
                    <span style={{ color:'#8899BB' }}>Precio venta: </span>
                    <span style={{ fontWeight:700, color:'#5DE0E6' }}>{fmt(saleP)}</span>
                  </div>
                  <div>
                    <span style={{ color:'#8899BB' }}>Margen: </span>
                    <span style={{ fontWeight:700, color: mg > 30 ? '#22C55E' : mg > 15 ? '#F59E0B' : '#EF4444' }}>{mg}%</span>
                  </div>
                  <div>
                    <span style={{ color:'#8899BB' }}>Utilidad: </span>
                    <span style={{ fontWeight:700, color:'#5DE0E6' }}>{fmt(util)}</span>
                  </div>
                </div>
              )}
            </div>

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
            <button onClick={saveProduct} disabled={saving}
              style={{ ...S.btn, flex:2, padding:12, fontSize:13, background: saving ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
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
      {showAdjust && adjustProduct && (
        <AdjustModal
          product={adjustProduct} type={adjustType} qty={adjustQty} note={adjustNote}
          adjDelta={adjDelta} adjFinal={adjFinal} adjPositive={adjPositive}
          adjusting={adjusting} adjustQtyRef={adjustQtyRef}
          onTypeChange={setAdjustType} onQtyChange={setAdjustQty} onNoteChange={setAdjustNote}
          onClose={() => setShowAdjust(false)} onConfirm={confirmAdjust}
          S={S}
        />
      )}

      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Movimientos — {selected.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => openAdjust(selected)} style={{ ...S.btn, background:'rgba(93,224,230,.1)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'6px 14px', fontSize:11 }}>
          📦 Ajustar stock
        </button>
        <button onClick={() => setView('list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>

      <div style={{ ...S.body, maxWidth:760, margin:'0 auto', width:'100%' }}>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr 1fr', gap:10, marginBottom:16 }}>
          {[
            ['📦 Stock actual', `${selected.stock} uds`],
            ['💰 Precio venta', fmt(selected.sale_price)],
            ['📊 Vendido 30d', `×${selected.sold_30d}`],
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
          ) : movements.map(m => {
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
  // VISTA LISTA PRINCIPAL
  // ============================================================
  return (
    <div style={S.page}>
      {/* Modal ajuste de stock */}
      {showAdjust && adjustProduct && (
        <AdjustModal
          product={adjustProduct} type={adjustType} qty={adjustQty} note={adjustNote}
          adjDelta={adjDelta} adjFinal={adjFinal} adjPositive={adjPositive}
          adjusting={adjusting} adjustQtyRef={adjustQtyRef}
          onTypeChange={setAdjustType} onQtyChange={setAdjustQty} onNoteChange={setAdjustNote}
          onClose={() => setShowAdjust(false)} onConfirm={confirmAdjust}
          S={S}
        />
      )}

      {/* Modal lectura de factura con IA */}
      {showInvoice && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setShowInvoice(false) }}>
          <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.25)', borderRadius:14, padding:'22px 24px', width:500, maxHeight:'80vh', overflowY:'auto' }}>
            <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>🧾 Leer factura con IA</div>
            <div style={{ fontSize:11, color:'#8899BB', marginBottom:16 }}>Sube una imagen de factura y la IA extrae los productos automáticamente</div>

            <label style={{ ...S.label, cursor:'pointer' }}>
              <div style={{ background:'#1A2540', border:'2px dashed rgba(93,224,230,.3)', borderRadius:10, padding:'20px', textAlign:'center', cursor:'pointer' }}>
                <div style={{ fontSize:28, marginBottom:6 }}>📎</div>
                <div style={{ fontSize:12, color:'#8899BB' }}>
                  {invoiceFile ? invoiceFile.name : 'Haz clic para subir imagen o PDF de factura'}
                </div>
              </div>
              <input type="file" accept="image/*,application/pdf" style={{ display:'none' }}
                onChange={e => setInvoiceFile(e.target.files?.[0] || null)} />
            </label>

            {invoiceFile && !invoiceLoading && invoiceResult.length === 0 && (
              <button onClick={readInvoiceWithAI}
                style={{ ...S.btn, width:'100%', padding:11, fontSize:13, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', marginTop:12 }}>
                🤖 Analizar con IA
              </button>
            )}

            {invoiceLoading && (
              <div style={{ textAlign:'center', padding:20, color:'#8899BB' }}>⏳ Analizando factura...</div>
            )}

            {invoiceResult.length > 0 && (
              <div style={{ marginTop:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#22C55E', marginBottom:8 }}>✅ {invoiceResult.length} productos detectados</div>
                {invoiceResult.map((item, i) => (
                  <div key={i} style={{ background:'#1A2540', borderRadius:8, padding:'8px 12px', marginBottom:6, fontSize:12 }}>
                    <div style={{ fontWeight:600 }}>{item.name}</div>
                    <div style={{ color:'#8899BB', marginTop:2 }}>
                      SKU: {item.sku || '—'} · Cant: {item.quantity} · Precio: {fmt(item.unit_price)}
                    </div>
                    <button onClick={() => {
                      setForm({ ...EMPTY_PRODUCT, name: item.name, sku: item.sku || '', sale_price: String(item.unit_price), initial_stock: String(item.quantity) })
                      setShowInvoice(false)
                      setView('edit')
                      setSelected(null)
                    }} style={{ ...S.btn, marginTop:6, padding:'3px 10px', fontSize:10, background:'rgba(0,74,173,.2)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6' }}>
                      + Agregar producto
                    </button>
                  </div>
                ))}
              </div>
            )}

            <button onClick={() => setShowInvoice(false)} style={{ ...S.btn, width:'100%', padding:10, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB', marginTop:12 }}>
              Cerrar (Esc)
            </button>
          </div>
        </div>
      )}

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Inventario</span>
        <span style={{ fontSize:11, color:'#8899BB' }}>{company?.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setShowInvoice(true)} style={{ ...S.btn, background:'rgba(193,158,77,.1)', border:'1px solid rgba(193,158,77,.25)', color:'#C19E4D', padding:'4px 12px', fontSize:11 }}>
          🤖 Leer factura
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Dashboard</button>
        <button onClick={openNew} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
          + Nuevo producto
        </button>
      </div>

      <div style={S.body}>
        {/* KPIs */}
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

        {/* Filtros con búsqueda por barcode */}
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' as 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Nombre, SKU o código de barras..."
            style={{ ...S.input, maxWidth:300, padding:'7px 10px', fontSize:12 }} />
          <select value={filterCategory} onChange={e => setFilterCategory(e.target.value)}
            style={{ ...S.input, width:'auto', padding:'7px 10px', fontSize:12 }}>
            <option value="">Todas las categorías</option>
            {categories.map(c => <option key={c.id} value={c.id}>{c.name}</option>)}
          </select>
          <select value={filterStatus} onChange={e => setFilterStatus(e.target.value)}
            style={{ ...S.input, width:'auto', padding:'7px 10px', fontSize:12 }}>
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
            {fetching ? '⏳' : `${filtered.length} productos`}
          </div>
        </div>

        {/* Tabla */}
        <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, overflow:'hidden' }}>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 100px 90px 90px 70px 70px 100px 140px', gap:8, padding:'8px 16px', background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.08)', fontSize:9, fontWeight:700, color:'#8899BB', textTransform:'uppercase' as 'uppercase', letterSpacing:'.5px' }}>
            <span>Producto</span>
            <span style={{ textAlign:'right' }}>Precio</span>
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
            const mg = p.sale_price > 0 && p.cost_price > 0 ? Math.round(((p.sale_price - p.cost_price) / p.sale_price) * 100) : 0
            return (
              <div key={p.id}
                style={{ display:'grid', gridTemplateColumns:'1fr 100px 90px 90px 70px 70px 100px 140px', gap:8, padding:'10px 16px', borderBottom:'1px solid rgba(93,224,230,.04)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)', transition:'background .1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,74,173,.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)'}
              >
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{p.name}</div>
                  <div style={{ fontSize:10, color:'#8899BB', marginTop:2, display:'flex', gap:5, alignItems:'center', flexWrap:'wrap' as 'wrap' }}>
                    {p.sku && <span>SKU: {p.sku}</span>}
                    {p.category_name && <span>· {p.category_name}</span>}
                    <TaxBadge taxType={p.tax_type} />
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
                {/* Botones más grandes — mejor accesibilidad */}
                <div style={{ display:'flex', gap:5, justifyContent:'center', alignSelf:'center' }}>
                  <button onClick={() => openEdit(p)} title="Editar producto"
                    style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'6px 10px', fontSize:14, minWidth:34 }}>
                    ✏️
                  </button>
                  <button onClick={() => openAdjust(p)} title="Ajustar stock"
                    style={{ ...S.btn, background:'rgba(193,158,77,.1)', border:'1px solid rgba(193,158,77,.25)', color:'#C19E4D', padding:'6px 10px', fontSize:14, minWidth:34 }}>
                    📦
                  </button>
                  <button onClick={() => openMovements(p)} title="Ver movimientos"
                    style={{ ...S.btn, background:'rgba(93,224,230,.05)', border:'1px solid rgba(93,224,230,.12)', color:'#8899BB', padding:'6px 10px', fontSize:14, minWidth:34 }}>
                    📋
                  </button>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}

// ============================================================
// COMPONENTE MODAL DE AJUSTE (extraído para reutilizar en
// vista lista, editar y movimientos sin duplicar código)
// ============================================================
interface AdjustModalProps {
  product: Product
  type: 'purchase'|'adjustment'|'return'|'merma'
  qty: string; note: string
  adjDelta: number; adjFinal: number; adjPositive: boolean
  adjusting: boolean
  adjustQtyRef: React.RefObject<HTMLInputElement | null>
  onTypeChange: (t: any) => void
  onQtyChange:  (v: string) => void
  onNoteChange: (v: string) => void
  onClose:   () => void
  onConfirm: () => void
  S: Record<string, React.CSSProperties>
}

function AdjustModal({ product, type, qty, note, adjDelta, adjFinal, adjPositive, adjusting, adjustQtyRef, onTypeChange, onQtyChange, onNoteChange, onClose, onConfirm, S }: AdjustModalProps) {
  const inputLabel = ADJUST_INPUT_LABEL[type] || 'CANTIDAD'
  const qtyNum = parseFloat(qty) || 0

  return (
    <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.25)', borderRadius:14, padding:'22px 24px', width:420, color:'#F0F4FF' }}>
        <div style={{ fontSize:14, fontWeight:700, marginBottom:4 }}>🔧 Ajustar stock</div>
        <div style={{ fontSize:12, color:'#8899BB', marginBottom:16 }}>{product.name}</div>

        {/* Conteo físico siempre visible */}
        <div style={{ background:'#0D1525', borderRadius:10, padding:'10px 14px', marginBottom:14, display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:10, color:'#8899BB' }}>Stock actual en sistema</div>
            <div style={{ fontSize:22, fontWeight:800, color:'#F0F4FF' }}>{product.stock}</div>
          </div>
          <div style={{ fontSize:22, color:'#8899BB' }}>→</div>
          <div style={{ textAlign:'right' }}>
            <div style={{ fontSize:10, color:'#8899BB' }}>Stock resultante</div>
            <div style={{ fontSize:22, fontWeight:800, color: adjPositive ? '#22C55E' : '#EF4444' }}>
              {qtyNum ? adjFinal : '—'}
            </div>
          </div>
          {qtyNum > 0 && (
            <div style={{ position:'absolute', fontSize:12, fontWeight:700, padding:'2px 8px', borderRadius:20, background: adjPositive ? 'rgba(34,197,94,.15)' : 'rgba(239,68,68,.15)', color: adjPositive ? '#22C55E' : '#EF4444', marginTop:28, marginRight:16 }}>
              {adjPositive ? '+' : ''}{adjDelta} uds
            </div>
          )}
        </div>

        {/* Tipo de movimiento */}
        <label style={S.label}>Tipo de movimiento</label>
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:6, marginBottom:14 }}>
          {([
            ['purchase',   '📦 Ingreso / Compra'],
            ['return',     '↩️ Devolución'],
            ['adjustment', '🔧 Ajuste manual'],
            ['merma',      '⚠️ Merma / Pérdida'],
          ] as [typeof type, string][]).map(([t, l]) => (
            <button key={t} onClick={() => onTypeChange(t)}
              style={{ ...S.btn, padding:'9px 10px', fontSize:11, background: type === t ? 'rgba(0,74,173,.3)' : '#1A2540', border:`1px solid ${type === t ? 'rgba(93,224,230,.4)' : 'rgba(93,224,230,.1)'}`, color: type === t ? '#5DE0E6' : '#8899BB', transition:'all .12s' }}>
              {l}
            </button>
          ))}
        </div>

        {/* Input dinámico con label según tipo */}
        <label style={{ ...S.label, color: type === 'merma' ? '#F59E0B' : '#8899BB' }}>
          {inputLabel}
          {type === 'adjustment' && <span style={{ color:'#8899BB', fontWeight:400 }}> (nueva cantidad total)</span>}
        </label>
        <input
          ref={adjustQtyRef}
          type="number" min="0" value={qty}
          onChange={e => onQtyChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && qty && note) onConfirm(); if (e.key === 'Escape') onClose() }}
          placeholder={type === 'adjustment' ? `Stock actual: ${product.stock}` : '0'}
          style={{ ...S.input, marginBottom:14, fontSize:16, fontWeight:700, borderColor: type === 'merma' ? 'rgba(239,68,68,.3)' : undefined }}
          autoFocus
        />

        <label style={S.label}>Motivo *</label>
        <input value={note} onChange={e => onNoteChange(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter' && qty && note) onConfirm(); if (e.key === 'Escape') onClose() }}
          placeholder={type === 'merma' ? 'Ej: Producto vencido, roto, robo...' : 'Ej: Compra proveedor, ajuste por conteo...'}
          style={{ ...S.input, marginBottom:16 }} />

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose}
            style={{ ...S.btn, flex:1, padding:11, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>
            Cancelar (Esc)
          </button>
          <button onClick={onConfirm}
            disabled={adjusting || !qty || !note}
            style={{ ...S.btn, flex:2, padding:11, fontSize:13, background: !qty || !note ? 'rgba(0,74,173,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', opacity: !qty || !note ? .5 : 1 }}>
            {adjusting ? '⏳ Guardando...' : '✅ Confirmar (Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}
