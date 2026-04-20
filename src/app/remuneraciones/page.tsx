'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase   = createClient()
const TODAY      = new Date().toISOString().split('T')[0]
const CUR_YEAR   = new Date().getFullYear()
const CUR_MONTH  = new Date().getMonth() + 1

const fmt = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const pct = (n: number) => (Number(n) * 100).toFixed(2) + '%'
const fmtDate = (d: string | null | undefined): string => {
  if (!d) return '—'
  const p = d.split('T')[0].split('-')
  return `${p[2]}/${p[1]}/${p[0]}`
}

const MONTHS = ['Enero','Febrero','Marzo','Abril','Mayo','Junio',
  'Julio','Agosto','Septiembre','Octubre','Noviembre','Diciembre']

// ============================================================
// INTERFACES
// ============================================================
interface User     { id: string; first_name: string; role: string; company_id: string }
interface Company  { id: string; name: string; rut?: string; industry?: string }

interface PayrollParams {
  id?: string
  afp_rate_worker: number
  sis_rate: number
  health_rate: number
  cesantia_worker: number
  cesantia_employer_indef: number
  cesantia_employer_fixed: number
  minimum_wage: number
  utm_value: number
  mutual_rate: number
}

interface PayrollPeriod {
  id: string; period_year: number; period_month: number
  status: string; total_liquido: number; total_bruto: number
  costo_empresa: number; employee_count: number
  notes: string | null; closed_at: string | null
  paid_at: string | null; created_at: string
}

interface PayrollItem {
  id: string; label: string
  type: 'haber_imponible' | 'haber_no_imponible' | 'descuento'
  amount: number
}

interface PayrollDocument {
  id: string; period_id: string; employee_id: string
  employee_name: string; employee_rut: string | null
  position: string | null; department: string | null
  contract_type: string; hours_per_week: number
  hire_date: string | null; base_salary: number
  items: PayrollItem[]
  total_imponible: number; total_no_imponible: number; total_bruto: number
  descuento_afp: number; descuento_salud: number; descuento_cesantia: number
  total_descuentos_legales: number; total_descuentos_otros: number
  total_liquido: number; costo_sis: number
  costo_cesantia_empresa: number; costo_total_empresa: number
  status: string; ai_draft_text: string | null
  notes: string | null; paid_at: string | null; paid_via: string | null
  expense_id: string | null; created_at: string; updated_at: string
}

interface EmployeeConditions {
  employee_id: string; employee_name: string; employee_rut: string | null
  position: string | null; department: string | null
  hire_date: string | null; contract_type: string
  hours_per_week: number; base_salary: number
  contract_document_id: string | null; salary_annex_id: string | null
}

interface SeveranceDoc {
  id: string; employee_id: string
  employee_name: string; employee_rut: string | null
  position: string | null; hire_date: string | null
  termination_date: string; termination_cause: string
  base_salary: number; pending_vacation_days: number
  vacation_amount: number; severance_months: number
  severance_amount: number; pending_salary_days: number
  pending_salary_amount: number; other_items: PayrollItem[]
  total_amount: number; status: string
  ai_draft_text: string | null; notes: string | null
  signed_at: string | null; created_at: string
}

interface Employee {
  id: string; first_name: string; last_name: string
  rut: string | null; position: string | null
  department: string | null; hire_date: string | null
  contract_type: string; salary: number | null
  hours_per_week: number; is_active: boolean
}

// ============================================================
// CONSTANTS
// ============================================================
const PERIOD_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  open:   { label: 'Abierto',  color: '#5DE0E6', bg: 'rgba(93,224,230,.12)'   },
  closed: { label: 'Emitido',  color: '#F59E0B', bg: 'rgba(245,158,11,.12)'   },
  paid:   { label: 'Pagado',   color: '#22C55E', bg: 'rgba(34,197,94,.12)'    },
}

const DOC_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:   { label: 'Borrador', color: '#8899BB', bg: 'rgba(136,153,187,.12)' },
  emitida: { label: 'Emitida',  color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
  pagada:  { label: 'Pagada',   color: '#22C55E', bg: 'rgba(34,197,94,.12)'   },
}

const SEV_STATUS: Record<string, { label: string; color: string; bg: string }> = {
  draft:  { label: 'Borrador',  color: '#8899BB', bg: 'rgba(136,153,187,.12)' },
  final:  { label: 'Finalizado',color: '#F59E0B', bg: 'rgba(245,158,11,.12)'  },
  signed: { label: 'Firmado',   color: '#22C55E', bg: 'rgba(34,197,94,.12)'   },
}

const TERMINATION_CAUSES = [
  { value: 'mutuo_acuerdo',   label: 'Mutuo Acuerdo (Art. 159 N°1)'      },
  { value: 'renuncia',        label: 'Renuncia Voluntaria (Art. 159 N°2)' },
  { value: 'termino_plazo',   label: 'Término Plazo Fijo (Art. 159 N°4)'  },
  { value: 'termino_obra',    label: 'Término Obra/Faena (Art. 159 N°5)'  },
  { value: 'articulo_160',    label: 'Causal de Despido (Art. 160)'        },
  { value: 'articulo_161_1',  label: 'Necesidades de Empresa (Art. 161)'  },
  { value: 'articulo_161_2',  label: 'Desahucio (Art. 161 inc. 2)'        },
  { value: 'otro',            label: 'Otra causal'                         },
]

const ITEM_TYPES = [
  { value: 'haber_imponible',    label: '➕ Haber Imponible'    },
  { value: 'haber_no_imponible', label: '➕ Haber No Imponible' },
  { value: 'descuento',          label: '➖ Descuento'          },
]

const HABER_PRESETS = [
  { label: 'Horas Extra',              type: 'haber_imponible'    },
  { label: 'Bono Desempeño',           type: 'haber_imponible'    },
  { label: 'Comisión',                 type: 'haber_imponible'    },
  { label: 'Gratificación Legal',      type: 'haber_imponible'    },
  { label: 'Asignación de Colación',   type: 'haber_no_imponible' },
  { label: 'Asignación de Movilización',type:'haber_no_imponible' },
  { label: 'Bono No Imponible',        type: 'haber_no_imponible' },
  { label: 'Anticipo',                 type: 'descuento'          },
  { label: 'Cuota Préstamo',           type: 'descuento'          },
  { label: 'Descuento Varios',         type: 'descuento'          },
]

// ============================================================
// PAYROLL CALCULATION (pure function — module level)
// ============================================================
function calcPayroll(
  baseSalary: number,
  items: PayrollItem[],
  params: PayrollParams,
  contractType: string
) {
  const habImpon   = items.filter(i => i.type === 'haber_imponible').reduce((s, i) => s + (i.amount || 0), 0)
  const habNoImpon = items.filter(i => i.type === 'haber_no_imponible').reduce((s, i) => s + (i.amount || 0), 0)
  const descOtros  = items.filter(i => i.type === 'descuento').reduce((s, i) => s + (i.amount || 0), 0)

  const totalImponible   = baseSalary + habImpon
  const totalNoImponible = habNoImpon
  const totalBruto       = totalImponible + totalNoImponible

  const descAfp       = Math.round(totalImponible * (params.afp_rate_worker || 0))
  const descSalud     = Math.round(totalImponible * (params.health_rate || 0))
  const descCesantia  = Math.round(totalImponible * (params.cesantia_worker || 0))
  const totalDescLeg  = descAfp + descSalud + descCesantia

  const totalLiquido  = totalBruto - totalDescLeg - descOtros

  const costoSIS        = Math.round(totalImponible * (params.sis_rate || 0))
  const costoMutual     = Math.round(totalImponible * (params.mutual_rate || 0))
  const isFijo          = ['plazo_fijo','obra_faena','temporada','aprendizaje'].includes(contractType)
  const costoCesantiaEmp= Math.round(totalImponible * (isFijo ? (params.cesantia_employer_fixed || 0) : (params.cesantia_employer_indef || 0)))
  const costoEmpresa    = totalBruto + costoSIS + costoCesantiaEmp + costoMutual

  return {
    total_imponible: totalImponible, total_no_imponible: totalNoImponible,
    total_bruto: totalBruto, descuento_afp: descAfp, descuento_salud: descSalud,
    descuento_cesantia: descCesantia, total_descuentos_legales: totalDescLeg,
    total_descuentos_otros: descOtros, total_liquido: totalLiquido,
    costo_sis: costoSIS, costo_cesantia_empresa: costoCesantiaEmp,
    costo_mutual: costoMutual, costo_total_empresa: costoEmpresa,
  }
}

