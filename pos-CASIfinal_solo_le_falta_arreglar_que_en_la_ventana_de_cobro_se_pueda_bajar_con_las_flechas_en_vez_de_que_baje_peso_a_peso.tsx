'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()

// ============================================================
// UTILIDADES
// ============================================================
function fmt(n: number) {
  return '$' + Math.round(n || 0).toLocaleString('es-CL')
}

// Calcular impuestos por producto
function calcTax(price: number, qty: number, taxType: string) {
  const subtotal = price * qty
  // IVA siempre incluido en el precio de venta (precio con IVA)
  const IVA_RATE = 0.19
  const ILA_BEER_RATE    = 0.315
  const ILA_WINE_RATE    = 0.205
  const ILA_SPIRITS_RATE = 0.315

  if (taxType === 'cigars' || taxType === 'exempt') {
    return { neto: subtotal, iva: 0, ila: 0, exento: subtotal, total: subtotal }
  }

  if (taxType === 'ila_beer' || taxType === 'ila_wine' || taxType === 'ila_spirits') {
    const ilaRate = taxType === 'ila_wine' ? ILA_WINE_RATE : ILA_SPIRITS_RATE
    // Precio = neto * (1 + IVA) * (1 + ILA)
    const factor = (1 + IVA_RATE) * (1 + ilaRate)
    const neto   = Math.round(subtotal / factor)
    const ila    = Math.round(neto * ilaRate)
    const iva    = Math.round(neto * IVA_RATE)
    return { neto, iva, ila, exento: 0, total: subtotal }
  }

  // IVA normal
  const neto = Math.round(subtotal / (1 + IVA_RATE))
  const iva  = subtotal - neto
  return { neto, iva, ila: 0, exento: 0, total: subtotal }
}

// Calcular totales del carrito
function calcCartTotals(cart: any[]) {
  let neto = 0, iva = 0, ila = 0, exento = 0, total = 0
  for (const item of cart) {
    const t = calcTax(item.sale_price, item.qty, item.tax_type || 'iva')
    neto    += t.neto
    iva     += t.iva
    ila     += t.ila
    exento  += t.exento
    total   += t.total
  }
  return { neto, iva, ila, exento, total }
}

// ============================================================
// TIPOS
// ============================================================
interface CartItem {
  id: string; name: string; sku: string; barcode: string
  sale_price: number; cost_price: number; tax_type: string
  qty: number; category_id: string
  categories?: { id: string; name: string }
  inventory?: { quantity: number }[]
}

interface PaymentLine {
  method: 'cash' | 'debit' | 'credit' | 'transfer' | 'qr'
  amount: string
}

interface Tab {
  id: string; name: string
  cart: CartItem[]
  customer: any
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function POSPage() {
  const router = useRouter()

  // Auth
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)

  // Catálogo
  const [products, setProducts]     = useState<any[]>([])
  const [categories, setCategories] = useState<any[]>([])
  const [search, setSearch]         = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  // Pestañas de venta (F10)
  const [tabs, setTabs]           = useState<Tab[]>([{ id: 'tab_1', name: 'Venta 1', cart: [], customer: null }])
  const [activeTab, setActiveTab] = useState('tab_1')
  const tabCounter                = useRef(1)

  // UI
  const [loading, setLoading]       = useState(true)
  const [successMsg, setSuccessMsg] = useState('')
  const [cartWidth, setCartWidth]   = useState(400)
  const [isDragging, setIsDragging] = useState(false)
  const dragRef                     = useRef<number>(0)

  // Modal de cobro (F8/F9) — campos fijos ultra-rápidos
  const [showPayModal, setShowPayModal] = useState(false)
  const [payments, setPayments]         = useState<PaymentLine[]>([{ method: 'cash', amount: '' }])
  const [paying, setPaying]             = useState(false)
  const [pmEf, setPmEf] = useState('')
  const [pmDb, setPmDb] = useState('')
  const [pmCr, setPmCr] = useState('')
  const [pmTr, setPmTr] = useState('')
  const [pmMp, setPmMp] = useState('')
  const [pmCh, setPmCh] = useState('')
  const [pmFocus, setPmFocus] = useState('ef')
  const efInputRef = useRef<HTMLInputElement>(null)

