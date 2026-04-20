'use client'

import { useEffect, useState, useRef } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

const supabase = createClient()
const fmt  = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtD = (d: string) => new Date(d).toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' })
const fmtDT= (d: string) => new Date(d).toLocaleString('es-CL', { day:'2-digit', month:'2-digit', hour:'2-digit', minute:'2-digit' })

// ============================================================
// CONSTANTES
// ============================================================
const SEGMENTS: Record<string, { label:string; color:string; bg:string; icon:string }> = {
  vip:        { label:'VIP',         color:'#C19E4D', bg:'rgba(193,158,77,.15)',  icon:'⭐' },
  frequent:   { label:'Frecuente',   color:'#5DE0E6', bg:'rgba(93,224,230,.12)', icon:'🔁' },
  new:        { label:'Nuevo',       color:'#22C55E', bg:'rgba(34,197,94,.12)',   icon:'🆕' },
  regular:    { label:'Regular',     color:'#8899BB', bg:'rgba(136,153,187,.1)',  icon:'👤' },
  dormant:    { label:'Dormido',     color:'#F59E0B', bg:'rgba(245,158,11,.12)',  icon:'😴' },
  at_risk:    { label:'En riesgo',   color:'#EF4444', bg:'rgba(239,68,68,.12)',   icon:'⚠️' },
  no_purchase:{ label:'Sin compra',  color:'#6B7280', bg:'rgba(107,114,128,.1)',  icon:'👋' },
}

const TIERS: Record<string, { label:string; color:string }> = {
  standard: { label:'Estándar', color:'#8899BB' },
  silver:   { label:'Silver',   color:'#C0C0C0' },
  gold:     { label:'Gold',     color:'#C19E4D' },
  platinum: { label:'Platinum', color:'#A78BFA' },
}

const SOURCES: Record<string, string> = {
  pos: '🖥 POS', manual: '✏️ Manual', web: '🌐 Web',
  whatsapp: '💬 WhatsApp', instagram: '📸 Instagram',
  facebook: '📘 Facebook', referral: '🤝 Referido',
}

const NOTE_TYPES = [
  { value:'general',   label:'General' },
  { value:'followup',  label:'Seguimiento' },
  { value:'complaint', label:'Reclamo' },
  { value:'sale',      label:'Venta' },
]

const METHOD_LABELS: Record<string,string> = {
  cash:'Efectivo', debit:'Débito', credit:'Crédito',
  transfer:'Transferencia', mercado_pago:'Mercado Pago',
}

const EMPTY_FORM = {
  first_name:'', last_name:'', rut:'', email:'', phone:'',
  whatsapp:'', address:'', city:'', acquisition_source:'manual', tags:'',
}

// ============================================================
// TIPOS
// ============================================================
interface Customer {
  id: string; first_name: string; last_name: string; full_name: string
  rut: string; email: string; phone: string; whatsapp: string
  tier: string; points: number; tags: string[]; acquisition_source: string
  address?: string; city?: string
  created_at: string; is_active: boolean
  total_purchases: number; total_spent: number; avg_ticket: number
  last_purchase_at: string | null; days_since_purchase: number | null
  segment: string
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function CRMPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Lista
  const [customers, setCustomers] = useState<Customer[]>([])
  const [summary, setSummary]     = useState<any>(null)
  const [fetching, setFetching]   = useState(false)
  const [search, setSearch]       = useState('')
  const [filterSegment, setFilterSegment] = useState('')
  const [filterTier, setFilterTier]       = useState('')

  // Vista
  const [view, setView] = useState<'list'|'profile'|'edit'>('list')
  const [selected, setSelected]   = useState<Customer | null>(null)
  const [profile, setProfile]     = useState<any>(null)
  const [profLoading, setProfLoading] = useState(false)

  // Formulario
  const [form, setForm]     = useState<any>(EMPTY_FORM)
  const [saving, setSaving] = useState(false)
  const [formErr, setFormErr] = useState('')

