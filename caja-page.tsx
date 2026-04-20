'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()
const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
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
  return a.bills_20000*20000 + a.bills_10000*10000 + a.bills_5000*5000 +
         a.bills_2000*2000   + a.bills_1000*1000   +
         a.coins_500*500     + a.coins_100*100      + a.coins_50*50 + a.coins_10*10
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function CajaPage() {
  const router = useRouter()
  const [user, setUser]         = useState<any>(null)
  const [company, setCompany]   = useState<any>(null)
  const [loading, setLoading]   = useState(true)
  const [session, setSession]   = useState<CashSession | null>(null)
  const [history, setHistory]   = useState<any[]>([])
  const [view, setView]         = useState<'main'|'open'|'close'|'history'>('main')

  // Apertura
  const [registerName, setRegisterName] = useState('Caja 1')
  const [openingAmt, setOpeningAmt]     = useState('')
  const [openingNote, setOpeningNote]   = useState('')
  const [opening, setOpening]           = useState(false)

  // Cierre + arqueo
  const [arqueo, setArqueo]       = useState<Arqueo>(emptyArqueo)
  const [closingNote, setClosingNote] = useState('')
  const [closing, setClosing]     = useState(false)
  const [closeResult, setCloseResult] = useState<any>(null)

  // ============================================================
  // INIT
  // ============================================================
  useEffect(() => {
    async function init() {
      const { data: { session: authSession } } = await supabase.auth.getSession()
      if (!authSession) { router.push('/login'); return }

      const { data: userData } = await supabase
        .from('users')
        .select('id, first_name, last_name, company_id, companies(id, name)')
        .eq('auth_user_id', authSession.user.id)
        .single()

      if (!userData) { router.push('/login'); return }
      setUser(userData)
      setCompany((userData as any).companies)
      await loadSession(userData.company_id)
      await loadHistory(userData.company_id)
      setLoading(false)
    }
    init()
  }, [])

  async function loadSession(companyId: string) {
    const { data, error } = await supabase.rpc('get_active_cash_session', {
      p_company_id: companyId
    })
    setSession(data || null)
  }

  async function loadHistory(companyId: string) {
    const { data } = await supabase.rpc('get_cash_session_history', {
      p_company_id: companyId
    })
    setHistory(data || [])
  }

  // ============================================================
  // APERTURA
  // ============================================================
  async function handleOpen() {
    if (!openingAmt || parseFloat(openingAmt) < 0) return
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
        alert(`Ya hay una caja abierta: ${registerName}`)
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
  }

  // ============================================================
  // CIERRE
  // ============================================================
  async function handleClose() {
    if (!session) return
    setClosing(true)
    const totalContado = calcArqueo(arqueo)

    // Guardar arqueo primero
    await supabase.from('cash_arqueos').insert({
      company_id:      company.id,
      cash_session_id: session.id,
      user_id:         user.id,
      ...arqueo,
      expected_cash:   session.opening_amount + (session.total_sales || 0),
      difference:      totalContado - (session.opening_amount + (session.total_sales || 0)),
      arqueo_type:     'close',
      notes:           closingNote || null,
    })

    // Cerrar sesión
    const { data, error } = await supabase.rpc('close_cash_session', {
      p_session_id:     session.id,
      p_user_id:        user.id,
      p_closing_amount: totalContado,
      p_notes:          closingNote || null,
    })

    setClosing(false)
    if (error || !data?.success) {
      alert('Error al cerrar caja: ' + (error?.message || data?.error))
      return
    }

    setCloseResult(data)
    setSession(null)
    await loadHistory(company.id)
    setArqueo(emptyArqueo)
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

  const arqueoTotal = calcArqueo(arqueo)
  const expectedCash = session ? (session.opening_amount + (session.total_sales || 0)) : 0
  const arqueoDiff = arqueoTotal - expectedCash

  // ============================================================
  // ESTILOS
  // ============================================================
  const st = {
    page:   { minHeight:'100vh', background:'#0A1628', fontFamily:'Montserrat,sans-serif', color:'#F0F4FF' },
    topbar: { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 20px', gap:12 } as React.CSSProperties,
    logo:   { width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff' } as React.CSSProperties,
    body:   { maxWidth:800, margin:'0 auto', padding:'28px 20px' } as React.CSSProperties,
    card:   { background:'#111827', border:'1px solid rgba(93,224,230,.12)', borderRadius:12, padding:'20px 22px', marginBottom:14 } as React.CSSProperties,
    label:  { fontSize:11, fontWeight:600, color:'#8899BB', marginBottom:5, display:'block' } as React.CSSProperties,
    input:  { width:'100%', background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:8, padding:'10px 12px', fontSize:13, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif', boxSizing:'border-box' as 'border-box' },
    btn:    { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
    row:    { display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom:'1px solid rgba(93,224,230,.06)', fontSize:12 } as React.CSSProperties,
  }

  // ============================================================
  // RESULTADO DE CIERRE
  // ============================================================
  if (closeResult) return (
    <div style={st.page}>
      <div style={st.topbar}>
        <div style={st.logo}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Cierre de Caja</span>
      </div>
      <div style={st.body}>
        <div style={{ ...st.card, textAlign:'center', borderColor: Math.abs(closeResult.difference) < 1000 ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)' }}>
          <div style={{ fontSize:44, marginBottom:10 }}>
            {Math.abs(closeResult.difference) < 1000 ? '✅' : Math.abs(closeResult.difference) < 5000 ? '⚠️' : '🚨'}
          </div>
          <div style={{ fontSize:18, fontWeight:700, marginBottom:4 }}>Caja Cerrada</div>
          <div style={{ fontSize:11, color:'#8899BB' }}>{fmtDate(new Date().toISOString())} · {fmtTime(new Date().toISOString())}</div>
        </div>

        <div style={st.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:14, color:'#5DE0E6' }}>Resumen del cierre</div>
          {[
            ['Monto de apertura',   fmt(closeResult.opening_amount)],
            ['Total ventas del día', fmt(closeResult.total_sales)],
            ['Total devoluciones',  fmt(closeResult.total_refunds)],
            ['Monto esperado',      fmt(closeResult.expected_amount)],
            ['Monto contado',       fmt(closeResult.closing_amount)],
          ].map(([l, v]) => (
            <div key={l} style={st.row}><span style={{ color:'#8899BB' }}>{l}</span><span style={{ fontWeight:600 }}>{v}</span></div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginTop:10, padding:'10px 0' }}>
            <span style={{ fontSize:14, fontWeight:700 }}>Diferencia</span>
            <span style={{ fontSize:20, fontWeight:800, color: Math.abs(closeResult.difference) < 1000 ? '#22C55E' : '#EF4444' }}>
              {closeResult.difference >= 0 ? '+' : ''}{fmt(closeResult.difference)}
            </span>
          </div>
          {Math.abs(closeResult.difference) >= 1000 && (
            <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:8, padding:'8px 12px', fontSize:11, color:'#EF4444', marginTop:8 }}>
              ⚠️ Descuadre de {fmt(Math.abs(closeResult.difference))}. Revisar con el administrador.
            </div>
          )}
        </div>

        {/* Resumen por método */}
        {closeResult.payment_summary && Object.keys(closeResult.payment_summary).length > 0 && (
          <div style={st.card}>
            <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:'#5DE0E6' }}>Ventas por método de pago</div>
            {Object.entries(closeResult.payment_summary as Record<string,number>)
              .filter(([,v]) => v > 0)
              .map(([method, amount]) => (
                <div key={method} style={st.row}>
                  <span style={{ color:'#8899BB', textTransform:'capitalize' }}>{method === 'cash' ? 'Efectivo' : method === 'debit' ? 'Débito' : method === 'credit' ? 'Crédito' : method === 'transfer' ? 'Transferencia' : method}</span>
                  <span style={{ fontWeight:600 }}>{fmt(amount)}</span>
                </div>
              ))}
          </div>
        )}

        <button
          onClick={() => { setCloseResult(null); setView('main') }}
          style={{ ...st.btn, width:'100%', padding:13, fontSize:13, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}
        >
          Volver al panel de caja
        </button>
      </div>
    </div>
  )

  // ============================================================
  // VISTA APERTURA
  // ============================================================
  if (view === 'open') return (
    <div style={st.page}>
      <div style={st.topbar}>
        <div style={st.logo}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Apertura de Caja</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView('main')} style={{ ...st.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={st.body}>
        <div style={st.card}>
          <div style={{ fontSize:15, fontWeight:700, marginBottom:18, color:'#5DE0E6' }}>🏪 Abrir nueva caja</div>

          <label style={st.label}>Nombre de la caja / terminal</label>
          <select value={registerName} onChange={e => setRegisterName(e.target.value)} style={{ ...st.input, marginBottom:14 }}>
            <option>Caja 1</option>
            <option>Caja 2</option>
            <option>Caja 3</option>
            <option>Terminal POS</option>
            <option>Barra</option>
          </select>

          <label style={st.label}>Monto de apertura (efectivo inicial en caja)</label>
          <input
            type="number" min="0" value={openingAmt}
            onChange={e => setOpeningAmt(e.target.value)}
            placeholder="Ej: 50000"
            style={{ ...st.input, marginBottom:14, fontSize:16, fontWeight:700 }}
            autoFocus
          />

          <label style={st.label}>Observaciones (opcional)</label>
          <input
            type="text" value={openingNote}
            onChange={e => setOpeningNote(e.target.value)}
            placeholder="Ej: Turno mañana, fondo inicial"
            style={{ ...st.input, marginBottom:20 }}
          />

          {openingAmt && parseFloat(openingAmt) >= 0 && (
            <div style={{ background:'rgba(93,224,230,.06)', border:'1px solid rgba(93,224,230,.15)', borderRadius:8, padding:'10px 14px', marginBottom:16, fontSize:12, color:'#8899BB' }}>
              <div style={{ display:'flex', justifyContent:'space-between' }}>
                <span>Caja</span><span style={{ color:'#F0F4FF', fontWeight:600 }}>{registerName}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                <span>Fondo inicial</span><span style={{ color:'#5DE0E6', fontWeight:700, fontSize:14 }}>{fmt(parseFloat(openingAmt))}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', marginTop:4 }}>
                <span>Cajero</span><span style={{ color:'#F0F4FF' }}>{user?.first_name} {user?.last_name}</span>
              </div>
            </div>
          )}

          <button
            onClick={handleOpen}
            disabled={opening || !openingAmt}
            style={{ ...st.btn, width:'100%', padding:13, fontSize:13, background: !openingAmt ? 'rgba(0,74,173,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', opacity: !openingAmt ? .5 : 1 }}
          >
            {opening ? '⏳ Abriendo caja...' : '🏪 Abrir caja ahora'}
          </button>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // VISTA CIERRE
  // ============================================================
  if (view === 'close' && session) return (
    <div style={st.page}>
      <div style={st.topbar}>
        <div style={st.logo}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Cierre de Caja — {session.register_name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView('main')} style={{ ...st.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={st.body}>

        {/* Resumen de ventas del día */}
        <div style={st.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:12, color:'#5DE0E6' }}>📊 Resumen del día</div>
          {[
            ['Apertura de caja',   fmt(session.opening_amount)],
            ['Total ventas',       fmt(session.total_sales)],
            ['N° transacciones',   String(session.transaction_count)],
            ['Monto esperado en caja', fmt(expectedCash)],
          ].map(([l, v]) => (
            <div key={l} style={st.row}><span style={{ color:'#8899BB' }}>{l}</span><span style={{ fontWeight:600, color:'#F0F4FF' }}>{v}</span></div>
          ))}
        </div>

        {/* Arqueo físico de caja */}
        <div style={st.card}>
          <div style={{ fontSize:13, fontWeight:700, marginBottom:4, color:'#5DE0E6' }}>🧾 Arqueo físico de caja</div>
          <div style={{ fontSize:11, color:'#8899BB', marginBottom:14 }}>Cuenta el dinero real y llena los campos</div>

          {/* Billetes */}
          <div style={{ fontSize:11, fontWeight:700, color:'#C19E4D', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Billetes</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
            {[
              ['bills_20000', '$20.000'],
              ['bills_10000', '$10.000'],
              ['bills_5000',  '$5.000'],
              ['bills_2000',  '$2.000'],
              ['bills_1000',  '$1.000'],
            ].map(([key, label]) => (
              <div key={key}>
                <label style={{ ...st.label, marginBottom:3 }}>{label} × cantidad</label>
                <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                  <input
                    type="number" min="0"
                    value={(arqueo as any)[key] || ''}
                    onChange={e => setArqueo(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                    placeholder="0"
                    style={{ ...st.input, textAlign:'center', fontWeight:700, fontSize:15 }}
                  />
                  {(arqueo as any)[key] > 0 && (
                    <span style={{ fontSize:10, color:'#5DE0E6', whiteSpace:'nowrap' }}>
                      = {fmt((arqueo as any)[key] * parseInt(label.replace(/\D/g,'').replace('.','')))}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>

          {/* Monedas */}
          <div style={{ fontSize:11, fontWeight:700, color:'#C19E4D', marginBottom:8, textTransform:'uppercase', letterSpacing:'.5px' }}>Monedas</div>
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:16 }}>
            {[
              ['coins_500', '$500'],
              ['coins_100', '$100'],
              ['coins_50',  '$50'],
              ['coins_10',  '$10'],
            ].map(([key, label]) => (
              <div key={key}>
                <label style={{ ...st.label, marginBottom:3 }}>{label} × cantidad</label>
                <input
                  type="number" min="0"
                  value={(arqueo as any)[key] || ''}
                  onChange={e => setArqueo(prev => ({ ...prev, [key]: parseInt(e.target.value) || 0 }))}
                  placeholder="0"
                  style={{ ...st.input, textAlign:'center', fontWeight:700, fontSize:15 }}
                />
              </div>
            ))}
          </div>

          {/* Total contado */}
          <div style={{ background:'#0D1525', borderRadius:10, padding:'12px 16px', marginBottom:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', marginBottom:6 }}>
              <span>Total contado</span>
              <span style={{ fontWeight:700, color:'#F0F4FF', fontSize:16 }}>{fmt(arqueoTotal)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:11, color:'#8899BB', marginBottom:6 }}>
              <span>Monto esperado</span>
              <span style={{ fontWeight:600 }}>{fmt(expectedCash)}</span>
            </div>
            <div style={{ display:'flex', justifyContent:'space-between', fontSize:14, fontWeight:800, marginTop:8, paddingTop:8, borderTop:'1px solid rgba(93,224,230,.1)' }}>
              <span>Diferencia</span>
              <span style={{ color: Math.abs(arqueoDiff) < 1000 ? '#22C55E' : '#EF4444' }}>
                {arqueoDiff >= 0 ? '+' : ''}{fmt(arqueoDiff)}
              </span>
            </div>
          </div>

          <label style={st.label}>Observaciones del cierre</label>
          <input
            type="text" value={closingNote}
            onChange={e => setClosingNote(e.target.value)}
            placeholder="Ej: Todo cuadró, turno sin novedad"
            style={{ ...st.input, marginBottom:16 }}
          />

          <button
            onClick={handleClose}
            disabled={closing}
            style={{ ...st.btn, width:'100%', padding:13, fontSize:13, background:'linear-gradient(90deg,#EF4444,#DC2626)', color:'#fff' }}
          >
            {closing ? '⏳ Cerrando caja...' : `🔒 Cerrar caja — ${fmt(arqueoTotal)} contados`}
          </button>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // VISTA HISTORIAL
  // ============================================================
  if (view === 'history') return (
    <div style={st.page}>
      <div style={st.topbar}>
        <div style={st.logo}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Historial de Caja</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView('main')} style={{ ...st.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={st.body}>
        {history.length === 0 ? (
          <div style={{ ...st.card, textAlign:'center', padding:40, color:'#8899BB' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
            Sin historial de sesiones todavía
          </div>
        ) : history.map((sess: any) => (
          <div key={sess.id} style={{ ...st.card, borderColor: sess.status === 'open' ? 'rgba(34,197,94,.25)' : 'rgba(93,224,230,.12)' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
              <div>
                <div style={{ fontSize:13, fontWeight:700 }}>{sess.register_name}</div>
                <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>
                  {fmtDate(sess.opened_at)} · {fmtTime(sess.opened_at)}
                  {sess.closed_at && ` → ${fmtTime(sess.closed_at)}`}
                </div>
              </div>
              <span style={{ padding:'3px 10px', borderRadius:20, fontSize:10, fontWeight:700, background: sess.status === 'open' ? 'rgba(34,197,94,.15)' : 'rgba(93,224,230,.1)', color: sess.status === 'open' ? '#22C55E' : '#5DE0E6' }}>
                {sess.status === 'open' ? '🟢 Abierta' : '🔒 Cerrada'}
              </span>
            </div>
            <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10 }}>
              {[
                ['Apertura', fmt(sess.opening_amount)],
                ['Ventas', fmt(sess.total_sales || 0)],
                ['Diferencia', sess.difference !== null ? (sess.difference >= 0 ? '+' : '') + fmt(sess.difference) : '—'],
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
    <div style={st.page}>
      <div style={st.topbar}>
        <div style={st.logo}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Sistema de Caja — {company?.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => router.push('/dashboard')} style={{ ...st.btn, background:'transparent', border:'1px solid rgba(93,224,230,.25)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
          ← Dashboard
        </button>
      </div>

      <div style={st.body}>

        {/* Estado actual */}
        {session ? (
          <>
            {/* CAJA ABIERTA */}
            <div style={{ ...st.card, borderColor:'rgba(34,197,94,.3)', background:'rgba(34,197,94,.04)' }}>
              <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:14 }}>
                <div>
                  <div style={{ display:'flex', alignItems:'center', gap:8 }}>
                    <div style={{ width:10, height:10, borderRadius:'50%', background:'#22C55E', boxShadow:'0 0 8px rgba(34,197,94,.6)' }} />
                    <span style={{ fontSize:15, fontWeight:700 }}>{session.register_name}</span>
                    <span style={{ fontSize:11, color:'#22C55E', fontWeight:600 }}>EN LÍNEA</span>
                  </div>
                  <div style={{ fontSize:11, color:'#8899BB', marginTop:4 }}>
                    Abierta a las {fmtTime(session.opened_at)} · {session.opened_by_name}
                  </div>
                </div>
                <div style={{ textAlign:'right' }}>
                  <div style={{ fontSize:11, color:'#8899BB' }}>Ventas del día</div>
                  <div style={{ fontSize:22, fontWeight:800, color:'#5DE0E6' }}>{fmt(session.total_sales)}</div>
                </div>
              </div>

              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr 1fr', gap:10, marginBottom:14 }}>
                {[
                  ['Fondo inicial', fmt(session.opening_amount)],
                  ['Transacciones', String(session.transaction_count)],
                  ['Devoluciones', fmt(session.total_refunds || 0)],
                ].map(([l, v]) => (
                  <div key={l} style={{ background:'#0D1525', borderRadius:8, padding:'8px 10px' }}>
                    <div style={{ fontSize:10, color:'#8899BB' }}>{l}</div>
                    <div style={{ fontSize:14, fontWeight:700 }}>{v}</div>
                  </div>
                ))}
              </div>

              {/* Pagos por método */}
              {session.payment_summary && Object.values(session.payment_summary).some((v: any) => v > 0) && (
                <div style={{ marginBottom:14 }}>
                  <div style={{ fontSize:11, color:'#8899BB', marginBottom:6 }}>Ventas por método</div>
                  <div style={{ display:'flex', gap:6, flexWrap:'wrap' as 'wrap' }}>
                    {Object.entries(session.payment_summary)
                      .filter(([,v]) => (v as number) > 0)
                      .map(([method, amount]) => (
                        <div key={method} style={{ background:'#1A2540', borderRadius:6, padding:'4px 10px', fontSize:11 }}>
                          <span style={{ color:'#8899BB' }}>{method === 'cash' ? '💵' : method === 'debit' ? '💳' : method === 'transfer' ? '📲' : '💳'} </span>
                          <span style={{ fontWeight:600 }}>{fmt(amount as number)}</span>
                        </div>
                      ))}
                  </div>
                </div>
              )}

              <div style={{ display:'flex', gap:8 }}>
                <button
                  onClick={() => router.push('/pos')}
                  style={{ ...st.btn, flex:2, padding:11, fontSize:12, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}
                >
                  💳 Ir al POS
                </button>
                <button
                  onClick={() => setView('close')}
                  style={{ ...st.btn, flex:1, padding:11, fontSize:12, background:'rgba(239,68,68,.15)', border:'1px solid rgba(239,68,68,.3)', color:'#EF4444' }}
                >
                  🔒 Cerrar caja
                </button>
              </div>
            </div>
          </>
        ) : (
          /* SIN CAJA ABIERTA */
          <div style={{ ...st.card, textAlign:'center', padding:'36px 20px', borderColor:'rgba(239,68,68,.2)' }}>
            <div style={{ fontSize:44, marginBottom:10 }}>🏪</div>
            <div style={{ fontSize:16, fontWeight:700, marginBottom:6 }}>No hay caja abierta</div>
            <div style={{ fontSize:12, color:'#8899BB', marginBottom:20 }}>
              Debes abrir la caja antes de registrar ventas
            </div>
            <button
              onClick={() => setView('open')}
              style={{ ...st.btn, padding:'11px 28px', fontSize:13, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}
            >
              🏪 Abrir caja ahora
            </button>
          </div>
        )}

        {/* Acciones rápidas */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10, marginBottom:14 }}>
          <button
            onClick={() => setView('open')}
            disabled={!!session}
            style={{ ...st.btn, padding:14, fontSize:12, background: session ? 'rgba(255,255,255,.03)' : '#1A2540', border:'1px solid rgba(93,224,230,.12)', color: session ? '#8899BB' : '#F0F4FF', opacity: session ? .4 : 1 }}
          >
            <div style={{ fontSize:22, marginBottom:4 }}>🏪</div>
            Abrir caja
          </button>
          <button
            onClick={() => setView('history')}
            style={{ ...st.btn, padding:14, fontSize:12, background:'#1A2540', border:'1px solid rgba(93,224,230,.12)', color:'#F0F4FF' }}
          >
            <div style={{ fontSize:22, marginBottom:4 }}>📋</div>
            Ver historial
          </button>
        </div>

        {/* Info rápida */}
        <div style={{ ...st.card, background:'rgba(0,74,173,.05)', borderColor:'rgba(0,74,173,.2)' }}>
          <div style={{ fontSize:11, color:'#5DE0E6', fontWeight:700, marginBottom:6 }}>💡 Sistema de caja</div>
          <div style={{ fontSize:11, color:'#8899BB', lineHeight:1.7 }}>
            Cada venta queda amarrada a la sesión de caja activa. Al cerrar la caja, el sistema calcula automáticamente la diferencia entre el monto esperado y el contado físico. El historial queda registrado con trazabilidad completa por cajero y fecha.
          </div>
        </div>
      </div>
    </div>
  )
}
