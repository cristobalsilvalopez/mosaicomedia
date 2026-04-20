'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase  = createClient()
const TODAY     = new Date().toISOString().split('T')[0]
const IN30DAYS  = new Date(Date.now() + 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0]

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  const p = d.split('T')[0].split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

// ============================================================
// INTERFACES
// ============================================================
interface User     { id: string; first_name: string; last_name: string; role: string; company_id: string }
interface Company  { id: string; name: string; rut?: string; industry?: string }
interface Employee {
  id: string; first_name: string; last_name: string
  rut: string | null; email: string | null
  position: string | null; department: string | null
  hire_date: string | null; contract_type: string
  salary: number | null; hours_per_week: number
}
interface ContractDocument {
  id: string; employee_id: string; employee_name: string
  employee_rut: string | null; employee_position: string | null
  contract_type: string; title: string
  start_date: string; end_date: string | null
  salary: number | null; hours_per_week: number
  position: string | null; department: string | null
  status: string; content: Record<string, unknown>
  ai_draft_text: string | null; notes: string | null
  signed_at: string | null; terminated_at: string | null
  termination_notes: string | null; annex_count: number
  created_at: string; updated_at: string
}
interface ContractAnnex {
  id: string; contract_document_id: string
  employee_id: string; employee_name: string
  annex_type: string; title: string; effective_date: string
  content: Record<string, unknown>; ai_draft_text: string | null
  status: string; notes: string | null; signed_at: string | null
  created_at: string
}

// ============================================================
// CONSTANTS
// ============================================================
const CONTRACT_TYPES = [
  { value: 'indefinido',  label: 'Indefinido',   color: '#22C55E' },
  { value: 'plazo_fijo',  label: 'Plazo Fijo',   color: '#F59E0B' },
  { value: 'obra_faena',  label: 'Obra/Faena',   color: '#F97316' },
  { value: 'part_time',   label: 'Part-Time',    color: '#A78BFA' },
  { value: 'temporada',   label: 'Temporada',    color: '#06B6D4' },
  { value: 'aprendizaje', label: 'Aprendizaje',  color: '#EC4899' },
]

const ANNEX_TYPES = [
  { value: 'salary_change',   label: 'Modificación de Remuneración' },
  { value: 'position_change', label: 'Cambio de Cargo'              },
  { value: 'hours_change',    label: 'Modificación de Jornada'      },
  { value: 'bonus',           label: 'Bono / Incentivo'             },
  { value: 'remote_work',     label: 'Teletrabajo'                  },
  { value: 'confidentiality', label: 'Confidencialidad'             },
  { value: 'other',           label: 'Otro'                         },
]

const STATUS_CFG: Record<string, { label: string; color: string; bg: string }> = {
  draft:      { label: 'Borrador',    color: '#8899BB', bg: 'rgba(136,153,187,.15)' },
  final:      { label: 'Finalizado',  color: '#F59E0B', bg: 'rgba(245,158,11,.15)'  },
  signed:     { label: 'Firmado',     color: '#22C55E', bg: 'rgba(34,197,94,.15)'   },
  expired:    { label: 'Vencido',     color: '#EF4444', bg: 'rgba(239,68,68,.15)'   },
  terminated: { label: 'Finiquitado', color: '#A78BFA', bg: 'rgba(167,139,250,.15)' },
}

const NEEDS_END = ['plazo_fijo', 'obra_faena', 'temporada', 'aprendizaje']

// ── Plantilla predeterminada (texto base contrato chileno) ────────────────────
const DEFAULT_CONTRACT_TPL = `CONTRATO INDIVIDUAL DE TRABAJO

En {{ciudad}}, a {{fecha_hoy}}, comparecen:

EMPLEADOR: {{nombre_empresa}}, RUT {{rut_empresa}}, representada por {{representante_empresa}}, en adelante "el Empleador";

TRABAJADOR: {{nombre_empleado}}, RUT {{rut_empleado}}, domiciliado en {{ciudad}}, en adelante "el Trabajador".

Ambas partes han convenido celebrar el siguiente Contrato Individual de Trabajo:

PRIMERA: CARGO Y FUNCIONES
El Trabajador se obliga a prestar servicios como {{cargo}}, en el área de {{departamento}}, debiendo desempeñar sus funciones con eficiencia, diligencia y esmero, conforme a las instrucciones del Empleador.

SEGUNDA: LUGAR DE PRESTACIÓN DE SERVICIOS
Los servicios se prestarán en las dependencias del Empleador en {{ciudad}}, sin perjuicio de los traslados que el Empleador pueda disponer conforme al artículo 12 del Código del Trabajo.

TERCERA: JORNADA DE TRABAJO
La jornada ordinaria será de {{horas_semanales}} horas semanales, distribuidas de lunes a viernes. Se contempla un descanso de 30 minutos para colación, no imputable a la jornada. El trabajador registrará su asistencia según el sistema dispuesto por el Empleador.

CUARTA: REMUNERACIÓN
El Empleador pagará una remuneración bruta mensual de {{sueldo_bruto}}, liquidable y pagadera dentro de los primeros 5 días hábiles del mes siguiente al devengado. Incluye pago proporcional de días sábados, domingos y festivos.

QUINTA: BENEFICIOS
El Trabajador tendrá derecho a los beneficios que el Empleador otorgue en forma general: aguinaldos de Fiestas Patrias y Navidad, bonos de productividad, y los demás establecidos en el Reglamento Interno de Orden, Higiene y Seguridad (RIOHS).

SEXTA: FERIADO ANUAL
El Trabajador tendrá derecho a feriado anual de 15 días hábiles con remuneración íntegra, conforme al artículo 67 y siguientes del Código del Trabajo, aumentado progresivamente según antigüedad.

SÉPTIMA: OBLIGACIONES DEL TRABAJADOR
El Trabajador se compromete a: (a) cumplir las obligaciones del contrato y del RIOHS; (b) guardar reserva de información confidencial del Empleador; (c) comunicar con anticipación toda ausencia; (d) respetar normas de seguridad e higiene; (e) mantener un trato respetuoso con compañeros, clientes y proveedores.

OCTAVA: OBLIGACIONES DEL EMPLEADOR
El Empleador se obliga a: (a) pagar oportunamente las remuneraciones; (b) proporcionar los implementos necesarios para el trabajo; (c) respetar la dignidad e integridad del Trabajador; (d) dar cumplimiento íntegro a la normativa laboral, de seguridad social y previsional vigente.

NOVENA: DOCUMENTOS ENTREGADOS
Con la firma del presente contrato, el Empleador hace entrega de: (a) copia del contrato; (b) Reglamento Interno de Orden, Higiene y Seguridad (RIOHS); (c) Obligación de Informar (ODI) sobre riesgos del cargo. El Trabajador declara haber recibido y leído dichos documentos.

DÉCIMA: VIGENCIA
El presente contrato rige a partir del {{fecha_inicio}} con carácter {{tipo_contrato}}.

DÉCIMA PRIMERA: LEGISLACIÓN APLICABLE
Este contrato se regirá por el Código del Trabajo y demás leyes laborales vigentes en la República de Chile.

En prueba de conformidad, las partes firman en dos ejemplares del mismo tenor y fecha.

_______________________________     _______________________________
        EL EMPLEADOR                          EL TRABAJADOR
   {{nombre_empresa}}                      {{nombre_empleado}}
   RUT: {{rut_empresa}}                    RUT: {{rut_empleado}}
`

// ============================================================
// INLINE STYLE HELPERS (shared across modals)
// ============================================================
const inputSt: React.CSSProperties = {
  width: '100%', background: '#1E2A3A',
  border: '1px solid rgba(93,224,230,.2)', borderRadius: 8,
  padding: '8px 12px', color: '#F0F4FF', fontSize: 13, boxSizing: 'border-box',
}
const selectSt: React.CSSProperties = { ...inputSt }
const labelSt: React.CSSProperties = {
  fontSize: 11, color: '#8899BB', display: 'block', marginBottom: 4,
}

// ============================================================
// CONTRACT FORM MODAL
// ============================================================
interface ContractFormModalProps {
  employees: Employee[]
  company: Company
  doc: ContractDocument | null
  onClose: () => void
  onSave: () => void
  Sbtn: React.CSSProperties
}