  // Notas
  const [noteText, setNoteText]   = useState('')
  const [noteType, setNoteType]   = useState('general')
  const [savingNote, setSavingNote] = useState(false)

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
      await Promise.all([
        loadCustomers(userData.company_id),
        loadSummary(userData.company_id),
      ])
      setLoading(false)
    }
    init()
  }, [])

  // Buscar cuando cambia el search (debounced)
  useEffect(() => {
    if (!company) return
    const t = setTimeout(() => loadCustomers(company.id), 300)
    return () => clearTimeout(t)
  }, [search, company])

  // ============================================================
  // CARGAR DATOS
  // ============================================================
  async function loadCustomers(companyId?: string) {
    const cId = companyId || company?.id
    if (!cId) return
    setFetching(true)
    const { data } = await supabase.rpc('get_customers', {
      p_company_id: cId,
      p_search:     search || null,
      p_limit:      200,
      p_offset:     0,
    })
    setCustomers((data as Customer[]) || [])
    setFetching(false)
  }

  async function loadSummary(companyId?: string) {
    const cId = companyId || company?.id
    if (!cId) return
    const { data } = await supabase.rpc('get_crm_summary', { p_company_id: cId })
    setSummary(data)
  }

  async function loadProfile(customerId: string) {
    setProfLoading(true)
    const { data } = await supabase.rpc('get_customer_profile', {
      p_company_id:  company.id,
      p_customer_id: customerId,
    })
    setProfile(data)
    setProfLoading(false)
  }

  // ============================================================
  // FILTRO LOCAL
  // ============================================================
  const filtered = customers.filter(c => {
    const matchSeg  = !filterSegment || c.segment === filterSegment
    const matchTier = !filterTier    || c.tier    === filterTier
    return matchSeg && matchTier
  })

  // ============================================================
  // ABRIR PERFIL
  // ============================================================
  function openProfile(c: Customer) {
    setSelected(c)
    setView('profile')
    setProfile(null)
    loadProfile(c.id)
  }

  function openNew() {
    setForm({ ...EMPTY_FORM })
    setFormErr('')
    setSelected(null)
    setView('edit')
  }

  function openEdit(c: Customer) {
    setForm({
      id: c.id,
      first_name: c.first_name || '', last_name: c.last_name || '',
      rut: c.rut || '', email: c.email || '', phone: c.phone || '',
      whatsapp: c.whatsapp || '', address: c.address || '',
      city: c.city || '',
      acquisition_source: c.acquisition_source || 'manual',
      tags: (c.tags || []).join(', '),
    })
    setFormErr('')
    setSelected(c)
    setView('edit')
  }

  // ============================================================
  // GUARDAR CLIENTE
  // ============================================================
  async function saveCustomer() {
    if (!form.first_name.trim()) { setFormErr('El nombre es obligatorio'); return }
    if (!form.phone && !form.email && !form.rut) {
      setFormErr('Debes ingresar al menos teléfono, email o RUT')
      return
    }
    setSaving(true); setFormErr('')
    const tagsArr = form.tags
      ? form.tags.split(',').map((t: string) => t.trim()).filter(Boolean)
      : []
    const payload = {
      ...form,
      company_id: company.id,
      tags: tagsArr,
    }
    const { data, error } = await supabase.rpc('upsert_customer', { p_data: payload })
    setSaving(false)
    if (error || !data?.success) { setFormErr(error?.message || 'Error al guardar'); return }
    await Promise.all([loadCustomers(), loadSummary()])
    // Si era edición desde perfil, recargar perfil
    if (selected && view === 'edit') {
      await loadProfile(data.id)
      setView('profile')
    } else {
      setView('list')
    }
  }

  // ============================================================
  // GUARDAR NOTA
  // ============================================================
  async function saveNote() {
    if (!noteText.trim() || !selected) return
    setSavingNote(true)
    await supabase.rpc('add_customer_note', {
      p_company_id:  company.id,
      p_customer_id: selected.id,
      p_note:        noteText,
      p_note_type:   noteType,
      p_user_id:     user.id,
    })
    setNoteText('')
    setSavingNote(false)
    await loadProfile(selected.id)
  }

  // ============================================================
  // TECLADO
  // ============================================================
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') {
        if (view === 'profile' || view === 'edit') setView('list')
      }
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [view])

  // ============================================================
  // LOADING
  // ============================================================
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando CRM...
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
  }

  // ============================================================
  // VISTA EDITAR / CREAR
  // ============================================================
  if (view === 'edit') return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>{selected ? 'Editar cliente' : 'Nuevo cliente'}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView(selected ? 'profile' : 'list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={{ ...S.body, maxWidth:620, margin:'0 auto', width:'100%' }}>
        <div style={S.card}>
          <div style={{ fontSize:14, fontWeight:700, marginBottom:18, color:'#5DE0E6' }}>
            {selected ? `✏️ ${selected.full_name}` : '👤 Nuevo cliente'}
          </div>

          {formErr && (
            <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#EF4444', marginBottom:14 }}>
              {formErr}
            </div>
          )}

          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div>
              <label style={S.label}>Nombre *</label>
              <input value={form.first_name} onChange={e => setForm((f:any) => ({...f, first_name: e.target.value}))}
                placeholder="Nombre" style={S.input} autoFocus />
            </div>
            <div>
              <label style={S.label}>Apellido</label>
              <input value={form.last_name} onChange={e => setForm((f:any) => ({...f, last_name: e.target.value}))}
                placeholder="Apellido" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Teléfono</label>
              <input value={form.phone} onChange={e => setForm((f:any) => ({...f, phone: e.target.value}))}
                placeholder="+56 9 1234 5678" style={S.input} />
            </div>
            <div>
              <label style={S.label}>WhatsApp</label>
              <input value={form.whatsapp} onChange={e => setForm((f:any) => ({...f, whatsapp: e.target.value}))}
                placeholder="+56 9 1234 5678" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Email</label>
              <input type="email" value={form.email} onChange={e => setForm((f:any) => ({...f, email: e.target.value}))}
                placeholder="email@ejemplo.com" style={S.input} />
            </div>
            <div>
              <label style={S.label}>RUT</label>
              <input value={form.rut} onChange={e => setForm((f:any) => ({...f, rut: e.target.value}))}
                placeholder="12.345.678-9" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Ciudad</label>
              <input value={form.city} onChange={e => setForm((f:any) => ({...f, city: e.target.value}))}
                placeholder="Ciudad" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Origen del cliente</label>
              <select value={form.acquisition_source} onChange={e => setForm((f:any) => ({...f, acquisition_source: e.target.value}))} style={S.input}>
                {Object.entries(SOURCES).map(([v, l]) => <option key={v} value={v}>{l}</option>)}
              </select>
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Dirección</label>
              <input value={form.address} onChange={e => setForm((f:any) => ({...f, address: e.target.value}))}
                placeholder="Dirección completa" style={S.input} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Etiquetas (separadas por coma)</label>
              <input value={form.tags} onChange={e => setForm((f:any) => ({...f, tags: e.target.value}))}
                placeholder="vip, mayorista, empresa, etc."
                onKeyDown={e => { if (e.key === 'Enter') saveCustomer() }}
                style={S.input} />
            </div>
          </div>

          <div style={{ background:'rgba(0,74,173,.06)', borderRadius:8, padding:'10px 12px', marginTop:14, fontSize:11, color:'#8899BB' }}>
            💡 El sistema detectará automáticamente si el cliente ya existe por RUT, teléfono o email y actualizará su perfil.
          </div>

          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button onClick={() => setView(selected ? 'profile' : 'list')}
              style={{ ...S.btn, flex:1, padding:12, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>
              Cancelar
            </button>
            <button onClick={saveCustomer} disabled={saving}
              style={{ ...S.btn, flex:2, padding:12, fontSize:13, background: saving ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
              {saving ? '⏳ Guardando...' : selected ? '💾 Actualizar' : '➕ Crear cliente'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ============================================================
  // VISTA PERFIL DEL CLIENTE
  // ============================================================
  if (view === 'profile' && selected) {
    const c    = profile?.customer || selected
    const seg  = SEGMENTS[c.segment] || SEGMENTS.regular
    const tier = TIERS[c.tier] || TIERS.standard
    const daysSince = c.days_since_purchase

    return (
      <div style={S.page}>
        <div style={S.topbar}>
          <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
          <span style={{ fontWeight:700, fontSize:13 }}>Perfil de cliente</span>
          <div style={{ flex:1 }} />
          <button onClick={() => openEdit(selected)} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
            ✏️ Editar
          </button>
          {selected.phone && (
            <a href={`https://wa.me/${(selected.whatsapp || selected.phone).replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
              style={{ ...S.btn, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', padding:'4px 12px', fontSize:11, textDecoration:'none', display:'inline-flex', alignItems:'center' }}>
              💬 WhatsApp
            </a>
          )}
          <button onClick={() => setView('list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>
            ← Volver (Esc)
          </button>
        </div>

        <div style={{ ...S.body, maxWidth:900, margin:'0 auto', width:'100%' }}>
          {profLoading ? (
            <div style={{ textAlign:'center', padding:60, color:'#8899BB' }}>⏳ Cargando perfil...</div>
          ) : (
            <div style={{ display:'grid', gridTemplateColumns:'340px 1fr', gap:16 }}>

              {/* COLUMNA IZQUIERDA — datos del cliente */}
              <div>
                {/* Header cliente */}
                <div style={{ ...S.card, textAlign:'center' as 'center' }}>
                  <div style={{ width:64, height:64, borderRadius:'50%', background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:24, fontWeight:800, margin:'0 auto 12px', color:'#fff' }}>
                    {(c.first_name || '?')[0].toUpperCase()}
                  </div>
                  <div style={{ fontSize:18, fontWeight:800 }}>{c.full_name || c.first_name}</div>
                  <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>{SOURCES[c.acquisition_source] || c.acquisition_source}</div>
                  <div style={{ display:'flex', justifyContent:'center', gap:8, marginTop:10, flexWrap:'wrap' as 'wrap' }}>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background: seg.bg, color: seg.color }}>
                      {seg.icon} {seg.label}
                    </span>
                    <span style={{ fontSize:11, fontWeight:700, padding:'3px 10px', borderRadius:20, background:'rgba(255,255,255,.06)', color: tier.color }}>
                      {tier.label}
                    </span>
                  </div>
                  {(c.tags || []).length > 0 && (
                    <div style={{ display:'flex', flexWrap:'wrap' as 'wrap', gap:4, justifyContent:'center', marginTop:10 }}>
                      {(c.tags || []).map((t: string) => (
                        <span key={t} style={{ fontSize:10, padding:'2px 8px', borderRadius:12, background:'rgba(93,224,230,.08)', color:'#5DE0E6', border:'1px solid rgba(93,224,230,.15)' }}>{t}</span>
                      ))}
                    </div>
                  )}
                </div>

                {/* Contacto */}
                <div style={S.card}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>📞 Contacto</div>
                  {[
                    ['📱 Teléfono', c.phone],
                    ['💬 WhatsApp', c.whatsapp],
                    ['📧 Email', c.email],
                    ['🪪 RUT', c.rut],
                    ['📍 Ciudad', c.city],
                    ['🏠 Dirección', c.address],
                  ].filter(([,v]) => v).map(([l, v]) => (
                    <div key={l} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12, borderBottom:'1px solid rgba(93,224,230,.05)' }}>
                      <span style={{ color:'#8899BB' }}>{l}</span>
                      <span style={{ fontWeight:600, maxWidth:160, textAlign:'right' as 'right', overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' as 'nowrap' }}>{v}</span>
                    </div>
                  ))}
                  <div style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12 }}>
                    <span style={{ color:'#8899BB' }}>📅 Cliente desde</span>
                    <span style={{ fontWeight:600 }}>{c.created_at ? fmtD(c.created_at) : '—'}</span>
                  </div>
                </div>

                {/* Métricas */}
                <div style={S.card}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>📊 Métricas</div>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:8 }}>
                    {[
                      ['Compras', String(c.total_purchases || 0), '#F0F4FF'],
                      ['Total gastado', fmt(c.total_spent), '#5DE0E6'],
                      ['Ticket promedio', fmt(c.avg_ticket), '#22C55E'],
                      ['Puntos', String(c.points || 0), '#C19E4D'],
                    ].map(([l, v, col]) => (
                      <div key={l} style={{ background:'#0D1525', borderRadius:8, padding:'8px 10px' }}>
                        <div style={{ fontSize:9, color:'#8899BB' }}>{l}</div>
                        <div style={{ fontSize:15, fontWeight:800, color: col, marginTop:2 }}>{v}</div>
                      </div>
                    ))}
                  </div>
                  {c.last_purchase_at && (
                    <div style={{ marginTop:10, padding:'8px 10px', background:'#0D1525', borderRadius:8, fontSize:11 }}>
                      <div style={{ color:'#8899BB' }}>Última compra</div>
                      <div style={{ fontWeight:700, marginTop:2 }}>{fmtD(c.last_purchase_at)}</div>
                      {daysSince !== null && (
                        <div style={{ fontSize:10, color: daysSince > 60 ? '#EF4444' : daysSince > 30 ? '#F59E0B' : '#22C55E', marginTop:2 }}>
                          Hace {daysSince} días
                        </div>
                      )}
                    </div>
                  )}
                </div>

                {/* Acciones rápidas */}
                <div style={S.card}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>⚡ Acciones rápidas</div>
                  <div style={{ display:'flex', flexDirection:'column' as 'column', gap:6 }}>
                    {selected.phone && (
                      <a href={`https://wa.me/${(selected.whatsapp || selected.phone).replace(/\D/g,'')}`} target="_blank" rel="noreferrer"
                        style={{ ...S.btn, padding:'9px 12px', fontSize:12, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', textAlign:'center' as 'center', textDecoration:'none', display:'block' }}>
                        💬 Enviar WhatsApp
                      </a>
                    )}
                    {selected.email && (
                      <a href={`mailto:${selected.email}`}
                        style={{ ...S.btn, padding:'9px 12px', fontSize:12, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', textAlign:'center' as 'center', textDecoration:'none', display:'block' }}>
                        📧 Enviar email
                      </a>
                    )}
                    <button onClick={() => openEdit(selected)}
                      style={{ ...S.btn, padding:'9px 12px', fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>
                      ✏️ Editar perfil
                    </button>
                  </div>
                </div>
              </div>

              {/* COLUMNA DERECHA — historial, notas, productos */}
              <div>
                {/* Productos favoritos */}
                {profile?.top_products?.length > 0 && (
                  <div style={S.card}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>🏆 Productos favoritos</div>
                    {profile.top_products.map((p: any, i: number) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'5px 0', borderBottom:'1px solid rgba(93,224,230,.05)', fontSize:12 }}>
                        <div style={{ display:'flex', gap:8, alignItems:'center' }}>
                          <span style={{ fontSize:12, fontWeight:800, color:'rgba(93,224,230,.3)', minWidth:18 }}>{i+1}</span>
                          <span>{p.name}</span>
                        </div>
                        <div style={{ textAlign:'right' as 'right' }}>
                          <div style={{ fontSize:11, fontWeight:700, color:'#5DE0E6' }}>{fmt(p.total)}</div>
                          <div style={{ fontSize:10, color:'#8899BB' }}>×{Math.round(p.qty)}</div>
                        </div>
                      </div>
                    ))}
                  </div>
                )}

                {/* Métodos de pago */}
                {profile?.payment_methods?.length > 0 && (
                  <div style={S.card}>
                    <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>💳 Métodos de pago frecuentes</div>
                    {profile.payment_methods.map((p: any, i: number) => (
                      <div key={i} style={{ display:'flex', justifyContent:'space-between', padding:'4px 0', fontSize:12, borderBottom:'1px solid rgba(93,224,230,.05)' }}>
                        <span style={{ color:'#8899BB' }}>{METHOD_LABELS[p.method] || p.method}</span>
                        <span style={{ fontWeight:700 }}>{fmt(p.total)}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Historial de compras */}
                <div style={S.card}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>
                    🛒 Historial de compras ({profile?.sales?.length || 0})
                  </div>
                  {!profile?.sales?.length ? (
                    <div style={{ fontSize:12, color:'#8899BB', padding:'10px 0', textAlign:'center' as 'center' }}>Sin compras registradas</div>
                  ) : profile.sales.map((s: any) => (
                    <div key={s.id} style={{ padding:'8px 0', borderBottom:'1px solid rgba(93,224,230,.05)' }}>
                      <div style={{ display:'flex', justifyContent:'space-between', fontSize:12 }}>
                        <span style={{ color:'#8899BB' }}>{fmtDT(s.created_at)}</span>
                        <span style={{ fontWeight:700, color:'#5DE0E6' }}>{fmt(s.total)}</span>
                      </div>
                      <div style={{ fontSize:10, color:'#8899BB', marginTop:3 }}>
                        {(s.items || []).slice(0, 3).map((item: any) => item.name).join(' · ')}
                        {(s.items || []).length > 3 && ` +${s.items.length - 3} más`}
                      </div>
                    </div>
                  ))}
                </div>

                {/* Notas */}
                <div style={S.card}>
                  <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>📝 Notas</div>

                  {/* Agregar nota */}
                  <div style={{ background:'#0D1525', borderRadius:10, padding:'12px', marginBottom:12 }}>
                    <select value={noteType} onChange={e => setNoteType(e.target.value)}
                      style={{ ...S.input, marginBottom:8, fontSize:11 }}>
                      {NOTE_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                    </select>
                    <textarea value={noteText} onChange={e => setNoteText(e.target.value)}
                      placeholder="Agregar nota sobre este cliente..."
                      rows={2} style={{ ...S.input, resize:'vertical' as 'vertical', marginBottom:8 }}
                      onKeyDown={e => { if (e.key === 'Enter' && e.ctrlKey) saveNote() }}
                    />
                    <button onClick={saveNote} disabled={savingNote || !noteText.trim()}
                      style={{ ...S.btn, width:'100%', padding:'8px', fontSize:12, background: !noteText.trim() ? 'rgba(0,74,173,.2)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', opacity: !noteText.trim() ? .5 : 1 }}>
                      {savingNote ? '⏳' : '+ Guardar nota (Ctrl+Enter)'}
                    </button>
                  </div>

                  {/* Lista de notas */}
                  {!profile?.notes?.length ? (
                    <div style={{ fontSize:12, color:'#8899BB', textAlign:'center' as 'center', padding:'8px 0' }}>Sin notas</div>
                  ) : profile.notes.map((n: any) => {
                    const nt = NOTE_TYPES.find(t => t.value === n.note_type)
                    return (
                      <div key={n.id} style={{ padding:'8px 0', borderBottom:'1px solid rgba(93,224,230,.05)', fontSize:12 }}>
                        <div style={{ display:'flex', justifyContent:'space-between', marginBottom:3 }}>
                          <span style={{ fontSize:10, fontWeight:700, padding:'1px 6px', borderRadius:10, background:'rgba(93,224,230,.08)', color:'#5DE0E6' }}>
                            {nt?.label || n.note_type}
                          </span>
                          <span style={{ fontSize:10, color:'#8899BB' }}>{fmtDT(n.created_at)} · {n.created_by}</span>
                        </div>
                        <div style={{ color:'#F0F4FF' }}>{n.note}</div>
                      </div>
                    )
                  })}
                </div>
              </div>
            </div>
          )}
        </div>
      </div>
    )
  }

  // ============================================================
  // VISTA LISTA PRINCIPAL
  // ============================================================
  return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>CRM — Clientes</span>
        <span style={{ fontSize:11, color:'#8899BB' }}>{company?.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Dashboard</button>
        <button onClick={openNew} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
          + Nuevo cliente
        </button>
      </div>

      <div style={S.body}>
        {/* KPIs del CRM */}
        {summary && (
          <div style={{ display:'grid', gridTemplateColumns:'repeat(5,1fr)', gap:10, marginBottom:16 }}>
            {[
              { icon:'👥', label:'Total clientes', value: summary.total,       color:'#5DE0E6' },
              { icon:'🆕', label:'Nuevos (30d)',   value: summary.new_30d,     color:'#22C55E' },
              { icon:'⭐', label:'VIP / Gold',      value: summary.vip,        color:'#C19E4D' },
              { icon:'⚠️', label:'En riesgo',       value: summary.at_risk,    color:'#EF4444' },
              { icon:'👋', label:'Sin compra',      value: summary.no_purchase, color:'#8899BB' },
            ].map(k => (
              <div key={k.label} onClick={() => k.label === 'En riesgo' ? setFilterSegment('at_risk') : k.label === 'VIP / Gold' ? setFilterTier('gold') : null}
                style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'12px 14px', cursor:'pointer' }}>
                <div style={{ fontSize:11, color:'#8899BB' }}>{k.icon} {k.label}</div>
                <div style={{ fontSize:22, fontWeight:800, color: k.color, marginTop:4 }}>{k.value}</div>
              </div>
            ))}
          </div>
        )}

        {/* Filtros */}
        <div style={{ display:'flex', gap:10, marginBottom:14, flexWrap:'wrap' as 'wrap' }}>
          <input value={search} onChange={e => setSearch(e.target.value)}
            placeholder="🔍 Nombre, email, teléfono o RUT..."
            style={{ ...S.input, maxWidth:300, padding:'7px 10px', fontSize:12 }} />

          <select value={filterSegment} onChange={e => setFilterSegment(e.target.value)}
            style={{ ...S.input, width:'auto', padding:'7px 10px', fontSize:12 }}>
            <option value="">Todos los segmentos</option>
            {Object.entries(SEGMENTS).map(([v, s]) => (
              <option key={v} value={v}>{s.icon} {s.label}</option>
            ))}
          </select>

          <select value={filterTier} onChange={e => setFilterTier(e.target.value)}
            style={{ ...S.input, width:'auto', padding:'7px 10px', fontSize:12 }}>
            <option value="">Todos los niveles</option>
            {Object.entries(TIERS).map(([v, t]) => (
              <option key={v} value={v}>{t.label}</option>
            ))}
          </select>

          <button onClick={() => { setSearch(''); setFilterSegment(''); setFilterTier('') }}
            style={{ ...S.btn, background:'rgba(255,255,255,.05)', border:'1px solid rgba(93,224,230,.15)', color:'#8899BB', padding:'7px 12px', fontSize:11 }}>
            ✕ Limpiar
          </button>
          <div style={{ marginLeft:'auto', fontSize:11, color:'#8899BB', alignSelf:'center' }}>
            {fetching ? '⏳' : `${filtered.length} clientes`}
          </div>
        </div>

        {/* Segmentos rápidos */}
        <div style={{ display:'flex', gap:6, marginBottom:14, flexWrap:'wrap' as 'wrap' }}>
          {Object.entries(SEGMENTS).map(([v, s]) => {
            const count = customers.filter(c => c.segment === v).length
            if (!count) return null
            return (
              <button key={v} onClick={() => setFilterSegment(filterSegment === v ? '' : v)}
                style={{ ...S.btn, padding:'4px 12px', fontSize:11, background: filterSegment === v ? s.bg : 'transparent', border:`1px solid ${filterSegment === v ? s.color : 'rgba(93,224,230,.1)'}`, color: filterSegment === v ? s.color : '#8899BB' }}>
                {s.icon} {s.label} ({count})
              </button>
            )
          })}
        </div>

        {/* Lista de clientes */}
        <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, overflow:'hidden' }}>
          {/* Header */}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 130px 120px 110px 100px', gap:8, padding:'8px 16px', background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.08)', fontSize:9, fontWeight:700, color:'#8899BB', textTransform:'uppercase' as 'uppercase', letterSpacing:'.5px' }}>
            <span>Cliente</span>
            <span style={{ textAlign:'right' as 'right' }}>Total gastado</span>
            <span style={{ textAlign:'center' as 'center' }}>Última compra</span>
            <span style={{ textAlign:'center' as 'center' }}>Ticket prom.</span>
            <span style={{ textAlign:'center' as 'center' }}>Segmento</span>
            <span style={{ textAlign:'center' as 'center' }}>Nivel</span>
          </div>

          {filtered.length === 0 ? (
            <div style={{ textAlign:'center' as 'center', padding:50, color:'#8899BB' }}>
              <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
              <div style={{ fontSize:14, fontWeight:600 }}>
                {customers.length === 0 ? 'Sin clientes aún' : 'Sin resultados para este filtro'}
              </div>
              <div style={{ fontSize:12, marginTop:6 }}>
                {customers.length === 0 ? 'Los clientes se crean desde el POS o manualmente' : 'Prueba otros filtros'}
              </div>
            </div>
          ) : filtered.map((c, idx) => {
            const seg  = SEGMENTS[c.segment] || SEGMENTS.regular
            const tier = TIERS[c.tier] || TIERS.standard
            return (
              <div key={c.id}
                onClick={() => openProfile(c)}
                style={{ display:'grid', gridTemplateColumns:'1fr 120px 130px 120px 110px 100px', gap:8, padding:'11px 16px', borderBottom:'1px solid rgba(93,224,230,.04)', background: idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)', cursor:'pointer', transition:'background .1s' }}
                onMouseEnter={e => (e.currentTarget as HTMLDivElement).style.background = 'rgba(0,74,173,.08)'}
                onMouseLeave={e => (e.currentTarget as HTMLDivElement).style.background = idx % 2 === 0 ? 'transparent' : 'rgba(255,255,255,.01)'}
              >
                <div style={{ minWidth:0 }}>
                  <div style={{ fontSize:13, fontWeight:700, whiteSpace:'nowrap' as 'nowrap', overflow:'hidden', textOverflow:'ellipsis' }}>
                    {c.full_name || `${c.first_name} ${c.last_name}`.trim() || 'Sin nombre'}
                  </div>
                  <div style={{ fontSize:10, color:'#8899BB', marginTop:2, display:'flex', gap:8 }}>
                    {c.phone && <span>📱 {c.phone}</span>}
                    {c.email && <span>✉️ {c.email}</span>}
                    {!c.phone && !c.email && c.rut && <span>🪪 {c.rut}</span>}
                  </div>
                </div>
                <div style={{ fontSize:13, fontWeight:800, color:'#5DE0E6', textAlign:'right' as 'right', alignSelf:'center' }}>
                  {c.total_purchases > 0 ? fmt(c.total_spent) : <span style={{ color:'#6B7280', fontSize:11 }}>Sin compras</span>}
                </div>
                <div style={{ textAlign:'center' as 'center', fontSize:11, alignSelf:'center' }}>
                  {c.last_purchase_at ? (
                    <>
                      <div style={{ fontWeight:600 }}>{fmtD(c.last_purchase_at)}</div>
                      {c.days_since_purchase !== null && (
                        <div style={{ fontSize:10, color: c.days_since_purchase > 60 ? '#EF4444' : c.days_since_purchase > 30 ? '#F59E0B' : '#22C55E' }}>
                          hace {c.days_since_purchase}d
                        </div>
                      )}
                    </>
                  ) : <span style={{ color:'#6B7280' }}>—</span>}
                </div>
                <div style={{ textAlign:'center' as 'center', fontSize:12, fontWeight:700, alignSelf:'center' }}>
                  {c.total_purchases > 0 ? fmt(c.avg_ticket) : '—'}
                </div>
                <div style={{ textAlign:'center' as 'center', alignSelf:'center' }}>
                  <span style={{ fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, background: seg.bg, color: seg.color }}>
                    {seg.icon} {seg.label}
                  </span>
                </div>
                <div style={{ textAlign:'center' as 'center', alignSelf:'center' }}>
                  <span style={{ fontSize:11, fontWeight:700, color: tier.color }}>{tier.label}</span>
                </div>
              </div>
            )
          })}
        </div>
      </div>
    </div>
  )
}
