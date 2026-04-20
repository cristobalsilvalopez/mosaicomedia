'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter }    from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase = createClient()
const NOW = Date.now()

const fmt  = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtD = (d: string | null) =>
  d ? new Date(d + 'T00:00:00').toLocaleDateString('es-CL', { day:'2-digit', month:'2-digit', year:'numeric' }) : '—'

// ──────────────────────────────────────────────────────────────
// CONSTANTES
// ──────────────────────────────────────────────────────────────

const CONTRACT_TYPES: Record<string, { label: string; color: string; bg: string }> = {
  indefinido:  { label:'Indefinido',  color:'#22C55E', bg:'rgba(34,197,94,.12)'   },
  plazo_fijo:  { label:'Plazo fijo',  color:'#F59E0B', bg:'rgba(245,158,11,.12)'  },
  part_time:   { label:'Part time',   color:'#5DE0E6', bg:'rgba(93,224,230,.12)'  },
}

const ATTENDANCE_STATUS: Record<string, { label: string; icon: string; color: string; bg: string }> = {
  present: { label:'Presente',  icon:'✅', color:'#22C55E', bg:'rgba(34,197,94,.1)'   },
  absent:  { label:'Ausente',   icon:'❌', color:'#EF4444', bg:'rgba(239,68,68,.1)'   },
  late:    { label:'Atrasado',  icon:'⏰', color:'#F59E0B', bg:'rgba(245,158,11,.1)'  },
  sick:    { label:'Enfermo',   icon:'🤒', color:'#A78BFA', bg:'rgba(167,139,250,.1)' },
  holiday: { label:'Feriado',   icon:'🏖', color:'#8899BB', bg:'rgba(136,153,187,.1)' },
}

const DEPARTMENTS = ['Ventas','Administración','Producción','Logística','Marketing','Otro']

const EMPTY_EMP = {
  first_name:'', last_name:'', rut:'', email:'', phone:'',
  position:'', department:'Ventas', hire_date:'',
  contract_type:'indefinido', salary:'', hours_per_week:'45', notes:'',
}

const EMPTY_CONTRACT = {
  contract_type:'indefinido', start_date:'', end_date:'',
  salary:'', hours_per_week:'45', notes:'',
}

// ──────────────────────────────────────────────────────────────
// TIPOS
// ──────────────────────────────────────────────────────────────

interface Employee {
  id: string; first_name: string; last_name: string; rut: string
  email: string; phone: string; position: string; department: string
  hire_date: string | null; contract_type: string; salary: number | null
  hours_per_week: number; is_active: boolean; notes: string | null
  contract_id: string | null; contract_start: string | null; contract_end: string | null
  attendance_today: string | null
}

interface AttendanceRecord {
  id: string; employee_id: string; employee_name: string
  work_date: string; check_in: string | null; check_out: string | null
  hours_worked: number | null; status: string; notes: string | null
}

interface Contract {
  id: string; employee_id: string; company_id: string
  contract_type: string; start_date: string; end_date: string | null
  salary: number | null; hours_per_week: number | null
  is_active: boolean; notes: string | null; created_at: string
}

// ──────────────────────────────────────────────────────────────
// COMPONENTE PRINCIPAL
// ──────────────────────────────────────────────────────────────

