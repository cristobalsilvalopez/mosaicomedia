'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase = createClient()
const fmt     = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtTime = (d: string) => new Date(d).toLocaleTimeString('es-CL', { hour:'2-digit', minute:'2-digit', timeZone:'America/Santiago' })
const fmtDate = (d: string) => new Date(d).toLocaleDateString('es-CL', { timeZone:'America/Santiago' })

// ============================================================
// TIPOS
// ============================================================
interface CashSession {
  id: string; register_name: string; opening_amount: number
  opened_at: string; total_sales: number; total_refunds: number
  transaction_count: number; payment_summary: Record<string,number>
  opened_by_name: string
}

interface Arqueo {
  bills_20000:number; bills_10000:number; bills_5000:number
  bills_2000:number;  bills_1000:number
  coins_500:number;   coins_100:number; coins_50:number; coins_10:number
}

const emptyArqueo: Arqueo = {
  bills_20000:0, bills_10000:0, bills_5000:0, bills_2000:0, bills_1000:0,
  coins_500:0, coins_100:0, coins_50:0, coins_10:0
}

function calcArqueo(a: Arqueo) {
  return a.bills_20000*20000 + a.bills_10000*10000 + a.bills_5000*5000
       + a.bills_2000*2000   + a.bills_1000*1000
       + a.coins_500*500     + a.coins_100*100 + a.coins_50*50 + a.coins_10*10
}

