'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase = createClient()

// ──────────────────────────────────────────────────────────────
// CONSTANTES
// ──────────────────────────────────────────────────────────────

const ROLES: Record<string, { label: string; color: string; bg: string }> = {
  admin:      { label: 'Admin',      color: '#EF4444', bg: 'rgba(239,68,68,.12)'   },
  supervisor: { label: 'Supervisor', color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
  cajero:     { label: 'Cajero',     color: '#5DE0E6', bg: 'rgba(93,224,230,.12)'  },
  vendedor:   { label: 'Vendedor',   color: '#22C55E', bg: 'rgba(34,197,94,.12)'   },
}

const PLAN_FEATURES = [
  { feature: 'POS completo con IVA/ILA',         free: true,  pro: true,  ent: true  },
  { feature: 'Caja y arqueos',                   free: true,  pro: true,  ent: true  },
  { feature: 'Historial de ventas',              free: true,  pro: true,  ent: true  },
  { feature: 'Inventario con lectura IA',        free: true,  pro: true,  ent: true  },
  { feature: 'CRM con segmentación RFM',         free: true,  pro: true,  ent: true  },
  { feature: 'Campañas WhatsApp',                free: true,  pro: true,  ent: true  },
  { feature: 'RRHH y contratos',                 free: true,  pro: true,  ent: true  },
  { feature: 'Múltiples usuarios con roles',     free: false, pro: true,  ent: true  },
  { feature: 'Módulo de finanzas',               free: false, pro: true,  ent: true  },
  { feature: 'Proveedores y órdenes de compra',  free: false, pro: true,  ent: true  },
  { feature: 'Reportes PDF / Excel',             free: false, pro: true,  ent: true  },
  { feature: 'Asistente IA en dashboard',        free: false, pro: true,  ent: true  },
  { feature: 'Soporte prioritario',              free: false, pro: false, ent: true  },
  { feature: 'API y webhooks',                   free: false, pro: false, ent: true  },
]

// ──────────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────────

interface CompanyUser {
  id: string
  first_name: string
  last_name: string | null
  email: string | null
  role: string
  is_active: boolean
  created_at: string
}

interface AuditEntry {
  id: string
  table_name: string
  operation: 'INSERT' | 'UPDATE' | 'DELETE'
  record_id: string | null
  old_data: Record<string, unknown> | null
  new_data: Record<string, unknown> | null
  changed_at: string
  user_name: string | null
  user_email: string | null
}

// ──────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────

export default function ConfiguracionPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)
  const [activeTab, setActiveTab] = useState<'empresa' | 'usuarios' | 'plan' | 'perfil' | 'historial'>('empresa')

  // Mi perfil — emails y teléfonos
  const [myEmails, setMyEmails]   = useState<{ id: string; email: string; is_primary: boolean; label: string }[]>([])
  const [myPhones, setMyPhones]   = useState<{ id: string; phone: string; is_primary: boolean; label: string }[]>([])
  const [newEmail, setNewEmail]   = useState('')
  const [newEmailLabel, setNewEmailLabel] = useState('personal')
  const [newPhone, setNewPhone]   = useState('')
  const [newPhoneLabel, setNewPhoneLabel] = useState('móvil')
  const [myRut, setMyRut]         = useState('')
  const [profileMsg, setProfileMsg] = useState('')
  const [profileSaving, setProfileSaving] = useState(false)

  // Historial de cambios
  const [auditLog, setAuditLog]       = useState<AuditEntry[]>([])
  const [auditLoading, setAuditLoading] = useState(false)
  const [auditLoaded, setAuditLoaded]   = useState(false)

  // Empresa
  const [compForm, setCompForm] = useState({ name: '', rut: '', address: '', city: '', logo_url: '' })
  const [savingComp, setSavingComp] = useState(false)
  const [compMsg, setCompMsg]       = useState('')

  // Usuarios
  const [users, setUsers]               = useState<CompanyUser[]>([])
  const [usersLoading, setUsersLoading] = useState(false)
  const [showCreateUser, setShowCreateUser] = useState(false)
  const [newUser, setNewUser] = useState({ email: '', first_name: '', last_name: '', role: 'cajero', password: '' })
  const [creatingUser, setCreatingUser] = useState(false)
  const [createMsg, setCreateMsg]       = useState('')

  // ── Cargar usuarios ─────────────────────────────────────────
  async function loadUsers(companyId: string) {
    setUsersLoading(true)
    const { data } = await supabase.rpc('get_company_users', { p_company_id: companyId })
    setUsers((data as CompanyUser[]) || [])
    setUsersLoading(false)
  }

  // ── Cargar historial de cambios ───────────────────────────────
  async function loadAuditLog(companyId: string) {
    setAuditLoading(true)
    const { data } = await supabase.rpc('get_audit_log', {
      p_company_id: companyId,
      p_limit: 150,
      p_offset: 0,
    })
    setAuditLog((data as AuditEntry[]) || [])
    setAuditLoaded(true)
    setAuditLoading(false)
  }

  // ── Init ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }

      const { data: fullCompany } = await supabase
        .from('companies')
        .select('id, name, slug, rut, address, city, logo_url, plan')
        .eq('id', ctx.companyId)
        .single()

      setUser(ctx.user as any)
      setCompany(fullCompany || ctx.company)
      setCompForm({
        name:     fullCompany?.name     || '',
        rut:      fullCompany?.rut      || '',
        address:  fullCompany?.address  || '',
        city:     fullCompany?.city     || '',
        logo_url: fullCompany?.logo_url || '',
      })

      if (ctx.isSuperAdmin || ['admin', 'supervisor', 'owner'].includes(ctx.user.role)) {
        await loadUsers(ctx.companyId)
      }

      await loadMyContact(ctx.user.id)
      setMyRut((ctx.user as any).rut || '')
      setLoading(false)
    }
    init()
  }, [])

  // ── Cargar emails y teléfonos propios ───────────────────────
  async function loadMyContact(userId: string) {
    const [{ data: emails }, { data: phones }] = await Promise.all([
      supabase.from('user_emails').select('id, email, is_primary, label').eq('user_id', userId).order('is_primary', { ascending: false }),
      supabase.from('user_phones').select('id, phone, is_primary, label').eq('user_id', userId).order('is_primary', { ascending: false }),
    ])
    setMyEmails(emails || [])
    setMyPhones(phones || [])
  }

  async function addEmail() {
    if (!newEmail.trim() || !user) return
    setProfileSaving(true); setProfileMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('user_emails').insert({
      user_id: user.id, auth_user_id: session?.user.id,
      email: newEmail.trim().toLowerCase(), label: newEmailLabel, is_primary: false,
    })
    if (error) { setProfileMsg('❌ ' + error.message) }
    else { setNewEmail(''); await loadMyContact(user.id); setProfileMsg('✅ Email agregado') }
    setProfileSaving(false)
    setTimeout(() => setProfileMsg(''), 4000)
  }

  async function removeEmail(id: string) {
    await supabase.from('user_emails').delete().eq('id', id)
    if (user) await loadMyContact(user.id)
  }

  async function addPhone() {
    if (!newPhone.trim() || !user) return
    setProfileSaving(true); setProfileMsg('')
    const { data: { session } } = await supabase.auth.getSession()
    const { error } = await supabase.from('user_phones').insert({
      user_id: user.id, auth_user_id: session?.user.id,
      phone: newPhone.trim(), label: newPhoneLabel, is_primary: myPhones.length === 0,
    })
    if (error) { setProfileMsg('❌ ' + error.message) }
    else { setNewPhone(''); await loadMyContact(user.id); setProfileMsg('✅ Teléfono agregado') }
    setProfileSaving(false)
    setTimeout(() => setProfileMsg(''), 4000)
  }

  async function removePhone(id: string) {
    await supabase.from('user_phones').delete().eq('id', id)
    if (user) await loadMyContact(user.id)
  }

  async function saveRut() {
    if (!user) return
    setProfileSaving(true); setProfileMsg('')
    const { error } = await supabase.from('users').update({ rut: myRut.trim() || null }).eq('id', user.id)
    if (error) setProfileMsg('❌ ' + error.message)
    else setProfileMsg('✅ RUT guardado')
    setProfileSaving(false)
    setTimeout(() => setProfileMsg(''), 4000)
  }

  // ── Guardar empresa ─────────────────────────────────────────
  async function saveCompany() {
    setSavingComp(true)
    setCompMsg('')
    const { data } = await supabase.rpc('update_company', { p_data: compForm })
    setSavingComp(false)
    if (data?.success) {
      setCompMsg('✅ Empresa actualizada correctamente')
      setCompany((prev: any) => ({ ...prev, ...compForm }))
    } else {
      setCompMsg('❌ Error: ' + (data?.error || 'Intenta de nuevo'))
    }
    setTimeout(() => setCompMsg(''), 5000)
  }

  // ── Cambiar rol de usuario ───────────────────────────────────
  async function updateRole(userId: string, role: string) {
    const { data } = await supabase.rpc('update_user_role', { p_user_id: userId, p_role: role })
    if (data?.success) setUsers(prev => prev.map(u => u.id === userId ? { ...u, role } : u))
  }

  // ── Activar / desactivar usuario ─────────────────────────────
  async function toggleActive(userId: string, currentActive: boolean) {
    const u = users.find(u => u.id === userId)
    if (!u) return
    const { data } = await supabase.rpc('update_user_role', {
      p_user_id:   userId,
      p_role:      u.role,
      p_is_active: !currentActive,
    })
    if (data?.success) setUsers(prev => prev.map(u => u.id === userId ? { ...u, is_active: !currentActive } : u))
  }

  // ── Crear usuario nuevo ──────────────────────────────────────
  async function createUser() {
    if (!newUser.email || !newUser.first_name || !newUser.password) {
      setCreateMsg('❌ Email, nombre y contraseña son obligatorios')
      return
    }
    if (newUser.password.length < 6) {
      setCreateMsg('❌ La contraseña debe tener al menos 6 caracteres')
      return
    }
    setCreatingUser(true)
    setCreateMsg('')

    const res = await fetch('/api/users/create', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        email:      newUser.email,
        password:   newUser.password,
        firstName:  newUser.first_name,
        lastName:   newUser.last_name,
        role:       newUser.role,
        company_id: company.id,
      }),
    })
    const result = await res.json()
    setCreatingUser(false)

    if (result.success) {
      setCreateMsg(`✅ Usuario creado. Email: ${newUser.email} · Contraseña: ${newUser.password}`)
      setNewUser({ email: '', first_name: '', last_name: '', role: 'cajero', password: '' })
      await loadUsers(company.id)
    } else {
      setCreateMsg('❌ ' + (result.error || 'Error al crear usuario'))
    }
  }

  // ── Loading ──────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5DE0E6', fontFamily: 'Montserrat,sans-serif' }}>
      ⏳ Cargando configuración...
    </div>
  )

  const isAdmin    = !!user?.is_super_admin || ['admin','owner'].includes(user?.role)
  const canSeeUsers = !!user?.is_super_admin || ['admin','supervisor','owner'].includes(user?.role)
  const plan       = company?.plan || 'free'

  // ── Estilos ──────────────────────────────────────────────────
  const S: Record<string, React.CSSProperties> = {
    page:    { minHeight: '100vh', background: 'var(--mp-bg, #0A1628)', fontFamily: 'Montserrat,sans-serif', color: 'var(--mp-text, #F0F4FF)', display: 'flex', flexDirection: 'column' },
    topbar:  { height: 50, background: '#111827', borderBottom: '1px solid rgba(93,224,230,.12)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 },
    logo:    { width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0 },
    body:    { flex: 1, padding: 20, overflowY: 'auto' as const },
    card:    { background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 12, padding: '16px 18px', marginBottom: 14 },
    btn:     { border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 } as React.CSSProperties,
    input:   { background: '#1A2540', border: '1px solid rgba(93,224,230,.2)', borderRadius: 7, padding: '8px 10px', fontSize: 13, color: '#F0F4FF', outline: 'none', fontFamily: 'Montserrat,sans-serif', width: '100%', boxSizing: 'border-box' as const },
    label:   { fontSize: 11, fontWeight: 600, color: '#8899BB', marginBottom: 4, display: 'block' } as React.CSSProperties,
    overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.85)', zIndex: 500, display: 'flex', alignItems: 'center', justifyContent: 'center', padding: 20 } as React.CSSProperties,
  }

  const msgStyle = (msg: string): React.CSSProperties => ({
    background: msg.startsWith('✅') ? 'rgba(34,197,94,.1)' : 'rgba(239,68,68,.1)',
    border: `1px solid ${msg.startsWith('✅') ? 'rgba(34,197,94,.25)' : 'rgba(239,68,68,.25)'}`,
    borderRadius: 7, padding: '8px 12px', fontSize: 12,
    color: msg.startsWith('✅') ? '#22C55E' : '#EF4444', marginBottom: 14,
  })

  // ────────────────────────────────────────────────────────────
  return (
    <div style={S.page}>

      {/* ═══ MODAL CREAR USUARIO ══════════════════════════════ */}
      {showCreateUser && (
        <div style={S.overlay} onClick={e => { if (e.target === e.currentTarget) setShowCreateUser(false) }}>
          <div style={{ background: '#111827', border: '1px solid rgba(93,224,230,.25)', borderRadius: 14, padding: '22px 24px', width: 500, color: '#F0F4FF' }}>
            <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 4 }}>👤 Crear nuevo usuario</div>
            <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 18 }}>
              El usuario podrá ingresar al sistema con estas credenciales.
            </div>

            {createMsg && <div style={msgStyle(createMsg)}>{createMsg}</div>}

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>
              <div>
                <label style={S.label}>Nombre *</label>
                <input value={newUser.first_name}
                  onChange={e => setNewUser(p => ({ ...p, first_name: e.target.value }))}
                  placeholder="María" style={S.input} autoFocus />
              </div>
              <div>
                <label style={S.label}>Apellido</label>
                <input value={newUser.last_name}
                  onChange={e => setNewUser(p => ({ ...p, last_name: e.target.value }))}
                  placeholder="González" style={S.input} />
              </div>
              <div style={{ gridColumn: '1/-1' }}>
                <label style={S.label}>Email *</label>
                <input type="email" value={newUser.email}
                  onChange={e => setNewUser(p => ({ ...p, email: e.target.value }))}
                  placeholder="maria@empresa.cl" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Contraseña temporal *</label>
                <input type="text" value={newUser.password}
                  onChange={e => setNewUser(p => ({ ...p, password: e.target.value }))}
                  placeholder="Mín. 6 caracteres" style={S.input} />
              </div>
              <div>
                <label style={S.label}>Rol</label>
                <select value={newUser.role}
                  onChange={e => setNewUser(p => ({ ...p, role: e.target.value }))}
                  style={S.input}>
                  <option value="cajero">Cajero</option>
                  <option value="vendedor">Vendedor</option>
                  <option value="supervisor">Supervisor</option>
                  <option value="admin">Admin</option>
                </select>
              </div>
            </div>

            <div style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 8, padding: '8px 12px', marginTop: 12, fontSize: 11, color: '#F59E0B' }}>
              ⚠️ Anota o comparte el email y contraseña con el usuario antes de cerrar esta ventana.
            </div>

            <div style={{ display: 'flex', gap: 10, marginTop: 16 }}>
              <button onClick={() => { setShowCreateUser(false); setCreateMsg('') }}
                style={{ ...S.btn, flex: 1, padding: 11, fontSize: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.1)', color: '#8899BB' }}>
                Cancelar
              </button>
              <button onClick={createUser} disabled={creatingUser}
                style={{ ...S.btn, flex: 2, padding: 11, fontSize: 13, background: creatingUser ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
                {creatingUser ? '⏳ Creando...' : '✅ Crear usuario'}
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ═══ TOPBAR ══════════════════════════════════════════ */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Configuración</span>
        <span style={{ fontSize: 11, color: '#8899BB' }}>{company?.name}</span>
        <div style={{ flex: 1 }} />
        {!isAdmin && (
          <span style={{ fontSize: 10, color: '#F59E0B', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.2)', borderRadius: 20, padding: '3px 10px' }}>
            Vista de solo lectura
          </span>
        )}
        <button onClick={() => router.push('/dashboard')}
          style={{ ...S.btn, background: 'transparent', border: '1px solid rgba(93,224,230,.2)', color: '#8899BB', padding: '4px 12px', fontSize: 11 }}>
          ← Dashboard
        </button>
      </div>

      <div style={S.body}>

        {/* Tabs */}
        <div style={{ display: 'flex', gap: 4, background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 10, padding: 4, marginBottom: 20, width: 'fit-content' }}>
          {([['empresa', '🏢 Empresa'], ['usuarios', '👥 Usuarios'], ['plan', '⭐ Plan'], ['perfil', '👤 Mi Perfil'], ['historial', '📋 Historial']] as const).map(([t, l]) => (
            <button key={t} onClick={() => {
              setActiveTab(t)
              if (t === 'historial' && !auditLoaded && company?.id) loadAuditLog(company.id)
            }}
              style={{ ...S.btn, padding: '7px 18px', fontSize: 12, borderRadius: 7, background: activeTab === t ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: activeTab === t ? '#fff' : '#8899BB' }}>
              {l}
            </button>
          ))}
        </div>

        {/* ══ TAB: EMPRESA ════════════════════════════════════ */}
        {activeTab === 'empresa' && (
          <div style={{ maxWidth: 620 }}>
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#5DE0E6', marginBottom: 16 }}>🏢 Información de la empresa</div>
              {compMsg && <div style={msgStyle(compMsg)}>{compMsg}</div>}

              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 14 }}>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={S.label}>Nombre de la empresa *</label>
                  <input value={compForm.name}
                    onChange={e => setCompForm(p => ({ ...p, name: e.target.value }))}
                    placeholder="BadWoman" style={S.input} disabled={!isAdmin} />
                </div>
                <div>
                  <label style={S.label}>RUT empresa</label>
                  <input value={compForm.rut}
                    onChange={e => setCompForm(p => ({ ...p, rut: e.target.value }))}
                    placeholder="76.123.456-7" style={S.input} disabled={!isAdmin} />
                </div>
                <div>
                  <label style={S.label}>Ciudad</label>
                  <input value={compForm.city}
                    onChange={e => setCompForm(p => ({ ...p, city: e.target.value }))}
                    placeholder="Rancagua" style={S.input} disabled={!isAdmin} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={S.label}>Dirección</label>
                  <input value={compForm.address}
                    onChange={e => setCompForm(p => ({ ...p, address: e.target.value }))}
                    placeholder="Av. Principal 123, Local 4" style={S.input} disabled={!isAdmin} />
                </div>
                <div style={{ gridColumn: '1/-1' }}>
                  <label style={S.label}>URL del logo (opcional)</label>
                  <input value={compForm.logo_url}
                    onChange={e => setCompForm(p => ({ ...p, logo_url: e.target.value }))}
                    placeholder="https://mi-empresa.cl/logo.png" style={S.input} disabled={!isAdmin} />
                  {compForm.logo_url && (
                    <div style={{ marginTop: 8 }}>
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img src={compForm.logo_url} alt="Logo" style={{ height: 48, borderRadius: 6, border: '1px solid rgba(93,224,230,.2)' }} />
                    </div>
                  )}
                </div>
              </div>

              {isAdmin && (
                <div style={{ marginTop: 16 }}>
                  <button onClick={saveCompany} disabled={savingComp}
                    style={{ ...S.btn, padding: '11px 24px', fontSize: 13, background: savingComp ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
                    {savingComp ? '⏳ Guardando...' : '💾 Guardar cambios'}
                  </button>
                </div>
              )}
            </div>

            {/* Info del sistema */}
            <div style={S.card}>
              <div style={{ fontSize: 12, fontWeight: 700, color: '#8899BB', marginBottom: 12 }}>ℹ️ Información del sistema</div>
              <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 8, fontSize: 12 }}>
                {[
                  ['ID empresa', company?.id?.slice(0, 8) + '...'],
                  ['Slug / URL', company?.slug || '—'],
                  ['Plan actual', company?.plan || 'free'],
                  ['Tu rol', user?.role || '—'],
                ].map(([l, v]) => (
                  <div key={l} style={{ background: '#0D1525', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ fontSize: 10, color: '#8899BB' }}>{l}</div>
                    <div style={{ fontWeight: 600, marginTop: 2, textTransform: 'capitalize' as const }}>{v}</div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ══ TAB: USUARIOS ═══════════════════════════════════ */}
        {activeTab === 'usuarios' && (
          <div style={{ maxWidth: 700 }}>
            {!canSeeUsers ? (
              <div style={{ ...S.card, textAlign: 'center' as const, padding: 40 }}>
                <div style={{ fontSize: 32, marginBottom: 10 }}>🔒</div>
                <div style={{ fontSize: 13, color: '#8899BB' }}>Necesitas rol de Supervisor o Admin para ver esta sección.</div>
              </div>
            ) : (
              <>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, color: '#8899BB' }}>
                    {users.length} usuario{users.length !== 1 ? 's' : ''} en tu equipo
                  </div>
                  {isAdmin && (
                    <button onClick={() => { setShowCreateUser(true); setCreateMsg('') }}
                      style={{ ...S.btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '6px 16px', fontSize: 12 }}>
                      + Crear usuario
                    </button>
                  )}
                </div>

                {usersLoading ? (
                  <div style={{ ...S.card, textAlign: 'center' as const, padding: 40, color: '#8899BB' }}>⏳ Cargando usuarios...</div>
                ) : users.length === 0 ? (
                  <div style={{ ...S.card, textAlign: 'center' as const, padding: 40 }}>
                    <div style={{ fontSize: 32, marginBottom: 10 }}>👥</div>
                    <div style={{ fontSize: 13, color: '#8899BB' }}>No hay usuarios registrados aún.</div>
                  </div>
                ) : (
                  <>
                    {users.map(u => {
                      const roleInfo = ROLES[u.role] || ROLES.cajero
                      const isMe = u.id === user.id
                      return (
                        <div key={u.id} style={{ ...S.card, display: 'flex', alignItems: 'center', gap: 14, padding: '14px 16px' }}>
                          {/* Avatar */}
                          <div style={{ width: 44, height: 44, borderRadius: '50%', background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 17, fontWeight: 800, color: '#fff', flexShrink: 0 }}>
                            {(u.first_name || '?')[0].toUpperCase()}
                          </div>

                          {/* Info */}
                          <div style={{ flex: 1, minWidth: 0 }}>
                            <div style={{ fontSize: 13, fontWeight: 700 }}>
                              {u.first_name} {u.last_name || ''}
                              {isMe && (
                                <span style={{ fontSize: 10, color: '#5DE0E6', marginLeft: 8, background: 'rgba(93,224,230,.1)', borderRadius: 10, padding: '1px 8px' }}>Tú</span>
                              )}
                            </div>
                            <div style={{ fontSize: 11, color: '#8899BB', marginTop: 2 }}>{u.email || '—'}</div>
                          </div>

                          {/* Rol */}
                          <div style={{ display: 'flex', alignItems: 'center', gap: 8, flexShrink: 0 }}>
                            {isAdmin && !isMe ? (
                              <select value={u.role} onChange={e => updateRole(u.id, e.target.value)}
                                style={{ ...S.input, width: 'auto', padding: '5px 8px', fontSize: 11, background: roleInfo.bg, color: roleInfo.color, border: `1px solid ${roleInfo.color}40` }}>
                                {Object.entries(ROLES).map(([v, r]) => (
                                  <option key={v} value={v}>{r.label}</option>
                                ))}
                              </select>
                            ) : (
                              <span style={{ fontSize: 11, fontWeight: 700, padding: '3px 10px', borderRadius: 20, background: roleInfo.bg, color: roleInfo.color }}>
                                {roleInfo.label}
                              </span>
                            )}

                            {/* Toggle activo */}
                            {isAdmin && !isMe ? (
                              <button onClick={() => toggleActive(u.id, u.is_active)}
                                style={{ ...S.btn, padding: '5px 11px', fontSize: 10, background: u.is_active ? 'rgba(34,197,94,.1)' : 'rgba(107,114,128,.1)', border: `1px solid ${u.is_active ? 'rgba(34,197,94,.3)' : 'rgba(107,114,128,.3)'}`, color: u.is_active ? '#22C55E' : '#6B7280' }}>
                                {u.is_active ? '● Activo' : '○ Inactivo'}
                              </button>
                            ) : (
                              <span style={{ fontSize: 10, padding: '3px 10px', borderRadius: 20, background: u.is_active ? 'rgba(34,197,94,.1)' : 'rgba(107,114,128,.1)', color: u.is_active ? '#22C55E' : '#6B7280' }}>
                                {u.is_active ? 'Activo' : 'Inactivo'}
                              </span>
                            )}
                          </div>
                        </div>
                      )
                    })}

                    <div style={{ background: 'rgba(0,74,173,.05)', border: '1px solid rgba(0,74,173,.15)', borderRadius: 10, padding: '10px 14px', fontSize: 11, color: '#8899BB' }}>
                      💡 <strong>Admin</strong>: acceso total · <strong>Supervisor</strong>: todo excepto configuración · <strong>Cajero</strong>: POS + Caja + Ventas · <strong>Vendedor</strong>: POS + CRM
                    </div>
                  </>
                )}
              </>
            )}
          </div>
        )}

        {/* ══ TAB: PLAN ═══════════════════════════════════════ */}
        {activeTab === 'plan' && (
          <div style={{ maxWidth: 560 }}>
            <div style={S.card}>
              <div style={{ fontSize: 14, fontWeight: 700, color: '#5DE0E6', marginBottom: 16 }}>⭐ Tu plan actual</div>

              {/* Plan badge */}
              <div style={{ display: 'flex', alignItems: 'center', gap: 14, marginBottom: 20, padding: '14px 16px', background: '#0D1525', borderRadius: 10 }}>
                <div style={{ width: 56, height: 56, borderRadius: 14, display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 26, background: plan === 'enterprise' ? 'linear-gradient(135deg,#A78BFA,#7C3AED)' : plan === 'pro' ? 'linear-gradient(135deg,#C19E4D,#F59E0B)' : 'linear-gradient(135deg,#004AAD,#5DE0E6)', flexShrink: 0 }}>
                  {plan === 'enterprise' ? '🏢' : plan === 'pro' ? '🚀' : '🌱'}
                </div>
                <div>
                  <div style={{ fontSize: 22, fontWeight: 800, textTransform: 'uppercase' as const, letterSpacing: 1 }}>
                    {plan}
                  </div>
                  <div style={{ fontSize: 12, color: '#8899BB', marginTop: 3 }}>
                    {plan === 'enterprise' ? 'Plan empresarial con soporte dedicado' : plan === 'pro' ? 'Acceso completo a todas las funciones' : 'Plan inicial · Incluye todas las funciones core'}
                  </div>
                </div>
              </div>

              {/* Features */}
              <div>
                {PLAN_FEATURES.map(f => {
                  const enabled = plan === 'enterprise' ? f.ent : plan === 'pro' ? f.pro : f.free
                  return (
                    <div key={f.feature} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '7px 0', borderBottom: '1px solid rgba(93,224,230,.05)', fontSize: 12 }}>
                      <span style={{ color: enabled ? '#F0F4FF' : '#8899BB' }}>{f.feature}</span>
                      <span>{enabled ? '✅' : '⬜'}</span>
                    </div>
                  )
                })}
              </div>

              {/* CTA upgrade */}
              {plan === 'free' && (
                <div style={{ marginTop: 18, background: 'linear-gradient(135deg,rgba(0,74,173,.15),rgba(93,224,230,.08))', border: '1px solid rgba(93,224,230,.2)', borderRadius: 10, padding: '14px 16px', textAlign: 'center' as const }}>
                  <div style={{ fontSize: 14, fontWeight: 700, marginBottom: 4 }}>🚀 Actualiza a Pro</div>
                  <div style={{ fontSize: 12, color: '#8899BB', marginBottom: 10 }}>
                    Desbloquea reportes, IA en dashboard, finanzas y múltiples usuarios.
                  </div>
                  <div style={{ fontSize: 12, color: '#5DE0E6' }}>
                    Contacta a soporte en <strong>hola@mosaico.media</strong>
                  </div>
                </div>
              )}
            </div>
          </div>
        )}

        {/* ══ TAB: MI PERFIL ════════════════════════════════════ */}
        {activeTab === 'perfil' && (
          <div style={{ maxWidth: 560, display: 'flex', flexDirection: 'column', gap: 20 }}>

            {profileMsg && (
              <div style={{ background: profileMsg.startsWith('❌') ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)', border: `1px solid ${profileMsg.startsWith('❌') ? 'rgba(239,68,68,.3)' : 'rgba(34,197,94,.3)'}`, borderRadius: 8, padding: '8px 14px', fontSize: 12, color: profileMsg.startsWith('❌') ? '#EF4444' : '#22C55E' }}>
                {profileMsg}
              </div>
            )}

            {/* RUT */}
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5DE0E6', marginBottom: 14 }}>🪪 RUT</div>
              <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 8 }}>Formato: XX.XXX.XXX-X</div>
              <div style={{ display: 'flex', gap: 8 }}>
                <input
                  value={myRut}
                  onChange={e => setMyRut(e.target.value)}
                  placeholder="12.345.678-9"
                  style={{ flex: 1, background: '#1E2A3A', border: '1px solid rgba(93,224,230,.2)', borderRadius: 8, padding: '8px 12px', color: '#F0F4FF', fontSize: 12, fontFamily: 'Montserrat,sans-serif' }}
                />
                <button onClick={saveRut} disabled={profileSaving} style={{ ...S.btn, padding: '8px 16px', fontSize: 12, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
                  Guardar
                </button>
              </div>
            </div>

            {/* Emails */}
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5DE0E6', marginBottom: 14 }}>📧 Correos electrónicos</div>
              <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 12 }}>
                Puedes iniciar sesión con cualquiera de estos correos usando la misma contraseña.
              </div>

              {/* Lista de emails */}
              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {myEmails.length === 0 && (
                  <div style={{ fontSize: 11, color: '#8899BB', fontStyle: 'italic' }}>No hay emails registrados aún.</div>
                )}
                {myEmails.map(e => (
                  <div key={e.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E2A3A', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: '#F0F4FF' }}>{e.email}</span>
                      <span style={{ marginLeft: 8, fontSize: 10, color: '#8899BB' }}>{e.label}</span>
                    </div>
                    {e.is_primary ? (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(93,224,230,.12)', color: '#5DE0E6' }}>PRINCIPAL</span>
                    ) : (
                      <button onClick={() => removeEmail(e.id)} style={{ ...S.btn, background: 'rgba(239,68,68,.1)', color: '#EF4444', fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>

              {/* Agregar email */}
              <div style={{ borderTop: '1px solid rgba(93,224,230,.1)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8899BB', marginBottom: 8 }}>Agregar email</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newEmail}
                    onChange={e => setNewEmail(e.target.value)}
                    placeholder="otro@correo.com"
                    type="email"
                    style={{ flex: 1, background: '#1E2A3A', border: '1px solid rgba(93,224,230,.2)', borderRadius: 8, padding: '8px 12px', color: '#F0F4FF', fontSize: 12, fontFamily: 'Montserrat,sans-serif' }}
                  />
                  <select
                    value={newEmailLabel}
                    onChange={e => setNewEmailLabel(e.target.value)}
                    style={{ background: '#1E2A3A', border: '1px solid rgba(93,224,230,.2)', borderRadius: 8, padding: '8px 10px', color: '#F0F4FF', fontSize: 12, fontFamily: 'Montserrat,sans-serif' }}
                  >
                    <option value="personal">Personal</option>
                    <option value="trabajo">Trabajo</option>
                    <option value="contacto">Contacto</option>
                  </select>
                  <button onClick={addEmail} disabled={profileSaving || !newEmail.trim()} style={{ ...S.btn, padding: '8px 14px', fontSize: 12, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
                    +
                  </button>
                </div>
              </div>
            </div>

            {/* Teléfonos */}
            <div style={S.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5DE0E6', marginBottom: 14 }}>📱 Teléfonos</div>

              <div style={{ display: 'flex', flexDirection: 'column', gap: 8, marginBottom: 16 }}>
                {myPhones.length === 0 && (
                  <div style={{ fontSize: 11, color: '#8899BB', fontStyle: 'italic' }}>No hay teléfonos registrados aún.</div>
                )}
                {myPhones.map(p => (
                  <div key={p.id} style={{ display: 'flex', alignItems: 'center', gap: 8, background: '#1E2A3A', borderRadius: 8, padding: '8px 12px' }}>
                    <div style={{ flex: 1 }}>
                      <span style={{ fontSize: 12, color: '#F0F4FF' }}>{p.phone}</span>
                      <span style={{ marginLeft: 8, fontSize: 10, color: '#8899BB' }}>{p.label}</span>
                    </div>
                    {p.is_primary ? (
                      <span style={{ fontSize: 9, fontWeight: 700, padding: '2px 7px', borderRadius: 20, background: 'rgba(93,224,230,.12)', color: '#5DE0E6' }}>PRINCIPAL</span>
                    ) : (
                      <button onClick={() => removePhone(p.id)} style={{ ...S.btn, background: 'rgba(239,68,68,.1)', color: '#EF4444', fontSize: 11, padding: '3px 8px', borderRadius: 6 }}>
                        Quitar
                      </button>
                    )}
                  </div>
                ))}
              </div>

              <div style={{ borderTop: '1px solid rgba(93,224,230,.1)', paddingTop: 14 }}>
                <div style={{ fontSize: 11, fontWeight: 700, color: '#8899BB', marginBottom: 8 }}>Agregar teléfono</div>
                <div style={{ display: 'flex', gap: 8 }}>
                  <input
                    value={newPhone}
                    onChange={e => setNewPhone(e.target.value)}
                    placeholder="+56 9 1234 5678"
                    type="tel"
                    style={{ flex: 1, background: '#1E2A3A', border: '1px solid rgba(93,224,230,.2)', borderRadius: 8, padding: '8px 12px', color: '#F0F4FF', fontSize: 12, fontFamily: 'Montserrat,sans-serif' }}
                  />
                  <select
                    value={newPhoneLabel}
                    onChange={e => setNewPhoneLabel(e.target.value)}
                    style={{ background: '#1E2A3A', border: '1px solid rgba(93,224,230,.2)', borderRadius: 8, padding: '8px 10px', color: '#F0F4FF', fontSize: 12, fontFamily: 'Montserrat,sans-serif' }}
                  >
                    <option value="móvil">Móvil</option>
                    <option value="trabajo">Trabajo</option>
                    <option value="casa">Casa</option>
                    <option value="WhatsApp">WhatsApp</option>
                  </select>
                  <button onClick={addPhone} disabled={profileSaving || !newPhone.trim()} style={{ ...S.btn, padding: '8px 14px', fontSize: 12, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff' }}>
                    +
                  </button>
                </div>
              </div>
            </div>

          </div>
        )}

        {/* ══ TAB: HISTORIAL ══════════════════════════════════════ */}
        {activeTab === 'historial' && (
          <div style={{ maxWidth: 900 }}>
            <div style={{ display: 'flex', alignItems: 'center', justifyContent: 'space-between', marginBottom: 16 }}>
              <div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F0F4FF' }}>📋 Historial de cambios</div>
                <div style={{ fontSize: 11, color: '#8899BB', marginTop: 2 }}>Últimas 150 operaciones registradas en la plataforma</div>
              </div>
              <button onClick={() => company?.id && loadAuditLog(company.id)} disabled={auditLoading}
                style={{ ...S.btn, padding: '6px 14px', fontSize: 11, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.2)', color: '#5DE0E6' }}>
                {auditLoading ? '⏳ Cargando...' : '↺ Actualizar'}
              </button>
            </div>

            {auditLoading && (
              <div style={{ textAlign: 'center', padding: 40, color: '#8899BB', fontSize: 13 }}>⏳ Cargando historial...</div>
            )}

            {!auditLoading && auditLoaded && auditLog.length === 0 && (
              <div style={{ ...S.card, textAlign: 'center', padding: 40, color: '#8899BB', fontSize: 13 }}>
                Sin registros aún. Los cambios aparecerán aquí automáticamente.
              </div>
            )}

            {!auditLoading && auditLog.length > 0 && (
              <div style={{ display: 'flex', flexDirection: 'column', gap: 6 }}>
                {auditLog.map(entry => {
                  const opColor = entry.operation === 'INSERT' ? '#22C55E'
                    : entry.operation === 'DELETE' ? '#EF4444' : '#F59E0B'
                  const opBg = entry.operation === 'INSERT' ? 'rgba(34,197,94,.1)'
                    : entry.operation === 'DELETE' ? 'rgba(239,68,68,.1)' : 'rgba(245,158,11,.1)'
                  const opLabel = entry.operation === 'INSERT' ? 'Creado'
                    : entry.operation === 'DELETE' ? 'Eliminado' : 'Editado'

                  const tableLabels: Record<string, string> = {
                    content_calendar: 'Calendario', content_pillars: 'Pilares',
                    content_packs: 'Packs', users: 'Usuarios',
                    companies: 'Empresa', employees: 'Empleados',
                    contracts: 'Contratos', expenses: 'Gastos',
                  }

                  const changedAt = new Date(entry.changed_at)
                  const dateStr = changedAt.toLocaleDateString('es-CL', { day: '2-digit', month: '2-digit', year: 'numeric' })
                  const timeStr = changedAt.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })

                  // What changed (for UPDATE)
                  let changedFields: string[] = []
                  if (entry.operation === 'UPDATE' && entry.old_data && entry.new_data) {
                    changedFields = Object.keys(entry.new_data).filter(
                      k => k !== 'updated_at' && JSON.stringify(entry.old_data![k]) !== JSON.stringify(entry.new_data![k])
                    )
                  }

                  return (
                    <div key={entry.id} style={{ ...S.card, padding: '12px 16px', display: 'flex', gap: 14, alignItems: 'flex-start' }}>
                      {/* Op badge */}
                      <div style={{ flexShrink: 0, marginTop: 2 }}>
                        <span style={{ fontSize: 10, fontWeight: 700, background: opBg, color: opColor, padding: '3px 8px', borderRadius: 20 }}>
                          {opLabel}
                        </span>
                      </div>

                      {/* Main info */}
                      <div style={{ flex: 1, minWidth: 0 }}>
                        <div style={{ display: 'flex', gap: 8, alignItems: 'center', flexWrap: 'wrap' }}>
                          <span style={{ fontSize: 12, fontWeight: 700, color: '#F0F4FF' }}>
                            {tableLabels[entry.table_name] || entry.table_name}
                          </span>
                          {entry.record_id && (
                            <span style={{ fontSize: 10, color: '#8899BB', fontFamily: 'monospace' }}>#{entry.record_id.slice(0, 8)}</span>
                          )}
                          {changedFields.length > 0 && (
                            <span style={{ fontSize: 10, color: '#8899BB' }}>
                              — campos: <span style={{ color: '#5DE0E6' }}>{changedFields.slice(0, 5).join(', ')}{changedFields.length > 5 ? '…' : ''}</span>
                            </span>
                          )}
                          {entry.operation === 'INSERT' && entry.new_data?.title != null && (
                            <span style={{ fontSize: 10, color: '#8899BB' }}>
                              — <span style={{ color: '#F0F4FF' }}>{String(entry.new_data.title as string).slice(0, 60)}</span>
                            </span>
                          )}
                        </div>
                        <div style={{ fontSize: 10, color: '#8899BB', marginTop: 4 }}>
                          Por <span style={{ color: '#F0F4FF' }}>{entry.user_name || 'Sistema'}</span>
                          {entry.user_email && <span style={{ color: '#5DE0E6' }}> ({entry.user_email})</span>}
                        </div>
                      </div>

                      {/* Timestamp */}
                      <div style={{ flexShrink: 0, textAlign: 'right' }}>
                        <div style={{ fontSize: 11, color: '#F0F4FF' }}>{timeStr}</div>
                        <div style={{ fontSize: 10, color: '#8899BB' }}>{dateStr}</div>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

      </div>
    </div>
  )
}