export default function RRHHPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  // Datos
  const [employees, setEmployees]   = useState<Employee[]>([])
  const [attendance, setAttendance] = useState<AttendanceRecord[]>([])
  const [contracts, setContracts]   = useState<Contract[]>([])
  const [fetching, setFetching]     = useState(false)

  // Navegación
  const [activeTab, setActiveTab] = useState<'empleados'|'asistencia'|'contratos'>('empleados')
  const [view, setView]           = useState<'list'|'edit-emp'|'edit-att'|'edit-contract'>('list')
  const [selected, setSelected]   = useState<Employee | null>(null)

  // Formularios
  const [empForm, setEmpForm]           = useState<any>(EMPTY_EMP)
  const [contractForm, setContractForm] = useState<any>(EMPTY_CONTRACT)
  const [attForm, setAttForm]           = useState<any>({
    employee_id:'', work_date: new Date().toISOString().slice(0,10),
    check_in:'09:00', check_out:'18:00', status:'present', notes:'',
  })
  const [saving, setSaving]   = useState(false)
  const [formErr, setFormErr] = useState('')

  // Filtro asistencia
  const today = new Date()
  const [attYear, setAttYear]   = useState(today.getFullYear())
  const [attMonth, setAttMonth] = useState(today.getMonth() + 1)

  // ── Carga ─────────────────────────────────────────────────
  async function loadAll(companyId?: string) {
    const cId = companyId || company?.id
    if (!cId) return
    setFetching(true)
    await Promise.all([
      loadEmployees(cId),
      loadAttendance(cId),
      loadContracts(cId),
    ])
    setFetching(false)
  }

  async function loadEmployees(cId?: string) {
    const id = cId || company?.id; if (!id) return
    const { data } = await supabase.rpc('get_employees', { p_company_id: id })
    setEmployees((data as Employee[]) || [])
  }

  async function loadAttendance(cId?: string) {
    const id = cId || company?.id; if (!id) return
    const { data } = await supabase.rpc('get_attendance', {
      p_company_id: id, p_year: attYear, p_month: attMonth,
    })
    setAttendance((data as AttendanceRecord[]) || [])
  }

  async function loadContracts(cId?: string) {
    const id = cId || company?.id; if (!id) return
    const { data } = await supabase
      .from('contracts')
      .select('*')
      .eq('company_id', id)
      .order('created_at', { ascending: false })
    setContracts((data as Contract[]) || [])
  }

  // ── Init ──────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      setUser(ctx.user as any)
      setCompany(ctx.company)
      await loadAll(ctx.companyId)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (!company) return
    loadAttendance(company.id)
  }, [attYear, attMonth, company])

  // ── Guardar empleado ──────────────────────────────────────
  async function saveEmployee() {
    if (!empForm.first_name.trim()) { setFormErr('El nombre es obligatorio'); return }
    setSaving(true); setFormErr('')
    const { data, error } = await supabase.rpc('upsert_employee', {
      p_data: { ...empForm, company_id: company.id },
    })
    setSaving(false)
    if (error || !data?.success) { setFormErr(error?.message || 'Error al guardar'); return }
    await loadAll()
    setView('list')
  }

  // ── Guardar asistencia ────────────────────────────────────
  async function saveAttendance() {
    if (!attForm.employee_id) { setFormErr('Selecciona un empleado'); return }
    setSaving(true); setFormErr('')
    const { error } = await supabase.rpc('record_attendance', {
      p_data: { ...attForm, company_id: company.id },
    })
    setSaving(false)
    if (error) { setFormErr(error.message); return }
    await loadAttendance()
    setView('list')
  }

  // ── Guardar contrato ──────────────────────────────────────
  async function saveContract() {
    if (!contractForm.start_date) { setFormErr('La fecha de inicio es obligatoria'); return }
    if (!selected) { setFormErr('Selecciona un empleado'); return }
    setSaving(true); setFormErr('')
    const { error } = await supabase.rpc('upsert_contract', {
      p_data: { ...contractForm, employee_id: selected.id, company_id: company.id },
    })
    setSaving(false)
    if (error) { setFormErr(error.message); return }
    await loadAll()
    setView('list')
  }

  // ── Keyboard ──────────────────────────────────────────────
  useEffect(() => {
    const onKey = (e: KeyboardEvent) => { if (e.key === 'Escape') setView('list') }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [])

  const now = NOW

  // ── Loading ───────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando RRHH...
    </div>
  )

  // ── Estilos ───────────────────────────────────────────────
  const S: Record<string, React.CSSProperties> = {
    page:   { minHeight:'100vh', background:'var(--mp-bg, #0A1628)', fontFamily:'Montserrat,sans-serif', color:'var(--mp-text, #F0F4FF)', display:'flex', flexDirection:'column' },
    topbar: { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 20px', gap:10, flexShrink:0 },
    logo:   { width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer', flexShrink:0 },
    body:   { flex:1, padding:20, overflowY:'auto' as const },
    card:   { background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, padding:'16px 18px', marginBottom:14 },
    btn:    { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
    input:  { background:'#1A2540', border:'1px solid rgba(93,224,230,.2)', borderRadius:7, padding:'8px 10px', fontSize:13, color:'#F0F4FF', outline:'none', fontFamily:'Montserrat,sans-serif', width:'100%', boxSizing:'border-box' as const },
    label:  { fontSize:11, fontWeight:600, color:'#8899BB', marginBottom:4, display:'block' } as React.CSSProperties,
  }

  // ────────────────────────────────────────────────────────────
  // FORMULARIO EMPLEADO
  // ────────────────────────────────────────────────────────────
  if (view === 'edit-emp') return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>{empForm.id ? 'Editar empleado' : 'Nuevo empleado'}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView('list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={{ ...S.body, maxWidth:640, margin:'0 auto', width:'100%' }}>
        <div style={S.card}>
          <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6', marginBottom:18 }}>
            {empForm.id ? `✏️ ${empForm.first_name} ${empForm.last_name}` : '👤 Nuevo empleado'}
          </div>
          {formErr && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#EF4444', marginBottom:14 }}>{formErr}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            {[
              ['Nombre *',    'first_name',   'text',  'María'],
              ['Apellido *',  'last_name',    'text',  'González'],
              ['RUT',         'rut',          'text',  '12.345.678-9'],
              ['Teléfono',    'phone',        'text',  '+56 9 1234 5678'],
              ['Email',       'email',        'email', 'maria@badwoman.cl'],
              ['Cargo',       'position',     'text',  'Vendedora'],
            ].map(([lbl, key, type, ph]) => (
              <div key={key}>
                <label style={S.label}>{lbl}</label>
                <input type={type} value={empForm[key]}
                  onChange={e => setEmpForm((f: any) => ({...f, [key]: e.target.value}))}
                  placeholder={ph as string} style={S.input} />
              </div>
            ))}
            <div>
              <label style={S.label}>Área / Departamento</label>
              <select value={empForm.department}
                onChange={e => setEmpForm((f:any) => ({...f, department: e.target.value}))}
                style={S.input}>
                {DEPARTMENTS.map(d => <option key={d} value={d}>{d}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Tipo de contrato</label>
              <select value={empForm.contract_type}
                onChange={e => setEmpForm((f:any) => ({...f, contract_type: e.target.value}))}
                style={S.input}>
                {Object.entries(CONTRACT_TYPES).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Fecha de ingreso</label>
              <input type="date" value={empForm.hire_date}
                onChange={e => setEmpForm((f:any) => ({...f, hire_date: e.target.value}))}
                style={S.input} />
            </div>
            <div>
              <label style={S.label}>Sueldo bruto (CLP)</label>
              <input type="number" value={empForm.salary}
                onChange={e => setEmpForm((f:any) => ({...f, salary: e.target.value}))}
                placeholder="500000" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Horas semanales</label>
              <input type="number" value={empForm.hours_per_week}
                onChange={e => setEmpForm((f:any) => ({...f, hours_per_week: e.target.value}))}
                style={S.input} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Notas</label>
              <textarea value={empForm.notes}
                onChange={e => setEmpForm((f:any) => ({...f, notes: e.target.value}))}
                rows={2} style={{ ...S.input, resize:'vertical' as const }}
                placeholder="Observaciones, habilidades, etc." />
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button onClick={() => setView('list')} style={{ ...S.btn, flex:1, padding:12, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>Cancelar</button>
            <button onClick={saveEmployee} disabled={saving}
              style={{ ...S.btn, flex:2, padding:12, fontSize:13, background: saving ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
              {saving ? '⏳ Guardando...' : empForm.id ? '💾 Actualizar' : '➕ Crear empleado'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────
  // FORMULARIO ASISTENCIA
  // ────────────────────────────────────────────────────────────
  if (view === 'edit-att') return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Registrar asistencia</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView('list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={{ ...S.body, maxWidth:520, margin:'0 auto', width:'100%' }}>
        <div style={S.card}>
          <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6', marginBottom:18 }}>📋 Registrar asistencia</div>
          {formErr && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#EF4444', marginBottom:14 }}>{formErr}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Empleado *</label>
              <select value={attForm.employee_id}
                onChange={e => setAttForm((f:any) => ({...f, employee_id: e.target.value}))}
                style={S.input}>
                <option value="">Seleccionar empleado...</option>
                {employees.filter(e => e.is_active).map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}</option>
                ))}
              </select>
            </div>
            <div>
              <label style={S.label}>Fecha</label>
              <input type="date" value={attForm.work_date}
                onChange={e => setAttForm((f:any) => ({...f, work_date: e.target.value}))}
                style={S.input} />
            </div>
            <div>
              <label style={S.label}>Estado</label>
              <select value={attForm.status}
                onChange={e => setAttForm((f:any) => ({...f, status: e.target.value}))}
                style={S.input}>
                {Object.entries(ATTENDANCE_STATUS).map(([v, s]) => (
                  <option key={v} value={v}>{s.icon} {s.label}</option>
                ))}
              </select>
            </div>
            {(attForm.status === 'present' || attForm.status === 'late') && (<>
              <div>
                <label style={S.label}>Entrada</label>
                <input type="time" value={attForm.check_in}
                  onChange={e => setAttForm((f:any) => ({...f, check_in: e.target.value}))}
                  style={S.input} />
              </div>
              <div>
                <label style={S.label}>Salida</label>
                <input type="time" value={attForm.check_out}
                  onChange={e => setAttForm((f:any) => ({...f, check_out: e.target.value}))}
                  style={S.input} />
              </div>
            </>)}
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Notas</label>
              <input value={attForm.notes}
                onChange={e => setAttForm((f:any) => ({...f, notes: e.target.value}))}
                placeholder="Motivo de ausencia, observación, etc."
                style={S.input} />
            </div>
          </div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button onClick={() => setView('list')} style={{ ...S.btn, flex:1, padding:12, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>Cancelar</button>
            <button onClick={saveAttendance} disabled={saving}
              style={{ ...S.btn, flex:2, padding:12, fontSize:13, background: saving ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
              {saving ? '⏳ Guardando...' : '💾 Guardar asistencia'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────
  // FORMULARIO CONTRATO
  // ────────────────────────────────────────────────────────────
  if (view === 'edit-contract') return (
    <div style={S.page}>
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>Nuevo contrato — {selected?.first_name} {selected?.last_name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => setView('list')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Volver</button>
      </div>
      <div style={{ ...S.body, maxWidth:520, margin:'0 auto', width:'100%' }}>
        <div style={S.card}>
          <div style={{ fontSize:14, fontWeight:700, color:'#5DE0E6', marginBottom:18 }}>📄 Nuevo contrato</div>
          {formErr && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', borderRadius:7, padding:'8px 12px', fontSize:12, color:'#EF4444', marginBottom:14 }}>{formErr}</div>}
          <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Tipo de contrato</label>
              <select value={contractForm.contract_type}
                onChange={e => setContractForm((f:any) => ({...f, contract_type: e.target.value}))}
                style={S.input}>
                {Object.entries(CONTRACT_TYPES).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
            </div>
            <div>
              <label style={S.label}>Fecha inicio *</label>
              <input type="date" value={contractForm.start_date}
                onChange={e => setContractForm((f:any) => ({...f, start_date: e.target.value}))}
                style={S.input} />
            </div>
            <div>
              <label style={S.label}>Fecha término {contractForm.contract_type === 'indefinido' ? '(no aplica)' : '*'}</label>
              <input type="date" value={contractForm.end_date}
                disabled={contractForm.contract_type === 'indefinido'}
                onChange={e => setContractForm((f:any) => ({...f, end_date: e.target.value}))}
                style={{ ...S.input, opacity: contractForm.contract_type === 'indefinido' ? .4 : 1 }} />
            </div>
            <div>
              <label style={S.label}>Sueldo bruto (CLP)</label>
              <input type="number" value={contractForm.salary}
                onChange={e => setContractForm((f:any) => ({...f, salary: e.target.value}))}
                placeholder="500000" style={S.input} />
            </div>
            <div>
              <label style={S.label}>Horas semanales</label>
              <input type="number" value={contractForm.hours_per_week}
                onChange={e => setContractForm((f:any) => ({...f, hours_per_week: e.target.value}))}
                style={S.input} />
            </div>
            <div style={{ gridColumn:'1/-1' }}>
              <label style={S.label}>Notas / observaciones</label>
              <textarea value={contractForm.notes}
                onChange={e => setContractForm((f:any) => ({...f, notes: e.target.value}))}
                rows={2} style={{ ...S.input, resize:'vertical' as const }} />
            </div>
          </div>
          <div style={{ background:'rgba(0,74,173,.06)', borderRadius:8, padding:'10px 12px', marginTop:14, fontSize:11, color:'#8899BB' }}>
            💡 Al crear un nuevo contrato se desactivará el anterior del empleado.
          </div>
          <div style={{ display:'flex', gap:10, marginTop:18 }}>
            <button onClick={() => setView('list')} style={{ ...S.btn, flex:1, padding:12, fontSize:12, background:'rgba(255,255,255,.05)', border:'1px solid rgba(255,255,255,.1)', color:'#8899BB' }}>Cancelar</button>
            <button onClick={saveContract} disabled={saving}
              style={{ ...S.btn, flex:2, padding:12, fontSize:13, background: saving ? 'rgba(0,74,173,.3)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff' }}>
              {saving ? '⏳ Guardando...' : '📄 Crear contrato'}
            </button>
          </div>
        </div>
      </div>
    </div>
  )

  // ────────────────────────────────────────────────────────────
  // VISTA PRINCIPAL
  // ────────────────────────────────────────────────────────────

  // KPIs
  const activos      = employees.filter(e => e.is_active).length
  const porVencer    = contracts.filter(c => {
    if (!c.end_date || !c.is_active) return false
    const days = (new Date(c.end_date).getTime() - now) / 86400000
    return days >= 0 && days <= 30
  }).length
  const presenteHoy  = employees.filter(e => e.attendance_today === 'present' || e.attendance_today === 'late').length
  const sinRegistro  = activos - employees.filter(e => e.attendance_today !== null).length

  const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio','Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

  return (
    <div style={S.page}>
      {/* Topbar */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:700, fontSize:13 }}>RRHH — {company?.name}</span>
        <div style={{ flex:1 }} />
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background:'transparent', border:'1px solid rgba(93,224,230,.2)', color:'#8899BB', padding:'4px 12px', fontSize:11 }}>← Dashboard</button>
        {activeTab === 'empleados' && (
          <button onClick={() => { setEmpForm({...EMPTY_EMP}); setFormErr(''); setView('edit-emp') }}
            style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
            + Empleado
          </button>
        )}
        {activeTab === 'asistencia' && (
          <button onClick={() => { setAttForm({ employee_id:'', work_date: new Date().toISOString().slice(0,10), check_in:'09:00', check_out:'18:00', status:'present', notes:'' }); setFormErr(''); setView('edit-att') }}
            style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
            + Registrar
          </button>
        )}
      </div>

      <div style={S.body}>
        {/* KPIs */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
          {[
            { icon:'👥', label:'Empleados activos',    value: activos,     color:'#5DE0E6' },
            { icon:'✅', label:'Presentes hoy',        value: presenteHoy, color:'#22C55E' },
            { icon:'📋', label:'Sin registro hoy',     value: sinRegistro, color:'#F59E0B' },
            { icon:'⚠️', label:'Contratos por vencer', value: porVencer,   color:'#EF4444' },
          ].map(k => (
            <div key={k.label} style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:11, color:'#8899BB' }}>{k.icon} {k.label}</div>
              <div style={{ fontSize:22, fontWeight:800, color: k.color, marginTop:4 }}>{k.value}</div>
            </div>
          ))}
        </div>

        {/* Tabs */}
        <div style={{ display:'flex', gap:4, background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:4, marginBottom:14, width:'fit-content' }}>
          {([
            ['empleados',   '👥 Empleados'],
            ['asistencia',  '📋 Asistencia'],
            ['contratos',   '📄 Contratos'],
          ] as const).map(([t, l]) => (
            <button key={t} onClick={() => setActiveTab(t)}
              style={{ border:'none', borderRadius:7, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700, padding:'6px 16px', fontSize:12, background: activeTab === t ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: activeTab === t ? '#fff' : '#8899BB' }}>
              {l}
            </button>
          ))}
        </div>

        {/* ══ TAB: EMPLEADOS ══════════════════════════════════ */}
        {activeTab === 'empleados' && (
          <div>
            {employees.length === 0 ? (
              <div style={{ ...S.card, textAlign:'center' as const, padding:40 }}>
                <div style={{ fontSize:36, marginBottom:10 }}>👥</div>
                <div style={{ fontSize:14, fontWeight:600, marginBottom:8 }}>Sin empleados registrados</div>
                <button onClick={() => { setEmpForm({...EMPTY_EMP}); setFormErr(''); setView('edit-emp') }}
                  style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 20px', fontSize:12 }}>
                  + Agregar primer empleado
                </button>
              </div>
            ) : (
              <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(280px,1fr))', gap:12 }}>
                {employees.map(e => {
                  const ct  = CONTRACT_TYPES[e.contract_type] || CONTRACT_TYPES.indefinido
                  const att = e.attendance_today ? ATTENDANCE_STATUS[e.attendance_today] : null
                  const daysActive = e.hire_date
                    ? Math.floor((now - new Date(e.hire_date).getTime()) / 86400000)
                    : null
                  const contractExpiring = e.contract_end
                    ? Math.floor((new Date(e.contract_end).getTime() - now) / 86400000)
                    : null

                  return (
                    <div key={e.id} style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, padding:'16px', position:'relative' as const }}>
                      {/* Indicador activo/inactivo */}
                      <div style={{ position:'absolute' as const, top:14, right:14, width:8, height:8, borderRadius:'50%', background: e.is_active ? '#22C55E' : '#6B7280' }} />

                      {/* Avatar y nombre */}
                      <div style={{ display:'flex', alignItems:'center', gap:12, marginBottom:12 }}>
                        <div style={{ width:44, height:44, borderRadius:'50%', background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:17, fontWeight:800, color:'#fff', flexShrink:0 }}>
                          {(e.first_name || '?')[0].toUpperCase()}
                        </div>
                        <div>
                          <div style={{ fontSize:14, fontWeight:700 }}>{e.first_name} {e.last_name}</div>
                          <div style={{ fontSize:11, color:'#8899BB' }}>{e.position || 'Sin cargo'} · {e.department || '—'}</div>
                        </div>
                      </div>

                      {/* Badges */}
                      <div style={{ display:'flex', gap:6, flexWrap:'wrap' as const, marginBottom:10 }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: ct.bg, color: ct.color }}>
                          {ct.label}
                        </span>
                        {att && (
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: att.bg, color: att.color }}>
                            {att.icon} {att.label}
                          </span>
                        )}
                        {contractExpiring !== null && contractExpiring <= 30 && contractExpiring >= 0 && (
                          <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background:'rgba(239,68,68,.1)', color:'#EF4444' }}>
                            ⚠️ Vence en {contractExpiring}d
                          </span>
                        )}
                      </div>

                      {/* Info */}
                      <div style={{ fontSize:11, color:'#8899BB', marginBottom:12 }}>
                        {e.salary ? <div>💰 {fmt(e.salary)}/mes · {e.hours_per_week}h/sem</div> : null}
                        {e.hire_date && daysActive !== null && <div>📅 Ingresó {fmtD(e.hire_date)} ({daysActive < 365 ? `${daysActive}d` : `${Math.floor(daysActive/365)}a`})</div>}
                        {e.phone && <div>📱 {e.phone}</div>}
                      </div>

                      {/* Acciones */}
                      <div style={{ display:'flex', gap:6 }}>
                        <button onClick={() => {
                          setEmpForm({ ...e, hire_date: e.hire_date || '', salary: e.salary || '', hours_per_week: String(e.hours_per_week), notes: e.notes || '' })
                          setFormErr(''); setView('edit-emp')
                        }} style={{ ...S.btn, flex:1, padding:'6px 8px', fontSize:11, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6' }}>
                          ✏️ Editar
                        </button>
                        <button onClick={() => {
                          setSelected(e); setContractForm({...EMPTY_CONTRACT, salary: e.salary || '', contract_type: e.contract_type})
                          setFormErr(''); setView('edit-contract')
                        }} style={{ ...S.btn, flex:1, padding:'6px 8px', fontSize:11, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E' }}>
                          📄 Contrato
                        </button>
                        <button onClick={() => {
                          setAttForm({ employee_id: e.id, work_date: new Date().toISOString().slice(0,10), check_in:'09:00', check_out:'18:00', status:'present', notes:'' })
                          setFormErr(''); setView('edit-att')
                        }} style={{ ...S.btn, flex:1, padding:'6px 8px', fontSize:11, background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', color:'#F59E0B' }}>
                          📋 Asist.
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ══ TAB: ASISTENCIA ═════════════════════════════════ */}
        {activeTab === 'asistencia' && (
          <div>
            {/* Selector mes/año */}
            <div style={{ display:'flex', gap:10, marginBottom:14, alignItems:'center', flexWrap:'wrap' as const }}>
              <select value={attMonth} onChange={e => setAttMonth(Number(e.target.value))}
                style={{ ...S.input, width:'auto', padding:'6px 10px', fontSize:12 }}>
                {MONTHS.map((m, i) => <option key={i+1} value={i+1}>{m}</option>)}
              </select>
              <select value={attYear} onChange={e => setAttYear(Number(e.target.value))}
                style={{ ...S.input, width:90, padding:'6px 10px', fontSize:12 }}>
                {[2024,2025,2026,2027].map(y => <option key={y} value={y}>{y}</option>)}
              </select>
              <div style={{ marginLeft:'auto', fontSize:11, color:'#8899BB' }}>
                {attendance.length} registros
              </div>
            </div>

            {/* Resumen por empleado */}
            {employees.filter(e => e.is_active).length > 0 && (
              <div style={{ ...S.card, marginBottom:14 }}>
                <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', marginBottom:10 }}>
                  📊 Resumen — {MONTHS[attMonth-1]} {attYear}
                </div>
                <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill, minmax(200px,1fr))', gap:8 }}>
                  {employees.filter(e => e.is_active).map(e => {
                    const empRecs = attendance.filter(a => a.employee_id === e.id)
                    const present = empRecs.filter(a => a.status === 'present' || a.status === 'late').length
                    const absent  = empRecs.filter(a => a.status === 'absent').length
                    const hours   = empRecs.reduce((s, a) => s + (a.hours_worked || 0), 0)
                    return (
                      <div key={e.id} style={{ background:'#0D1525', borderRadius:8, padding:'10px 12px' }}>
                        <div style={{ fontSize:12, fontWeight:700, marginBottom:6 }}>{e.first_name} {e.last_name}</div>
                        <div style={{ display:'flex', gap:10, fontSize:10, color:'#8899BB' }}>
                          <span style={{ color:'#22C55E' }}>✅ {present}d</span>
                          <span style={{ color:'#EF4444' }}>❌ {absent}d</span>
                          <span style={{ color:'#5DE0E6' }}>⏱ {hours.toFixed(1)}h</span>
                        </div>
                      </div>
                    )
                  })}
                </div>
              </div>
            )}

            {/* Tabla de registros */}
            <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'120px 1fr 90px 90px 70px 80px', gap:8, padding:'8px 16px', background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.08)', fontSize:9, fontWeight:700, color:'#8899BB', textTransform:'uppercase' as const }}>
                <span>Fecha</span><span>Empleado</span><span style={{ textAlign:'center' as const }}>Entrada</span>
                <span style={{ textAlign:'center' as const }}>Salida</span>
                <span style={{ textAlign:'center' as const }}>Horas</span>
                <span style={{ textAlign:'center' as const }}>Estado</span>
              </div>
              {attendance.length === 0 ? (
                <div style={{ textAlign:'center' as const, padding:40, color:'#8899BB', fontSize:12 }}>
                  Sin registros para {MONTHS[attMonth-1]} {attYear}
                </div>
              ) : attendance.map((a, i) => {
                const st = ATTENDANCE_STATUS[a.status] || ATTENDANCE_STATUS.present
                return (
                  <div key={a.id} style={{ display:'grid', gridTemplateColumns:'120px 1fr 90px 90px 70px 80px', gap:8, padding:'10px 16px', borderBottom:'1px solid rgba(93,224,230,.04)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,.01)', fontSize:12 }}>
                    <div style={{ color:'#8899BB' }}>{fmtD(a.work_date)}</div>
                    <div style={{ fontWeight:600, whiteSpace:'nowrap' as const, overflow:'hidden', textOverflow:'ellipsis' }}>{a.employee_name}</div>
                    <div style={{ textAlign:'center' as const, color:'#5DE0E6' }}>{a.check_in?.slice(0,5) || '—'}</div>
                    <div style={{ textAlign:'center' as const, color:'#5DE0E6' }}>{a.check_out?.slice(0,5) || '—'}</div>
                    <div style={{ textAlign:'center' as const, fontWeight:700 }}>{a.hours_worked ? `${a.hours_worked}h` : '—'}</div>
                    <div style={{ textAlign:'center' as const }}>
                      <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20, background: st.bg, color: st.color }}>{st.icon} {st.label}</span>
                    </div>
                  </div>
                )
              })}
            </div>
          </div>
        )}

        {/* ══ TAB: CONTRATOS ══════════════════════════════════ */}
        {activeTab === 'contratos' && (
          <div>
            {contracts.length === 0 ? (
              <div style={{ ...S.card, textAlign:'center' as const, padding:40 }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📄</div>
                <div style={{ fontSize:13, color:'#8899BB' }}>
                  Los contratos se crean desde la tarjeta de cada empleado.
                </div>
              </div>
            ) : (
              <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, overflow:'hidden' }}>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 120px 110px 110px 90px 80px', gap:8, padding:'8px 16px', background:'#0D1525', borderBottom:'1px solid rgba(93,224,230,.08)', fontSize:9, fontWeight:700, color:'#8899BB', textTransform:'uppercase' as const }}>
                  <span>Empleado</span>
                  <span>Tipo</span>
                  <span style={{ textAlign:'center' as const }}>Inicio</span>
                  <span style={{ textAlign:'center' as const }}>Término</span>
                  <span style={{ textAlign:'right' as const }}>Sueldo</span>
                  <span style={{ textAlign:'center' as const }}>Estado</span>
                </div>
                {contracts.map((c, i) => {
                  const emp = employees.find(e => e.id === c.employee_id)
                  const ct  = CONTRACT_TYPES[c.contract_type] || CONTRACT_TYPES.indefinido
                  const daysLeft = c.end_date
                    ? Math.floor((new Date(c.end_date).getTime() - now) / 86400000)
                    : null
                  const isExpired = daysLeft !== null && daysLeft < 0
                  return (
                    <div key={c.id} style={{ display:'grid', gridTemplateColumns:'1fr 120px 110px 110px 90px 80px', gap:8, padding:'11px 16px', borderBottom:'1px solid rgba(93,224,230,.04)', background: i%2===0 ? 'transparent' : 'rgba(255,255,255,.01)', fontSize:12 }}>
                      <div>
                        <div style={{ fontWeight:700 }}>{emp ? `${emp.first_name} ${emp.last_name}` : '—'}</div>
                        {emp && <div style={{ fontSize:10, color:'#8899BB' }}>{emp.position}</div>}
                      </div>
                      <div>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 8px', borderRadius:20, background: ct.bg, color: ct.color }}>{ct.label}</span>
                      </div>
                      <div style={{ textAlign:'center' as const, color:'#8899BB' }}>{fmtD(c.start_date)}</div>
                      <div style={{ textAlign:'center' as const }}>
                        {c.end_date ? (
                          <span style={{ color: isExpired ? '#EF4444' : daysLeft !== null && daysLeft <= 30 ? '#F59E0B' : '#8899BB' }}>
                            {fmtD(c.end_date)}
                            {!isExpired && daysLeft !== null && daysLeft <= 30 && <span style={{ fontSize:9, display:'block' }}>{daysLeft}d</span>}
                          </span>
                        ) : <span style={{ color:'#22C55E' }}>Indefinido</span>}
                      </div>
                      <div style={{ textAlign:'right' as const, fontWeight:700, color:'#5DE0E6' }}>
                        {c.salary ? fmt(c.salary) : '—'}
                      </div>
                      <div style={{ textAlign:'center' as const }}>
                        <span style={{ fontSize:10, fontWeight:700, padding:'2px 7px', borderRadius:20,
                          background: !c.is_active ? 'rgba(107,114,128,.1)' : isExpired ? 'rgba(239,68,68,.1)' : 'rgba(34,197,94,.1)',
                          color:      !c.is_active ? '#6B7280' : isExpired ? '#EF4444' : '#22C55E' }}>
                          {!c.is_active ? 'Inactivo' : isExpired ? 'Vencido' : 'Activo'}
                        </span>
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