// ============================================================
// ESTILOS BASE (sin conflictos border/borderColor)
// ============================================================
const ST = {
  page:   { minHeight:'100vh', background:'var(--mp-bg, #0A1628)', fontFamily:'Montserrat,sans-serif', color:'var(--mp-text, #F0F4FF)' } as React.CSSProperties,
  body:   { maxWidth:820, margin:'0 auto', padding:'28px 20px' } as React.CSSProperties,
  card:   { background:'#111827', border:'1px solid rgba(93,224,230,.12)', borderRadius:12, padding:'20px 22px', marginBottom:14 } as React.CSSProperties,
  // Variantes de card sin conflictos:
  cardGreen: { background:'#111827', border:'1px solid rgba(34,197,94,.3)', borderRadius:12, padding:'20px 22px', marginBottom:14 } as React.CSSProperties,
  cardRed:   { background:'#111827', border:'1px solid rgba(239,68,68,.3)', borderRadius:12, padding:'20px 22px', marginBottom:14 } as React.CSSProperties,
  cardBlue:  { background:'rgba(0,74,173,.05)', border:'1px solid rgba(0,74,173,.2)', borderRadius:12, padding:'14px 18px', marginBottom:14 } as React.CSSProperties,
  label:  { fontSize:11, fontWeight:600, color:'#8899BB', marginBottom:5, display:'block' } as React.CSSProperties,
  input:  { width:'100%', background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif', boxSizing:'border-box' as const },
  btn:    { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
  row:    { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(93,224,230,.06)', fontSize:12 } as React.CSSProperties,
  overlay:{ position:'fixed', inset:0, background:'rgba(0,0,0,.8)', zIndex:200, display:'flex', alignItems:'center', justifyContent:'center', fontFamily:'Montserrat,sans-serif' } as React.CSSProperties,
  modal:  { background:'#111827', border:'1px solid rgba(93,224,230,.3)', borderRadius:14, padding:'24px 26px', width:360, color:'#F0F4FF' } as React.CSSProperties,
}

// ============================================================
// MODAL DE PIN — componente extraído para evitar recreación en render
// ============================================================
interface PinModalProps {
  onClose: () => void
  pendingAction: 'open' | 'close' | null
  registerName: string
  pinDots: number
  inputRef: React.RefObject<HTMLInputElement | null>
  onInput: React.ChangeEventHandler<HTMLInputElement>
  onKeyDown: React.KeyboardEventHandler<HTMLInputElement>
  pinError: string
  onConfirm: () => void
  loading: boolean
}

function PinModal({ onClose, pendingAction, registerName, pinDots, inputRef, onInput, onKeyDown, pinError, onConfirm, loading }: PinModalProps) {
  return (
    <div style={ST.overlay} onClick={e => { if (e.target === e.currentTarget) onClose() }}>
      <div style={ST.modal}>
        <div style={{ textAlign:'center', marginBottom:18 }}>
          <div style={{ fontSize:32, marginBottom:8 }}>🔐</div>
          <div style={{ fontSize:15, fontWeight:700 }}>Confirmar con PIN</div>
          <div style={{ fontSize:11, color:'#8899BB', marginTop:4 }}>
            {pendingAction === 'open' ? `Abriendo ${registerName}` : 'Cerrando caja'}
          </div>
        </div>

        <div style={{ display:'flex', justifyContent:'center', gap:8, marginBottom:14 }}>
          {[0,1,2,3].map(i => (
            <div key={i} style={{
              width:12, height:12, borderRadius:'50%',
              background: i < pinDots ? '#5DE0E6' : 'rgba(93,224,230,.12)',
              border: `1px solid ${i < pinDots ? '#5DE0E6' : 'rgba(93,224,230,.25)'}`,
              transition:'background .1s',
            }} />
          ))}
        </div>

        <input
          ref={inputRef}
          type="password"
          inputMode="numeric"
          autoComplete="one-time-code"
          maxLength={6}
          onChange={onInput}
          onKeyDown={onKeyDown}
          placeholder="● ● ● ●"
          style={{
            ...ST.input,
            textAlign:'center', fontSize:22, letterSpacing:10,
            fontWeight:700, marginBottom: pinError ? 8 : 14,
          }}
        />

        {pinError && (
          <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', borderRadius:6, padding:'7px 12px', fontSize:11, color:'#EF4444', marginBottom:12, textAlign:'center' }}>
            {pinError}
          </div>
        )}

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={onClose}
            style={{ ...ST.btn, flex:1, padding:11, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}
          >
            Cancelar (Esc)
          </button>
          <button onClick={onConfirm} disabled={pinDots < 4 || loading}
            style={{ ...ST.btn, flex:2, padding:11, fontSize:13, background: pinDots >= 4 ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'rgba(0,74,173,.2)', color:'#fff', opacity: pinDots >= 4 ? 1 : .5 }}
          >
            {loading ? '⏳ Verificando...' : '✅ Confirmar (Enter)'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function CajaPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading]           = useState(true)
  const [sessions, setSessions]         = useState<CashSession[]>([])
  const [sessionToClose, setSessionToClose] = useState<CashSession | null>(null)
  const [history, setHistory]           = useState<any[]>([])
  const [view, setView]                 = useState<'main'|'open'|'close'|'history'>('main')

  // Modal PIN — useRef para el valor para evitar pérdida de foco
  const [showPinModal, setShowPinModal] = useState(false)
  const [pinError, setPinError]         = useState('')
  const [pinLoading, setPinLoading]     = useState(false)
  const [pinDots, setPinDots]           = useState(0)   // solo para indicador visual
  const pinInputRef                     = useRef<HTMLInputElement>(null)
  const pinValueRef                     = useRef('')     // valor real del PIN sin re-render
  const [pendingAction, setPendingAction] = useState<'open' | 'close' | null>(null)

  // Apertura
  const [registerName, setRegisterName] = useState('Caja 1')
  const [openingAmt, setOpeningAmt]     = useState('')
  const [openingNote, setOpeningNote]   = useState('')
  const [opening, setOpening]           = useState(false)

  // Cierre + arqueo
  const [arqueo, setArqueo]         = useState<Arqueo>(emptyArqueo)
  const [transbankAmt, setTransbankAmt] = useState('')  // monto máquina Transbank
  const [closingNote, setClosingNote]   = useState('')
  const [closing, setClosing]           = useState(false)
  const [closeResult, setCloseResult]   = useState<any>(null)

  // ============================================================
  async function loadSession(companyId: string) {
    const { data } = await supabase.rpc('get_active_cash_sessions', { p_company_id: companyId })
    setSessions(Array.isArray(data) ? data : (data ? [data] : []))
  }

  async function loadHistory(companyId: string) {
    const { data } = await supabase.rpc('get_cash_session_history', { p_company_id: companyId })
    setHistory(data || [])
  }

  // INIT
  // ============================================================
  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      setUser(ctx.user as any)
      setCompany(ctx.company)
      await loadSession(ctx.companyId)
      await loadHistory(ctx.companyId)
      setLoading(false)
    }
    init()
  }, [])

  // ============================================================
  // FLUJO DE PIN — modal aparece después del formulario
  // ============================================================
  function requestPin(action: 'open' | 'close') {
    if (action === 'open' && (!openingAmt || parseFloat(openingAmt) < 0)) return
    if (action === 'close' && !sessionToClose) return
    setPendingAction(action)
    pinValueRef.current = ''
    setPinDots(0)
    setPinError('')
    setShowPinModal(true)
    // Foco con delay para que el modal esté montado
    setTimeout(() => {
      if (pinInputRef.current) {
        pinInputRef.current.value = ''
        pinInputRef.current.focus()
      }
    }, 80)
  }

  async function confirmPin() {
    const currentPin = pinValueRef.current
    if (currentPin.length < 4) {
      setPinError('El PIN debe tener al menos 4 dígitos')
      pinInputRef.current?.focus()
      return
    }
    setPinLoading(true)
    const { data: pinData } = await supabase.rpc('verify_user_pin', {
      p_user_id: user.id,
      p_pin:     currentPin,
    })
    setPinLoading(false)

    if (!pinData || !pinData.success) {
      setPinError('PIN incorrecto. Intenta nuevamente.')
      pinValueRef.current = ''
      setPinDots(0)
      if (pinInputRef.current) {
        pinInputRef.current.value = ''
        pinInputRef.current.focus()
      }
      return
    }

    // PIN correcto — ejecutar acción pendiente
    setShowPinModal(false)
    pinValueRef.current = ''
    setPinDots(0)
    setPinError('')
    if (pendingAction === 'open')  await executeOpen()
    if (pendingAction === 'close') await executeClose()
    setPendingAction(null)
    setSessionToClose(null)
  }

  // ============================================================
  // APERTURA
  // ============================================================
  async function executeOpen() {
    setOpening(true)
    const { data, error } = await supabase.rpc('open_cash_session', {
      p_company_id:     company.id,
      p_user_id:        user.id,
      p_register_name:  registerName,
      p_opening_amount: parseFloat(openingAmt),
      p_notes:          openingNote || null,
    })
    setOpening(false)
    if (error || !data?.success) {
      if (data?.error === 'ALREADY_OPEN') {
        alert(`Ya hay una sesión abierta para ${registerName}. Ciérrala primero.`)
      } else {
        alert('Error al abrir caja: ' + (error?.message || data?.error))
      }
      return
    }
    await loadSession(company.id)
    await loadHistory(company.id)
    setView('main')
    setOpeningAmt('')
    setOpeningNote('')
    // Auto-sugerir siguiente nombre
    setRegisterName('Caja ' + (sessions.length + 2))
  }

  // ============================================================
  // CIERRE
  // ============================================================
  async function executeClose() {
    if (!sessionToClose) return
    setClosing(true)
    const efectivoContado  = calcArqueo(arqueo)
    const transbankTotal   = parseFloat(transbankAmt) || 0
    const totalContado     = efectivoContado + transbankTotal

    // Guardar arqueo
    await supabase.from('cash_arqueos').insert({
      company_id:      company.id,
      cash_session_id: sessionToClose.id,
      user_id:         user.id,
      ...arqueo,
      expected_cash:   sessionToClose.opening_amount + (sessionToClose.payment_summary?.cash || 0),
      difference:      efectivoContado - (sessionToClose.opening_amount + (sessionToClose.payment_summary?.cash || 0)),
      arqueo_type:     'close',
      notes:           closingNote || null,
    })

    // Cerrar sesión con el total contado real
    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session_id:     sessionToClose.id,
      p_user_id:        user.id,
      p_closing_amount: totalContado,
      p_notes:          closingNote || null,
    })

    setClosing(false)
    if (error || !data?.success) {
      alert('Error al cerrar caja: ' + (error?.message || data?.error))
      return
    }

    setCloseResult({ ...data, efectivo_contado: efectivoContado, transbank_contado: transbankTotal })
    await loadSession(company.id)
    await loadHistory(company.id)
    setArqueo(emptyArqueo)
    setTransbankAmt('')
    setClosingNote('')
  }

  // ============================================================
  // LOADING
  // ============================================================
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando...
    </div>
  )

  const arqueoTotal  = calcArqueo(arqueo)
  const transbankVal = parseFloat(transbankAmt) || 0
  const cashSales    = sessionToClose?.payment_summary?.cash || 0
  const expectedCash = sessionToClose ? (sessionToClose.opening_amount + cashSales) : 0
  const arqueoDiff   = arqueoTotal - expectedCash

  // ============================================================
  // MODAL DE PIN — input no controlado para mantener foco siempre
  // ============================================================
  // El input usa ref en vez de value={state} para evitar que React
  // destruya y recree el elemento en cada keystroke (que causa pérdida de foco)
  function handlePinInput(e: React.ChangeEvent<HTMLInputElement>) {
    // Solo dígitos, máximo 6
    const raw    = e.target.value.replace(/\D/g, '').slice(0, 6)
    e.target.value = raw          // actualizar el DOM directamente
    pinValueRef.current = raw     // guardar en ref (sin re-render)
    setPinDots(raw.length)        // solo los dots provocan re-render (muy leve)
    if (raw.length > 0) setPinError('')
    // Auto-confirmar al llegar a 4 dígitos
    if (raw.length === 4) confirmPin()
  }

  function handlePinKey(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Enter')  { e.preventDefault(); confirmPin() }
    if (e.key === 'Escape') { e.preventDefault(); setShowPinModal(false) }
  }


  // ============================================================
  // RESULTADO DE CIERRE
  // ============================================================
  if (closeResult) return (
    <div style={ST.page}>
      {showPinModal && <PinModal onClose={() => setShowPinModal(false)} pendingAction={pendingAction} registerName={registerName} pinDots={pinDots} inputRef={pinInputRef} onInput={handlePinInput} onKeyDown={handlePinKey} pinError={pinError} onConfirm={confirmPin} loading={pinLoading} />}
      <div style={ST.body}>
        {/* Estado general */}
        {Math.abs(closeResult.difference) < 1000 ? (
          <div style={ST.cardGreen}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:44, marginBottom:10 }}>✅</div>
              <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Caja Cerrada — Sin descuadre</div>
              <div style={{ fontSize:11, color:'#8899BB' }}>{fmtDate(new Date().toISOString())} · {fmtTime(new Date().toISOString())}</div>
            </div>
          </div>
        ) : Math.abs(closeResult.difference) < 5000 ? (
          <div style={{ background:'#111827', border:'1px solid rgba(251,191,36,.3)', borderRadius:12, padding:'20px 22px', marginBottom:14, textAlign:'center' }}>
            <div style={{ fontSize:44, marginBottom:10 }}>⚠️</div>
            <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Caja Cerrada — Descuadre menor</div>
            <div style={{ fontSize:11, color:'#8899BB' }}>{fmtDate(new Date().toISOString())} · {fmtTime(new Date().toISOString())}</div>
          </div>
        ) : (
          <div style={ST.cardRed}>
            <div style={{ textAlign:'center' }}>
              <div style={{ fontSize:44, marginBottom:10 }}>🚨</div>
              <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Caja Cerrada — Descuadre grave</div>
              <div style={{ fontSize:11, color:'#8899BB' }}>{fmtDate(new Date().toISOString())} · {fmtTime(new Date().toISOString())}</div>
            </div>
          </div>
        )}

        <div style={ST.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:'#5DE0E6' }}>Resumen del cierre</div>
          {([
            ['Monto de apertura',        fmt(closeResult.opening_amount)],
            ['Ventas totales del día',    fmt(closeResult.total_sales || 0)],
            ['Efectivo en ventas',        fmt(closeResult.cash_sales || 0)],
            ['Efectivo contado (arqueo)', fmt(closeResult.efectivo_contado || closeResult.closing_amount)],
            ['Monto esperado (efectivo)', fmt(closeResult.expected_amount)],
            ['Total contado',             fmt(closeResult.closing_amount)],
          ] as [string,string][]).map(([l, v]) => (
            <div key={l} style={ST.row}><span style={{ color:'#8899BB' }}>{l}</span><span style={{ fontWeight:600 }}>{v}</span></div>
          ))}
          {closeResult.transbank_contado > 0 && (
            <div style={ST.row}>
              <span style={{ color:'#8899BB' }}>Transbank / máquina contado</span>
              <span style={{ fontWeight:600 }}>{fmt(closeResult.transbank_contado)}</span>
            </div>
          )}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, padding:'10px 0' }}>
            <span style={{ fontSize:14, fontWeight:700 }}>Diferencia (efectivo)</span>
            <span style={{ fontSize:20, fontWeight:800, color: Math.abs(closeResult.difference) < 1000 ? '#22C55E' : '#EF4444' }}>
              {closeResult.difference >= 0 ? '+' : ''}{fmt(closeResult.difference)}
            </span>
          </div>
          {Math.abs(closeResult.difference) >= 1000 && (
            <div style={{ background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', borderRadius:8, padding:'8px 12px', fontSize:11, color:'#EF4444', marginTop:8 }}>
              ⚠️ Descuadre de {fmt(Math.abs(closeResult.difference))}. Revisar con el administrador.
            </div>
          )}
        </div>

        {closeResult.payment_summary && Object.values(closeResult.payment_summary).some((v: any) => v > 0) && (
          <div style={ST.card}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:'#5DE0E6' }}>Ventas por método de pago</div>
            {Object.entries(closeResult.payment_summary as Record<string,number>)
              .filter(([,v]) => v > 0)
              .map(([method, amount]) => (
                <div key={method} style={ST.row}>
                  <span style={{ color:'#8899BB' }}>
                    {method === 'cash' ? '💵 Efectivo' : method === 'debit' ? '💳 Débito' : method === 'credit' ? '💳 Crédito' : method === 'transfer' ? '📲 Transferencia' : method === 'mercadopago' ? '🟢 Mercado Pago' : method}
                  </span>
                  <span style={{ fontWeight:600 }}>{fmt(amount)}</span>
                </div>
              ))}
          </div>
        )}

        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => router.push('/pos')} style={{ ...ST.btn, flex:1, padding:13, fontSize:12, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6' }}>
            💳 Ir al POS
          </button>
          <button onClick={() => { setCloseResult(null); setView('main') }} style={{ ...ST.btn, flex:2, padding:13, fontSize:13, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
            Volver al panel de caja
          </button>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // VISTA APERTURA
  // ============================================================
  if (view === 'open') return (
    <div style={ST.page}>
      {showPinModal && <PinModal onClose={() => setShowPinModal(false)} pendingAction={pendingAction} registerName={registerName} pinDots={pinDots} inputRef={pinInputRef} onInput={handlePinInput} onKeyDown={handlePinKey} pinError={pinError} onConfirm={confirmPin} loading={pinLoading} />}
      <div style={ST.body}>
        <button onClick={() => setView('main')} style={{ ...ST.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11, marginBottom:16 }}>← Volver</button>
        <div style={ST.card}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:18, color:'#5DE0E6' }}>🏪 Abrir nueva caja</div>

          <label style={ST.label}>Nombre de la caja / terminal</label>
          <select value={registerName} onChange={e => setRegisterName(e.target.value)} style={{ ...ST.input, marginBottom:14 }}>
            <option>Caja 1</option>
            <option>Caja 2</option>
            <option>Caja 3</option>
            <option>Terminal POS</option>
            <option>Barra</option>
          </select>

          <label style={ST.label}>Monto de apertura (efectivo inicial en caja)</label>
          <input
            type="number" min="0" value={openingAmt}
            onChange={e => setOpeningAmt(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && openingAmt) requestPin('open') }}
            placeholder="Ej: 50000"
            style={{ ...ST.input, marginBottom:14, fontSize:16, fontWeight:700 }}
            autoFocus
          />

          <label style={ST.label}>Observaciones (opcional)</label>
          <input
            type="text" value={openingNote}
            onChange={e => setOpeningNote(e.target.value)}
            onKeyDown={e => { if (e.key === 'Enter' && openingAmt) requestPin('open') }}
            placeholder="Ej: Turno mañana, fondo inicial"
            style={{ ...ST.input, marginBottom:20 }}
          />

          {openingAmt && parseFloat(openingAmt) >= 0 && (
            <div style={ST.cardBlue}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                <span style={{ color:'#8899BB' }}>Caja</span><span style={{ fontWeight:600 }}>{registerName}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4, fontSize:12 }}>
                <span style={{ color:'#8899BB' }}>Fondo inicial</span><span style={{ color:'#5DE0E6', fontWeight:700, fontSize:15 }}>{fmt(parseFloat(openingAmt))}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                <span style={{ color:'#8899BB' }}>Cajero</span><span style={{ fontWeight:600 }}>{user?.first_name} {user?.last_name}</span>
              </div>
            </div>
          )}

          <button
            onClick={() => requestPin('open')}
            disabled={opening || !openingAmt}
            style={{ ...ST.btn, width:'100%', padding:13, fontSize:13, background: !openingAmt ? 'rgba(0,74,173,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', opacity: !openingAmt ? .5 : 1 }}
          >
            {opening ? '⏳ Abriendo caja...' : '🏪 Abrir caja — se pedirá PIN'}
          </button>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // VISTA CIERRE
  // ============================================================
  if (view === 'close' && sessionToClose) return (
    <div style={ST.page}>
      {showPinModal && <PinModal onClose={() => setShowPinModal(false)} pendingAction={pendingAction} registerName={registerName} pinDots={pinDots} inputRef={pinInputRef} onInput={handlePinInput} onKeyDown={handlePinKey} pinError={pinError} onConfirm={confirmPin} loading={pinLoading} />}
      <div style={ST.body}>
        <button onClick={() => setView('main')} style={{ ...ST.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11, marginBottom:16 }}>← Volver</button>

        {/* Resumen del día */}
        <div style={ST.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:'#5DE0E6' }}>📊 Resumen del día</div>
          {[
            ['Apertura de caja',        fmt(sessionToClose.opening_amount)],
            ['Total ventas',            fmt(sessionToClose.total_sales)],
            ['Ventas en efectivo',      fmt(cashSales)],
            ['N° transacciones',        String(sessionToClose.transaction_count)],
            ['Efectivo esperado en caja', fmt(expectedCash)],
          ].map(([l, v]) => (
            <div key={l} style={ST.row}><span style={{ color:'#8899BB' }}>{l}</span><span style={{ fontWeight:600, color:'#F0F4FF' }}>{v}</span></div>
          ))}
        </div>

        {/* Arqueo físico — efectivo */}
        <div style={ST.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:4, color:'#5DE0E6' }}>🧾 Arqueo físico — Efectivo</div>
          <div style={{ fontSize:11, color:'#8899BB', marginBottom:14 }}>Cuenta los billetes y monedas físicos en la caja</div>

          <div style={{ fontSize:11, fontWeight:700, color:'#C19E4D', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Billetes</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
            {([
              ['bills_20000', '$20.000', 20000],
              ['bills_10000', '$10.000', 10000],
              ['bills_5000',  '$5.000',  5000],
              ['bills_2000',  '$2.000',  2000],
              ['bills_1000',  '$1.000',  1000],
            ] as [keyof Arqueo, string, number][]).map(([key, label, val]) => (
              <div key={key}>
                <label style={{ ...ST.label, marginBottom:3 }}>{label} × cantidad</label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input
                    type="number" min="0"
                    value={(arqueo as any)[key] || ''}
                    onChange={e => setArqueo(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    style={{ ...ST.input, textAlign:'center', fontWeight:700, fontSize:15 }}
                  />
                  {(arqueo as any)[key] > 0 && (
                    <span style={{ fontSize:10, color:'#5DE0E6', whiteSpace:'nowrap' }}>= {fmt((arqueo as any)[key] * val)}</span>
                  )}
                </div>
              </div>
            ))}
          </div>

          <div style={{ fontSize:11, fontWeight:700, color:'#C19E4D', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Monedas</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {([
              ['coins_500', '$500', 500],
              ['coins_100', '$100', 100],
              ['coins_50',  '$50',  50],
              ['coins_10',  '$10',  10],
            ] as [keyof Arqueo, string, number][]).map(([key, label]) => (
              <div key={key}>
                <label style={{ ...ST.label, marginBottom:3 }}>{label} × cantidad</label>
                <input
                  type="number" min="0"
                  value={(arqueo as any)[key] || ''}
                  onChange={e => setArqueo(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  style={{ ...ST.input, textAlign:'center', fontWeight:700, fontSize:15 }}
                />
              </div>
            ))}
          </div>

          {/* Total efectivo contado */}
          <div style={{ background:'#0D1525', borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#8899BB', marginBottom:5 }}>
              <span>Efectivo contado</span><span style={{ color:'#F0F4FF', fontWeight:700, fontSize:15 }}>{fmt(arqueoTotal)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#8899BB', marginBottom:5 }}>
              <span>Efectivo esperado</span><span style={{ fontWeight:600 }}>{fmt(expectedCash)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:800, marginTop:8, paddingTop:8, borderTop:'1px solid rgba(93,224,230,.1)' }}>
              <span>Diferencia efectivo</span>
              <span style={{ color: Math.abs(arqueoDiff) < 1000 ? '#22C55E' : '#EF4444' }}>
                {arqueoDiff >= 0 ? '+' : ''}{fmt(arqueoDiff)}
              </span>
            </div>
          </div>
        </div>

        {/* Transbank / máquina */}
        <div style={ST.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:4, color:'#5DE0E6' }}>💳 Transbank / Máquina</div>
          <div style={{ fontSize:11, color:'#8899BB', marginBottom:12 }}>Ingresa el total que muestra el cierre de lote de la máquina bancaria</div>

          <label style={ST.label}>Total cierre de lote Transbank / POS bancario</label>
          <input
            type="number" min="0" value={transbankAmt}
            onChange={e => setTransbankAmt(e.target.value)}
            placeholder="Ej: 45000"
            style={{ ...ST.input, fontSize:16, fontWeight:700, marginBottom:10 }}
          />

          {transbankVal > 0 && (
            <div style={{ background:'#0D1525', borderRadius:8, padding:'10px 14px', fontSize:12 }}>
              <div style={{ display:'flex', justifyContent:'space-between', color:'#8899BB', marginBottom:4 }}>
                <span>Sistema registra (tarjetas)</span>
                <span>{fmt((sessionToClose.payment_summary?.debit || 0) + (sessionToClose.payment_summary?.credit || 0))}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', color:'#8899BB' }}>
                <span>Máquina marca</span>
                <span style={{ fontWeight:700, color:'#F0F4FF' }}>{fmt(transbankVal)}</span>
              </div>
            </div>
          )}
        </div>

        {/* Resumen total del cierre */}
        <div style={ST.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:'#5DE0E6' }}>📋 Total del cierre</div>
          <div style={{ background:'#0D1525', borderRadius:10, padding:'12px 16px' }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#8899BB', marginBottom:5 }}>
              <span>Efectivo contado</span><span>{fmt(arqueoTotal)}</span>
            </div>
            {transbankVal > 0 && (
              <div style={{ display:'flex', justifyContent:'space-between', fontSize:12, color:'#8899BB', marginBottom:5 }}>
                <span>Transbank contado</span><span>{fmt(transbankVal)}</span>
              </div>
            )}
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:15, fontWeight:800, marginTop:8, paddingTop:8, borderTop:'1px solid rgba(93,224,230,.1)', color:'#5DE0E6' }}>
              <span>Total contado</span><span>{fmt(arqueoTotal + transbankVal)}</span>
            </div>
          </div>
        </div>

        <label style={ST.label}>Observaciones del cierre</label>
        <input
          type="text" value={closingNote}
          onChange={e => setClosingNote(e.target.value)}
          onKeyDown={e => { if (e.key === 'Enter') requestPin('close') }}
          placeholder="Ej: Todo cuadró, turno sin novedad"
          style={{ ...ST.input, marginBottom:16 }}
        />

        <button
          onClick={() => requestPin('close')}
          disabled={closing}
          style={{ ...ST.btn, width:'100%', padding:13, fontSize:13, background:'linear-gradient(90deg,#EF4444,#DC2626)', color:'#fff' }}
        >
          {closing ? '⏳ Cerrando caja...' : `🔒 Cerrar caja — se pedirá PIN`}
        </button>
      </div>
    </div>
  )

  // ============================================================
  // VISTA HISTORIAL
  // ============================================================
  if (view === 'history') return (
    <div style={ST.page}>
      <div style={ST.body}>
        <button onClick={() => setView('main')} style={{ ...ST.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11, marginBottom:16 }}>← Volver</button>
        {history.length === 0 ? (
          <div style={{ ...ST.card, textAlign:'center', padding:40, color:'#8899BB' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
            Sin historial de sesiones todavía
          </div>
        ) : history.map((sess: any) => (
          <div key={sess.id} style={sess.status === 'open' ? ST.cardGreen : ST.card}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>{sess.register_name}</div>
                <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>
                  {fmtDate(sess.opened_at)} · {fmtTime(sess.opened_at)}
                  {sess.closed_at && ` → ${fmtTime(sess.closed_at)}`}
                  {' · '}{sess.opened_by_name}
                </div>
              </div>
              <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, background: sess.status === 'open' ? 'rgba(34,197,94,.15)' : 'rgba(93,224,230,.1)', color: sess.status === 'open' ? '#22C55E' : '#5DE0E6' }}>
                {sess.status === 'open' ? '🟢 Abierta' : '🔒 Cerrada'}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:8 }}>
              {[
                ['Apertura', fmt(sess.opening_amount || 0)],
                ['Ventas', fmt(sess.total_sales || 0)],
                ['Diferencia', sess.difference !== null && sess.difference !== undefined ? (sess.difference >= 0 ? '+' : '') + fmt(sess.difference) : '—'],
              ].map(([l, v]) => (
                <div key={l} style={{ background:'#0D1525', borderRadius:8, padding:'8px 10px' }}>
                  <div style={{ fontSize:10, color:'#8899BB' }}>{l}</div>
                  <div style={{ fontSize:13, fontWeight:700, color: l === 'Diferencia' && sess.difference !== null ? (Math.abs(sess.difference) < 1000 ? '#22C55E' : '#EF4444') : '#F0F4FF' }}>{v}</div>
                </div>
              ))}
            </div>
          </div>
        ))}
      </div>
    </div>
  )

  // ============================================================
  // VISTA PRINCIPAL
  // ============================================================
  return (
    <div style={ST.page}>
      {showPinModal && <PinModal onClose={() => setShowPinModal(false)} pendingAction={pendingAction} registerName={registerName} pinDots={pinDots} inputRef={pinInputRef} onInput={handlePinInput} onKeyDown={handlePinKey} pinError={pinError} onConfirm={confirmPin} loading={pinLoading} />}
      <div style={ST.body}>

        {/* Sesiones activas */}
        {sessions.length === 0 ? (
          <div style={{ ...ST.card, textAlign:'center', padding:'36px 20px' }}>
            <div style={{ fontSize:44, marginBottom:10 }}>🏪</div>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>No hay caja abierta</div>
            <div style={{ fontSize:12, color:'#8899BB', marginBottom:20 }}>
              Debes abrir la caja antes de registrar ventas
            </div>
            <button onClick={() => { setRegisterName('Caja 1'); setView('open') }} style={{ ...ST.btn, padding:'11px 28px', fontSize:13, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
              🏪 Abrir caja ahora
            </button>
          </div>
        ) : (
          <div style={{ display:'flex', flexDirection:'column', gap:10, marginBottom:10 }}>
            {sessions.map(sess => (
              <div key={sess.id} style={ST.cardGreen}>
                <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                  <div>
                    <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                      <div style={{ width:10, height:10, borderRadius:'50%', background:'#22C55E', boxShadow:'0 0 8px rgba(34,197,94,.6)' }} />
                      <span style={{ fontSize:15, fontWeight:700 }}>{sess.register_name}</span>
                      <span style={{ fontSize:11, color:'#22C55E', fontWeight:600 }}>EN LÍNEA</span>
                    </div>
                    <div style={{ fontSize:11, color:'#8899BB', marginTop:4 }}>
                      Abierta a las {fmtTime(sess.opened_at)} · {sess.opened_by_name}
                    </div>
                  </div>
                  <div style={{ textAlign:'right' }}>
                    <div style={{ fontSize:11, color:'#8899BB' }}>Ventas del día</div>
                    <div style={{ fontSize:22, fontWeight:800, color:'#5DE0E6' }}>{fmt(sess.total_sales)}</div>
                  </div>
                </div>

                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
                  {[
                    ['Fondo inicial',   fmt(sess.opening_amount)],
                    ['Transacciones',   String(sess.transaction_count)],
                    ['Efectivo ventas', fmt(sess.payment_summary?.cash || 0)],
                  ].map(([l, v]) => (
                    <div key={l} style={{ background:'rgba(0,0,0,.2)', borderRadius:8, padding:'8px 10px' }}>
                      <div style={{ fontSize:10, color:'#8899BB' }}>{l}</div>
                      <div style={{ fontSize:14, fontWeight:700 }}>{v}</div>
                    </div>
                  ))}
                </div>

                {sess.payment_summary && Object.values(sess.payment_summary).some((v: any) => v > 0) && (
                  <div style={{ marginBottom:14 }}>
                    <div style={{ fontSize:11, color:'#8899BB', marginBottom:6 }}>Ventas por método</div>
                    <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const }}>
                      {Object.entries(sess.payment_summary).filter(([,v]) => (v as number) > 0).map(([method, amount]) => (
                        <div key={method} style={{ background:'rgba(0,0,0,.2)', borderRadius:6, padding:'4px 10px', fontSize:11 }}>
                          <span style={{ color:'#8899BB' }}>{method === 'cash' ? '💵 ' : method === 'debit' ? '💳 ' : method === 'transfer' ? '📲 ' : method === 'mercadopago' ? '🟢 ' : '💳 '}</span>
                          <span style={{ fontWeight:600 }}>{fmt(amount as number)}</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}

                <div style={{ display:'flex', gap:8 }}>
                  <button onClick={() => router.push('/pos')} style={{ ...ST.btn, flex:2, padding:11, fontSize:12, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
                    💳 Ir al POS
                  </button>
                  <button onClick={() => { setSessionToClose(sess); setView('close') }} style={{ ...ST.btn, flex:1, padding:11, fontSize:12, background:'rgba(239,68,68,.12)', border:'1px solid rgba(239,68,68,.3)', color:'#EF4444' }}>
                    🔒 Cerrar caja
                  </button>
                </div>
              </div>
            ))}
          </div>
        )}

        {/* Acciones rápidas */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <button onClick={() => { setRegisterName('Caja ' + (sessions.length + 1)); setView('open') }}
            style={{ ...ST.btn, padding:14, fontSize:12, background:'#1A2540', border:'1px solid rgba(93,224,230,.12)', color:'#F0F4FF' }}>
            <div style={{ fontSize:22, marginBottom:4 }}>🏪</div>
            Abrir caja
          </button>
          <button onClick={() => setView('history')}
            style={{ ...ST.btn, padding:14, fontSize:12, background:'#1A2540', border:'1px solid rgba(93,224,230,.12)', color:'#F0F4FF' }}>
            <div style={{ fontSize:22, marginBottom:4 }}>📋</div>
            Historial de cajas
          </button>
        </div>

        <div style={ST.cardBlue}>
          <div style={{ fontSize:11, color:'#5DE0E6', fontWeight:700, marginBottom:6 }}>💡 Sistema de caja</div>
          <div style={{ fontSize:11, color:'#8899BB', lineHeight:1.7 }}>
            Cada venta queda amarrada a la sesión de caja activa. El arqueo al cierre te permite contar físicamente el efectivo y registrar el monto de la máquina Transbank. El historial queda con trazabilidad completa.
          </div>
        </div>
      </div>
    </div>
  )
}