  // Modal de recibo
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSale, setLastSale]       = useState<any>(null)

  // Carrito de la pestaña activa
  const currentTab  = tabs.find(t => t.id === activeTab) || tabs[0]
  const cart        = currentTab?.cart || []
  const totals      = calcCartTotals(cart)

  // ============================================================
  // RESIZE CARRITO
  // ============================================================
  function startResize(e: React.MouseEvent) {
    setIsDragging(true)
    dragRef.current = e.clientX
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', stopResize)
  }
  function onMouseMove(e: MouseEvent) {
    const delta = dragRef.current - e.clientX
    dragRef.current = e.clientX
    setCartWidth(prev => Math.max(300, Math.min(window.innerWidth * 0.65, prev + delta)))
  }
  function stopResize() {
    setIsDragging(false)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', stopResize)
  }

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
      await Promise.all([
        loadCategories(userData.company_id),
        loadProducts(userData.company_id),
      ])
      setLoading(false)
    }
    init()
  }, [])

  async function loadCategories(companyId: string) {
    const { data } = await supabase
      .from('categories').select('id, name, slug, color')
      .eq('company_id', companyId).eq('is_active', true).order('name')
    setCategories(data || [])
  }

  async function loadProducts(companyId: string) {
    const { data } = await supabase
      .from('products')
      .select('id, name, sku, barcode, sale_price, cost_price, tax_type, category_id, categories(id, name), inventory(quantity)')
      .eq('company_id', companyId).eq('is_active', true).order('name').limit(100)
    setProducts(data || [])
  }

  // ============================================================
  // GESTIÓN DE PESTAÑAS (F10)
  // ============================================================
  function newTab() {
    tabCounter.current += 1
    const id   = `tab_${tabCounter.current}`
    const name = `Venta ${tabCounter.current}`
    setTabs(prev => [...prev, { id, name, cart: [], customer: null }])
    setActiveTab(id)
  }

  function closeTab(tabId: string) {
    if (tabs.length === 1) return // siempre debe quedar 1
    setTabs(prev => {
      const remaining = prev.filter(t => t.id !== tabId)
      if (activeTab === tabId) setActiveTab(remaining[remaining.length - 1].id)
      return remaining
    })
  }

  function updateTabCart(tabId: string, newCart: CartItem[]) {
    setTabs(prev => prev.map(t => t.id === tabId ? { ...t, cart: newCart } : t))
  }

  // ============================================================
  // CARRITO
  // ============================================================
  function addToCart(product: any) {
    const stock = product.inventory?.[0]?.quantity ?? 0
    if (stock <= 0) return
    const newCart = (() => {
      const existing = cart.find(i => i.id === product.id)
      if (existing) {
        if (existing.qty >= stock) return cart
        return cart.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...cart, { ...product, qty: 1 }]
    })()
    updateTabCart(activeTab, newCart)
  }

  function changeQty(id: string, delta: number) {
    const newCart = cart
      .map(i => i.id === id ? { ...i, qty: i.qty + delta } : i)
      .filter(i => i.qty > 0)
    updateTabCart(activeTab, newCart)
  }

  function removeFromCart(id: string) {
    updateTabCart(activeTab, cart.filter(i => i.id !== id))
  }

  function clearCart() {
    updateTabCart(activeTab, [])
  }

  // Borrar último producto (ESC)
  function removeLastItem() {
    if (cart.length === 0) return
    const newCart = [...cart]
    const last    = newCart[newCart.length - 1]
    if (last.qty > 1) {
      newCart[newCart.length - 1] = { ...last, qty: last.qty - 1 }
    } else {
      newCart.pop()
    }
    updateTabCart(activeTab, newCart)
  }

  // ============================================================
  // MODAL DE COBRO
  // ============================================================
  function openPayModal() {
    if (cart.length === 0) return
    // Reset all fields, pre-fill efectivo con el total
    setPmEf(String(totals.total))
    setPmDb(''); setPmCr(''); setPmTr(''); setPmMp(''); setPmCh('')
    setPmFocus('ef')
    setShowPayModal(true)
    setTimeout(() => efInputRef.current?.select(), 80)
  }

  function addPaymentLine() {
    setPayments(prev => [...prev, { method: 'transfer', amount: '' }])
  }

  function removePaymentLine(idx: number) {
    setPayments(prev => prev.filter((_, i) => i !== idx))
  }

  function updatePayment(idx: number, field: 'method' | 'amount', value: string) {
    setPayments(prev => prev.map((p, i) => i === idx ? { ...p, [field]: value } : p))
  }

  // Cálculos del modal de cobro (campos fijos)
  const pmTotal = [pmEf,pmDb,pmCr,pmTr,pmMp,pmCh].reduce((s,v) => s+(parseFloat(v)||0), 0)
  const pmDiff  = pmTotal - totals.total
  const pmVuelto = parseFloat(pmEf) > 0 && pmDiff > 0 ? Math.min(pmDiff, parseFloat(pmEf)||0) : 0
  const canPay   = pmTotal >= totals.total && !paying
  // Compat: mantener variables antiguas para el recibo
  const totalPaid    = pmTotal
  const totalPending = totals.total - pmTotal
  const vuelto       = pmVuelto
  // Payments array para guardar en DB
  const paymentsForSave = [
    { method:'cash',     amount: pmEf },
    { method:'debit',    amount: pmDb },
    { method:'credit',   amount: pmCr },
    { method:'transfer', amount: pmTr },
    { method:'mercadopago', amount: pmMp },
    { method:'cheque',   amount: pmCh },
  ].filter(p => parseFloat(p.amount) > 0)

  // ============================================================
  // COMPLETAR VENTA
  // ============================================================
  async function completeSale() {
    if (cart.length === 0 || paying) return
    if (!canPay) return
    setPaying(true)

    const idempotencyKey = `${company?.id}_${user?.id}_${Date.now()}_${Math.random().toString(36).slice(2)}`

    const items = cart.map(i => {
      const t = calcTax(i.sale_price, i.qty, i.tax_type || 'iva')
      return {
        product_id:       i.id,
        name:             i.name,
        sku:              i.sku || '',
        quantity:         i.qty,
        unit_price:       i.sale_price,
        total:            t.total,
        tax_type:         i.tax_type || 'iva',
        neto:             t.neto,
        iva_amount:       t.iva,
        ila_amount:       t.ila,
        exento_amount:    t.exento,
        discount_amount:  0,
        discount_percent: 0,
      }
    })

    const { data: saleId, error } = await supabase.rpc('create_sale_simple', {
      p_company_id: company.id,
      p_user_id:    user.id,
      p_items:      items,
      p_subtotal:   totals.neto,
      p_total:      totals.total,
    })

    setPaying(false)

    if (error) {
      alert('Error al guardar la venta: ' + error.message)
      return
    }

    setLastSale({
      id:       saleId,
      totals,
      items:    [...cart],
      payments: paymentsForSave,
      vuelto:   pmVuelto,
    })
    setShowPayModal(false)
    setShowReceipt(true)
    clearCart()
    setPmEf(''); setPmDb(''); setPmCr(''); setPmTr(''); setPmMp(''); setPmCh('')
    setSuccessMsg(`✅ Venta completada · ${fmt(totals.total)}`)
    setTimeout(() => setSuccessMsg(''), 4000)
    await loadProducts(company.id)
  }

  // ============================================================
  // ATAJOS DE TECLADO
  // ============================================================
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    const tag     = (e.target as HTMLElement).tagName
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

    switch (e.key) {
      case 'F8':
      case 'F9':
        e.preventDefault()
        if (showReceipt) { setShowReceipt(false); return }
        if (showPayModal) { completeSale(); return }
        openPayModal()
        break

      case 'Escape':
        e.preventDefault()
        if (showReceipt)   { setShowReceipt(false); return }
        if (showPayModal)  { setShowPayModal(false); return }
        if (!isInput)      removeLastItem()
        break

      case 'Enter':
        if (showReceipt)  { e.preventDefault(); setShowReceipt(false); return }
        if (showPayModal && canPay) { e.preventDefault(); completeSale(); return }
        break

      case 'F10':
        e.preventDefault()
        newTab()
        break
    }
  }, [cart, showReceipt, showPayModal, canPay, paying, totals])

  useEffect(() => {
    window.addEventListener('keydown', handleKeyDown)
    return () => window.removeEventListener('keydown', handleKeyDown)
  }, [handleKeyDown])

  // ============================================================
  // FILTROS
  // ============================================================
  const filtered = products.filter(p => {
    const matchCat    = activeCategory === 'all' || p.category_id === activeCategory
    const matchSearch = !search ||
      p.name.toLowerCase().includes(search.toLowerCase()) ||
      (p.barcode || '').includes(search) ||
      (p.sku || '').toLowerCase().includes(search.toLowerCase())
    return matchCat && matchSearch
  })

  // ============================================================
  // LOADING
  // ============================================================
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif', fontSize:14 }}>
      ⏳ Cargando POS...
    </div>
  )

  // ============================================================
  // ESTILOS BASE
  // ============================================================
  const s: Record<string, React.CSSProperties> = {
    overlay:    { position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif' },
    modal:      { background:'#111827', border:'1px solid rgba(93,224,230,.3)', borderRadius:16, padding:28, color:'#F0F4FF', maxHeight:'90vh', overflowY:'auto' },
    root:       { height:'100vh', display:'flex', flexDirection:'column', background:'#0A1628', fontFamily:'Montserrat,sans-serif', color:'#F0F4FF', userSelect: isDragging ? 'none' : 'auto' },
    topbar:     { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 14px', gap:10, flexShrink:0 },
    tabBar:     { background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.08)', display:'flex', alignItems:'center', padding:'0 14px', gap:4, flexShrink:0, height:36 },
    body:       { flex:1, display:'flex', overflow:'hidden' },
    left:       { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 },
    searchBar:  { padding:'8px 14px', background:'#111827', borderBottom:'1px solid rgba(93,224,230,.08)', flexShrink:0 },
    catBar:     { display:'flex', gap:5, padding:'6px 14px', background:'#111827', borderBottom:'1px solid rgba(93,224,230,.08)', overflowX:'auto', flexShrink:0 },
    grid:       { flex:1, overflowY:'auto', padding:10, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(125px,1fr))', gap:7, alignContent:'start' },
    resizer:    { width:5, background: isDragging ? 'rgba(93,224,230,.5)' : 'rgba(93,224,230,.1)', cursor:'col-resize', flexShrink:0 },
    cart:       { width:cartWidth, background:'#111827', borderLeft:'1px solid rgba(93,224,230,.12)', display:'flex', flexDirection:'column', flexShrink:0 },
    cartHead:   { padding:'10px 14px', borderBottom:'1px solid rgba(93,224,230,.1)', display:'flex', alignItems:'center', justifyContent:'space-between' },
    cartItems:  { flex:1, overflowY:'auto', padding:'4px 12px' },
    cartFoot:   { padding:12, borderTop:'1px solid rgba(93,224,230,.12)', background:'#0D1F3C' },
    btn:        { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 },
    input:      { background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:7, padding:'8px 10px', fontSize:13, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif', width:'100%', boxSizing:'border-box' as 'border-box' },
  }

  const keyHint = (k: string, label: string) => (
    <div style={{ display:'flex', alignItems:'center', gap:3 }}>
      <span style={{ background:'#1A2540', border:'1px solid rgba(93,224,230,.25)', borderRadius:4, padding:'1px 5px', fontSize:9, fontWeight:700, color:'#5DE0E6', fontFamily:'monospace' }}>{k}</span>
      <span style={{ fontSize:9, color:'#8899BB' }}>{label}</span>
    </div>
  )

  // ============================================================
  // RENDER
  // ============================================================
  return (
    <>
      {/* ===== MODAL COBRO (F8/F9) — ULTRA RÁPIDO ===== */}
      {showPayModal && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowPayModal(false) }}>
          <div style={{ ...s.modal, width:440, padding:'20px 22px' }}>

            {/* Header */}
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                <span style={{ fontSize:15, fontWeight:700 }}>💳 Cobro de venta</span>
              </div>
              <span style={{ fontSize:10, color:'#8899BB' }}>Enter confirma · Esc vuelve</span>
            </div>

            {/* Total prominente */}
            <div style={{ background:'#0D1525', borderRadius:10, padding:'10px 14px', marginBottom:14 }}>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', marginBottom:2 }}>
                <span>Neto</span><span>{fmt(totals.neto)}</span>
              </div>
              {totals.iva > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', marginBottom:2 }}>
                <span>IVA (19%)</span><span>{fmt(totals.iva)}</span>
              </div>}
              {totals.ila > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#F59E0B', marginBottom:2 }}>
                <span>ILA (alcohol)</span><span>{fmt(totals.ila)}</span>
              </div>}
              {totals.exento > 0 && <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', marginBottom:2 }}>
                <span>Exento</span><span>{fmt(totals.exento)}</span>
              </div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:18, fontWeight:800, color:'#5DE0E6', marginTop:8, paddingTop:8, borderTop:'1px solid rgba(93,224,230,.1)' }}>
                <span>TOTAL A PAGAR</span><span>{fmt(totals.total)}</span>
              </div>
            </div>

            {/* MÉTODOS DE PAGO FIJOS — sin dropdowns, ultra rápido */}
            <div style={{ fontSize:10, fontWeight:700, color:'#8899BB', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Métodos de pago</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:12 }}>
              {[
                { id:'ef', label:'💵 Efectivo',      val:pmEf, set:setPmEf,  ref:efInputRef },
                { id:'db', label:'💳 Débito',         val:pmDb, set:setPmDb },
                { id:'cr', label:'💳 Crédito',        val:pmCr, set:setPmCr },
                { id:'tr', label:'📲 Transferencia',  val:pmTr, set:setPmTr },
                { id:'mp', label:'🟢 Mercado Pago',   val:pmMp, set:setPmMp },
                { id:'ch', label:'📄 Cheque',         val:pmCh, set:setPmCh },
              ].map(m => (
                <div
                  key={m.id}
                  onClick={() => setPmFocus(m.id)}
                  style={{
                    display:'flex', alignItems:'center', gap:10,
                    padding:'7px 11px', borderRadius:8, cursor:'text',
                    border:`1px solid ${pmFocus === m.id ? 'rgba(93,224,230,.5)' : 'rgba(93,224,230,.08)'}`,
                    background: pmFocus === m.id ? 'rgba(0,74,173,.15)' : '#1A2540',
                    transition:'all .1s',
                  }}
                >
                  <span style={{ fontSize:11, fontWeight:600, color: pmFocus === m.id ? '#F0F4FF' : '#8899BB', width:120, flexShrink:0 }}>{m.label}</span>
                  <input
                    ref={(m as any).ref}
                    type="number" min="0"
                    value={m.val}
                    onChange={e => m.set(e.target.value)}
                    onFocus={() => setPmFocus(m.id)}
                    placeholder="0"
                    style={{
                      flex:1, border:'none', background:'transparent',
                      fontFamily:'Montserrat,sans-serif', fontSize:16, fontWeight:800,
                      color: parseFloat(m.val) > 0 ? '#F0F4FF' : '#8899BB',
                      textAlign:'right', outline:'none',
                    }}
                  />
                </div>
              ))}
            </div>

            {/* Estado dinámico — Total pagado + Diferencia */}
            <div style={{ height:'0.5px', background:'rgba(93,224,230,.1)', marginBottom:10 }} />
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', marginBottom:6 }}>
              <span>Total pagado</span>
              <span style={{ fontWeight:700, color:'#F0F4FF' }}>{fmt(pmTotal)}</span>
            </div>
            <div style={{
              display:'flex', justifyContent:'space-between', alignItems:'center',
              padding:'8px 12px', borderRadius:8, marginBottom:14,
              background: pmTotal === 0 ? '#0D1525' : pmDiff >= 0 ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
              border: `1px solid ${pmTotal === 0 ? 'rgba(93,224,230,.08)' : pmDiff >= 0 ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}`,
            }}>
              <span style={{ fontSize:13, fontWeight:800, color: pmTotal === 0 ? '#8899BB' : pmDiff >= 0 ? '#22C55E' : '#EF4444' }}>
                {pmTotal === 0 ? 'Diferencia' : pmDiff > 0 ? `VUELTO` : pmDiff < 0 ? 'FALTA' : '✅ EXACTO'}
              </span>
              <span style={{ fontSize:22, fontWeight:800, color: pmTotal === 0 ? '#8899BB' : pmDiff >= 0 ? '#22C55E' : '#EF4444' }}>
                {pmTotal === 0 ? '$0' : pmDiff > 0 ? fmt(pmDiff) : pmDiff < 0 ? `(${fmt(Math.abs(pmDiff))})` : '$0'}
              </span>
            </div>

            {/* Botones */}
            <div style={{ display:'flex', gap:8 }}>
              <button
                onClick={() => setShowPayModal(false)}
                style={{ ...s.btn, flex:1, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB', padding:12, fontSize:12 }}
              >
                ← Volver
              </button>
              <button
                onClick={completeSale}
                disabled={!canPay}
                style={{ ...s.btn, flex:2, background: canPay ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'rgba(0,74,173,.2)', color:'#fff', padding:12, fontSize:13, opacity: canPay ? 1 : .5 }}
              >
                {paying ? '⏳ Procesando...' : canPay ? `✅ CONFIRMAR ${fmt(totals.total)}` : `FALTA ${fmt(Math.abs(pmDiff))}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== MODAL RECIBO ===== */}
      {showReceipt && lastSale && (
        <div style={s.overlay}>
          <div style={{ ...s.modal, width: 420 }}>
            <div style={{ textAlign:'center', marginBottom:20 }}>
              <div style={{ fontSize:40, marginBottom:6 }}>✅</div>
              <div style={{ fontSize:17, fontWeight:700 }}>Venta Completada</div>
              <div style={{ fontSize:11, color:'#8899BB', marginTop:3 }}>
                ID: {String(lastSale.id).slice(0,8).toUpperCase()}
              </div>
            </div>

            {/* Productos */}
            <div style={{ borderTop:'1px solid rgba(93,224,230,.1)', padding:'10px 0', marginBottom:12 }}>
              <div style={{ fontSize:10, color:'#8899BB', fontWeight:700, marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Productos</div>
              {lastSale.items.map((item: any, idx: number) => (
                <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12 }}>
                  <div>
                    <span style={{ fontWeight:600 }}>{item.name}</span>
                    <span style={{ color:'#8899BB', marginLeft:6 }}>×{item.qty}</span>
                    {item.tax_type === 'cigars' && <span style={{ fontSize:10, color:'#8899BB', marginLeft:6 }}>[Exento]</span>}
                    {item.tax_type?.startsWith('ila') && <span style={{ fontSize:10, color:'#F59E0B', marginLeft:6 }}>[+ILA]</span>}
                  </div>
                  <span style={{ fontWeight:700, color:'#5DE0E6' }}>{fmt(item.sale_price * item.qty)}</span>
                </div>
              ))}
            </div>

            {/* Resumen tributario */}
            <div style={{ background:'#0D1525', borderRadius:8, padding:'10px 12px', marginBottom:12, fontSize:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', color:'#8899BB', marginBottom:3 }}><span>Neto</span><span>{fmt(lastSale.totals.neto)}</span></div>
              {lastSale.totals.iva > 0 && <div style={{ display:'flex', justifyContent:'space-between', color:'#8899BB', marginBottom:3 }}><span>IVA</span><span>{fmt(lastSale.totals.iva)}</span></div>}
              {lastSale.totals.ila > 0 && <div style={{ display:'flex', justifyContent:'space-between', color:'#F59E0B', marginBottom:3 }}><span>ILA</span><span>{fmt(lastSale.totals.ila)}</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:700, color:'#5DE0E6', fontSize:14, marginTop:6, paddingTop:6, borderTop:'1px solid rgba(93,224,230,.1)' }}>
                <span>TOTAL</span><span>{fmt(lastSale.totals.total)}</span>
              </div>
            </div>

            {/* Pagos */}
            <div style={{ marginBottom:14, fontSize:12 }}>
              <div style={{ fontSize:10, color:'#8899BB', fontWeight:700, marginBottom:6, textTransform:'uppercase', letterSpacing:'.5px' }}>Pagos</div>
              {lastSale.payments.map((p: any, idx: number) => (
                <div key={idx} style={{ display:'flex', justifyContent:'space-between', padding:'2px 0', color:'#8899BB' }}>
                  <span>{{ cash:'Efectivo', debit:'Débito', credit:'Crédito', transfer:'Transferencia', qr:'QR' }[p.method as string] || p.method}</span>
                  <span style={{ color:'#F0F4FF' }}>{fmt(parseFloat(p.amount) || 0)}</span>
                </div>
              ))}
              {lastSale.vuelto > 0 && (
                <div style={{ display:'flex', justifyContent:'space-between', color:'#22C55E', fontWeight:700, marginTop:6, paddingTop:6, borderTop:'1px solid rgba(34,197,94,.15)' }}>
                  <span>Vuelto</span><span>{fmt(lastSale.vuelto)}</span>
                </div>
              )}
            </div>

            <button
              onClick={() => setShowReceipt(false)}
              style={{ ...s.btn, width:'100%', background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:13, fontSize:13 }}
            >
              💳 Nueva venta (Enter)
            </button>
          </div>
        </div>
      )}

      {/* ===== PANTALLA PRINCIPAL ===== */}
      <div style={s.root}>

        {/* Topbar */}
        <div style={s.topbar}>
          <div style={{ width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', flexShrink:0 }}>MP</div>
          <span style={{ fontWeight:700, fontSize:13 }}>POS · {company?.name}</span>
          <span style={{ fontSize:11, color:'#8899BB' }}>Hola, {user?.first_name}</span>
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', gap:8 }}>
            {keyHint('F8', 'Cobrar')}
            {keyHint('Esc', 'Borrar último')}
            {keyHint('↵', 'Confirmar')}
            {keyHint('F10', 'Nueva pestaña')}
          </div>
          <button onClick={() => router.push('/dashboard')} style={{ ...s.btn, background:'transparent', border:'1px solid rgba(93,224,230,.25)', color:'#5DE0E6', padding:'4px 12px', fontSize:11, fontWeight:600 }}>
            ← Dashboard
          </button>
        </div>

        {/* Pestañas de venta (F10) */}
        <div style={s.tabBar}>
          {tabs.map(tab => (
            <div
              key={tab.id}
              style={{ display:'flex', alignItems:'center', gap:5, padding:'4px 12px', borderRadius:'6px 6px 0 0', fontSize:11, fontWeight:600, cursor:'pointer', background: activeTab === tab.id ? '#111827' : 'transparent', color: activeTab === tab.id ? '#5DE0E6' : '#8899BB', border: activeTab === tab.id ? '1px solid rgba(93,224,230,.2)' : '1px solid transparent', borderBottom:'none', transition:'all .13s' }}
              onClick={() => setActiveTab(tab.id)}
            >
              {tab.name}
              {tab.cart.length > 0 && (
                <span style={{ background:'#5DE0E6', color:'#0A1628', borderRadius:8, padding:'0 5px', fontSize:9, fontWeight:700 }}>
                  {tab.cart.reduce((s, i) => s + i.qty, 0)}
                </span>
              )}
              {tabs.length > 1 && (
                <span
                  onClick={e => { e.stopPropagation(); closeTab(tab.id) }}
                  style={{ marginLeft:2, color:'#EF4444', fontSize:13, lineHeight:1, opacity:.6 }}
                >×</span>
              )}
            </div>
          ))}
          <button
            onClick={newTab}
            style={{ ...s.btn, background:'none', border:'1px dashed rgba(93,224,230,.2)', color:'#5DE0E6', fontSize:11, padding:'3px 10px', marginLeft:4 }}
          >
            + F10
          </button>
        </div>

        {/* Mensaje de éxito */}
        {successMsg && (
          <div style={{ background:'rgba(34,197,94,.15)', borderBottom:'1px solid rgba(34,197,94,.3)', padding:'9px 16px', fontSize:13, fontWeight:600, color:'#22C55E', textAlign:'center', flexShrink:0 }}>
            {successMsg}
          </div>
        )}

        <div style={s.body}>

          {/* Panel izquierdo: productos */}
          <div style={s.left}>
            <div style={s.searchBar}>
              <input
                value={search}
                onChange={e => setSearch(e.target.value)}
                placeholder="🔍 Buscar producto, SKU o barcode..."
                style={{ ...s.input, border:'1px solid rgba(93,224,230,.15)', padding:'8px 12px', fontSize:12 }}
              />
            </div>

            <div style={s.catBar}>
              {[{ id:'all', name:'Todos', color:'#004AAD' }, ...categories].map(cat => (
                <button key={cat.id} onClick={() => setActiveCategory(cat.id)} style={{
                  ...s.btn, padding:'4px 12px', borderRadius:20, border:'none',
                  fontSize:11, fontWeight:600, whiteSpace:'nowrap' as 'nowrap',
                  background: activeCategory === cat.id ? (cat.color || '#004AAD') : '#1A2540',
                  color: activeCategory === cat.id ? '#fff' : '#8899BB',
                }}>
                  {cat.name}
                </button>
              ))}
            </div>

            <div style={s.grid}>
              {filtered.length === 0 && (
                <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40, color:'#8899BB', fontSize:13 }}>
                  📭 Sin productos
                </div>
              )}
              {filtered.map(p => {
                const stock    = p.inventory?.[0]?.quantity ?? 0
                const sinStock = stock <= 0
                const inCart   = cart.find(i => i.id === p.id)
                const taxColor = p.tax_type?.startsWith('ila') ? '#F59E0B' : p.tax_type === 'cigars' ? '#6B7280' : undefined
                return (
                  <div key={p.id}
                    onClick={() => !sinStock && addToCart(p)}
                    style={{
                      background: inCart ? 'rgba(0,74,173,.25)' : '#1A2540',
                      border: `1px solid ${inCart ? '#5DE0E6' : 'rgba(93,224,230,.1)'}`,
                      borderRadius:9, padding:'9px 9px 7px', cursor: sinStock ? 'not-allowed' : 'pointer',
                      opacity: sinStock ? .4 : 1, transition:'all .13s', position:'relative',
                    }}
                    onMouseEnter={e => { if (!sinStock) (e.currentTarget as HTMLDivElement).style.borderColor = '#5DE0E6' }}
                    onMouseLeave={e => { if (!inCart) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(93,224,230,.1)' }}
                  >
                    {inCart && (
                      <div style={{ position:'absolute', top:5, right:6, background:'#5DE0E6', color:'#0A1628', borderRadius:9, padding:'1px 6px', fontSize:9, fontWeight:700 }}>
                        ×{inCart.qty}
                      </div>
                    )}
                    <div style={{ fontSize:10, color:'#8899BB', marginBottom:2 }}>{p.categories?.name}</div>
                    <div style={{ fontSize:11, fontWeight:600, lineHeight:1.3, marginBottom:4, minHeight:28 }}>{p.name}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6' }}>{fmt(p.sale_price)}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                      <span style={{ fontSize:10, color: stock <= 5 ? '#EF4444' : '#8899BB' }}>
                        {sinStock ? '❌ Sin stock' : `Stock: ${stock}`}
                      </span>
                      {taxColor && <span style={{ fontSize:9, color: taxColor, fontWeight:700 }}>
                        {p.tax_type === 'cigars' ? 'Exento' : 'ILA'}
                      </span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Resize handle */}
          <div style={s.resizer} onMouseDown={startResize} title="Arrastra para redimensionar" />

          {/* Panel derecho: carrito */}
          <div style={s.cart}>
            <div style={s.cartHead}>
              <div style={{ fontSize:13, fontWeight:700 }}>🛒 {currentTab?.name}</div>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontSize:11, color:'#8899BB' }}>{cart.length} prods</span>
                {cart.length > 0 && (
                  <button onClick={clearCart} style={{ ...s.btn, background:'none', border:'1px solid rgba(239,68,68,.3)', color:'#EF4444', padding:'2px 8px', fontSize:10 }}>
                    Vaciar
                  </button>
                )}
              </div>
            </div>

            <div style={s.cartItems}>
              {cart.length === 0 ? (
                <div style={{ textAlign:'center', padding:'36px 20px', color:'#8899BB', fontSize:12, lineHeight:2 }}>
                  <div style={{ fontSize:30, marginBottom:6 }}>🛒</div>
                  Agrega productos<br/>o presiona F10 para nueva pestaña
                </div>
              ) : cart.map(item => {
                const t = calcTax(item.sale_price, item.qty, item.tax_type || 'iva')
                return (
                  <div key={item.id} style={{ display:'flex', alignItems:'center', gap:7, padding:'8px 0', borderBottom:'1px solid rgba(93,224,230,.06)' }}>
                    <div style={{ flex:1, minWidth:0 }}>
                      <div style={{ fontSize:12, fontWeight:600, whiteSpace:'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>{item.name}</div>
                      <div style={{ display:'flex', gap:6, marginTop:1 }}>
                        <span style={{ fontSize:10, color:'#8899BB' }}>{fmt(item.sale_price)} c/u</span>
                        {item.tax_type?.startsWith('ila') && <span style={{ fontSize:9, color:'#F59E0B' }}>+ILA</span>}
                        {item.tax_type === 'cigars' && <span style={{ fontSize:9, color:'#6B7280' }}>Exento</span>}
                      </div>
                    </div>
                    <div style={{ display:'flex', alignItems:'center', gap:4 }}>
                      <button onClick={() => changeQty(item.id, -1)} style={{ ...s.btn, width:22, height:22, borderRadius:5, border:'1px solid rgba(93,224,230,.2)', background:'transparent', color:'#F0F4FF', fontSize:14 }}>−</button>
                      <span style={{ fontSize:13, fontWeight:700, minWidth:22, textAlign:'center' }}>{item.qty}</span>
                      <button onClick={() => changeQty(item.id, 1)} style={{ ...s.btn, width:22, height:22, borderRadius:5, border:'1px solid rgba(93,224,230,.2)', background:'transparent', color:'#F0F4FF', fontSize:14 }}>+</button>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#22C55E', minWidth:60, textAlign:'right' }}>
                      {fmt(t.total)}
                    </div>
                    <button onClick={() => removeFromCart(item.id)} style={{ background:'none', border:'none', color:'#EF4444', cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                )
              })}
            </div>

            {/* Footer del carrito */}
            <div style={s.cartFoot}>
              {/* Resumen tributario compacto */}
              {cart.length > 0 && (
                <div style={{ fontSize:11, color:'#8899BB', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}><span>Neto</span><span>{fmt(totals.neto)}</span></div>
                  {totals.iva > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}><span>IVA 19%</span><span>{fmt(totals.iva)}</span></div>}
                  {totals.ila > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2, color:'#F59E0B' }}><span>ILA</span><span>{fmt(totals.ila)}</span></div>}
                  {totals.exento > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}><span>Exento</span><span>{fmt(totals.exento)}</span></div>}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:12 }}>
                <span style={{ fontSize:15, fontWeight:700 }}>TOTAL</span>
                <span style={{ fontSize:22, fontWeight:700, color:'#5DE0E6' }}>{fmt(totals.total)}</span>
              </div>

              <button
                onClick={openPayModal}
                disabled={cart.length === 0}
                style={{
                  ...s.btn, width:'100%', padding:13, fontSize:14, color:'#fff',
                  background: cart.length === 0 ? 'rgba(0,74,173,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)',
                  opacity: cart.length === 0 ? .5 : 1,
                }}
              >
                {cart.length === 0 ? 'Agrega productos' : `💳 COBRAR ${fmt(totals.total)} · F8`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
