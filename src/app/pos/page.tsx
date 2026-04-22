'use client'

import { useEffect, useState, useRef, useCallback } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase = createClient()

// ============================================================
// UTILIDADES
// ============================================================
const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtDate = (d: Date) => d.toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' })
const fmtTime = (d: Date) => d.toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', second:'2-digit' })

function calcTax(price: number, qty: number, taxType: string) {
  const subtotal = price * qty
  const IVA = 0.19
  if (taxType === 'cigars' || taxType === 'exempt') {
    return { neto: subtotal, iva: 0, ila: 0, exento: subtotal, total: subtotal }
  }
  if (taxType === 'ila_beer' || taxType === 'ila_wine' || taxType === 'ila_spirits') {
    const ilaRate = taxType === 'ila_wine' ? 0.205 : 0.315
    const factor  = (1 + IVA) * (1 + ilaRate)
    const neto    = Math.round(subtotal / factor)
    const ila     = Math.round(neto * ilaRate)
    const iva     = Math.round(neto * IVA)
    return { neto, iva, ila, exento: 0, total: subtotal }
  }
  const neto = Math.round(subtotal / (1 + IVA))
  return { neto, iva: subtotal - neto, ila: 0, exento: 0, total: subtotal }
}

function calcCartTotals(cart: any[]) {
  let neto = 0, iva = 0, ila = 0, exento = 0, total = 0
  for (const item of cart) {
    const t = calcTax(item.sale_price, item.qty, item.tax_type || 'iva')
    neto += t.neto; iva += t.iva; ila += t.ila; exento += t.exento; total += t.total
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

interface Tab { id: string; name: string; cart: CartItem[]; customer: any }

// IDs ordenados de los métodos de pago
const PM_IDS = ['ef','db','cr','tr','mp','ch']

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function POSPage() {
  const router = useRouter()

  // Auth
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)

  // Catálogo
  const [products, setProducts]             = useState<any[]>([])
  const [categories, setCategories]         = useState<any[]>([])
  const [search, setSearch]                 = useState('')
  const [activeCategory, setActiveCategory] = useState('all')

  // Pestañas — ahora SOLO en el panel derecho
  const [tabs, setTabs]           = useState<Tab[]>([{ id:'tab_1', name:'Venta 1', cart:[], customer:null }])
  const [activeTab, setActiveTab] = useState('tab_1')
  const tabCounter                = useRef(1)

  // UI
  const [loading, setLoading]               = useState(true)
  const [successMsg, setSuccessMsg]         = useState('')
  const [cartWidth, setCartWidth]           = useState(420)
  const [isDragging, setIsDragging]         = useState(false)
  const dragRef                             = useRef<number>(0)

  // Sesión de caja
  const [cashSession, setCashSession]               = useState<any>(null)
  const [cashSessionLoading, setCashSessionLoading] = useState(true)

  // Modal de cobro — 6 campos fijos
  const [showPayModal, setShowPayModal] = useState(false)
  const [pmEf, setPmEf] = useState('')
  const [pmDb, setPmDb] = useState('')
  const [pmCr, setPmCr] = useState('')
  const [pmTr, setPmTr] = useState('')
  const [pmMp, setPmMp] = useState('')
  const [pmCh, setPmCh] = useState('')
  const [pmFocus, setPmFocus] = useState('ef')
  const [paying, setPaying]   = useState(false)
  const efInputRef = useRef<HTMLInputElement>(null)

  // Modal recibo
  const [showReceipt, setShowReceipt] = useState(false)
  const [lastSale, setLastSale]       = useState<any>(null)

  // Carrito de la pestaña activa
  const currentTab = tabs.find(t => t.id === activeTab) || tabs[0]
  const cart       = currentTab?.cart || []
  const totals     = calcCartTotals(cart)

  // Cálculos de pago
  const pmTotal  = [pmEf,pmDb,pmCr,pmTr,pmMp,pmCh].reduce((s,v) => s+(parseFloat(v)||0), 0)
  const pmDiff   = pmTotal - totals.total
  const pmVuelto = parseFloat(pmEf) > 0 && pmDiff > 0 ? Math.min(pmDiff, parseFloat(pmEf)||0) : 0
  const canPay   = pmTotal >= totals.total && !paying

  const paymentsForSave = [
    { method:'cash',        label:'Efectivo',      amount: pmEf },
    { method:'debit',       label:'Débito',        amount: pmDb },
    { method:'credit',      label:'Crédito',       amount: pmCr },
    { method:'transfer',    label:'Transferencia', amount: pmTr },
    { method:'mercadopago', label:'Mercado Pago',  amount: pmMp },
    { method:'cheque',      label:'Cheque',        amount: pmCh },
  ].filter(p => parseFloat(p.amount) > 0)

  // ============================================================
  // RESIZE
  // ============================================================
  function startResize(e: React.MouseEvent) {
    setIsDragging(true); dragRef.current = e.clientX
    document.addEventListener('mousemove', onMouseMove)
    document.addEventListener('mouseup', stopResize)
  }
  function onMouseMove(e: MouseEvent) {
    const delta = dragRef.current - e.clientX; dragRef.current = e.clientX
    setCartWidth(prev => Math.max(320, Math.min(window.innerWidth * 0.6, prev + delta)))
  }
  function stopResize() {
    setIsDragging(false)
    document.removeEventListener('mousemove', onMouseMove)
    document.removeEventListener('mouseup', stopResize)
  }

  // ============================================================
  // INIT
  // ============================================================
  async function loadCategories(companyId: string) {
    const { data } = await supabase.from('categories')
      .select('id, name, slug, color')
      .eq('company_id', companyId).eq('is_active', true).order('name')
    setCategories(data || [])
  }

  async function loadProducts(companyId: string) {
    const { data } = await supabase.from('products')
      .select('id, name, sku, barcode, sale_price, cost_price, tax_type, category_id, categories(id, name), inventory(quantity)')
      .eq('company_id', companyId).eq('is_active', true).order('name').limit(100)
    setProducts(data || [])
  }

  async function loadCashSession(companyId: string) {
    setCashSessionLoading(true)
    const { data } = await supabase.rpc('get_active_cash_session', { p_company_id: companyId })
    setCashSession(data || null)
    setCashSessionLoading(false)
  }

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      setUser(ctx.user as any)
      setCompany(ctx.company)
      await Promise.all([
        loadCategories(ctx.companyId),
        loadProducts(ctx.companyId),
        loadCashSession(ctx.companyId),
      ])
      setLoading(false)
    }
    init()
  }, [])

  // ============================================================
  // PESTAÑAS
  // ============================================================
  function newTab() {
    tabCounter.current += 1
    const id = `tab_${tabCounter.current}`
    setTabs(prev => [...prev, { id, name:`Venta ${tabCounter.current}`, cart:[], customer:null }])
    setActiveTab(id)
  }

  function closeTab(tabId: string) {
    if (tabs.length === 1) return
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
      const ex = cart.find(i => i.id === product.id)
      if (ex) {
        if (ex.qty >= stock) return cart
        return cart.map(i => i.id === product.id ? { ...i, qty: i.qty + 1 } : i)
      }
      return [...cart, { ...product, qty: 1 }]
    })()
    updateTabCart(activeTab, newCart)
  }

  function changeQty(id: string, delta: number) {
    updateTabCart(activeTab, cart.map(i => i.id === id ? { ...i, qty: i.qty + delta } : i).filter(i => i.qty > 0))
  }

  function removeFromCart(id: string) {
    updateTabCart(activeTab, cart.filter(i => i.id !== id))
  }

  function clearCart() { updateTabCart(activeTab, []) }

  function removeLastItem() {
    if (!cart.length) return
    const nc = [...cart]
    const last = nc[nc.length - 1]
    if (last.qty > 1) nc[nc.length - 1] = { ...last, qty: last.qty - 1 }
    else nc.pop()
    updateTabCart(activeTab, nc)
  }

  // ============================================================
  // MODAL DE COBRO
  // ============================================================
  function openPayModal() {
    if (!cart.length) return
    setPmEf(''); setPmDb(''); setPmCr(''); setPmTr(''); setPmMp(''); setPmCh('')
    setPmFocus('ef')
    setShowPayModal(true)
    setTimeout(() => efInputRef.current?.focus(), 80)
  }

  // Navegación entre métodos de pago con flechas ↑↓
  function handlePayKeyDown(e: React.KeyboardEvent, currentId: string) {
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      const idx = PM_IDS.indexOf(currentId)
      const next = e.key === 'ArrowDown'
        ? PM_IDS[(idx + 1) % PM_IDS.length]
        : PM_IDS[(idx - 1 + PM_IDS.length) % PM_IDS.length]
      setPmFocus(next)
      setTimeout(() => {
        const el = document.getElementById(`pm-input-${next}`)
        if (el) { (el as HTMLInputElement).focus(); (el as HTMLInputElement).select() }
      }, 20)
    }
    if (e.key === 'Enter' && canPay) { e.preventDefault(); completeSale() }
    if (e.key === 'Escape') { e.preventDefault(); setShowPayModal(false) }
  }

  // ============================================================
  // COMPLETAR VENTA
  // ============================================================
  async function completeSale() {
    if (!cart.length || paying || !canPay) return
    setPaying(true)

    const saleDate = new Date()
    const items = cart.map(i => {
      const t = calcTax(i.sale_price, i.qty, i.tax_type || 'iva')
      return {
        product_id: i.id, name: i.name, sku: i.sku || '',
        quantity: i.qty, unit_price: i.sale_price, total: t.total,
        tax_type: i.tax_type || 'iva', neto: t.neto,
        iva_amount: t.iva, ila_amount: t.ila, exento_amount: t.exento,
        discount_amount: 0, discount_percent: 0,
      }
    })

    const primaryMethod = paymentsForSave.reduce(
      (best, p) => parseFloat(p.amount) > parseFloat(best.amount) ? p : best,
      paymentsForSave[0] || { method:'cash', amount:'0' }
    ).method

    const { data: saleId, error } = await supabase.rpc('create_sale_simple', {
      p_company_id:     company.id,
      p_user_id:        user.id,
      p_items:          items,
      p_subtotal:       totals.neto,
      p_total:          totals.total,
      p_session_id:     cashSession?.id || null,
      p_payment_method: primaryMethod,
    })

    setPaying(false)

    if (error) {
      alert('Error al guardar la venta: ' + error.message)
      return
    }

    // Guardar para el recibo completo
    setLastSale({
      id:          saleId,
      totals:      { ...totals },
      items:       [...cart],
      payments:    paymentsForSave,
      vuelto:      pmVuelto,
      date:        saleDate,
      cashier:     user?.first_name,
      register:    cashSession?.register_name || 'Sin caja',
    })

    setShowPayModal(false)
    setShowReceipt(true)
    clearCart()
    setPmEf(''); setPmDb(''); setPmCr(''); setPmTr(''); setPmMp(''); setPmCh('')
    setSuccessMsg(`✅ Venta completada · ${fmt(totals.total)}`)
    setTimeout(() => setSuccessMsg(''), 4000)
    await Promise.all([loadProducts(company.id), loadCashSession(company.id)])
  }

  // ============================================================
  // ATAJOS DE TECLADO GLOBALES
  // ============================================================
  /* eslint-disable react-hooks/preserve-manual-memoization */
  const handleKeyDown = useCallback((e: KeyboardEvent) => {
    // Si el modal de cobro está abierto, las teclas las maneja el modal
    if (showPayModal) return

    const tag     = (e.target as HTMLElement).tagName
    const isInput = tag === 'INPUT' || tag === 'TEXTAREA' || tag === 'SELECT'

    switch (e.key) {
      case 'F8':
      case 'F9':
        e.preventDefault()
        if (showReceipt) { setShowReceipt(false); return }
        openPayModal()
        break
      case 'Escape':
        e.preventDefault()
        if (showReceipt) { setShowReceipt(false); return }
        if (!isInput) removeLastItem()
        break
      case 'Enter':
        if (showReceipt) { e.preventDefault(); setShowReceipt(false); return }
        break
      case 'F10':
        e.preventDefault()
        newTab()
        break
    }
  }, [cart, showReceipt, showPayModal, canPay, paying, totals])
  /* eslint-enable react-hooks/preserve-manual-memoization */

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
  // LOADING / BLOQUEO
  // ============================================================
  if (loading || cashSessionLoading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif', fontSize:14 }}>
      ⏳ Cargando POS...
    </div>
  )

  if (!cashSession) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif', color:'#F0F4FF', gap:16, padding:20 }}>
      <div style={{ width:64, height:64, borderRadius:16, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:30 }}>🏪</div>
      <div style={{ fontSize:20, fontWeight:700 }}>No hay caja abierta</div>
      <div style={{ fontSize:13, color:'#8899BB', textAlign:'center', maxWidth:340, lineHeight:1.7 }}>
        Debes abrir una caja antes de registrar ventas.
      </div>
      <div style={{ display:'flex', gap:10, marginTop:4 }}>
        <button onClick={() => router.push('/caja')} style={{ border:'none', borderRadius:9, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'12px 24px', fontSize:13, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
          🏪 Abrir caja
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ border:'none', borderRadius:9, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'12px 24px', fontSize:13, background:'rgba(255,255,255,.05)', borderColor:'rgba(93,224,230,.2)', borderWidth:1, borderStyle:'solid', color:'#8899BB' }}>
          ← Dashboard
        </button>
      </div>
    </div>
  )

  // ============================================================
  // ESTILOS
  // ============================================================
  const s: Record<string, React.CSSProperties> = {
    overlay:   { position:'fixed', inset:0, background:'rgba(0,0,0,.85)', zIndex:1000, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif' },
    modal:     { background:'#111827', border:'1px solid rgba(93,224,230,.3)', borderRadius:16, padding:24, color:'#F0F4FF', maxHeight:'92vh', overflowY:'auto' },
    root:      { height:'100vh', display:'flex', flexDirection:'column', background:'var(--mp-bg, #0A1628)', fontFamily:'Montserrat,sans-serif', color:'var(--mp-text, #F0F4FF)', userSelect: isDragging ? 'none' : 'auto' },
    body:      { flex:1, display:'flex', overflow:'hidden' },
    left:      { flex:1, display:'flex', flexDirection:'column', overflow:'hidden', minWidth:0 },
    searchBar: { padding:'8px 14px', background:'#111827', borderBottom:'1px solid rgba(93,224,230,.08)', flexShrink:0 },
    catBar:    { display:'flex', gap:5, padding:'6px 14px', background:'#111827', borderBottom:'1px solid rgba(93,224,230,.08)', overflowX:'auto', flexShrink:0 },
    grid:      { flex:1, overflowY:'auto', padding:10, display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(125px,1fr))', gap:7, alignContent:'start' },
    resizer:   { width:5, background: isDragging ? 'rgba(93,224,230,.5)' : 'rgba(93,224,230,.1)', cursor:'col-resize', flexShrink:0 },
    cart:      { width:cartWidth, background:'#111827', borderLeft:'1px solid rgba(93,224,230,.12)', display:'flex', flexDirection:'column', flexShrink:0 },
    cartFoot:  { padding:12, borderTop:'1px solid rgba(93,224,230,.12)', background:'#0D1F3C', flexShrink:0 },
    btn:       { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
    input:     { background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:7, padding:'8px 10px', fontSize:13, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif', width:'100%', boxSizing:'border-box' as const },
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
      {/* ===== MODAL COBRO ===== */}
      {showPayModal && (
        <div style={s.overlay} onClick={e => { if (e.target === e.currentTarget) setShowPayModal(false) }}>
          <div style={{ ...s.modal, width:440, padding:'20px 22px' }}>
            <div style={{ display:'flex', alignItems:'center', justifyContent:'space-between', marginBottom:14 }}>
              <span style={{ fontSize:15, fontWeight:700 }}>💳 Cobro de venta</span>
              <span style={{ fontSize:10, color:'#8899BB' }}>↑↓ navegar · Enter confirmar · Esc volver</span>
            </div>

            {/* Resumen tributario */}
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

            {/* 6 métodos fijos */}
            <div style={{ fontSize:10, fontWeight:700, color:'#8899BB', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Métodos de pago</div>
            <div style={{ display:'flex', flexDirection:'column', gap:4, marginBottom:12 }}>
              {[
                { id:'ef', label:'💵 Efectivo',     val:pmEf, set:setPmEf, ref:efInputRef },
                { id:'db', label:'💳 Débito',        val:pmDb, set:setPmDb },
                { id:'cr', label:'💳 Crédito',       val:pmCr, set:setPmCr },
                { id:'tr', label:'📲 Transferencia', val:pmTr, set:setPmTr },
                { id:'mp', label:'🟢 Mercado Pago',  val:pmMp, set:setPmMp },
                { id:'ch', label:'📄 Cheque',        val:pmCh, set:setPmCh },
              ].map(m => (
                <div key={m.id} onClick={() => { setPmFocus(m.id); document.getElementById(`pm-input-${m.id}`)?.focus() }}
                  style={{ display:'flex', alignItems:'center', gap:10, padding:'7px 11px', borderRadius:8, cursor:'text', border:`1px solid ${pmFocus === m.id ? 'rgba(93,224,230,.5)' : 'rgba(93,224,230,.08)'}`, background: pmFocus === m.id ? 'rgba(0,74,173,.15)' : '#1A2540', transition:'all .1s' }}
                >
                  <span style={{ fontSize:11, fontWeight:600, color: pmFocus === m.id ? '#F0F4FF' : '#8899BB', width:120, flexShrink:0 }}>{m.label}</span>
                  <input
                    id={`pm-input-${m.id}`}
                    ref={(m as any).ref}
                    type="text"
                    inputMode="numeric"
                    value={m.val}
                    onChange={e => { const v = e.target.value.replace(/[^0-9]/g,''); m.set(v) }}
                    onFocus={() => setPmFocus(m.id)}
                    onKeyDown={e => handlePayKeyDown(e, m.id)}
                    placeholder="0"
                    autoComplete="off"
                    autoCorrect="off"
                    spellCheck={false}
                    style={{ flex:1, border:'none', background:'transparent', fontFamily:'Montserrat,sans-serif', fontSize:16, fontWeight:800, color: parseFloat(m.val) > 0 ? '#F0F4FF' : '#8899BB', textAlign:'right', outline:'none' }}
                  />
                </div>
              ))}
            </div>

            {/* Estado dinámico */}
            <div style={{ height:'0.5px', background:'rgba(93,224,230,.1)', marginBottom:10 }} />
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', marginBottom:6 }}>
              <span>Total pagado</span>
              <span style={{ fontWeight:700, color:'#F0F4FF' }}>{fmt(pmTotal)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'8px 12px', borderRadius:8, marginBottom:14, background: pmDiff > 0 ? 'rgba(34,197,94,.1)' : pmDiff === 0 && pmTotal > 0 ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)', border:`1px solid ${pmDiff > 0 ? 'rgba(34,197,94,.2)' : pmDiff === 0 && pmTotal > 0 ? 'rgba(34,197,94,.2)' : 'rgba(239,68,68,.2)'}` }}>
              <span style={{ fontSize:13, fontWeight:800, color: pmDiff > 0 ? '#22C55E' : pmDiff === 0 && pmTotal > 0 ? '#22C55E' : '#EF4444' }}>
                {pmDiff > 0 ? 'VUELTO' : pmDiff === 0 && pmTotal > 0 ? '✅ EXACTO' : 'FALTA'}
              </span>
              <span style={{ fontSize:22, fontWeight:800, color: pmDiff > 0 ? '#22C55E' : pmDiff === 0 && pmTotal > 0 ? '#22C55E' : '#EF4444' }}>
                {pmDiff > 0 ? fmt(pmDiff) : pmDiff === 0 && pmTotal > 0 ? '$0' : fmt(Math.abs(pmDiff))}
              </span>
            </div>

            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowPayModal(false)} style={{ ...s.btn, flex:1, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB', padding:12, fontSize:12 }}>
                ← Volver
              </button>
              <button onClick={completeSale} disabled={!canPay} style={{ ...s.btn, flex:2, background: canPay ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'rgba(0,74,173,.2)', color:'#fff', padding:12, fontSize:13, opacity: canPay ? 1 : .5 }}>
                {paying ? '⏳ Procesando...' : canPay ? `✅ CONFIRMAR ${fmt(totals.total)}` : `FALTA ${fmt(Math.abs(pmDiff))}`}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ===== TOAST RECIBO — esquina superior izquierda ===== */}
      {showReceipt && lastSale && (
        <div style={{
          position:'fixed', top:16, left:72, zIndex:1200,
          width:340, maxHeight:'90vh',
          background:'#0E1C30', border:'1px solid rgba(34,197,94,.35)',
          borderRadius:14, boxShadow:'0 8px 40px rgba(0,0,0,.7)',
          display:'flex', flexDirection:'column',
          fontFamily:'Montserrat,sans-serif', color:'#F0F4FF',
          animation:'slideInLeft .25s cubic-bezier(.4,0,.2,1)',
        }}>
          <style>{`@keyframes slideInLeft{from{opacity:0;transform:translateX(-24px)}to{opacity:1;transform:none}}`}</style>

          {/* Header */}
          <div style={{ background:'rgba(34,197,94,.12)', borderBottom:'1px solid rgba(34,197,94,.2)', borderRadius:'14px 14px 0 0', padding:'12px 14px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start' }}>
              <div>
                <div style={{ display:'flex', alignItems:'center', gap:7, marginBottom:4 }}>
                  <span style={{ fontSize:16 }}>✅</span>
                  <span style={{ fontSize:14, fontWeight:800, color:'#22C55E' }}>Venta completada</span>
                </div>
                <div style={{ fontSize:10, color:'#8899BB', display:'flex', flexWrap:'wrap', gap:'4px 10px' }}>
                  <span>📅 {fmtDate(lastSale.date)}</span>
                  <span>🕐 {fmtTime(lastSale.date)}</span>
                  <span>🏪 {lastSale.register}</span>
                  <span>👤 {lastSale.cashier}</span>
                </div>
                <div style={{ fontSize:9, color:'rgba(93,224,230,.4)', marginTop:3, fontFamily:'monospace' }}>REF: {String(lastSale.id).slice(0,16).toUpperCase()}</div>
              </div>
              <button onClick={() => setShowReceipt(false)} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:18, lineHeight:1, padding:'0 0 0 8px' }}>×</button>
            </div>
          </div>

          {/* Body scrollable */}
          <div style={{ overflowY:'auto', padding:'12px 14px', flex:1 }}>

            {/* Productos */}
            <div style={{ fontSize:9, color:'#5DE0E6', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:6 }}>Productos</div>
            {lastSale.items.map((item: any, idx: number) => (
              <div key={idx} style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', padding:'4px 0', borderBottom:'1px solid rgba(93,224,230,.06)', fontSize:11 }}>
                <div style={{ flex:1 }}>
                  <div style={{ fontWeight:600 }}>{item.name}</div>
                  <div style={{ fontSize:9, color:'#8899BB', marginTop:1, display:'flex', gap:6 }}>
                    <span>{item.qty} × {fmt(item.sale_price)}</span>
                    {item.tax_type?.startsWith('ila') && <span style={{ color:'#F59E0B' }}>ILA</span>}
                    {(item.tax_type === 'cigars' || item.tax_type === 'exempt') && <span style={{ color:'#6B7280' }}>Exento</span>}
                  </div>
                </div>
                <span style={{ fontWeight:700, color:'#5DE0E6', marginLeft:10, fontSize:12 }}>{fmt(item.sale_price * item.qty)}</span>
              </div>
            ))}

            {/* Impuestos */}
            <div style={{ background:'#0A1525', borderRadius:8, padding:'8px 10px', margin:'10px 0', fontSize:11 }}>
              <div style={{ display:'flex', justifyContent:'space-between', color:'#8899BB', marginBottom:2 }}><span>Neto</span><span>{fmt(lastSale.totals.neto)}</span></div>
              {lastSale.totals.iva > 0   && <div style={{ display:'flex', justifyContent:'space-between', color:'#8899BB', marginBottom:2 }}><span>IVA 19%</span><span>{fmt(lastSale.totals.iva)}</span></div>}
              {lastSale.totals.ila > 0   && <div style={{ display:'flex', justifyContent:'space-between', color:'#F59E0B', marginBottom:2 }}><span>ILA</span><span>{fmt(lastSale.totals.ila)}</span></div>}
              {lastSale.totals.exento > 0 && <div style={{ display:'flex', justifyContent:'space-between', color:'#8899BB', marginBottom:2 }}><span>Exento</span><span>{fmt(lastSale.totals.exento)}</span></div>}
              <div style={{ display:'flex', justifyContent:'space-between', fontWeight:800, color:'#5DE0E6', fontSize:14, marginTop:5, paddingTop:5, borderTop:'1px solid rgba(93,224,230,.1)' }}>
                <span>TOTAL</span><span>{fmt(lastSale.totals.total)}</span>
              </div>
            </div>

            {/* Pagos */}
            <div style={{ fontSize:9, color:'#5DE0E6', fontWeight:700, textTransform:'uppercase', letterSpacing:'.05em', marginBottom:5 }}>Forma de pago</div>
            {lastSale.payments.map((p: any, idx: number) => (
              <div key={idx} style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', padding:'2px 0' }}>
                <span>{p.label || p.method}</span>
                <span style={{ color:'#F0F4FF', fontWeight:600 }}>{fmt(parseFloat(p.amount))}</span>
              </div>
            ))}
            {lastSale.vuelto > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', color:'#22C55E', fontWeight:700, fontSize:12, marginTop:5, paddingTop:5, borderTop:'1px solid rgba(34,197,94,.15)' }}>
                <span>Vuelto</span><span>{fmt(lastSale.vuelto)}</span>
              </div>
            )}
          </div>

          {/* Footer */}
          <div style={{ padding:'10px 14px', borderTop:'1px solid rgba(93,224,230,.08)', display:'flex', gap:8 }}>
            <button onClick={() => router.push('/ventas')}
              style={{ ...s.btn, flex:1, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'8px 0', fontSize:11 }}>
              📋 Ver historial
            </button>
            <button onClick={() => setShowReceipt(false)}
              style={{ ...s.btn, flex:2, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 0', fontSize:12 }}>
              💳 Nueva venta
            </button>
          </div>
        </div>
      )}

      {/* ===== PANTALLA PRINCIPAL ===== */}
      <div style={s.root}>

        {/* Info strip */}
        <div style={{ display:'flex', alignItems:'center', gap:10, padding:'4px 12px', background:'rgba(10,22,40,.6)', borderBottom:'1px solid rgba(93,224,230,.08)', flexShrink:0 }}>
          <span style={{ fontSize:11, color:'#8899BB' }}>Hola, {user?.first_name}</span>
          {cashSession && (
            <div style={{ display:'flex', alignItems:'center', gap:5, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.25)', borderRadius:20, padding:'2px 10px' }}>
              <div style={{ width:6, height:6, borderRadius:'50%', background:'#22C55E' }} />
              <span style={{ fontSize:9, fontWeight:700, color:'#22C55E' }}>{cashSession.register_name}</span>
            </div>
          )}
          <div style={{ flex:1 }} />
          <div style={{ display:'flex', gap:8 }}>
            {keyHint('F8/F9', 'Cobrar')}
            {keyHint('Esc', 'Borrar último')}
            {keyHint('↵', 'Confirmar')}
            {keyHint('F10', 'Nueva pestaña')}
          </div>
        </div>

        {/* Mensaje de éxito */}
        {successMsg && (
          <div style={{ background:'rgba(34,197,94,.15)', borderBottom:'1px solid rgba(34,197,94,.3)', padding:'8px 16px', fontSize:12, fontWeight:600, color:'#22C55E', textAlign:'center', flexShrink:0 }}>
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
                  fontSize:11, fontWeight:600, whiteSpace:'nowrap' as const,
                  background: activeCategory === cat.id ? (cat.color || '#004AAD') : '#1A2540',
                  color: activeCategory === cat.id ? '#fff' : '#8899BB',
                }}>
                  {cat.name}
                </button>
              ))}
            </div>
            <div style={s.grid}>
              {filtered.length === 0 && (
                <div style={{ gridColumn:'1/-1', textAlign:'center', padding:40, color:'#8899BB', fontSize:13 }}>📭 Sin productos</div>
              )}
              {filtered.map(p => {
                const stock    = p.inventory?.[0]?.quantity ?? 0
                const sinStock = stock <= 0
                const inCart   = cart.find(i => i.id === p.id)
                const taxColor = p.tax_type?.startsWith('ila') ? '#F59E0B' : p.tax_type === 'cigars' ? '#6B7280' : undefined
                return (
                  <div key={p.id} onClick={() => !sinStock && addToCart(p)}
                    style={{ background: inCart ? 'rgba(0,74,173,.25)' : '#1A2540', border:`1px solid ${inCart ? '#5DE0E6' : 'rgba(93,224,230,.1)'}`, borderRadius:9, padding:'9px 9px 7px', cursor: sinStock ? 'not-allowed' : 'pointer', opacity: sinStock ? .4 : 1, transition:'all .13s', position:'relative' }}
                    onMouseEnter={e => { if (!sinStock) (e.currentTarget as HTMLDivElement).style.borderColor = '#5DE0E6' }}
                    onMouseLeave={e => { if (!inCart) (e.currentTarget as HTMLDivElement).style.borderColor = 'rgba(93,224,230,.1)' }}
                  >
                    {inCart && <div style={{ position:'absolute', top:5, right:6, background:'#5DE0E6', color:'#0A1628', borderRadius:9, padding:'1px 6px', fontSize:9, fontWeight:700 }}>×{inCart.qty}</div>}
                    <div style={{ fontSize:10, color:'#8899BB', marginBottom:2 }}>{p.categories?.name}</div>
                    <div style={{ fontSize:11, fontWeight:600, lineHeight:1.3, marginBottom:4, minHeight:28 }}>{p.name}</div>
                    <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6' }}>{fmt(p.sale_price)}</div>
                    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:3 }}>
                      <span style={{ fontSize:10, color: stock <= 5 ? '#EF4444' : '#8899BB' }}>{sinStock ? '❌ Sin stock' : `Stock: ${stock}`}</span>
                      {taxColor && <span style={{ fontSize:9, color: taxColor, fontWeight:700 }}>{p.tax_type === 'cigars' ? 'Exento' : 'ILA'}</span>}
                    </div>
                  </div>
                )
              })}
            </div>
          </div>

          {/* Resize handle */}
          <div style={s.resizer} onMouseDown={startResize} />

          {/* Panel derecho: pestañas + carrito */}
          <div style={s.cart}>

            {/* ===== PESTAÑAS — SOLO EN EL PANEL DERECHO ===== */}
            <div style={{ display:'flex', alignItems:'center', background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.08)', padding:'0 10px', gap:3, flexShrink:0, minHeight:34, overflowX:'auto' }}>
              {tabs.map(tab => (
                <div key={tab.id} onClick={() => setActiveTab(tab.id)}
                  style={{ display:'flex', alignItems:'center', gap:5, padding:'5px 10px', borderRadius:'6px 6px 0 0', fontSize:11, fontWeight:600, cursor:'pointer', flexShrink:0, background: activeTab === tab.id ? '#111827' : 'transparent', color: activeTab === tab.id ? '#5DE0E6' : '#8899BB', borderBottom: activeTab === tab.id ? '2px solid #5DE0E6' : '2px solid transparent', transition:'all .12s' }}
                >
                  {tab.name}
                  {tab.cart.length > 0 && (
                    <span style={{ background:'#5DE0E6', color:'#0A1628', borderRadius:8, padding:'0 5px', fontSize:9, fontWeight:700 }}>
                      {tab.cart.reduce((s, i) => s + i.qty, 0)}
                    </span>
                  )}
                  {tabs.length > 1 && (
                    <span onClick={e => { e.stopPropagation(); closeTab(tab.id) }} style={{ fontSize:13, color:'#EF4444', opacity:.5, lineHeight:1 }}>×</span>
                  )}
                </div>
              ))}
              <button onClick={newTab} style={{ ...s.btn, background:'none', border:'1px dashed rgba(93,224,230,.2)', color:'#5DE0E6', fontSize:10, padding:'3px 8px', marginLeft:4, flexShrink:0 }}>
                + F10
              </button>
            </div>

            {/* Header del carrito */}
            <div style={{ padding:'8px 14px', borderBottom:'1px solid rgba(93,224,230,.1)', display:'flex', alignItems:'center', justifyContent:'space-between', flexShrink:0 }}>
              <div style={{ fontSize:12, fontWeight:700 }}>🛒 {currentTab?.name}</div>
              <div style={{ display:'flex', alignItems:'center', gap:7 }}>
                <span style={{ fontSize:10, color:'#8899BB' }}>{cart.reduce((s,i) => s+i.qty, 0)} items</span>
                {cart.length > 0 && (
                  <button onClick={clearCart} style={{ ...s.btn, background:'none', border:'1px solid rgba(239,68,68,.3)', color:'#EF4444', padding:'2px 8px', fontSize:10 }}>Vaciar</button>
                )}
              </div>
            </div>

            {/* Items del carrito */}
            <div style={{ flex:1, overflowY:'auto', padding:'4px 12px' }}>
              {cart.length === 0 ? (
                <div style={{ textAlign:'center', padding:'36px 16px', color:'#8899BB', fontSize:12, lineHeight:2 }}>
                  <div style={{ fontSize:28, marginBottom:6 }}>🛒</div>
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
                    <div style={{ fontSize:12, fontWeight:700, color:'#22C55E', minWidth:60, textAlign:'right' }}>{fmt(t.total)}</div>
                    <button onClick={() => removeFromCart(item.id)} style={{ background:'none', border:'none', color:'#EF4444', cursor:'pointer', fontSize:14 }}>✕</button>
                  </div>
                )
              })}
            </div>

            {/* Footer: totales + cobrar */}
            <div style={s.cartFoot}>
              {cart.length > 0 && (
                <div style={{ fontSize:11, color:'#8899BB', marginBottom:8 }}>
                  <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}><span>Neto</span><span>{fmt(totals.neto)}</span></div>
                  {totals.iva > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}><span>IVA 19%</span><span>{fmt(totals.iva)}</span></div>}
                  {totals.ila > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2, color:'#F59E0B' }}><span>ILA</span><span>{fmt(totals.ila)}</span></div>}
                  {totals.exento > 0 && <div style={{ display:'flex', justifyContent:'space-between', marginBottom:2 }}><span>Exento</span><span>{fmt(totals.exento)}</span></div>}
                </div>
              )}
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:10 }}>
                <span style={{ fontSize:15, fontWeight:700 }}>TOTAL</span>
                <span style={{ fontSize:22, fontWeight:700, color:'#5DE0E6' }}>{fmt(totals.total)}</span>
              </div>
              <button
                onClick={openPayModal}
                disabled={cart.length === 0}
                style={{ ...s.btn, width:'100%', padding:13, fontSize:14, color:'#fff', background: cart.length === 0 ? 'rgba(0,74,173,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', opacity: cart.length === 0 ? .5 : 1 }}
              >
                {cart.length === 0 ? 'Agrega productos' : `💳 COBRAR ${fmt(totals.total)} · F8/F9`}
              </button>
            </div>
          </div>
        </div>
      </div>
    </>
  )
}