// ============================================================
// INLINE STYLES
// ============================================================
const inp: React.CSSProperties = {
  width:'100%', background:'#1E2A3A', border:'1px solid rgba(93,224,230,.2)',
  borderRadius:8, padding:'8px 12px', color:'#F0F4FF', fontSize:13, boxSizing:'border-box',
}
const lbl: React.CSSProperties = { fontSize:11, color:'#8899BB', display:'block', marginBottom:4 }

// ============================================================
// NEW PERIOD MODAL
// ============================================================
interface NewPeriodModalProps {
  company: Company
  onClose: () => void
  onSave: () => void
  Sbtn: React.CSSProperties
}

function NewPeriodModal({ company, onClose, onSave, Sbtn }: NewPeriodModalProps) {
  const [year,  setYear]  = useState(CUR_YEAR)
  const [month, setMonth] = useState(CUR_MONTH)
  const [notes, setNotes] = useState('')
  const [saving, setSaving] = useState(false)
  const [error,  setError]  = useState('')

  async function save() {
    setSaving(true); setError('')
    const { data, error: e } = await supabase.rpc('upsert_payroll_period', {
      p_data: { company_id: company.id, period_year: year, period_month: month, notes: notes || null },
    })
    setSaving(false)
    if (e || !data?.success) { setError(e?.message || data?.error || 'Error al crear período'); return }
    onSave()
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.75)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:16, padding:28, width:'min(400px,96vw)' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div style={{ fontSize:15, fontWeight:800 }}>Nuevo Período de Nómina</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22, lineHeight:1 }}>×</button>
        </div>
        {error && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 12px', marginBottom:14, color:'#EF4444', fontSize:12 }}>{error}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:14 }}>
          <div>
            <label style={lbl}>Mes</label>
            <select value={month} onChange={e => setMonth(Number(e.target.value))} style={inp}>
              {MONTHS.map((m, i) => <option key={i + 1} value={i + 1}>{m}</option>)}
            </select>
          </div>
          <div>
            <label style={lbl}>Año</label>
            <input type='number' value={year} onChange={e => setYear(Number(e.target.value))} style={inp} />
          </div>
        </div>
        <div style={{ marginBottom:14 }}>
          <label style={lbl}>Notas (opcional)</label>
          <input value={notes} onChange={e => setNotes(e.target.value)} placeholder='Ej: período con aguinaldo' style={inp} />
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ ...Sbtn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'8px 18px', fontSize:12 }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 22px', fontSize:12 }}>
            {saving ? 'Creando...' : 'Crear período'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PAYROLL DOCUMENT MODAL
// ============================================================
interface PayrollDocModalProps {
  period: PayrollPeriod
  company: Company
  doc: PayrollDocument | null
  employees: Employee[]
  params: PayrollParams
  onClose: () => void
  onSave: () => void
  Sbtn: React.CSSProperties
}

function PayrollDocModal({ period, company, doc, employees, params, onClose, onSave, Sbtn }: PayrollDocModalProps) {
  const [empId,     setEmpId]     = useState(doc?.employee_id ?? '')
  const [empCond,   setEmpCond]   = useState<EmployeeConditions | null>(null)
  const [baseSalary,setBaseSalary]= useState(doc?.base_salary?.toString() ?? '')
  const [items,     setItems]     = useState<PayrollItem[]>(doc?.items ?? [])
  const [newLabel,  setNewLabel]  = useState('')
  const [newType,   setNewType]   = useState<PayrollItem['type']>('haber_no_imponible')
  const [newAmount, setNewAmount] = useState('')
  const [loading,   setLoading]   = useState(false)
  const [saving,    setSaving]    = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiText,    setAiText]    = useState('')
  const [error,     setError]     = useState('')

  const base = parseFloat(baseSalary) || 0
  const calc  = calcPayroll(base, items, params, empCond?.contract_type || 'indefinido')

  async function loadCond(id: string) {
    setLoading(true)
    const periodDate = `${period.period_year}-${String(period.period_month).padStart(2,'0')}-01`
    const { data } = await supabase.rpc('get_employee_current_conditions', {
      p_company_id:  company.id,
      p_employee_id: id,
      p_as_of_date:  periodDate,
    })
    setLoading(false)
    if (data && data.length > 0) {
      const c = data[0] as EmployeeConditions
      setEmpCond(c)
      if (!doc) {
        setBaseSalary(c.base_salary?.toString() ?? '')
      }
    }
  }

  function pickEmp(id: string) {
    setEmpId(id)
    if (id) loadCond(id)
    else { setEmpCond(null); setBaseSalary('') }
  }

  function addItem() {
    if (!newLabel || !newAmount) return
    const item: PayrollItem = {
      id: Math.random().toString(36).slice(2),
      label: newLabel, type: newType, amount: parseFloat(newAmount) || 0,
    }
    setItems(prev => [...prev, item])
    setNewLabel(''); setNewAmount('')
  }

  function removeItem(id: string) {
    setItems(prev => prev.filter(i => i.id !== id))
  }

  function applyPreset(preset: { label: string; type: string }) {
    setNewLabel(preset.label)
    setNewType(preset.type as PayrollItem['type'])
  }

  async function save() {
    if (!empId) { setError('Selecciona un empleado.'); return }
    if (base <= 0) { setError('Ingresa el sueldo base.'); return }
    setSaving(true); setError('')
    const emp = empCond || employees.find(e => e.id === empId)
    const payload = {
      ...(doc ? { id: doc.id } : {}),
      company_id:    company.id,
      period_id:     period.id,
      employee_id:   empId,
      employee_name: (emp as EmployeeConditions)?.employee_name || ((emp as Employee)?.first_name + ' ' + (emp as Employee)?.last_name),
      employee_rut:  (emp as EmployeeConditions)?.employee_rut || (emp as Employee)?.rut,
      position:      (emp as EmployeeConditions)?.position,
      department:    (emp as EmployeeConditions)?.department,
      contract_type: (emp as EmployeeConditions)?.contract_type || 'indefinido',
      hours_per_week:(emp as EmployeeConditions)?.hours_per_week || 45,
      hire_date:     (emp as EmployeeConditions)?.hire_date || null,
      base_salary:   base,
      items:         items,
      ...calc,
      status: doc?.status ?? 'draft',
    }
    const { data, error: e } = await supabase.rpc('upsert_payroll_document', { p_data: payload })
    setSaving(false)
    if (e || !data?.success) { setError(e?.message || data?.error || 'Error al guardar'); return }
    onSave()
  }

  async function genAI() {
    if (!empId || !base) { setError('Completa empleado y sueldo base primero.'); return }
    setAiLoading(true); setError('')
    try {
      const docForAI = { ...calc, base_salary: base, items, employee_name: empCond?.employee_name, employee_rut: empCond?.employee_rut, position: empCond?.position, contract_type: empCond?.contract_type, hours_per_week: empCond?.hours_per_week }
      const res = await fetch('/api/ai/remuneraciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'explain_liquidacion', payload: { doc: docForAI, period, company } }),
      })
      const r = await res.json()
      if (r.resumen) {
        const text = [
          r.resumen,
          r.haberes_explicacion && `\n\nHABERES:\n${r.haberes_explicacion}`,
          r.descuentos_explicacion && `\n\nDESCUENTOS:\n${r.descuentos_explicacion}`,
          r.liquido_explicacion && `\n\nLÍQUIDO:\n${r.liquido_explicacion}`,
          r.observaciones?.length > 0 && `\n\nOBSERVACIONES:\n${r.observaciones.join('\n')}`,
        ].filter(Boolean).join('')
        setAiText(text)
      } else setError(r.error || 'Error al generar')
    } catch { setError('Error de red') }
    setAiLoading(false)
  }

  const colTot:  React.CSSProperties = { fontSize:11, color:'#8899BB', textAlign:'right' as const }
  const colVal:  React.CSSProperties = { fontSize:13, fontWeight:700, color:'#F0F4FF', textAlign:'right' as const }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:16, padding:28, width:'min(800px,97vw)', maxHeight:'93vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800 }}>{doc ? 'Editar Liquidación' : 'Nueva Liquidación'}</div>
            <div style={{ fontSize:11, color:'#8899BB' }}>{MONTHS[period.period_month - 1]} {period.period_year}</div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22 }}>×</button>
        </div>

        {error && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 12px', marginBottom:14, color:'#EF4444', fontSize:12 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
          {/* Empleado */}
          <div style={{ gridColumn:'1/-1' }}>
            <label style={lbl}>Empleado *</label>
            <select value={empId} onChange={e => pickEmp(e.target.value)} style={inp} disabled={!!doc}>
              <option value=''>— Seleccionar empleado —</option>
              {employees.filter(e => e.is_active).map(e => (
                <option key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.rut ? ` (${e.rut})` : ''}</option>
              ))}
            </select>
            {loading && <div style={{ fontSize:11, color:'#5DE0E6', marginTop:4 }}>Cargando condiciones del contrato...</div>}
          </div>

          {empCond && (
            <div style={{ gridColumn:'1/-1', background:'rgba(93,224,230,.04)', border:'1px solid rgba(93,224,230,.1)', borderRadius:8, padding:'10px 14px', display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:8 }}>
              {[
                { l:'Cargo',           v: empCond.position || '—' },
                { l:'Tipo contrato',   v: empCond.contract_type   },
                { l:'Horas/semana',    v: `${empCond.hours_per_week}h` },
                { l:'Ingreso',         v: fmtDate(empCond.hire_date) },
              ].map(f => (
                <div key={f.l}>
                  <div style={{ fontSize:9, color:'#8899BB' }}>{f.l}</div>
                  <div style={{ fontSize:12, fontWeight:700 }}>{f.v}</div>
                </div>
              ))}
            </div>
          )}

          <div>
            <label style={lbl}>Sueldo base (del contrato) *</label>
            <input type='number' value={baseSalary} onChange={e => setBaseSalary(e.target.value)} placeholder='500000' style={inp} />
          </div>
          <div style={{ display:'flex', alignItems:'flex-end', paddingBottom:2 }}>
            <div style={{ fontSize:11, color:'#8899BB' }}>
              {empCond && `Contrato: ${fmt(empCond.base_salary)}`}
              {empCond?.salary_annex_id && <span style={{ color:'#F59E0B', marginLeft:6 }}>✔ Actualizado por anexo</span>}
            </div>
          </div>
        </div>

        {/* Ítems adicionales */}
        <div style={{ marginBottom:20 }}>
          <div style={{ fontSize:12, fontWeight:700, color:'#8899BB', marginBottom:10, textTransform:'uppercase', letterSpacing:'.5px' }}>Haberes y Descuentos Adicionales</div>

          {/* Presets */}
          <div style={{ display:'flex', gap:6, flexWrap:'wrap', marginBottom:10 }}>
            {HABER_PRESETS.map(p => (
              <button key={p.label} onClick={() => applyPreset(p)} style={{ background:'rgba(93,224,230,.06)', border:'1px solid rgba(93,224,230,.15)', borderRadius:6, padding:'3px 10px', color:'#8899BB', fontSize:10, cursor:'pointer' }}>
                {p.label}
              </button>
            ))}
          </div>

          {/* Add item row */}
          <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr auto', gap:8, marginBottom:10 }}>
            <input value={newLabel} onChange={e => setNewLabel(e.target.value)} placeholder='Descripción' style={{ ...inp, fontSize:12 }} />
            <select value={newType} onChange={e => setNewType(e.target.value as PayrollItem['type'])} style={{ ...inp, fontSize:12 }}>
              {ITEM_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
            </select>
            <input type='number' value={newAmount} onChange={e => setNewAmount(e.target.value)} placeholder='Monto CLP' style={{ ...inp, fontSize:12 }} />
            <button onClick={addItem} disabled={!newLabel || !newAmount} style={{ ...Sbtn, background:'rgba(93,224,230,.12)', border:'1px solid rgba(93,224,230,.3)', color:'#5DE0E6', padding:'8px 14px', fontSize:12 }}>+</button>
          </div>

          {/* Items list */}
          {items.length > 0 && (
            <div style={{ background:'#0D1926', borderRadius:8, overflow:'hidden' }}>
              {items.map(item => {
                const colors = { haber_imponible: '#22C55E', haber_no_imponible: '#5DE0E6', descuento: '#EF4444' }
                const c = colors[item.type]
                return (
                  <div key={item.id} style={{ display:'flex', alignItems:'center', gap:10, padding:'8px 14px', borderBottom:'1px solid rgba(93,224,230,.07)' }}>
                    <span style={{ color:c, fontSize:10, fontWeight:700, width:120, flexShrink:0 }}>
                      {ITEM_TYPES.find(t => t.value === item.type)?.label}
                    </span>
                    <span style={{ flex:1, fontSize:12 }}>{item.label}</span>
                    <span style={{ color:c, fontSize:12, fontWeight:700, flexShrink:0 }}>{item.type === 'descuento' ? '–' : '+'}{fmt(item.amount)}</span>
                    <button onClick={() => removeItem(item.id)} style={{ background:'none', border:'none', color:'#EF4444', cursor:'pointer', fontSize:14, padding:'0 4px' }}>×</button>
                  </div>
                )
              })}
            </div>
          )}
        </div>

        {/* CALCULADORA */}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:16, marginBottom:20 }}>
          {/* Haberes */}
          <div style={{ background:'#0D1926', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#8899BB', marginBottom:10, textTransform:'uppercase', letterSpacing:'.5px' }}>Haberes</div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:12, color:'#C8D4E8' }}>Sueldo base</span>
              <span style={{ fontSize:12, fontWeight:700 }}>{fmt(base)}</span>
            </div>
            {items.filter(i => i.type !== 'descuento').map(i => (
              <div key={i.id} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:11, color:'#8899BB' }}>{i.label} {i.type === 'haber_no_imponible' ? '(no imp.)' : '(imp.)'}</span>
                <span style={{ fontSize:11, color: i.type === 'haber_imponible' ? '#22C55E' : '#5DE0E6' }}>{fmt(i.amount)}</span>
              </div>
            ))}
            <div style={{ borderTop:'1px solid rgba(93,224,230,.1)', marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between' }}>
              <span style={colTot}>Total bruto</span>
              <span style={{ ...colVal, color:'#5DE0E6' }}>{fmt(calc.total_bruto)}</span>
            </div>
          </div>

          {/* Descuentos + Líquido */}
          <div style={{ background:'#0D1926', borderRadius:10, padding:'14px 16px' }}>
            <div style={{ fontSize:11, fontWeight:700, color:'#8899BB', marginBottom:10, textTransform:'uppercase', letterSpacing:'.5px' }}>Descuentos Legales</div>
            {[
              { l:`AFP (${pct(params.afp_rate_worker)})`, v: calc.descuento_afp },
              { l:`Salud (${pct(params.health_rate)})`,   v: calc.descuento_salud },
              { l:`Cesantía (${pct(params.cesantia_worker)})`, v: calc.descuento_cesantia },
            ].map(r => (
              <div key={r.l} style={{ display:'flex', justifyContent:'space-between', marginBottom:5 }}>
                <span style={{ fontSize:11, color:'#8899BB' }}>{r.l}</span>
                <span style={{ fontSize:11, color:'#EF4444' }}>–{fmt(r.v)}</span>
              </div>
            ))}
            {items.filter(i => i.type === 'descuento').map(i => (
              <div key={i.id} style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={{ fontSize:11, color:'#8899BB' }}>{i.label}</span>
                <span style={{ fontSize:11, color:'#EF4444' }}>–{fmt(i.amount)}</span>
              </div>
            ))}
            <div style={{ borderTop:'1px solid rgba(93,224,230,.1)', marginTop:8, paddingTop:8 }}>
              <div style={{ display:'flex', justifyContent:'space-between', marginBottom:4 }}>
                <span style={colTot}>Imponible</span>
                <span style={colVal}>{fmt(calc.total_imponible)}</span>
              </div>
              <div style={{ display:'flex', justifyContent:'space-between', background:'rgba(34,197,94,.08)', borderRadius:6, padding:'6px 8px' }}>
                <span style={{ fontSize:13, fontWeight:800, color:'#22C55E' }}>Líquido a pagar</span>
                <span style={{ fontSize:14, fontWeight:800, color:'#22C55E' }}>{fmt(calc.total_liquido)}</span>
              </div>
            </div>
          </div>
        </div>

        {/* Costo empresa */}
        <div style={{ background:'rgba(167,139,250,.06)', border:'1px solid rgba(167,139,250,.15)', borderRadius:8, padding:'10px 14px', marginBottom:20, display:'flex', gap:20, flexWrap:'wrap' }}>
          <div style={{ fontSize:11, color:'#A78BFA', fontWeight:700, minWidth:'100%', marginBottom:4 }}>Costo Total Empresa (estimado)</div>
          {[
            { l:'SIS empleador', v: calc.costo_sis },
            { l:'Cesantía empleador', v: calc.costo_cesantia_empresa },
            { l:'Mutual', v: calc.costo_mutual },
            { l:'TOTAL', v: calc.costo_total_empresa },
          ].map(c => (
            <div key={c.l} style={{ textAlign:'center' as const }}>
              <div style={{ fontSize:10, color:'#8899BB' }}>{c.l}</div>
              <div style={{ fontSize:13, fontWeight:700, color:'#A78BFA' }}>{fmt(c.v)}</div>
            </div>
          ))}
        </div>

        {/* IA */}
        <div style={{ background:'rgba(93,224,230,.04)', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:14, marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#5DE0E6' }}>✨ Explicación con IA</span>
            <button onClick={genAI} disabled={aiLoading || !empId} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
              {aiLoading ? '⏳ Analizando...' : '🤖 Explicar liquidación'}
            </button>
          </div>
          {aiText
            ? <div style={{ fontSize:12, color:'#C8D4E8', lineHeight:1.7, whiteSpace:'pre-wrap' }}>{aiText}</div>
            : <div style={{ fontSize:11, color:'#8899BB' }}>La IA puede explicar esta liquidación en lenguaje simple para el trabajador.</div>
          }
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ ...Sbtn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'8px 20px', fontSize:12 }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 24px', fontSize:12 }}>
            {saving ? 'Guardando...' : 'Guardar liquidación'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PERIOD DETAIL MODAL
// ============================================================
interface PeriodDetailModalProps {
  period: PayrollPeriod
  docs: PayrollDocument[]
  company: Company
  employees: Employee[]
  params: PayrollParams
  onClose: () => void
  onRefresh: () => void
  onAddDoc: () => void
  Sbtn: React.CSSProperties
}

function PeriodDetailModal({ period, docs, company, employees, params, onClose, onRefresh, onAddDoc, Sbtn }: PeriodDetailModalProps) {
  const [acting, setActing] = useState(false)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiInsight, setAiInsight] = useState('')

  const ps = PERIOD_STATUS[period.status] || PERIOD_STATUS.open

  async function closeOrPay(markPaid: boolean) {
    setActing(true)
    await supabase.rpc('close_payroll_period', {
      p_period_id: period.id, p_company_id: company.id, p_mark_paid: markPaid,
    })
    setActing(false)
    onRefresh()
  }

  async function detectIssues() {
    if (docs.length === 0) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/remuneraciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'detect_inconsistencies', payload: { docs, params } }),
      })
      const r = await res.json()
      if (r.issues) {
        setAiInsight((r.has_issues
          ? '⚠ Inconsistencias:\n' + r.issues.join('\n')
          : '✅ Sin inconsistencias detectadas.')
          + (r.suggestions?.length > 0 ? '\n\nSugerencias:\n' + r.suggestions.join('\n') : ''))
      }
    } catch { /* silent */ }
    setAiLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:16, padding:28, width:'min(880px,97vw)', maxHeight:'93vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div>
            <div style={{ fontSize:16, fontWeight:800 }}>
              {MONTHS[period.period_month - 1]} {period.period_year}
              <span style={{ ...ps, marginLeft:10, fontSize:10, padding:'3px 10px', borderRadius:20 }}>{ps.label}</span>
            </div>
            <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>
              {docs.length} liquidaciones · Total líquido: {fmt(period.total_liquido)} · Costo empresa: {fmt(period.costo_empresa)}
            </div>
          </div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22 }}>×</button>
        </div>

        {/* Actions */}
        <div style={{ display:'flex', gap:10, flexWrap:'wrap', marginBottom:20 }}>
          {period.status === 'open' && (
            <button onClick={onAddDoc} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'7px 16px', fontSize:11 }}>
              + Nueva liquidación
            </button>
          )}
          {period.status === 'open' && docs.length > 0 && (
            <button disabled={acting} onClick={() => closeOrPay(false)} style={{ ...Sbtn, background:'rgba(245,158,11,.1)', border:'1px solid rgba(245,158,11,.3)', color:'#F59E0B', padding:'7px 16px', fontSize:11 }}>
              {acting ? '⏳...' : '📋 Emitir nómina'}
            </button>
          )}
          {period.status === 'closed' && (
            <button disabled={acting} onClick={() => closeOrPay(true)} style={{ ...Sbtn, background:'rgba(34,197,94,.1)', border:'1px solid rgba(34,197,94,.3)', color:'#22C55E', padding:'7px 16px', fontSize:11 }}>
              {acting ? '⏳...' : '💸 Marcar como pagada'}
            </button>
          )}
          <button disabled={aiLoading || docs.length === 0} onClick={detectIssues} style={{ ...Sbtn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'7px 16px', fontSize:11 }}>
            {aiLoading ? '⏳...' : '🤖 Detectar inconsistencias'}
          </button>
        </div>

        {aiInsight && (
          <div style={{ background:'rgba(93,224,230,.06)', border:'1px solid rgba(93,224,230,.15)', borderRadius:8, padding:'10px 14px', marginBottom:14, fontSize:12, color:'#C8D4E8', whiteSpace:'pre-wrap' }}>
            {aiInsight}
          </div>
        )}

        {docs.length === 0 ? (
          <div style={{ textAlign:'center' as const, padding:40, color:'#8899BB' }}>
            <div style={{ fontSize:32, marginBottom:8 }}>📋</div>
            <div style={{ marginBottom:16 }}>No hay liquidaciones en este período.</div>
            {period.status === 'open' && (
              <button onClick={onAddDoc} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 20px', fontSize:12 }}>
                Agregar primera liquidación
              </button>
            )}
          </div>
        ) : (
          <div>
            {/* Summary row */}
            <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:10, marginBottom:16 }}>
              {[
                { l:'Total Bruto',      v: period.total_bruto,    c:'#5DE0E6' },
                { l:'Total Líquido',    v: period.total_liquido,  c:'#22C55E' },
                { l:'Costo Empresa',    v: period.costo_empresa,  c:'#A78BFA' },
                { l:'Trabajadores',     v: period.employee_count, c:'#F59E0B', isCnt: true },
              ].map(s => (
                <div key={s.l} style={{ background:'#0D1926', borderRadius:8, padding:'10px 12px' }}>
                  <div style={{ fontSize:10, color:'#8899BB', marginBottom:3 }}>{s.l}</div>
                  <div style={{ fontSize:16, fontWeight:800, color:s.c }}>{s.isCnt ? s.v : fmt(Number(s.v))}</div>
                </div>
              ))}
            </div>

            {/* Table */}
            <div style={{ background:'#0D1926', borderRadius:10, overflow:'hidden' }}>
              <div style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px', gap:0, background:'#0A1628', padding:'8px 14px' }}>
                {['Empleado','Bruto','AFP+Salud+Ces.','Líquido','Estado',''].map(h => (
                  <div key={h} style={{ fontSize:10, fontWeight:700, color:'#8899BB', textTransform:'uppercase' as const, letterSpacing:'.5px', textAlign: h === '' ? 'center' as const : 'left' as const }}>{h}</div>
                ))}
              </div>
              {docs.map(d => {
                const ds = DOC_STATUS[d.status] || DOC_STATUS.draft
                return (
                  <div key={d.id} style={{ display:'grid', gridTemplateColumns:'2fr 1fr 1fr 1fr 1fr 80px', gap:0, padding:'10px 14px', borderTop:'1px solid rgba(93,224,230,.07)', alignItems:'center' }}>
                    <div>
                      <div style={{ fontSize:13, fontWeight:700 }}>{d.employee_name}</div>
                      <div style={{ fontSize:10, color:'#8899BB' }}>{d.position || '—'} · {d.contract_type}</div>
                    </div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{fmt(d.total_bruto)}</div>
                    <div style={{ fontSize:12, color:'#EF4444' }}>–{fmt(d.total_descuentos_legales)}</div>
                    <div style={{ fontSize:13, fontWeight:800, color:'#22C55E' }}>{fmt(d.total_liquido)}</div>
                    <span style={{ background:ds.bg, color:ds.color, fontSize:10, fontWeight:700, padding:'3px 8px', borderRadius:20, width:'fit-content' }}>{ds.label}</span>
                    <div style={{ fontSize:10, color:'#8899BB', textAlign:'center' as const }}>{fmt(d.costo_total_empresa)}</div>
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
// SEVERANCE MODAL
// ============================================================
interface SeveranceModalProps {
  company: Company
  employees: Employee[]
  sev: SeveranceDoc | null
  onClose: () => void
  onSave: () => void
  Sbtn: React.CSSProperties
}

function SeveranceModal({ company, employees, sev, onClose, onSave, Sbtn }: SeveranceModalProps) {
  const [empId,      setEmpId]      = useState(sev?.employee_id ?? '')
  const [termDate,   setTermDate]   = useState(sev?.termination_date ?? TODAY)
  const [cause,      setCause]      = useState(sev?.termination_cause ?? 'mutuo_acuerdo')
  const [baseSal,    setBaseSal]    = useState(sev?.base_salary?.toString() ?? '')
  const [vacDays,    setVacDays]    = useState(sev?.pending_vacation_days?.toString() ?? '0')
  const [pendDays,   setPendDays]   = useState(sev?.pending_salary_days?.toString() ?? '0')
  const [notes,      setNotes]      = useState(sev?.notes ?? '')
  const [aiLoading,  setAiLoading]  = useState(false)
  const [aiText,     setAiText]     = useState(sev?.ai_draft_text ?? '')
  const [saving,     setSaving]     = useState(false)
  const [error,      setError]      = useState('')

  const emp     = employees.find(e => e.id === empId)
  const base    = parseFloat(baseSal) || 0
  const dailyRate = base / 30

  // Auto-fill when emp changes
  function pickEmp(id: string) {
    setEmpId(id)
    const e = employees.find(x => x.id === id)
    if (e) {
      if (!sev) setBaseSal(e.salary?.toString() ?? '')
    }
  }

  // Calculate severance
  const vacAmount  = Math.round(parseFloat(vacDays)  * dailyRate)
  const pendAmount = Math.round(parseFloat(pendDays) * dailyRate)

  function calcSeveranceMonths(): number {
    if (!emp?.hire_date || !termDate) return 0
    const h = new Date(emp.hire_date)
    const t = new Date(termDate)
    const yrs = (t.getTime() - h.getTime()) / (1000 * 60 * 60 * 24 * 365.25)
    return Math.min(Math.floor(yrs), 11)
  }

  const sevMonths = ['articulo_161_1','articulo_161_2'].includes(cause) ? calcSeveranceMonths() : 0
  const sevAmount = Math.round(sevMonths * base)
  const totalAmount = vacAmount + sevAmount + pendAmount

  async function save(status: string) {
    if (!empId || !termDate) { setError('Empleado y fecha de término son obligatorios.'); return }
    setSaving(true); setError('')
    const payload = {
      ...(sev ? { id: sev.id } : {}),
      company_id:            company.id,
      employee_id:           empId,
      employee_name:         emp ? `${emp.first_name} ${emp.last_name}` : '',
      employee_rut:          emp?.rut || null,
      position:              emp?.position || null,
      hire_date:             emp?.hire_date || null,
      termination_date:      termDate,
      termination_cause:     cause,
      base_salary:           base,
      pending_vacation_days: parseFloat(vacDays) || 0,
      vacation_amount:       vacAmount,
      severance_years:       sevMonths,
      severance_months:      sevMonths,
      severance_amount:      sevAmount,
      pending_salary_days:   parseFloat(pendDays) || 0,
      pending_salary_amount: pendAmount,
      other_items:           [],
      total_amount:          totalAmount,
      status,
      ai_draft_text:         aiText || null,
      notes:                 notes || null,
    }
    const { data, error: e } = await supabase.rpc('upsert_severance_document', { p_data: payload })
    setSaving(false)
    if (e || !data?.success) { setError(e?.message || data?.error || 'Error al guardar'); return }
    onSave()
  }

  async function genFiniquito() {
    if (!empId) { setError('Selecciona un empleado primero.'); return }
    setAiLoading(true); setError('')
    try {
      const sevData = {
        employee_name: emp ? `${emp.first_name} ${emp.last_name}` : '',
        employee_rut: emp?.rut, position: emp?.position,
        hire_date: emp?.hire_date, termination_date: termDate,
        termination_cause: cause, base_salary: base,
        pending_vacation_days: parseFloat(vacDays) || 0,
        vacation_amount: vacAmount, severance_months: sevMonths,
        severance_amount: sevAmount, pending_salary_days: parseFloat(pendDays) || 0,
        pending_salary_amount: pendAmount, total_amount: totalAmount, notes,
      }
      const res = await fetch('/api/ai/remuneraciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'generate_finiquito', payload: { sev: sevData, company } }),
      })
      const r = await res.json()
      if (r.document_text) setAiText(r.document_text)
      else setError(r.error || 'Error al generar')
    } catch { setError('Error de red') }
    setAiLoading(false)
  }

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(167,139,250,.2)', borderRadius:16, padding:28, width:'min(740px,97vw)', maxHeight:'93vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
          <div style={{ fontSize:15, fontWeight:800 }}>{sev ? 'Editar Finiquito' : 'Nuevo Finiquito'}</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22 }}>×</button>
        </div>

        {error && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 12px', marginBottom:14, color:'#EF4444', fontSize:12 }}>{error}</div>}

        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:20 }}>
          <div style={{ gridColumn:'1/-1' }}>
            <label style={lbl}>Empleado *</label>
            <select value={empId} onChange={e => pickEmp(e.target.value)} style={inp}>
              <option value=''>— Seleccionar empleado —</option>
              {employees.map(e => <option key={e.id} value={e.id}>{e.first_name} {e.last_name}{e.rut ? ` (${e.rut})` : ''}</option>)}
            </select>
            {emp && <div style={{ fontSize:11, color:'#8899BB', marginTop:4 }}>Ingreso: {fmtDate(emp.hire_date)} · {emp.contract_type} · {emp.position || '—'}</div>}
          </div>

          <div>
            <label style={lbl}>Fecha de término *</label>
            <input type='date' value={termDate} onChange={e => setTermDate(e.target.value)} style={inp} />
          </div>

          <div>
            <label style={lbl}>Causal de término</label>
            <select value={cause} onChange={e => setCause(e.target.value)} style={inp}>
              {TERMINATION_CAUSES.map(c => <option key={c.value} value={c.value}>{c.label}</option>)}
            </select>
          </div>

          <div>
            <label style={lbl}>Sueldo base (último mes)</label>
            <input type='number' value={baseSal} onChange={e => setBaseSal(e.target.value)} placeholder='500000' style={inp} />
          </div>

          <div>
            <label style={lbl}>Días de vacaciones pendientes</label>
            <input type='number' value={vacDays} onChange={e => setVacDays(e.target.value)} style={inp} />
          </div>

          <div>
            <label style={lbl}>Días trabajados del mes en curso</label>
            <input type='number' value={pendDays} onChange={e => setPendDays(e.target.value)} style={inp} />
          </div>

          <div style={{ gridColumn:'1/-1' }}>
            <label style={lbl}>Notas / observaciones</label>
            <textarea value={notes} onChange={e => setNotes(e.target.value)} rows={2} style={{ ...inp, resize:'vertical' }} />
          </div>
        </div>

        {/* Resumen finiquito */}
        <div style={{ background:'#0D1926', borderRadius:10, padding:'14px 16px', marginBottom:20 }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#8899BB', marginBottom:10, textTransform:'uppercase', letterSpacing:'.5px' }}>Cálculo del Finiquito</div>
          {[
            { l:`Vacaciones pendientes (${vacDays} días)`, v: vacAmount, show: parseFloat(vacDays) > 0 },
            { l:`Indemnización (${sevMonths} meses) Art. 161`, v: sevAmount, show: sevMonths > 0 },
            { l:`Días trabajados mes corriente (${pendDays} días)`, v: pendAmount, show: parseFloat(pendDays) > 0 },
          ].filter(r => r.show).map(r => (
            <div key={r.l} style={{ display:'flex', justifyContent:'space-between', marginBottom:6 }}>
              <span style={{ fontSize:12, color:'#C8D4E8' }}>{r.l}</span>
              <span style={{ fontSize:12, fontWeight:700 }}>{fmt(r.v)}</span>
            </div>
          ))}
          {['articulo_161_1','articulo_161_2'].includes(cause) && sevMonths === 0 && emp?.hire_date && (
            <div style={{ fontSize:11, color:'#8899BB', marginBottom:6 }}>Sin indemnización (antigüedad {'<'} 1 año)</div>
          )}
          <div style={{ borderTop:'1px solid rgba(93,224,230,.1)', marginTop:8, paddingTop:8, display:'flex', justifyContent:'space-between' }}>
            <span style={{ fontSize:14, fontWeight:800, color:'#A78BFA' }}>Total Finiquito</span>
            <span style={{ fontSize:16, fontWeight:800, color:'#A78BFA' }}>{fmt(totalAmount)}</span>
          </div>
        </div>

        {/* IA */}
        <div style={{ background:'rgba(93,224,230,.04)', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:14, marginBottom:20 }}>
          <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:8 }}>
            <span style={{ fontSize:11, fontWeight:700, color:'#5DE0E6' }}>✨ Finiquito con IA</span>
            <button onClick={genFiniquito} disabled={aiLoading || !empId} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'5px 14px', fontSize:11 }}>
              {aiLoading ? '⏳ Redactando...' : '🤖 Generar finiquito'}
            </button>
          </div>
          {aiText
            ? <textarea value={aiText} onChange={e => setAiText(e.target.value)} rows={12} style={{ ...inp, fontFamily:'monospace', fontSize:11, background:'#0D1926', resize:'vertical' }} />
            : <div style={{ fontSize:11, color:'#8899BB' }}>Haz clic en &ldquo;Generar finiquito&rdquo; para redactar el documento legal con IA.</div>
          }
        </div>

        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ ...Sbtn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'8px 18px', fontSize:12 }}>Cancelar</button>
          <button onClick={() => save('draft')} disabled={saving} style={{ ...Sbtn, background:'rgba(136,153,187,.1)', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'8px 18px', fontSize:12 }}>
            Guardar borrador
          </button>
          <button onClick={() => save('final')} disabled={saving} style={{ ...Sbtn, background:'linear-gradient(90deg,#7C3AED,#A78BFA)', color:'#fff', padding:'8px 22px', fontSize:12 }}>
            {saving ? 'Guardando...' : 'Finalizar finiquito'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PARAMS MODAL
// ============================================================
interface ParamsModalProps {
  company: Company
  params: PayrollParams
  onClose: () => void
  onSave: (p: PayrollParams) => void
  Sbtn: React.CSSProperties
}

function ParamsModal({ company, params, onClose, onSave, Sbtn }: ParamsModalProps) {
  const [form, setForm] = useState({ ...params })
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState('')

  function set(key: keyof PayrollParams, val: string) {
    setForm(f => ({ ...f, [key]: parseFloat(val) || 0 }))
  }

  async function save() {
    setSaving(true); setError('')
    const { data, error: e } = await supabase.rpc('upsert_payroll_params', {
      p_data: { ...form, company_id: company.id },
    })
    setSaving(false)
    if (e || !data?.success) { setError(e?.message || data?.error || 'Error al guardar'); return }
    onSave(form)
    onClose()
  }

  const pFields: { key: keyof PayrollParams; label: string; format: 'pct' | 'clp' }[] = [
    { key: 'afp_rate_worker',        label: 'AFP (tasa trabajador)',               format: 'pct' },
    { key: 'sis_rate',               label: 'SIS (tasa empleador)',                format: 'pct' },
    { key: 'health_rate',            label: 'Salud (tasa trabajador)',             format: 'pct' },
    { key: 'cesantia_worker',        label: 'Cesantía (tasa trabajador)',           format: 'pct' },
    { key: 'cesantia_employer_indef',label: 'Cesantía empleador (indefinido)',     format: 'pct' },
    { key: 'cesantia_employer_fixed',label: 'Cesantía empleador (plazo fijo)',     format: 'pct' },
    { key: 'mutual_rate',            label: 'Mutual de Seguridad (tasa base)',     format: 'pct' },
    { key: 'minimum_wage',           label: 'Salario Mínimo (IMM)',                format: 'clp' },
    { key: 'utm_value',              label: 'UTM vigente',                         format: 'clp' },
  ]

  return (
    <div style={{ position:'fixed', inset:0, background:'rgba(0,0,0,.78)', display:'flex', alignItems:'center', justifyContent:'center', zIndex:1000 }}>
      <div style={{ background:'#111827', border:'1px solid rgba(93,224,230,.15)', borderRadius:16, padding:28, width:'min(540px,96vw)', maxHeight:'90vh', overflowY:'auto' }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:22 }}>
          <div style={{ fontSize:15, fontWeight:800 }}>⚙️ Parámetros Previsionales</div>
          <button onClick={onClose} style={{ background:'none', border:'none', color:'#8899BB', cursor:'pointer', fontSize:22 }}>×</button>
        </div>
        <div style={{ fontSize:11, color:'#8899BB', marginBottom:16 }}>
          Actualiza estos valores según las tasas vigentes de AFP, Isapre/Fonasa e indicadores del SII. Los cambios aplican a nuevas liquidaciones.
        </div>
        {error && <div style={{ background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.3)', borderRadius:8, padding:'8px 12px', marginBottom:14, color:'#EF4444', fontSize:12 }}>{error}</div>}
        <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:12, marginBottom:20 }}>
          {pFields.map(f => (
            <div key={String(f.key)}>
              <label style={lbl}>{f.label}</label>
              <div style={{ position:'relative' }}>
                <input
                  type='number' step={f.format === 'pct' ? '0.0001' : '1'}
                  value={f.format === 'pct' ? (Number(form[f.key]) * 100).toFixed(4) : String(form[f.key])}
                  onChange={e => set(f.key, f.format === 'pct' ? String(parseFloat(e.target.value) / 100) : e.target.value)}
                  style={{ ...inp, paddingRight: f.format === 'pct' ? 32 : 12 }}
                />
                {f.format === 'pct' && <span style={{ position:'absolute', right:10, top:'50%', transform:'translateY(-50%)', fontSize:12, color:'#8899BB' }}>%</span>}
              </div>
            </div>
          ))}
        </div>
        <div style={{ display:'flex', gap:10, justifyContent:'flex-end' }}>
          <button onClick={onClose} style={{ ...Sbtn, background:'transparent', border:'1px solid rgba(136,153,187,.3)', color:'#8899BB', padding:'8px 18px', fontSize:12 }}>Cancelar</button>
          <button onClick={save} disabled={saving} style={{ ...Sbtn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 22px', fontSize:12 }}>
            {saving ? 'Guardando...' : 'Guardar parámetros'}
          </button>
        </div>
      </div>
    </div>
  )
}

// ============================================================
// PAGE
// ============================================================
export default function RemuneracionesPage() {
  const router = useRouter()
  const [user,      setUser]      = useState<User | null>(null)
  const [company,   setCompany]   = useState<Company | null>(null)
  const [loading,   setLoading]   = useState(true)
  const [tab,       setTab]       = useState<'periodos'|'finiquitos'|'reporte'>('periodos')

  const [periods,   setPeriods]   = useState<PayrollPeriod[]>([])
  const [docs,      setDocs]      = useState<PayrollDocument[]>([])
  const [sevDocs,   setSevDocs]   = useState<SeveranceDoc[]>([])
  const [employees, setEmployees] = useState<Employee[]>([])
  const [params,    setParams]    = useState<PayrollParams | null>(null)

  const [selPeriod,    setSelPeriod]    = useState<PayrollPeriod | null>(null)
  const [showNewPeriod,setShowNewPeriod]= useState(false)
  const [showPayDoc,   setShowPayDoc]   = useState(false)
  const [showSeverance,setShowSeverance]= useState(false)
  const [showParams,   setShowParams]   = useState(false)
  const [editSev,      setEditSev]      = useState<SeveranceDoc | null>(null)

  const [aiSummary,    setAiSummary]    = useState('')
  const [aiLoading,    setAiLoading]    = useState(false)

  // ── Loaders ──

  async function loadPeriods(cid: string) {
    const { data } = await supabase.rpc('get_payroll_periods', { p_company_id: cid })
    if (data) setPeriods(data as PayrollPeriod[])
  }

  async function loadDocs(cid: string, pid?: string) {
    const { data } = await supabase.rpc('get_payroll_documents', {
      p_company_id: cid, p_period_id: pid ?? null,
    })
    if (data) setDocs(data as PayrollDocument[])
  }

  async function loadSevDocs(cid: string) {
    const { data } = await supabase.rpc('get_severance_documents', { p_company_id: cid })
    if (data) setSevDocs(data as SeveranceDoc[])
  }

  async function loadEmployees(cid: string) {
    const { data } = await supabase.rpc('get_employees', { p_company_id: cid })
    if (data) setEmployees(data as Employee[])
  }

  async function loadParams(cid: string) {
    const { data } = await supabase.rpc('get_payroll_params', { p_company_id: cid })
    if (data && !data.error) setParams(data as PayrollParams)
  }

  // ── Init ──
  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      if (!ctx.isSuperAdmin && !['admin','owner'].includes(ctx.user.role)) { router.push('/dashboard'); return }
      setUser(ctx.user as any)
      const { data: c } = await supabase.from('companies').select('id,name,rut,industry').eq('id', ctx.companyId).single()
      if (c) setCompany(c as Company)
      await Promise.all([
        loadPeriods(ctx.companyId),
        loadDocs(ctx.companyId),
        loadSevDocs(ctx.companyId),
        loadEmployees(ctx.companyId),
        loadParams(ctx.companyId),
      ])
      setLoading(false)
    }
    init()
  }, []) // eslint-disable-line react-hooks/exhaustive-deps

  function refresh() {
    if (!company) return
    loadPeriods(company.id)
    loadDocs(company.id)
    loadSevDocs(company.id)
  }

  async function genExecutiveSummary() {
    const closedPeriods = periods.filter(p => p.status !== 'open').slice(0, 6)
    if (closedPeriods.length === 0) return
    setAiLoading(true)
    try {
      const res = await fetch('/api/ai/remuneraciones', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action: 'payroll_executive_summary', payload: { periods: closedPeriods, company } }),
      })
      const r = await res.json()
      if (r.resumen) {
        const text = [
          r.resumen,
          r.alertas?.length > 0 && '\n\nAlertas:\n' + r.alertas.join('\n'),
          r.recomendaciones?.length > 0 && '\n\nRecomendaciones:\n' + r.recomendaciones.join('\n'),
        ].filter(Boolean).join('')
        setAiSummary(text)
      }
    } catch { /* silent */ }
    setAiLoading(false)
  }

  // Filtered period docs
  const periodDocs = selPeriod ? docs.filter(d => d.period_id === selPeriod.id) : []

  // Report: last 12 months from closed/paid periods
  const reportPeriods = periods.filter(p => p.status !== 'open').slice(0, 12).reverse()

  if (loading) return (
    <div style={{ minHeight:'100vh', background:'#0A1628', display:'flex', alignItems:'center', justifyContent:'center', color:'#5DE0E6', fontFamily:'Montserrat,sans-serif' }}>
      ⏳ Cargando remuneraciones...
    </div>
  )

  const S: Record<string, React.CSSProperties> = {
    page:   { minHeight:'100vh', background:'var(--mp-bg, #0A1628)', fontFamily:'Montserrat,sans-serif', color:'var(--mp-text, #F0F4FF)', display:'flex', flexDirection:'column' },
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
        <span style={{ fontWeight:800, fontSize:13 }}>Remuneraciones</span>
        <span style={{ fontSize:11, color:'#8899BB' }}>{company?.name}</span>
        {user?.role && (
          <span style={{ fontSize:9, fontWeight:700, padding:'2px 7px', borderRadius:20, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.15)', color:'#5DE0E6', textTransform:'uppercase' as const, letterSpacing:'.05em' }}>
            {user.role}
          </span>
        )}
        <div style={{ flex:1 }} />
        <button onClick={() => router.push('/contratos')} style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'4px 12px', fontSize:11 }}>
          📄 Contratos
        </button>
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
            <div style={{ fontSize:20, fontWeight:800 }}>💼 Remuneraciones</div>
            <div style={{ fontSize:12, color:'#8899BB', marginTop:2 }}>Liquidaciones, nómina mensual y finiquitos</div>
          </div>
          <div style={{ display:'flex', gap:8 }}>
            <button onClick={() => setShowParams(true)} style={{ ...S.btn, background:'rgba(136,153,187,.08)', border:'1px solid rgba(136,153,187,.2)', color:'#8899BB', padding:'7px 14px', fontSize:11 }}>
              ⚙️ Parámetros AFP/Salud
            </button>
            <button onClick={() => setShowNewPeriod(true)} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'8px 18px', fontSize:12 }}>
              + Nuevo período
            </button>
          </div>
        </div>

        {/* SUMMARY CARDS */}
        <div style={{ display:'grid', gridTemplateColumns:'repeat(4,1fr)', gap:12, marginBottom:20 }}>
          {[
            { label:'Períodos cerrados', value: periods.filter(p => p.status !== 'open').length, color:'#5DE0E6' },
            { label:'Empleados activos', value: employees.filter(e => e.is_active).length,       color:'#22C55E' },
            { label:'Finiquitos',        value: sevDocs.length,                                   color:'#A78BFA' },
            { label:'Nómina último mes', value: periods.find(p => p.status !== 'open')?.total_liquido || 0, color:'#F59E0B', money: true },
          ].map(s => (
            <div key={s.label} style={S.card}>
              <div style={{ fontSize: s.money ? 18 : 24, fontWeight:800, color:s.color }}>
                {s.money ? fmt(Number(s.value)) : s.value}
              </div>
              <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>{s.label}</div>
            </div>
          ))}
        </div>

        {/* TABS */}
        <div style={{ display:'flex', gap:4, background:'#111827', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:4, marginBottom:20, width:'fit-content' }}>
          {(['periodos','finiquitos','reporte'] as const).map(t => (
            <button key={t} onClick={() => setTab(t)} style={{ ...S.btn, padding:'6px 20px', fontSize:12, borderRadius:7, background: tab === t ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent', color: tab === t ? '#fff' : '#8899BB' }}>
              {{ periodos:'📋 Nómina', finiquitos:'🚪 Finiquitos', reporte:'📊 Reporte' }[t]}
            </button>
          ))}
        </div>

        {/* ── PERIODOS TAB ── */}
        {tab === 'periodos' && (
          <div>
            {periods.length === 0 ? (
              <div style={{ ...S.card, textAlign:'center' as const, padding:48, color:'#8899BB' }}>
                <div style={{ fontSize:36, marginBottom:10 }}>📋</div>
                <div style={{ marginBottom:16 }}>No hay períodos de nómina todavía.</div>
                <button onClick={() => setShowNewPeriod(true)} style={{ ...S.btn, background:'linear-gradient(90deg,#004AAD,#5DE0E6)', color:'#fff', padding:'9px 20px', fontSize:12 }}>
                  Crear primer período
                </button>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {periods.map(p => {
                  const ps = PERIOD_STATUS[p.status] || PERIOD_STATUS.open
                  return (
                    <div key={p.id} onClick={() => setSelPeriod(p)}
                      style={{ ...S.card, display:'flex', alignItems:'center', gap:16, cursor:'pointer' }}>
                      <div style={{ width:48, height:48, borderRadius:10, background:'rgba(93,224,230,.1)', display:'flex', flexDirection:'column', alignItems:'center', justifyContent:'center', flexShrink:0 }}>
                        <div style={{ fontSize:9, color:'#5DE0E6', fontWeight:700 }}>{MONTHS[p.period_month-1].slice(0,3).toUpperCase()}</div>
                        <div style={{ fontSize:14, fontWeight:800, color:'#F0F4FF' }}>{p.period_year}</div>
                      </div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:14 }}>{MONTHS[p.period_month - 1]} {p.period_year}</div>
                        <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>
                          {p.employee_count} trabajadores · Bruto: {fmt(p.total_bruto)} · Costo empresa: {fmt(p.costo_empresa)}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' as const, flexShrink:0 }}>
                        <div style={{ fontSize:18, fontWeight:800, color:'#22C55E' }}>{fmt(p.total_liquido)}</div>
                        <div style={{ fontSize:10, color:'#8899BB' }}>líquido a pagar</div>
                      </div>
                      <span style={{ background:ps.bg, color:ps.color, fontSize:10, fontWeight:700, padding:'4px 10px', borderRadius:20, flexShrink:0 }}>{ps.label}</span>
                    </div>
                  )
                })}
              </div>
            )}
          </div>
        )}

        {/* ── FINIQUITOS TAB ── */}
        {tab === 'finiquitos' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontSize:13, color:'#8899BB' }}>{sevDocs.length} finiquito{sevDocs.length !== 1 ? 's' : ''}</div>
              <button onClick={() => { setEditSev(null); setShowSeverance(true) }} style={{ ...S.btn, background:'rgba(167,139,250,.1)', border:'1px solid rgba(167,139,250,.25)', color:'#A78BFA', padding:'6px 16px', fontSize:11 }}>
                + Nuevo finiquito
              </button>
            </div>
            {sevDocs.length === 0 ? (
              <div style={{ ...S.card, textAlign:'center' as const, padding:48, color:'#8899BB' }}>
                <div style={{ fontSize:36, marginBottom:10 }}>🚪</div>
                <div>No hay finiquitos todavía.</div>
              </div>
            ) : (
              <div style={{ display:'flex', flexDirection:'column', gap:10 }}>
                {sevDocs.map(s => {
                  const ss = SEV_STATUS[s.status] || SEV_STATUS.draft
                  const causeLabel = TERMINATION_CAUSES.find(c => c.value === s.termination_cause)?.label || s.termination_cause
                  return (
                    <div key={s.id} style={{ ...S.card, display:'flex', alignItems:'center', gap:14 }}>
                      <div style={{ width:42, height:42, borderRadius:10, background:'rgba(167,139,250,.1)', display:'flex', alignItems:'center', justifyContent:'center', fontSize:20, flexShrink:0 }}>🚪</div>
                      <div style={{ flex:1 }}>
                        <div style={{ fontWeight:700, fontSize:13 }}>{s.employee_name}</div>
                        <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>
                          {s.position || '—'} · Término: {fmtDate(s.termination_date)} · {causeLabel.split('(')[0].trim()}
                        </div>
                      </div>
                      <div style={{ textAlign:'right' as const, flexShrink:0 }}>
                        <div style={{ fontSize:16, fontWeight:800, color:'#A78BFA' }}>{fmt(s.total_amount)}</div>
                        <div style={{ fontSize:10, color:'#8899BB' }}>total finiquito</div>
                      </div>
                      <span style={{ background:ss.bg, color:ss.color, fontSize:10, fontWeight:700, padding:'3px 9px', borderRadius:20, flexShrink:0 }}>{ss.label}</span>
                      <button onClick={() => { setEditSev(s); setShowSeverance(true) }}
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

        {/* ── REPORTE TAB ── */}
        {tab === 'reporte' && (
          <div>
            <div style={{ display:'flex', justifyContent:'space-between', marginBottom:16 }}>
              <div style={{ fontSize:13, color:'#8899BB' }}>Últimos {reportPeriods.length} períodos cerrados</div>
              <button disabled={aiLoading || reportPeriods.length === 0} onClick={genExecutiveSummary}
                style={{ ...S.btn, background:'rgba(93,224,230,.08)', border:'1px solid rgba(93,224,230,.2)', color:'#5DE0E6', padding:'6px 14px', fontSize:11 }}>
                {aiLoading ? '⏳...' : '🤖 Resumen ejecutivo con IA'}
              </button>
            </div>

            {aiSummary && (
              <div style={{ background:'rgba(93,224,230,.06)', border:'1px solid rgba(93,224,230,.15)', borderRadius:10, padding:'14px 16px', marginBottom:16, fontSize:12, color:'#C8D4E8', lineHeight:1.7, whiteSpace:'pre-wrap' }}>
                {aiSummary}
              </div>
            )}

            {reportPeriods.length === 0 ? (
              <div style={{ ...S.card, textAlign:'center' as const, padding:40, color:'#8899BB' }}>
                <div style={{ fontSize:32, marginBottom:8 }}>📊</div>
                <div>No hay períodos cerrados para reportar.</div>
              </div>
            ) : (
              <>
                {/* Chart bars */}
                <div style={{ ...S.card, marginBottom:16 }}>
                  <div style={{ fontSize:11, fontWeight:700, color:'#8899BB', marginBottom:12, textTransform:'uppercase', letterSpacing:'.5px' }}>Costo Nómina por Mes</div>
                  <div style={{ display:'flex', alignItems:'flex-end', gap:8, height:120 }}>
                    {reportPeriods.map(p => {
                      const maxCosto = Math.max(...reportPeriods.map(x => x.costo_empresa), 1)
                      const h = Math.round((p.costo_empresa / maxCosto) * 100)
                      return (
                        <div key={p.id} style={{ flex:1, display:'flex', flexDirection:'column', alignItems:'center', gap:4 }}>
                          <div style={{ fontSize:9, color:'#5DE0E6', fontWeight:700 }}>{fmt(p.costo_empresa).replace('$','')}</div>
                          <div style={{ width:'100%', height:`${h}%`, minHeight:4, background:'linear-gradient(180deg,#004AAD,#5DE0E6)', borderRadius:4, transition:'height .3s' }} />
                          <div style={{ fontSize:9, color:'#8899BB', textAlign:'center' as const }}>{MONTHS[p.period_month-1].slice(0,3)}</div>
                        </div>
                      )
                    })}
                  </div>
                </div>

                {/* Table */}
                <div style={{ ...S.card }}>
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 1fr 1fr 1fr', gap:0, background:'#0A1628', padding:'8px 14px', borderRadius:'8px 8px 0 0' }}>
                    {['Período','Trab.','Bruto','Líquido','Costo Empresa'].map(h => (
                      <div key={h} style={{ fontSize:10, fontWeight:700, color:'#8899BB', textTransform:'uppercase' as const, letterSpacing:'.5px' }}>{h}</div>
                    ))}
                  </div>
                  {[...reportPeriods].reverse().map(p => (
                    <div key={p.id} style={{ display:'grid', gridTemplateColumns:'1fr 60px 1fr 1fr 1fr', gap:0, padding:'10px 14px', borderTop:'1px solid rgba(93,224,230,.07)', alignItems:'center' }}>
                      <div style={{ fontWeight:700, fontSize:13 }}>{MONTHS[p.period_month-1]} {p.period_year}</div>
                      <div style={{ fontSize:12 }}>{p.employee_count}</div>
                      <div style={{ fontSize:12 }}>{fmt(p.total_bruto)}</div>
                      <div style={{ fontSize:13, fontWeight:700, color:'#22C55E' }}>{fmt(p.total_liquido)}</div>
                      <div style={{ fontSize:12, color:'#A78BFA' }}>{fmt(p.costo_empresa)}</div>
                    </div>
                  ))}
                  {/* Totals */}
                  <div style={{ display:'grid', gridTemplateColumns:'1fr 60px 1fr 1fr 1fr', gap:0, padding:'10px 14px', borderTop:'2px solid rgba(93,224,230,.15)', alignItems:'center', background:'rgba(93,224,230,.04)' }}>
                    <div style={{ fontWeight:800, fontSize:12, color:'#5DE0E6' }}>TOTAL</div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{reportPeriods.reduce((s,p) => s+p.employee_count,0)}</div>
                    <div style={{ fontSize:12, fontWeight:700 }}>{fmt(reportPeriods.reduce((s,p) => s + p.total_bruto, 0))}</div>
                    <div style={{ fontSize:13, fontWeight:800, color:'#22C55E' }}>{fmt(reportPeriods.reduce((s,p) => s + p.total_liquido, 0))}</div>
                    <div style={{ fontSize:12, fontWeight:700, color:'#A78BFA' }}>{fmt(reportPeriods.reduce((s,p) => s + p.costo_empresa, 0))}</div>
                  </div>
                </div>
              </>
            )}
          </div>
        )}

      </div>

      {/* MODALS */}
      {showNewPeriod && company && (
        <NewPeriodModal
          company={company}
          onClose={() => setShowNewPeriod(false)}
          onSave={() => { setShowNewPeriod(false); refresh() }}
          Sbtn={S.btn}
        />
      )}

      {selPeriod && company && params && (
        <PeriodDetailModal
          period={selPeriod}
          docs={periodDocs}
          company={company}
          employees={employees}
          params={params}
          onClose={() => setSelPeriod(null)}
          onRefresh={() => { refresh(); if (company) { loadPeriods(company.id) } }}
          onAddDoc={() => setShowPayDoc(true)}
          Sbtn={S.btn}
        />
      )}

      {showPayDoc && selPeriod && company && params && (
        <PayrollDocModal
          period={selPeriod}
          company={company}
          doc={null}
          employees={employees}
          params={params}
          onClose={() => setShowPayDoc(false)}
          onSave={() => { setShowPayDoc(false); if (company) { loadDocs(company.id); loadPeriods(company.id) } }}
          Sbtn={S.btn}
        />
      )}

      {showSeverance && company && (
        <SeveranceModal
          company={company}
          employees={employees}
          sev={editSev}
          onClose={() => { setShowSeverance(false); setEditSev(null) }}
          onSave={() => { setShowSeverance(false); setEditSev(null); refresh() }}
          Sbtn={S.btn}
        />
      )}

      {showParams && company && params && (
        <ParamsModal
          company={company}
          params={params}
          onClose={() => setShowParams(false)}
          onSave={p => setParams(p)}
          Sbtn={S.btn}
        />
      )}

    </div>
  )
}