function ContractFormModal({ employees, company, doc, onClose, onSave, Sbtn }: ContractFormModalProps) {
  const [form, setForm] = useState({
    employee_id:   doc?.employee_id   ?? '',
    contract_type: doc?.contract_type ?? 'indefinido',
    start_date:    doc?.start_date    ?? TODAY,
    end_date:      doc?.end_date      ?? '',
    salary:        doc?.salary?.toString()        ?? '',
    hours_per_week:doc?.hours_per_week?.toString() ?? '45',
    position:      doc?.position      ?? '',
    department:    doc?.department    ?? '',
    notes:         doc?.notes         ?? '',
  })
  const [manualName, setManualName] = useState(doc?.employee_name ?? '')
  const [manualRut,  setManualRut]  = useState(doc?.employee_rut  ?? '')
  const [useManual,  setUseManual]  = useState(employees.length === 0 || !doc?.employee_id)
  const [saving,    setSaving]    = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiText,    setAiText]    = useState(doc?.ai_draft_text ?? '')
  const [aiNotes,   setAiNotes]   = useState<string[]>([])
  const [error,     setError]     = useState('')

  const emp = employees.find(e => e.id === form.employee_id)

  function pickEmp(id: string) {
    const e = employees.find(x => x.id === id)
    setForm(f => ({
      ...f,
      employee_id:    id,
      position:       e?.position    ?? f.position,
      department:     e?.department  ?? f.department,
      salary:         e?.salary?.toString() ?? f.salary,
      hours_per_week: e?.hours_per_week?.toString() ?? f.hours_per_week,
    }))
  }

  async function save() {
    if (!form.start_date) { setError('La fecha de inicio es obligatoria.'); return }
    if (useManual && !manualName.trim()) { setError('El nombre del empleado es obligatorio.'); return }
    if (!useManual && !form.employee_id) { setError('Selecciona un empleado.'); return }
    setSaving(true); setError('')
    const employeeName = useManual ? manualName.trim() : (emp ? `${emp.first_name} ${emp.last_name}` : '')
    const { data, error: e } = await supabase.rpc('upsert_contract_document', {
      p_data: {
        ...(doc ? { id: doc.id } : {}),
        company_id:    company.id,
        employee_id:   useManual ? null : (form.employee_id || null),
        employee_name: employeeName,
        employee_rut:  useManual ? (manualRut.trim() || null) : (emp?.rut ?? null),
        contract_type: form.contract_type,
        start_date:    form.start_date,
        end_date:      form.end_date || null,
        salary:        form.salary   || null,
        hours_per_week:parseInt(form.hours_per_week) || 45,
        position:      form.position   || null,
        department:    form.department || null,
        notes:         form.notes      || null,
        ai_draft_text: aiText          || null,
        status:        doc?.status     ?? 'draft',
      },
    })
    setSaving(false)
    if (e || !data?.success) { setError(e?.message || data?.error || 'Error al guardar'); return }
    onSave()
  }

  async function genAI() {
    if (!form.employee_id) { setError('Selecciona un empleado primero.'); return }
    setAiLoading(true); setError('')
    try {
      const res = await fetch('/api/ai/contratos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_draft',
          payload: {
            employee: emp,
            contract: { ...form, salary: form.salary || null, end_date: form.end_date || null },
            company,
          },
        }),
      })
      const r = await res.json()
      if (r.document_text) { setAiText(r.document_text); setAiNotes(r.validation_notes || []) }
      else setError(r.error || 'Error al generar')
    } catch { setError('Error de red') }
    setAiLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:16, padding:28, width:'min(720px,96vw)', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div style={{ fontSize:16, fontWeight:800 }}>{doc ? 'Editar Contrato' : 'Nuevo Contrato'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {error && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 12px', marginBottom:14, color:'#EF4444', fontSize:12 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:4 }}>
              <label style={{ ...labelSt, marginBottom:0 }}>Empleado *</label>
              <button type='button' onClick={() => setUseManual(v => !v)}
                style={{ background:'none', border:'none', color:'#5DE0E6', cursor:'pointer', fontSize:11, fontFamily:'Montserrat,sans-serif' }}>
                {useManual ? (employees.length > 0 ? '↩ Seleccionar de lista' : '') : '✏️ Ingresar manualmente'}
              </button>
            </div>
            {useManual ? (
              <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:10 }}>
                <div>
                  <label style={labelSt}>Nombre completo *</label>
                  <input value={manualName} onChange={e => setManualName(e.target.value)}
                    placeholder='Ej: Juan Pérez González' style={inputSt} />
                </div>
                <div>
                  <label style={labelSt}>RUT</label>
                  <input value={manualRut} onChange={e => setManualRut(e.target.value)}
                    placeholder='Ej: 12.345.678-9' style={inputSt} />
                </div>
              </div>
            ) : (
              <select value={form.employee_id} onChange={e => pickEmp(e.target.value)} style={selectSt}>
                <option value=''>— Seleccionar empleado —</option>
                {employees.map(e => (
                  <option key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.rut ? ` (${e.rut})` : ''}</option>
                ))}
              </select>
            )}
          </div>

          <div>
            <label style={labelSt}>Tipo de contrato</label>
            <select value={form.contract_type} onChange={e => setForm(f => ({ ...f, contract_type: e.target.value }))} style={selectSt}>
              {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelSt}>Cargo</label>
            <input value={form.position} onChange={e => setForm(f => ({ ...f, position: e.target.value }))} placeholder='Encargada de tienda' style={inputSt} />
          </div>

          <div>
            <label style={labelSt}>Departamento</label>
            <input value={form.department} onChange={e => setForm(f => ({ ...f, department: e.target.value }))} placeholder='Ventas' style={inputSt} />
          </div>

          <div>
            <label style={labelSt}>Remuneración bruta mensual (CLP)</label>
            <input type='number' value={form.salary} onChange={e => setForm(f => ({ ...f, salary: e.target.value }))} placeholder='580000' style={inputSt} />
          </div>

          <div>
            <label style={labelSt}>Horas semanales</label>
            <input type='number' value={form.hours_per_week} onChange={e => setForm(f => ({ ...f, hours_per_week: e.target.value }))} style={inputSt} />
          </div>

          <div>
            <label style={labelSt}>Fecha de inicio *</label>
            <input type='date' value={form.start_date} onChange={e => setForm(f => ({ ...f, start_date: e.target.value }))} style={inputSt} />
          </div>

          <div>
            <label style={labelSt}>Fecha de término {NEEDS_END.includes(form.contract_type) ? '*' : '(opcional)'}</label>
            <input type='date' value={form.end_date} onChange={e => setForm(f => ({ ...f, end_date: e.target.value }))} style={inputSt} />
          </div>

          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelSt}>Notas / cláusulas adicionales</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} placeholder='Instrucciones especiales...' style={{ ...inputSt, resize:'vertical' }} />
          </div>

          {/* IA */}
          <div style={{ gridColumn:'1/-1', background:'rgba(93,224,230,.04)', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#5DE0E6' }}>✨ Borrador con IA</span>
              <button onClick={genAI} disabled={aiLoading || !form.employee_id} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
                {aiLoading ? '⏳ Generando...' : '🤖 Generar borrador'}
              </button>
            </div>
            {aiNotes.length > 0 && (
              <div style={{ marginBottom:8 }}>
                {aiNotes.map((n, i) => (
                  <div key={i} style={{ fontSize:11, color:'#F59E0B', marginBottom:3 }}>⚠ {n}</div>
                ))}
              </div>
            )}
            {aiText
              ? <textarea value={aiText} onChange={e => setAiText(e.target.value)} rows={10} style={{ ...inputSt, fontFamily:'monospace', fontSize:11, background:'#0D1926', resize:'vertical' }} />
              : <div style={{ fontSize:11, color:'#8899BB' }}>Selecciona empleado y haz clic en &ldquo;Generar borrador&rdquo; para redactar el contrato con IA.</div>
            }
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={{ ...Sbtn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'8px 20px', fontSize:12 }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 24px', fontSize:12 }}>
            {saving ? 'Guardando...' : 'Guardar contrato'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// ANNEX FORM MODAL
// ============================================================
interface AnnexFormModalProps {
  contracts: ContractDocument[]
  employees: Employee[]
  company: Company
  annex: ContractAnnex | null
  preselectedContractId: string | null
  onClose: () => void
  onSave: () => void
  Sbtn: React.CSSProperties
}

function AnnexFormModal({ contracts, employees, company, annex, preselectedContractId, onClose, onSave, Sbtn }: AnnexFormModalProps) {
  const [form, setForm] = useState({
    contract_document_id: annex?.contract_document_id ?? preselectedContractId ?? '',
    annex_type:    annex?.annex_type    ?? 'salary_change',
    effective_date:annex?.effective_date ?? TODAY,
    notes:         annex?.notes         ?? '',
    new_salary:    (annex?.content as Record<string, string>)?.new_salary ?? '',
    new_position:  (annex?.content as Record<string, string>)?.new_position ?? '',
    new_hours:     (annex?.content as Record<string, string>)?.new_hours ?? '',
    bonus_amount:  (annex?.content as Record<string, string>)?.bonus_amount ?? '',
    bonus_reason:  (annex?.content as Record<string, string>)?.bonus_reason ?? '',
  })
  const [saving,    setSaving]    = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiText,    setAiText]    = useState(annex?.ai_draft_text ?? '')
  const [error,     setError]     = useState('')

  const selContract  = contracts.find(c => c.id === form.contract_document_id)
  const selEmployee  = employees.find(e => e.id === selContract?.employee_id)

  function buildContent(): Record<string, string> {
    const c: Record<string, string> = {}
    if (form.annex_type === 'salary_change'   && form.new_salary)   c.new_salary   = form.new_salary
    if (form.annex_type === 'position_change' && form.new_position) c.new_position = form.new_position
    if (form.annex_type === 'hours_change'    && form.new_hours)    c.new_hours    = form.new_hours
    if (form.annex_type === 'bonus') {
      if (form.bonus_amount) c.bonus_amount = form.bonus_amount
      if (form.bonus_reason) c.bonus_reason = form.bonus_reason
    }
    return c
  }

  async function save() {
    if (!form.contract_document_id || !form.effective_date) { setError('Contrato y fecha de vigencia son obligatorios.'); return }
    if (!selContract) { setError('Contrato no encontrado.'); return }
    setSaving(true); setError('')
    const { data, error: e } = await supabase.rpc('upsert_contract_annex', {
      p_data: {
        ...(annex ? { id: annex.id } : {}),
        company_id:          company.id,
        contract_document_id:form.contract_document_id,
        employee_id:         selContract.employee_id,
        annex_type:          form.annex_type,
        effective_date:      form.effective_date,
        content:             buildContent(),
        ai_draft_text:       aiText || null,
        status:              annex?.status ?? 'draft',
        notes:               form.notes || null,
      },
    })
    setSaving(false)
    if (e || !data?.success) { setError(e?.message || data?.error || 'Error al guardar'); return }
    onSave()
  }

  async function genAI() {
    if (!selContract) { setError('Selecciona un contrato primero.'); return }
    setAiLoading(true); setError('')
    try {
      const res = await fetch('/api/ai/contratos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          action: 'generate_annex',
          payload: {
            employee:  selEmployee,
            annex:     { annex_type: form.annex_type, effective_date: form.effective_date, content: buildContent(), notes: form.notes },
            contract:  selContract,
            company,
          },
        }),
      })
      const r = await res.json()
      if (r.document_text) setAiText(r.document_text)
      else setError(r.error || 'Error al generar')
    } catch { setError('Error de red') }
    setAiLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(245,158,11,.15)', borderRadius:16, padding:28, width:'min(660px,96vw)', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div style={{ fontSize:16, fontWeight:800 }}>{annex ? 'Editar Anexo' : 'Nuevo Anexo'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {error && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 12px', marginBottom:14, color:'#EF4444', fontSize:12 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelSt}>Contrato base *</label>
            <select value={form.contract_document_id} onChange={e => setForm(f => ({ ...f, contract_document_id: e.target.value }))} style={selectSt}>
              <option value=''>— Seleccionar contrato —</option>
              {contracts.filter(c => c.status !== 'terminated').map(c => (
                <option key={c.id} value={c.id}>{c.employee_name} — {c.title}</option>
              ))}
            </select>
          </div>

          <div>
            <label style={labelSt}>Tipo de anexo</label>
            <select value={form.annex_type} onChange={e => setForm(f => ({ ...f, annex_type: e.target.value }))} style={selectSt}>
              {ANNEX_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
          </div>

          <div>
            <label style={labelSt}>Fecha de vigencia *</label>
            <input type='date' value={form.effective_date} onChange={e => setForm(f => ({ ...f, effective_date: e.target.value }))} style={inputSt} />
          </div>

          {form.annex_type === 'salary_change' && (
            <div style={{ gridColumn:'1/-1' }}>
              <label style={labelSt}>Nueva remuneración bruta mensual (CLP)</label>
              <input type='number' value={form.new_salary} onChange={e => setForm(f => ({ ...f, new_salary: e.target.value }))} placeholder='650000' style={inputSt} />
            </div>
          )}
          {form.annex_type === 'position_change' && (
            <div style={{ gridColumn:'1/-1' }}>
              <label style={labelSt}>Nuevo cargo</label>
              <input value={form.new_position} onChange={e => setForm(f => ({ ...f, new_position: e.target.value }))} placeholder='Jefa de tienda' style={inputSt} />
            </div>
          )}
          {form.annex_type === 'hours_change' && (
            <div style={{ gridColumn:'1/-1' }}>
              <label style={labelSt}>Nuevas horas semanales</label>
              <input type='number' value={form.new_hours} onChange={e => setForm(f => ({ ...f, new_hours: e.target.value }))} placeholder='30' style={inputSt} />
            </div>
          )}
          {form.annex_type === 'bonus' && (
            <>
              <div>
                <label style={labelSt}>Monto del bono (CLP)</label>
                <input type='number' value={form.bonus_amount} onChange={e => setForm(f => ({ ...f, bonus_amount: e.target.value }))} placeholder='50000' style={inputSt} />
              </div>
              <div>
                <label style={labelSt}>Motivo del bono</label>
                <input value={form.bonus_reason} onChange={e => setForm(f => ({ ...f, bonus_reason: e.target.value }))} placeholder='Desempeño Q1' style={inputSt} />
              </div>
            </>
          )}

          <div style={{ gridColumn:'1/-1' }}>
            <label style={labelSt}>Notas adicionales</label>
            <textarea value={form.notes} onChange={e => setForm(f => ({ ...f, notes: e.target.value }))} rows={2} style={{ ...inputSt, resize:'vertical' }} />
          </div>

          <div style={{ gridColumn:'1/-1', background:'rgba(93,224,230,.04)', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:14 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <span style={{ fontSize:11, fontWeight:700, color:'#5DE0E6' }}>✨ Borrador con IA</span>
              <button onClick={genAI} disabled={aiLoading || !form.contract_document_id} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
                {aiLoading ? '⏳ Generando...' : '🤖 Generar anexo'}
              </button>
            </div>
            {aiText
              ? <textarea value={aiText} onChange={e => setAiText(e.target.value)} rows={8} style={{ ...inputSt, fontFamily:'monospace', fontSize:11, background:'#0D1926', resize:'vertical' }} />
              : <div style={{ fontSize:11, color:'#8899BB' }}>Selecciona un contrato y haz clic en &ldquo;Generar anexo&rdquo;.</div>
            }
          </div>
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end', marginTop:20 }}>
          <button onClick={onClose} style={{ ...Sbtn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'8px 20px', fontSize:12 }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...Sbtn, background:'linear-gradient(90deg,#F59E0B,#F97316)', color:'#fff', padding:'8px 24px', fontSize:12 }}>
            {saving ? 'Guardando...' : 'Guardar anexo'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// CONTRACT DETAIL MODAL
// ============================================================
interface ContractDetailModalProps {
  doc: ContractDocument
  annexes: ContractAnnex[]
  company: Company
  onClose: () => void
  onStatusChange: (id: string, status: string, notes?: string) => Promise<void>
  onAddAnnex: (contractId: string) => void
  Sbtn: React.CSSProperties
}

function ContractDetailModal({ doc, annexes, company, onClose, onStatusChange, onAddAnnex, Sbtn }: ContractDetailModalProps) {
  const [termNotes, setTermNotes] = useState('')
  const [showTerm,  setShowTerm]  = useState(false)
  const [acting,    setActing]    = useState(false)
  const [aiSummary, setAiSummary] = useState('')
  const [summarizing, setSummarizing] = useState(false)

  const st  = STATUS_CFG[doc.status] || STATUS_CFG.draft
  const ct  = CONTRACT_TYPES.find(t => t.value === doc.contract_type)

  async function transition(newStatus: string, notes?: string) {
    setActing(true)
    await onStatusChange(doc.id, newStatus, notes)
    setActing(false)
    setShowTerm(false)
  }

  async function summarize() {
    if (!doc.ai_draft_text) return
    setSummarizing(true)
    try {
      const res = await fetch('/api/ai/contratos', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'summarize', payload: { document_text: doc.ai_draft_text } }),
      })
      const r = await res.json()
      if (r.summary) setAiSummary(r.summary)
    } catch { /* silent */ }
    setSummarizing(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:16, padding:28, width:'min(760px,96vw)', maxHeight:'92vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800, color:'#F0F4FF' }}>{doc.title}</div>
            <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>{company.name} · Creado {fmtDate(doc.created_at)}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>

        {/* Status + Workflow */}
        <div style={{ display:'flex', alignItems:'center', gap:10, flexWrap:'wrap', marginBottom:20 }}>
          <span style={{ background:st.bg, color:st.color, fontSize:11, fontWeight:700, padding:'4px 12px', borderRadius:20 }}>{st.label}</span>
          <span style={{ background:`${ct?.color || '#8899BB'}20`, color:ct?.color || '#8899BB', fontSize:11, fontWeight:600, padding:'4px 10px', borderRadius:20 }}>{ct?.label || doc.contract_type}</span>
          <div style={{ flex:1 }} />
          {doc.status === 'draft' && (
            <button disabled={acting} onClick={() => transition('final')} style={{ ...Sbtn, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', color:'#F59E0B', padding:'5px 14px', fontSize:11 }}>
              ✅ Finalizar
            </button>
          )}
          {doc.status === 'final' && (
            <button disabled={acting} onClick={() => transition('signed')} style={{ ...Sbtn, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.3)', color:'#22C55E', padding:'5px 14px', fontSize:11 }}>
              ✍️ Marcar firmado
            </button>
          )}
          {doc.status === 'signed' && (
            <button disabled={acting} onClick={() => transition('expired')} style={{ ...Sbtn, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', color:'#EF4444', padding:'5px 14px', fontSize:11 }}>
              ⏰ Marcar vencido
            </button>
          )}
          {['signed','final','expired'].includes(doc.status) && (
            <button disabled={acting} onClick={() => setShowTerm(t => !t)} style={{ ...Sbtn, background:'rgba(167,139,250,.1)', border:'1px solid rgba(167,139,250,.3)', color:'#A78BFA', padding:'5px 14px', fontSize:11 }}>
              🚪 Resciliar
            </button>
          )}
          <button onClick={() => onAddAnnex(doc.id)} style={{ ...Sbtn, background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', color:'#F59E0B', padding:'5px 14px', fontSize:11 }}>
            + Anexo
          </button>
        </div>

        {showTerm && (
          <div style={{ background:'rgba(167,139,250,.06)', border:'1px solid rgba(167,139,250,.2)', borderRadius:10, padding:14, marginBottom:16 }}>
            <div style={{ fontSize:12, fontWeight:700, color:'#A78BFA', marginBottom:8 }}>Resciliación de contrato</div>
            <textarea value={termNotes} onChange={e => setTermNotes(e.target.value)} rows={3} placeholder='Motivo de resciliación, acuerdo de finiquito...' style={{ ...inputSt, resize:'vertical', marginBottom:10 }} />
            <div style={{ display:'flex', gap:8 }}>
              <button onClick={() => setShowTerm(false)} style={{ ...Sbtn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'6px 14px', fontSize:11 }}>Cancelar</button>
              <button disabled={acting} onClick={() => transition('terminated', termNotes)} style={{ ...Sbtn, background:'rgba(167,139,250,.2)', color:'#A78BFA', padding:'6px 14px', fontSize:11 }}>
                Confirmar resciliación
              </button>
            </div>
          </div>
        )}

        {/* Details grid */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(3,1fr)', gap:10, marginBottom:20 }}>
          {[
            { label:'Empleado',     value: doc.employee_name },
            { label:'RUT',          value: doc.employee_rut || '—' },
            { label:'Cargo',        value: doc.position || doc.employee_position || '—' },
            { label:'Inicio',       value: fmtDate(doc.start_date) },
            { label:'Término',      value: fmtDate(doc.end_date) },
            { label:'Remuneración', value: doc.salary ? fmt(doc.salary) : '—' },
            { label:'Horas/semana', value: `${doc.hours_per_week}h` },
            { label:'Departamento', value: doc.department || '—' },
            { label:'Anexos',       value: String(doc.annex_count) },
          ].map(item => (
            <div key={item.label} style={{ background:'#0D1926', borderRadius:8, padding:'10px 12px' }}>
              <div style={{ fontSize:10, color:'#8899BB', marginBottom:3 }}>{item.label}</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#F0F4FF' }}>{item.value}</div>
            </div>
          ))}
        </div>

        {doc.notes && (
          <div style={{ background:'#0D1926', borderRadius:8, padding:'10px 14px', marginBottom:16 }}>
            <div style={{ fontSize:10, color:'#8899BB', marginBottom:4 }}>NOTAS</div>
            <div style={{ fontSize:12, color:'#F0F4FF' }}>{doc.notes}</div>
          </div>
        )}

        {/* AI Draft */}
        {doc.ai_draft_text && (
          <div style={{ marginBottom:16 }}>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
              <div style={{ fontSize:11, fontWeight:700, color:'#5DE0E6' }}>📄 Borrador del contrato</div>
              <button onClick={summarize} disabled={summarizing} style={{ ...Sbtn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 12px', fontSize:10 }}>
                {summarizing ? '⏳ Resumiendo...' : '✨ Resumir con IA'}
              </button>
            </div>
            {aiSummary && (
              <div style={{ background:'rgba(93,224,230,.06)', border:'1px solid rgba(93,224,230,.15)', borderRadius:8, padding:'10px 14px', marginBottom:10, fontSize:12, color:'#F0F4FF', lineHeight:1.6 }}>
                {aiSummary}
              </div>
            )}
            <div style={{ background:'#0D1926', border:'1px solid rgba(93,224,230,.1)', borderRadius:8, padding:'12px 14px', maxHeight:220, overflowY:'auto' }}>
              <pre style={{ margin:0, fontSize:11, color:'#C8D4E8', fontFamily:'monospace', whiteSpace:'pre-wrap', lineHeight:1.6 }}>{doc.ai_draft_text}</pre>
            </div>
          </div>
        )}

        {/* Annexes */}
        {annexes.length > 0 && (
          <div>
            <div style={{ fontSize:11, fontWeight:700, color:'#8899BB', marginBottom:10, textTransform:'uppercase', letterSpacing:'.5px' }}>Anexos ({annexes.length})</div>
            <div style={{ display:'flex', flexDirection:'column', gap:8 }}>
              {annexes.map(a => {
                const as_ = STATUS_CFG[a.status] || STATUS_CFG.draft
                const at  = ANNEX_TYPES.find(t => t.value === a.annex_type)
                return (
                  <div key={a.id} style={{ background:'#0D1926', borderRadius:8, padding:'10px 14px', display:'flex', alignItems:'center', gap:10 }}>
                    <span style={{ fontSize:16 }}>📎</span>
                    <div style={{ flex:1 }}>
                      <div style={{ fontSize:12, fontWeight:700 }}>{a.title}</div>
                      <div style={{ fontSize:11, color:'#8899BB' }}>{at?.label} · Vigencia: {fmtDate(a.effective_date)}</div>
                    </div>
                    <span style={{ background:as_.bg, color:as_.color, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20 }}>{as_.label}</span>
                  </div>
                )
              })}
            </div>
          </div>
        )}
      </div>
    </div>
  )
}

// ============================================================
// PAGE
// ============================================================
// ============================================================
// TEMPLATE INTERFACE + EXPORT HELPERS
// ============================================================
interface ContractTemplate {
  id: string; company_id: string; name: string; type: string
  content: string; variables: string[]; file_url: string | null; created_at: string
}

const TEMPLATE_VARS = [
  '{{nombre_empleado}}','{{rut_empleado}}','{{cargo}}','{{departamento}}',
  '{{sueldo_bruto}}','{{horas_semanales}}','{{fecha_inicio}}','{{fecha_termino}}',
  '{{tipo_contrato}}','{{nombre_empresa}}','{{rut_empresa}}','{{fecha_hoy}}',
  '{{ciudad}}','{{pais}}','{{representante_empresa}}',
]

function fillTemplate(template: string, doc: ContractDocument, company: Company): string {
  const today = new Date().toLocaleDateString('es-CL', { day:'numeric', month:'long', year:'numeric' })
  return template
    .replace(/\{\{nombre_empleado\}\}/g, doc.employee_name || '')
    .replace(/\{\{rut_empleado\}\}/g,    doc.employee_rut  || '')
    .replace(/\{\{cargo\}\}/g,           doc.position      || '')
    .replace(/\{\{departamento\}\}/g,    doc.department    || '')
    .replace(/\{\{sueldo_bruto\}\}/g,    doc.salary ? '$' + Math.round(doc.salary).toLocaleString('es-CL') : '')
    .replace(/\{\{horas_semanales\}\}/g, String(doc.hours_per_week || 45))
    .replace(/\{\{fecha_inicio\}\}/g,    doc.start_date    ? fmtDate(doc.start_date) : '')
    .replace(/\{\{fecha_termino\}\}/g,   doc.end_date      ? fmtDate(doc.end_date)  : 'Indefinido')
    .replace(/\{\{tipo_contrato\}\}/g,   CONTRACT_TYPES.find(t => t.value === doc.contract_type)?.label || doc.contract_type)
    .replace(/\{\{nombre_empresa\}\}/g,  company.name      || '')
    .replace(/\{\{rut_empresa\}\}/g,     company.rut       || '')
    .replace(/\{\{fecha_hoy\}\}/g,       today)
    .replace(/\{\{ciudad\}\}/g,          'Santiago')
    .replace(/\{\{pais\}\}/g,            'Chile')
    .replace(/\{\{representante_empresa\}\}/g, '')
}

function exportPDF(content: string, title: string) {
  const win = window.open('', '_blank')
  if (!win) return
  win.document.write(`<!DOCTYPE html><html><head><title>${title}</title><meta charset="utf-8">
  <style>
    body { font-family: 'Times New Roman',serif; font-size:12pt; line-height:1.8; color:#000; background:#fff; max-width:720px; margin:40px auto; padding:0 20px }
    h1 { font-size:14pt; text-align:center; text-transform:uppercase; margin-bottom:24px }
    pre { white-space:pre-wrap; font-family:inherit; font-size:12pt }
    @media print { body { margin:0; max-width:100% } }
  </style></head><body>
  <h1>${title}</h1><pre>${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre>
  <script>window.onload=()=>{ window.print() }<\/script>
  </body></html>`)
  win.document.close()
}

function exportWord(content: string, title: string) {
  const html = `<html xmlns:o="urn:schemas-microsoft-com:office:office" xmlns:w="urn:schemas-microsoft-com:office:word" xmlns="http://www.w3.org/TR/REC-html40">
  <head><meta charset="utf-8"><title>${title}</title>
  <!--[if gte mso 9]><xml><w:WordDocument><w:View>Print</w:View></w:WordDocument></xml><![endif]-->
  <style>body{font-family:"Times New Roman",serif;font-size:12pt;line-height:1.8}h1{text-align:center;font-size:14pt;text-transform:uppercase}pre{white-space:pre-wrap;font-family:inherit}</style>
  </head><body><h1>${title}</h1><pre>${content.replace(/</g,'&lt;').replace(/>/g,'&gt;')}</pre></body></html>`
  const blob = new Blob([html], { type: 'application/msword' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `${title.replace(/\s+/g,'-')}.doc`; a.click()
  URL.revokeObjectURL(url)
}

function exportRTF(content: string, title: string) {
  const escaped = content.replace(/\\/g,'\\\\').replace(/\{/g,'\\{').replace(/\}/g,'\\}').replace(/\n/g,'\\par\n')
  const rtf = `{\\rtf1\\ansi\\deff0{\\fonttbl{\\f0 Times New Roman;}}\\f0\\fs24\\par\\qc\\b ${title}\\b0\\par\\par\\ql ${escaped}}`
  const blob = new Blob([rtf], { type: 'application/rtf' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `${title.replace(/\s+/g,'-')}.rtf`; a.click()
  URL.revokeObjectURL(url)
}

function exportCSV(doc: ContractDocument, company: Company) {
  const rows = [
    ['Campo','Valor'],
    ['Empleado', doc.employee_name],
    ['RUT Empleado', doc.employee_rut || ''],
    ['Empresa', company.name],
    ['RUT Empresa', company.rut || ''],
    ['Tipo de contrato', CONTRACT_TYPES.find(t => t.value === doc.contract_type)?.label || doc.contract_type],
    ['Cargo', doc.position || ''],
    ['Departamento', doc.department || ''],
    ['Sueldo bruto', doc.salary ? String(doc.salary) : ''],
    ['Horas semanales', String(doc.hours_per_week)],
    ['Fecha inicio', doc.start_date],
    ['Fecha término', doc.end_date || 'Indefinido'],
    ['Estado', STATUS_CFG[doc.status]?.label || doc.status],
    ['Notas', doc.notes || ''],
  ]
  const csv = rows.map(r => r.map(c => `"${String(c).replace(/"/g,'""')}"`).join(',')).join('\n')
  const blob = new Blob(['\uFEFF' + csv], { type: 'text/csv;charset=utf-8' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `contrato-${doc.employee_name.replace(/\s+/g,'-')}.csv`; a.click()
  URL.revokeObjectURL(url)
}

function exportXML(doc: ContractDocument, company: Company) {
  const esc = (s: string) => s.replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;')
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<contrato xmlns:xsi="http://www.w3.org/2001/XMLSchema-instance">
  <empresa>
    <nombre>${esc(company.name)}</nombre>
    <rut>${esc(company.rut || '')}</rut>
  </empresa>
  <empleado>
    <nombre>${esc(doc.employee_name)}</nombre>
    <rut>${esc(doc.employee_rut || '')}</rut>
    <cargo>${esc(doc.position || '')}</cargo>
    <departamento>${esc(doc.department || '')}</departamento>
  </empleado>
  <contrato_laboral>
    <tipo>${esc(doc.contract_type)}</tipo>
    <fecha_inicio>${doc.start_date}</fecha_inicio>
    <fecha_termino>${doc.end_date || 'indefinido'}</fecha_termino>
    <sueldo_bruto>${doc.salary || 0}</sueldo_bruto>
    <horas_semanales>${doc.hours_per_week}</horas_semanales>
    <estado>${doc.status}</estado>
  </contrato_laboral>
  <notas>${esc(doc.notes || '')}</notas>
  <generado_en>${new Date().toISOString()}</generado_en>
</contrato>`
  const blob = new Blob([xml], { type: 'application/xml' })
  const url  = URL.createObjectURL(blob)
  const a    = document.createElement('a'); a.href = url; a.download = `contrato-${doc.employee_name.replace(/\s+/g,'-')}.xml`; a.click()
  URL.revokeObjectURL(url)
}

// ============================================================
// PAGE
// ============================================================
export default function ContratosPage() {
  const router = useRouter()

  const [user,       setUser]       = useState<User | null>(null)
  const [company,    setCompany]    = useState<Company | null>(null)
  const [docs,       setDocs]       = useState<ContractDocument[]>([])
  const [annexes,    setAnnexes]    = useState<ContractAnnex[]>([])
  const [employees,  setEmployees]  = useState<Employee[]>([])
  const [templates,  setTemplates]  = useState<ContractTemplate[]>([])
  const [loading,    setLoading]    = useState(true)
  const [tab,        setTab]        = useState<'contratos'|'anexos'|'plantillas'>('contratos')

  // Template UI state
  const [editTemplate,  setEditTemplate]  = useState<ContractTemplate | null>(null)
  const [newTemplate,   setNewTemplate]   = useState(false)
  const [tplForm,       setTplForm]       = useState({ name: '', type: 'contract', content: DEFAULT_CONTRACT_TPL })
  const [tplSaving,     setTplSaving]     = useState(false)
  const [previewDoc,    setPreviewDoc]    = useState<ContractDocument | null>(null)
  const [previewTpl,    setPreviewTpl]    = useState<ContractTemplate | null>(null)
  const [search,   setSearch]   = useState('')
  const [fStatus,  setFStatus]  = useState('')
  const [fType,    setFType]    = useState('')

  const [showForm,      setShowForm]      = useState(false)
  const [editDoc,       setEditDoc]       = useState<ContractDocument | null>(null)
  const [detailDoc,     setDetailDoc]     = useState<ContractDocument | null>(null)
  const [showAnnexForm, setShowAnnexForm] = useState(false)
  const [editAnnex,     setEditAnnex]     = useState<ContractAnnex | null>(null)
  const [annexContractId, setAnnexContractId] = useState<string | null>(null)

  // ── loaders (hoisted above init useEffect) ──

  async function loadDocs(cid: string) {
    const { data } = await supabase.rpc('get_contract_documents', { p_company_id: cid })
    if (data) setDocs(data as ContractDocument[])
  }

  async function loadAnnexes(cid: string) {
    const { data } = await supabase.rpc('get_contract_annexes', { p_company_id: cid })
    if (data) setAnnexes(data as ContractAnnex[])
  }

  async function loadTemplates(cid: string) {
    const { data } = await supabase.from('contract_templates').select('*').eq('company_id', cid).order('created_at')
    if (data) setTemplates(data as ContractTemplate[])
  }

  async function loadEmployees(cid: string) {
    const { data } = await supabase.rpc('get_employees', { p_company_id: cid })
    if (data) setEmployees(data as Employee[])
  }

  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      if (!ctx.isSuperAdmin && !['admin','owner'].includes(ctx.user.role)) { router.push('/dashboard'); return }
      setUser(ctx.user as any)
      const { data: c } = await supabase.from('companies')
        .select('id,name,rut,industry').eq('id', ctx.companyId).single()
      if (c) setCompany(c as Company)
      await Promise.all([loadDocs(ctx.companyId), loadAnnexes(ctx.companyId), loadEmployees(ctx.companyId), loadTemplates(ctx.companyId)])
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    if (!company) return
    loadDocs(company.id)
    loadAnnexes(company.id)
    loadTemplates(company.id)
  }

  async function saveTpl() {
    if (!company || !tplForm.name.trim()) return
    setTplSaving(true)
    if (editTemplate) {
      await supabase.from('contract_templates').update({ name: tplForm.name, type: tplForm.type, content: tplForm.content, updated_at: new Date().toISOString() }).eq('id', editTemplate.id).eq('company_id', company.id)
    } else {
      await supabase.from('contract_templates').insert({ company_id: company.id, name: tplForm.name, type: tplForm.type, content: tplForm.content })
    }
    setTplSaving(false); setEditTemplate(null); setNewTemplate(false); setTplForm({ name: '', type: 'contract', content: DEFAULT_CONTRACT_TPL })
    loadTemplates(company.id)
  }

  async function deleteTpl(id: string) {
    if (!company || !confirm('¿Eliminar esta plantilla?')) return
    await supabase.from('contract_templates').delete().eq('id', id).eq('company_id', company.id)
    loadTemplates(company.id)
  }

  async function handleStatusChange(id: string, newStatus: string, notes?: string) {
    if (!company) return
    const now = new Date().toISOString()
    await supabase.rpc('upsert_contract_document', {
      p_data: {
        id, company_id: company.id, status: newStatus,
        ...(newStatus === 'signed'     ? { signed_at: now }                                             : {}),
        ...(newStatus === 'terminated' ? { terminated_at: now, termination_notes: notes || null }       : {}),
      },
    })
    await loadDocs(company.id)
    setDetailDoc(prev => prev?.id === id ? { ...prev, status: newStatus } : prev)
  }

  const filteredDocs = docs.filter(d => {
    const ms = !search   || d.employee_name.toLowerCase().includes(search.toLowerCase()) || d.title.toLowerCase().includes(search.toLowerCase())
    const mst = !fStatus || d.status        === fStatus
    const mty = !fType   || d.contract_type === fType
    return ms && mst && mty
  })

  const summary = {
    total:       docs.length,
    signed:      docs.filter(d => d.status === 'signed').length,
    draft:       docs.filter(d => d.status === 'draft').length,
    expiringSoon:docs.filter(d => d.status === 'signed' && !!d.end_date && d.end_date <= IN30DAYS).length,
  }

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando contratos...
    </div>
  )

  const S: Record<string, React.CSSProperties> = {
    page:   { minHeight:'100vh', background:'var(--mp-bg, #0A1628)', fontFamily:'Montserrat,sans-serif', color:'var(--mp-text, #F0F4FF)', display:'flex', flexDirection:'column', transition:'background .25s, color .25s' },
    topbar: { height:50, background:'#111827', borderBottom:'1px solid rgba(93,224,230,.12)', display:'flex', alignItems:'center', padding:'0 20px', gap:10, flexShrink:0 },
    logo:   { width:28, height:28, borderRadius:7, background:'linear-gradient(135deg,#004AAD,#5DE0E6)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:11, fontWeight:700, color:'#fff', cursor:'pointer', flexShrink:0 },
    body:   { flex:1, padding:'20px', overflowY:'auto' as const },
    card:   { background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:12, padding:'16px 18px' },
    btn:    { border:'none', borderRadius:8, cursor:'pointer', fontFamily:'Montserrat,sans-serif', fontWeight:700 } as React.CSSProperties,
  }

  return (
    <div style={S.page}>

      {/* TOPBAR */}
      <div style={S.topbar}>
        <div style={S.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight:800, fontSize:13 }}>Contratos</span>
        <span style={{ fontSize:11, color:'#8899BB' }}>{company?.name}</span>
        {user?.role && (
          <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.15)', color:'#5DE0E6', textTransform:'uppercase' as const, letterSpacing:'.05em' }}>
            {user.role}
          </span>
        )}
        <div style={{ flex:1 }} />
        <button onClick={() => router.push('/rrhh')} style={{ ...S.btn, background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', color:'#A78BFA', padding:'4px 12px', fontSize:11 }}>
          🧑‍💼 RRHH
        </button>
        <button onClick={() => router.push('/dashboard')} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
          ← Dashboard
        </button>
      </div>

      <div style={S.body}>

        {/* HEADER */}
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:20, fontWeight:800 }}>📄 Gestión de Contratos</div>
            <div style={{ fontSize:12, color:'#8899BB', marginTop:2 }}>Contratos laborales, anexos y documentación del personal</div>
          </div>
          <button onClick={() => { setEditDoc(null); setShowForm(true) }} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'9px 18px', fontSize:12 }}>
            + Nuevo contrato
          </button>
        </div>

        {/* SUMMARY CARDS */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Total contratos', value:summary.total,        color:'#5DE0E6' },
            { label:'Firmados',        value:summary.signed,       color:'#22C55E' },
            { label:'Borradores',      value:summary.draft,        color:'#F59E0B' },
            { label:'Vencen en 30 días',value:summary.expiringSoon,color:'#EF4444' },
          ].map(s => (
            <div key={s.label} style={S.card}>
              <div style={{ fontSize:24, fontWeight:800, color:s.color }}>{s.value}</div>
              <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display:'flex', gap:4, background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:4, marginBottom:20, width:'fit-content' }}>
          {([
            { key: 'contratos',  label: '📄 Contratos'  },
            { key: 'anexos',     label: '📎 Anexos'      },
            { key: 'plantillas', label: '🗂 Plantillas'  },
          ] as const).map(t => (
            <button key={t.key} onClick={() => setTab(t.key)} style={{ ...S.btn, padding:'6px 20px', fontSize:12, borderRadius:7, background: tab === t.key ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: tab === t.key ? '#fff' : '#8899BB' }}>
              {t.label}
            </button>
          ))}
        </div>

        {/* CONTRATOS TAB */}
        {tab === 'contratos' && (
          <div>
            <div style={{ display:'flex', gap:10, marginBottom:16, flexWrap:'wrap' }}>
              <input value={search} onChange={e => setSearch(e.target.value)} placeholder='Buscar empleado o título...' style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:8, padding:'7px 12px', color:'#F0F4FF', fontSize:12, flex:1, minWidth:180 }} />
              <select value={fStatus} onChange={e => setFStatus(e.target.value)} style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:8, padding:'7px 12px', color:'#F0F4FF', fontSize:12 }}>
                <option value=''>Todos los estados</option>
                {Object.entries(STATUS_CFG).map(([v, c]) => <option key={v} value={v}>{c.label}</option>)}
              </select>
              <select value={fType} onChange={e => setFType(e.target.value)} style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:8, padding:'7px 12px', color:'#F0F4FF', fontSize:12 }}>
                <option value=''>Todos los tipos</option>
                {CONTRACT_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>

            {filteredDocs.length === 0 ? (
              <div style={{ ...S.card, textAlign:'center' as const, padding:48, color:'#8899BB' }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📄</div>
                <div style={{ marginBottom:16 }}>No hay contratos{search || fStatus || fType ? ' con estos filtros' : ' todavía'}.</div>
                {!search && !fStatus && !fType && (
                  <button onClick={() => { setEditDoc(null); setShowForm(true) }} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'9px 20px', fontSize:12 }}>
                    Crear primer contrato
                  </button>
                )}
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {filteredDocs.map(doc => {
                  const st = STATUS_CFG[doc.status] || STATUS_CFG.draft
                  const ct = CONTRACT_TYPES.find(t => t.value === doc.contract_type)
                  const expiring = doc.status === 'signed' && doc.end_date && doc.end_date <= IN30DAYS
                  return (
                    <div key={doc.id} onClick={() => setDetailDoc(doc)}
                      style={{ ...S.card, display:'flex', alignItems:'center', gap:14, cursor:'pointer', transition:'border-color .15s',
                        ...(expiring ? { borderColor:'rgba(239,68,68,.35)' } : {}) }}>
                      <div style={{ width:42, height:42, borderRadius:10, background:`${ct?.color || '#8899BB'}18`, display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>📄</div>
                      <div style={{ flex:1, minWidth:0 }}>
                        <div style={{ fontWeight:700, fontSize:13, overflow:'hidden', textOverflow:'ellipsis', whiteSpace:'nowrap' }}>{doc.title}</div>
                        <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>
                          {doc.employee_name}{doc.employee_rut ? ` · ${doc.employee_rut}` : ''} · Inicio {fmtDate(doc.start_date)}{doc.end_date ? ` · Término ${fmtDate(doc.end_date)}` : ''}
                          {expiring && <span style={{ color:'#EF4444', marginLeft:6 }}>⚠ Vence pronto</span>}
                        </div>
                      </div>
                      <div style={{ display:'flex', flexDirection:'column', alignItems:'flex-end', gap:5, flexShrink:0 }}>
                        <span style={{ background:st.bg, color:st.color, fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>{st.label}</span>
                        <span style={{ color:ct?.color || '#8899BB', fontSize:10, fontWeight:600 }}>{ct?.label}</span>
                      </div>
                      {doc.salary !== null && <div style={{ fontSize:12, fontWeight:700, color:'#5DE0E6', flexShrink:0 }}>{fmt(doc.salary)}</div>}
                      <div style={{ display:'flex', gap:6, flexShrink:0 }} onClick={e => e.stopPropagation()}>
                        <button onClick={() => { setEditDoc(doc); setShowForm(true) }}
                          style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 10px', fontSize:10 }}>
                          Editar
                        </button>
                        <button onClick={() => { setAnnexContractId(doc.id); setEditAnnex(null); setShowAnnexForm(true) }}
                          style={{ ...S.btn, background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', color:'#F59E0B', padding:'4px 10px', fontSize:10 }}>
                          + Anexo
                        </button>
                      </div>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ANEXOS TAB */}
        {tab === 'anexos' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:16 }}>
              <div style={{ fontSize:13, color:'#8899BB' }}>{annexes.length} anexo{annexes.length !== 1 ? 's' : ''}</div>
              <button onClick={() => { setEditAnnex(null); setAnnexContractId(null); setShowAnnexForm(true) }}
                style={{ ...S.btn, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.25)', color:'#F59E0B', padding:'6px 16px', fontSize:11 }}>
                + Nuevo anexo
              </button>
            </div>
            {annexes.length === 0 ? (
              <div style={{ ...S.card, textAlign:'center' as const, padding:48, color:'#8899BB' }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📎</div>
                <div>No hay anexos todavía.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {annexes.map(a => {
                  const as_ = STATUS_CFG[a.status] || STATUS_CFG.draft
                  const at  = ANNEX_TYPES.find(t => t.value === a.annex_type)
                  return (
                    <div key={a.id} style={{ ...S.card, display:'flex', alignItems:'center', gap:14 }}>
                      <div style={{ width:38, height:38, borderRadius:9, background:'rgba(245,158,11,.15)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:18, flexShrink:0 }}>📎</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:13 }}>{a.title}</div>
                        <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>{a.employee_name} · {at?.label} · Vigencia: {fmtDate(a.effective_date)}</div>
                      </div>
                      <span style={{ background:as_.bg, color:as_.color, fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20 }}>{as_.label}</span>
                      <button onClick={() => { setEditAnnex(a); setAnnexContractId(a.contract_document_id); setShowAnnexForm(true) }}
                        style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 10px', fontSize:10 }}>
                        Editar
                      </button>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── PLANTILLAS TAB ─────────────────────────────────────────── */}
        {tab === 'plantillas' && company && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:18 }}>
              <div>
                <div style={{ fontSize:15, fontWeight:800 }}>🗂 Plantillas de documentos</div>
                <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>Crea plantillas con variables automáticas • Exporta como PDF, Word, CSV o XML</div>
              </div>
              <button onClick={() => { setEditTemplate(null); setTplForm({ name:'', type:'contract', content: DEFAULT_CONTRACT_TPL }); setNewTemplate(true) }}
                style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 16px', fontSize:12 }}>
                + Nueva plantilla
              </button>
            </div>

            {/* Variable reference */}
            <div style={{ ...S.card, marginBottom:16, padding:'12px 14px' }}>
              <div style={{ fontSize:10, fontWeight:700, color:'#5DE0E6', marginBottom:8, textTransform:'uppercase', letterSpacing:'.05em' }}>Variables disponibles</div>
              <div style={{ display:'flex', flexWrap:'wrap', gap:4 }}>
                {TEMPLATE_VARS.map(v => (
                  <span key={v} style={{ fontSize:10, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.15)', borderRadius:5, padding:'2px 7px', color:'#5DE0E6', cursor:'pointer', userSelect:'all' }}>{v}</span>
                ))}
              </div>
              <div style={{ fontSize:10, color:'#8899BB', marginTop:6 }}>Haz clic en una variable para copiarla. Pégala en el contenido de tu plantilla.</div>
            </div>

            {/* Template editor */}
            {(newTemplate || editTemplate) && (
              <div style={{ ...S.card, marginBottom:16 }}>
                <div style={{ fontSize:13, fontWeight:800, marginBottom:14 }}>{editTemplate ? 'Editar plantilla' : 'Nueva plantilla'}</div>
                <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:12 }}>
                  <div>
                    <label style={{ fontSize:11, color:'#8899BB', display:'block', marginBottom:4 }}>Nombre *</label>
                    <input value={tplForm.name} onChange={e => setTplForm(f => ({ ...f, name: e.target.value }))} placeholder='Contrato indefinido estándar' style={inputSt} />
                  </div>
                  <div>
                    <label style={{ fontSize:11, color:'#8899BB', display:'block', marginBottom:4 }}>Tipo</label>
                    <select value={tplForm.type} onChange={e => setTplForm(f => ({ ...f, type: e.target.value }))} style={selectSt}>
                      <option value='contract'>Contrato</option>
                      <option value='annex'>Anexo</option>
                      <option value='other'>Otro</option>
                    </select>
                  </div>
                </div>
                <div style={{ marginBottom:12 }}>
                  <label style={{ fontSize:11, color:'#8899BB', display:'block', marginBottom:4 }}>Contenido (usa las variables entre dobles llaves)</label>
                  <textarea
                    value={tplForm.content}
                    onChange={e => setTplForm(f => ({ ...f, content: e.target.value }))}
                    rows={18}
                    style={{ ...inputSt, resize:'vertical', fontFamily:'monospace', fontSize:11, background:'#0D1926', lineHeight: 1.6 }}
                  />
                </div>
                <div style={{ display:'flex', gap:8, justifyContent:'flex-end' }}>
                  <button onClick={() => { setNewTemplate(false); setEditTemplate(null); setTplForm({ name:'', type:'contract', content: DEFAULT_CONTRACT_TPL }) }}
                    style={{ ...S.btn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'7px 16px', fontSize:12 }}>Cancelar</button>
                  <button onClick={saveTpl} disabled={tplSaving || !tplForm.name.trim()}
                    style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'7px 20px', fontSize:12 }}>
                    {tplSaving ? 'Guardando...' : 'Guardar plantilla'}
                  </button>
                </div>
              </div>
            )}

            {/* Template list */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(320px,1fr))', gap:14 }}>
              {templates.map(tpl => (
                <div key={tpl.id} style={{ ...S.card }}>
                  <div style={{ display:'flex', justifyContent:'space-between', alignItems:'flex-start', marginBottom:10 }}>
                    <div>
                      <div style={{ fontWeight:800, fontSize:13 }}>{tpl.name}</div>
                      <span style={{ fontSize:9, color:'#8899BB', background:'rgba(93,224,230,.06)', border:'1px solid rgba(93,224,230,.12)', borderRadius:4, padding:'1px 6px' }}>
                        {tpl.type === 'contract' ? 'Contrato' : tpl.type === 'annex' ? 'Anexo' : 'Otro'}
                      </span>
                    </div>
                    <div style={{ display:'flex', gap:5 }}>
                      <button onClick={() => { setEditTemplate(tpl); setTplForm({ name:tpl.name, type:tpl.type, content: tpl.content || DEFAULT_CONTRACT_TPL }); setNewTemplate(false) }}
                        style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 9px', fontSize:10 }}>Editar</button>
                      <button onClick={() => deleteTpl(tpl.id)}
                        style={{ ...S.btn, background:'rgba(239,68,68,.08)', border:'1px solid rgba(239,68,68,.2)', color:'#EF4444', padding:'4px 9px', fontSize:10 }}>🗑</button>
                    </div>
                  </div>

                  {/* Preview of content */}
                  <div style={{ fontSize:10, color:'#8899BB', background:'#0D1926', borderRadius:6, padding:'8px 10px', marginBottom:10, maxHeight:80, overflow:'hidden', fontFamily:'monospace' }}>
                    {tpl.content.slice(0, 200)}{tpl.content.length > 200 ? '...' : ''}
                  </div>

                  {/* Apply to contract + export */}
                  <div>
                    <div style={{ fontSize:10, color:'#8899BB', marginBottom:5 }}>Aplicar a contrato y exportar:</div>
                    <div style={{ display:'flex', gap:5, flexWrap:'wrap' }}>
                      <select
                        onChange={e => { if (e.target.value) { setPreviewDoc(docs.find(d => d.id === e.target.value) || null); setPreviewTpl(tpl) } }}
                        style={{ ...selectSt, fontSize:10, padding:'4px 8px', flex:1 }}>
                        <option value=''>— Seleccionar contrato —</option>
                        {docs.map(d => <option key={d.id} value={d.id}>{d.employee_name} · {CONTRACT_TYPES.find(t => t.value === d.contract_type)?.label}</option>)}
                      </select>
                    </div>
                    {previewTpl?.id === tpl.id && previewDoc && (
                      <div style={{ display:'flex', gap:4, marginTop:8, flexWrap:'wrap' }}>
                        <button onClick={() => exportPDF(fillTemplate(tpl.content, previewDoc, company), tpl.name)}
                          style={{ ...S.btn, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', color:'#EF4444', padding:'5px 10px', fontSize:10 }}>📄 PDF</button>
                        <button onClick={() => exportWord(fillTemplate(tpl.content, previewDoc, company), tpl.name)}
                          style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'5px 10px', fontSize:10 }}>📝 Word</button>
                        <button onClick={() => exportRTF(fillTemplate(tpl.content, previewDoc, company), tpl.name)}
                          style={{ ...S.btn, background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', color:'#A78BFA', padding:'5px 10px', fontSize:10 }}>📋 RTF</button>
                        <button onClick={() => exportCSV(previewDoc, company)}
                          style={{ ...S.btn, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', padding:'5px 10px', fontSize:10 }}>📊 CSV</button>
                        <button onClick={() => exportXML(previewDoc, company)}
                          style={{ ...S.btn, background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', color:'#F59E0B', padding:'5px 10px', fontSize:10 }}>🔖 XML</button>
                      </div>
                    )}
                  </div>
                </div>
              ))}

              {templates.length === 0 && !newTemplate && (
                <div style={{ ...S.card, textAlign:'center' as const, padding:40, color:'#8899BB', gridColumn:'1/-1' }}>
                  <div style={{ fontSize:32, marginBottom:10 }}>🗂</div>
                  <div style={{ marginBottom:14 }}>No hay plantillas todavía.</div>
                  <button onClick={() => { setTplForm({ name:'', type:'contract', content:'' }); setNewTemplate(true) }}
                    style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 18px', fontSize:12 }}>
                    Crear primera plantilla
                  </button>
                </div>
              )}
            </div>

            {/* Export from any doc directly */}
            {docs.length > 0 && (
              <div style={{ ...S.card, marginTop:20 }}>
                <div style={{ fontSize:12, fontWeight:700, marginBottom:10 }}>⚡ Exportación rápida (sin plantilla)</div>
                <div style={{ display:'flex', gap:10, alignItems:'center', flexWrap:'wrap' }}>
                  <select
                    onChange={e => setPreviewDoc(docs.find(d => d.id === e.target.value) || null)}
                    style={{ ...selectSt, flex:1, minWidth:200 }}>
                    <option value=''>— Seleccionar contrato —</option>
                    {docs.map(d => <option key={d.id} value={d.id}>{d.employee_name} · {CONTRACT_TYPES.find(t => t.value === d.contract_type)?.label}</option>)}
                  </select>
                  {previewDoc && (
                    <>
                      <button onClick={() => { const c = previewDoc.ai_draft_text || `CONTRATO — ${previewDoc.title}\nEmpleado: ${previewDoc.employee_name}\nRUT: ${previewDoc.employee_rut || ''}\nCargo: ${previewDoc.position || ''}\nSueldo: ${previewDoc.salary ? '$'+Math.round(previewDoc.salary).toLocaleString('es-CL') : ''}\nInicio: ${fmtDate(previewDoc.start_date)}${previewDoc.end_date ? '\nTérmino: '+fmtDate(previewDoc.end_date) : ''}\n${previewDoc.notes || ''}`; exportPDF(c, previewDoc.title) }}
                        style={{ ...S.btn, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.25)', color:'#EF4444', padding:'6px 12px', fontSize:11 }}>📄 PDF</button>
                      <button onClick={() => { const c = previewDoc.ai_draft_text || `CONTRATO — ${previewDoc.title}\n\nEmpleado: ${previewDoc.employee_name}\nCargo: ${previewDoc.position || ''}`; exportWord(c, previewDoc.title) }}
                        style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'6px 12px', fontSize:11 }}>📝 Word</button>
                      <button onClick={() => exportCSV(previewDoc, company)}
                        style={{ ...S.btn, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', padding:'6px 12px', fontSize:11 }}>📊 CSV</button>
                      <button onClick={() => exportXML(previewDoc, company)}
                        style={{ ...S.btn, background:'rgba(245,158,11,.08)', border:'1px solid rgba(245,158,11,.2)', color:'#F59E0B', padding:'6px 12px', fontSize:11 }}>🔖 XML</button>
                    </>
                  )}
                </div>
              </div>
            )}
          </div>
        )}

      </div>

      {/* MODALS */}
      {showForm && company && (
        <ContractFormModal
          employees={employees}
          company={company}
          doc={editDoc}
          onClose={() => { setShowForm(false); setEditDoc(null) }}
          onSave={() => { setShowForm(false); setEditDoc(null); refresh() }}
          Sbtn={S.btn}
        />
      )}

      {detailDoc && company && (
        <ContractDetailModal
          doc={detailDoc}
          annexes={annexes.filter(a => a.contract_document_id === detailDoc.id)}
          company={company}
          onClose={() => setDetailDoc(null)}
          onStatusChange={handleStatusChange}
          onAddAnnex={contractId => { setAnnexContractId(contractId); setEditAnnex(null); setShowAnnexForm(true) }}
          Sbtn={S.btn}
        />
      )}

      {showAnnexForm && company && (
        <AnnexFormModal
          contracts={docs}
          employees={employees}
          company={company}
          annex={editAnnex}
          preselectedContractId={annexContractId}
          onClose={() => { setShowAnnexForm(false); setEditAnnex(null); setAnnexContractId(null) }}
          onSave={() => { setShowAnnexForm(false); setEditAnnex(null); setAnnexContractId(null); refresh() }}
          Sbtn={S.btn}
        />
      )}

    </div>
  )
}
