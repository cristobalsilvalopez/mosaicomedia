'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { getAuthContext, getStoredCompany } from '@/lib/auth-company'

const supabase = createClient()
const fmt     = (n: number) => '$' + Math.round(n || 0).toLocaleString('es-CL')
const fmtDate = (d: string) => {
  const [y, m, day] = d.split('-')
  return `${day}/${m}/${y}`
}

// ============================================================
// TIPOS
// ============================================================
interface Expense {
  id: string
  amount: number
  category: string
  description: string | null
  payment_method: string
  expense_date: string
  cash_session_id: string | null
  created_by_name: string
  created_at: string
}

interface FinanceSummary {
  sales_total: number
  expenses_total: number
  net_flow: number
  by_category: { category: string; total: number; count: number }[]
  by_payment: { method: string; total: number }[]
  by_day: { date: string; sales: number; expenses: number; net: number }[]
}

interface ExpenseForm {
  amount: string
  category: string
  payment_method: string
  description: string
  expense_date: string
}

const CATEGORIES = [
  { value: 'arriendo',    label: '🏠 Arriendo',                 color: '#A78BFA' },
  { value: 'proveedores', label: '📦 Proveedores',               color: '#C19E4D' },
  { value: 'sueldos',     label: '👥 Sueldos',                  color: '#5DE0E6' },
  { value: 'insumos',     label: '🛒 Insumos',                  color: '#22C55E' },
  { value: 'servicios',   label: '⚡ Servicios',                color: '#F59E0B' },
  { value: 'otros',       label: '📋 Otros',                    color: '#8899BB' },
]

const PAYMENT_METHODS = [
  { value: 'cash',     label: '💵 Efectivo' },
  { value: 'transfer', label: '📲 Transferencia' },
  { value: 'debit',    label: '💳 Débito' },
  { value: 'credit',   label: '💳 Crédito' },
]

const catColor = (cat: string) => CATEGORIES.find(c => c.value === cat)?.color || '#8899BB'
const catLabel = (cat: string) => CATEGORIES.find(c => c.value === cat)?.label || cat
const payLabel = (method: string) => PAYMENT_METHODS.find(m => m.value === method)?.label || method

const emptyForm: ExpenseForm = {
  amount: '',
  category: 'otros',
  payment_method: 'cash',
  description: '',
  expense_date: new Date().toISOString().slice(0, 10),
}

type Tab       = 'dashboard' | 'gastos' | 'flujo' | 'ia' | 'resultado' | 'situacion' | 'tributario'
type PeriodKey = 'today'  | 'week'  | 'month' | 'custom'

function getDateRange(
  period: PeriodKey,
  customFrom?: string,
  customTo?: string,
): { from: string; to: string } {
  const today    = new Date()
  const todayStr = today.toISOString().slice(0, 10)
  if (period === 'today') return { from: todayStr, to: todayStr }
  if (period === 'week') {
    const d = new Date(today); d.setDate(d.getDate() - 6)
    return { from: d.toISOString().slice(0, 10), to: todayStr }
  }
  if (period === 'month') return { from: todayStr.slice(0, 7) + '-01', to: todayStr }
  return { from: customFrom || todayStr, to: customTo || todayStr }
}

// ============================================================
// ESTILOS
// ============================================================
const ST = {
  page:    { minHeight: '100vh', background: 'var(--mp-bg, #0A1628)', fontFamily: 'Montserrat,sans-serif', color: 'var(--mp-text, #F0F4FF)', transition: 'background .25s, color .25s' } as React.CSSProperties,
  topbar:  { height: 50, background: '#111827', borderBottom: '1px solid rgba(93,224,230,.12)', display: 'flex', alignItems: 'center', padding: '0 20px', gap: 10, flexShrink: 0 } as React.CSSProperties,
  logo:    { width: 28, height: 28, borderRadius: 7, background: 'linear-gradient(135deg,#004AAD,#5DE0E6)', display: 'flex', alignItems: 'center', justifyContent: 'center', fontSize: 11, fontWeight: 700, color: '#fff', cursor: 'pointer', flexShrink: 0 } as React.CSSProperties,
  body:    { maxWidth: 960, margin: '0 auto', padding: '28px 20px' } as React.CSSProperties,
  card:    { background: '#111827', border: '1px solid rgba(93,224,230,.12)', borderRadius: 12, padding: '20px 22px', marginBottom: 14 } as React.CSSProperties,
  label:   { fontSize: 11, fontWeight: 600, color: '#8899BB', marginBottom: 5, display: 'block' } as React.CSSProperties,
  input:   { width: '100%', background: '#1A2540', border: '1px solid rgba(93,224,230,.2)', borderRadius: 8, padding: '10px 12px', fontSize: 13, color: '#F0F4FF', outline: 'none', fontFamily: 'Montserrat,sans-serif', boxSizing: 'border-box' as const },
  btn:     { border: 'none', borderRadius: 8, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif', fontWeight: 700 } as React.CSSProperties,
  overlay: { position: 'fixed', inset: 0, background: 'rgba(0,0,0,.82)', zIndex: 200, display: 'flex', alignItems: 'center', justifyContent: 'center', fontFamily: 'Montserrat,sans-serif' } as React.CSSProperties,
  modal:   { background: '#111827', border: '1px solid rgba(93,224,230,.3)', borderRadius: 14, padding: '26px 28px', width: 440, maxWidth: '95vw', color: '#F0F4FF', maxHeight: '90vh', overflowY: 'auto' as const },
}

// ============================================================
// GRÁFICO FLUJO (barras duales: ventas vs gastos)
// ============================================================
function FlowChart({ data }: { data: FinanceSummary['by_day'] }) {
  if (!data || data.length === 0) return (
    <div style={{ textAlign: 'center', padding: '24px 0', color: '#8899BB', fontSize: 12 }}>
      Sin datos para mostrar
    </div>
  )
  const maxVal   = Math.max(...data.map(d => Math.max(d.sales, d.expenses)), 1)
  const showDays = data.slice(-21)

  return (
    <div>
      <div style={{ display: 'flex', gap: 16, marginBottom: 12 }}>
        {[['#5DE0E6', 'Ventas'], ['#EF4444', 'Gastos']].map(([color, label]) => (
          <div key={label} style={{ display: 'flex', alignItems: 'center', gap: 5, fontSize: 11, color: '#8899BB' }}>
            <div style={{ width: 10, height: 10, background: color, borderRadius: 2 }} />
            {label}
          </div>
        ))}
      </div>
      <div style={{ display: 'flex', alignItems: 'flex-end', gap: 5, height: 110, overflowX: 'auto', paddingBottom: 4 }}>
        {showDays.map((d, i) => {
          const salesH = maxVal > 0 ? Math.max(3, (d.sales    / maxVal) * 96) : 3
          const expH   = maxVal > 0 ? Math.max(3, (d.expenses / maxVal) * 96) : 3
          const [, mm, dd] = d.date.split('-')
          return (
            <div key={i} style={{ flex: 1, minWidth: 24, display: 'flex', flexDirection: 'column', alignItems: 'center', gap: 2 }}>
              <div style={{ display: 'flex', gap: 2, alignItems: 'flex-end', height: 96 }}>
                <div
                  style={{ width: 7, height: `${salesH}px`, background: '#5DE0E6', borderRadius: '3px 3px 0 0', opacity: d.sales === 0 ? .25 : 1 }}
                  title={`${d.date} · Ventas: ${fmt(d.sales)}`}
                />
                <div
                  style={{ width: 7, height: `${expH}px`, background: '#EF4444', borderRadius: '3px 3px 0 0', opacity: d.expenses === 0 ? .25 : 1 }}
                  title={`${d.date} · Gastos: ${fmt(d.expenses)}`}
                />
              </div>
              <span style={{ fontSize: 8, color: '#8899BB', whiteSpace: 'nowrap' }}>{dd}/{mm}</span>
            </div>
          )
        })}
      </div>
    </div>
  )
}

// ============================================================
// COMPONENTE PRINCIPAL
// ============================================================
export default function FinanzasPage() {
  const router = useRouter()
  const [user, setUser]       = useState<any>(null)
  const [company, setCompany] = useState<any>(null)
  const [loading, setLoading] = useState(true)

  const [period,     setPeriod]     = useState<PeriodKey>('month')
  const [customFrom, setCustomFrom] = useState('')
  const [customTo,   setCustomTo]   = useState('')

  const [expenses,   setExpenses]   = useState<Expense[]>([])
  const [summary,    setSummary]    = useState<FinanceSummary | null>(null)
  const [filterCat,  setFilterCat]  = useState('')
  const [fetching,   setFetching]   = useState(false)

  const [activeTab, setActiveTab] = useState<Tab>('dashboard')

  const [showModal, setShowModal] = useState(false)
  const [form,      setForm]      = useState<ExpenseForm>(emptyForm)
  const [saving,    setSaving]    = useState(false)
  const [formError, setFormError] = useState('')

  const [aiInsight, setAiInsight] = useState<any>(null)
  const [aiLoading, setAiLoading] = useState(false)
  const [aiError,   setAiError]   = useState('')

  // ── INIT ────────────────────────────────────────────────────
  useEffect(() => {
    async function init() {
      const ctx = await getAuthContext()
      if (!ctx) { router.push('/login'); return }
      if (ctx.isSuperAdmin && !getStoredCompany()) { router.push('/empresas'); return }
      if (!ctx.isSuperAdmin && !['admin', 'supervisor', 'owner'].includes(ctx.user.role)) {
        router.push('/dashboard'); return
      }
      setUser(ctx.user as any)
      setCompany(ctx.company)
      setLoading(false)
    }
    init()
  }, [])

  useEffect(() => {
    if (company) loadData()
  }, [company, period, customFrom, customTo, filterCat])

  // ── CARGA DE DATOS ──────────────────────────────────────────
  async function loadData() {
    if (!company) return
    const { from, to } = getDateRange(period, customFrom, customTo)
    setFetching(true)

    const [expRes, sumRes] = await Promise.all([
      supabase.rpc('get_expenses', {
        p_company_id: company.id,
        p_from:       from,
        p_to:         to,
        p_category:   filterCat || null,
      }),
      supabase.rpc('get_finance_summary', {
        p_company_id: company.id,
        p_from:       from,
        p_to:         to,
      }),
    ])

    setExpenses(expRes.data || [])
    setSummary(sumRes.data as FinanceSummary || null)
    setFetching(false)
  }

  // ── GUARDAR GASTO ───────────────────────────────────────────
  async function handleSave() {
    if (!form.amount || parseFloat(form.amount) <= 0) {
      setFormError('Ingresa un monto válido mayor a 0')
      return
    }
    setSaving(true)
    setFormError('')

    const { data, error } = await supabase.rpc('create_expense', {
      p_data: {
        amount:         parseFloat(form.amount),
        category:       form.category,
        payment_method: form.payment_method,
        description:    form.description,
        expense_date:   form.expense_date,
      },
    })

    setSaving(false)

    if (error || !data?.success) {
      setFormError(error?.message || data?.error || 'Error al guardar')
      return
    }

    setShowModal(false)
    setForm({ ...emptyForm, expense_date: new Date().toISOString().slice(0, 10) })
    await loadData()
  }

  // ── ELIMINAR GASTO ──────────────────────────────────────────
  async function handleDelete(id: string) {
    if (!confirm('¿Eliminar este gasto? Esta acción no se puede deshacer.')) return

    const { data, error } = await supabase.rpc('delete_expense', { p_expense_id: id })
    if (error || !data?.success) {
      alert(error?.message || data?.error || 'Error al eliminar')
      return
    }
    await loadData()
  }

  // ── ANÁLISIS IA ─────────────────────────────────────────────
  async function generateInsight() {
    if (!summary) return
    setAiLoading(true)
    setAiError('')
    setAiInsight(null)

    try {
      const periodLabel = {
        today: 'hoy', week: 'esta semana', month: 'este mes', custom: 'período personalizado',
      }[period]

      const res = await fetch('/api/ai/finance', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ summary, period: periodLabel }),
      })

      const result = await res.json()
      if (result.error) throw new Error(result.error)
      setAiInsight(result)
    } catch (err: any) {
      setAiError(err.message || 'Error al generar análisis')
    } finally {
      setAiLoading(false)
    }
  }

  // ── LOADING ─────────────────────────────────────────────────
  if (loading) return (
    <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center', color: '#5DE0E6', fontFamily: 'Montserrat,sans-serif' }}>
      ⏳ Cargando...
    </div>
  )

  const { from, to } = getDateRange(period, customFrom, customTo)
  const periodLabel  = { today: 'Hoy', week: 'Esta semana', month: 'Este mes', custom: 'Personalizado' }[period]
  const netPositive  = (summary?.net_flow || 0) >= 0
  const expTotal     = expenses.reduce((a, e) => a + e.amount, 0)
  const maxCat       = Math.max(...(summary?.by_category || []).map(c => c.total), 1)
  const ratio        = summary && summary.sales_total > 0
    ? Math.round((summary.expenses_total / summary.sales_total) * 100)
    : null

  // ── MODAL NUEVO GASTO ───────────────────────────────────────
  function openModal() {
    setForm({ ...emptyForm, expense_date: new Date().toISOString().slice(0, 10) })
    setFormError('')
    setShowModal(true)
  }

  const Modal = () => (
    <div style={ST.overlay} onClick={e => { if (e.target === e.currentTarget) setShowModal(false) }}>
      <div style={ST.modal}>
        <div style={{ fontSize: 17, fontWeight: 800, marginBottom: 3 }}>💸 Nuevo Gasto</div>
        <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 22 }}>
          Enter en el último campo para guardar
        </div>

        {/* Monto */}
        <label style={ST.label}>Monto *</label>
        <input
          type="number"
          inputMode="numeric"
          min="1"
          value={form.amount}
          onChange={e => setForm(f => ({ ...f, amount: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
          placeholder="Ej: 45000"
          autoFocus
          style={{ ...ST.input, fontSize: 26, fontWeight: 800, textAlign: 'center', marginBottom: 16, letterSpacing: 1 }}
        />

        {/* Categoría */}
        <label style={ST.label}>Categoría *</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr 1fr', gap: 6, marginBottom: 16 }}>
          {CATEGORIES.map(c => (
            <button
              key={c.value}
              onClick={() => setForm(f => ({ ...f, category: c.value }))}
              style={{
                ...ST.btn,
                padding: '9px 6px',
                fontSize: 11,
                textAlign: 'center' as const,
                background: form.category === c.value ? `rgba(${hexToRgb(c.color)}, .15)` : '#1A2540',
                border: `1px solid ${form.category === c.value ? c.color : 'rgba(93,224,230,.12)'}`,
                color: form.category === c.value ? c.color : '#8899BB',
              }}
            >
              {c.label.split(' ')[0]}<br />
              <span style={{ fontSize: 10, fontWeight: 400 }}>{c.label.split(' ').slice(1).join(' ')}</span>
            </button>
          ))}
        </div>

        {/* Método de pago */}
        <label style={ST.label}>Método de pago</label>
        <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 6, marginBottom: 14 }}>
          {PAYMENT_METHODS.map(m => (
            <button
              key={m.value}
              onClick={() => setForm(f => ({ ...f, payment_method: m.value }))}
              style={{
                ...ST.btn,
                padding: '9px 10px',
                fontSize: 12,
                background: form.payment_method === m.value ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : '#1A2540',
                border: `1px solid ${form.payment_method === m.value ? 'transparent' : 'rgba(93,224,230,.12)'}`,
                color: form.payment_method === m.value ? '#fff' : '#8899BB',
              }}
            >
              {m.label}
            </button>
          ))}
        </div>

        {/* Aviso caja */}
        {form.payment_method === 'cash' && (
          <div style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.15)', borderRadius: 8, padding: '7px 12px', fontSize: 11, color: '#22C55E', marginBottom: 14 }}>
            💵 Se vinculará a la sesión de caja activa automáticamente
          </div>
        )}

        {/* Descripción */}
        <label style={ST.label}>Descripción</label>
        <input
          type="text"
          value={form.description}
          onChange={e => setForm(f => ({ ...f, description: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
          placeholder="Ej: Arriendo local noviembre"
          style={{ ...ST.input, marginBottom: 14 }}
        />

        {/* Fecha */}
        <label style={ST.label}>Fecha del gasto</label>
        <input
          type="date"
          value={form.expense_date}
          onChange={e => setForm(f => ({ ...f, expense_date: e.target.value }))}
          onKeyDown={e => { if (e.key === 'Enter') { e.preventDefault(); handleSave() } }}
          style={{ ...ST.input, marginBottom: formError ? 10 : 20 }}
        />

        {formError && (
          <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 6, padding: '8px 12px', fontSize: 11, color: '#EF4444', marginBottom: 14 }}>
            {formError}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: 8 }}>
          <button
            onClick={() => setShowModal(false)}
            style={{ ...ST.btn, flex: 1, padding: 11, fontSize: 12, background: 'rgba(255,255,255,.05)', border: '1px solid rgba(255,255,255,.08)', color: '#8899BB' }}
          >
            Cancelar (Esc)
          </button>
          <button
            onClick={handleSave}
            disabled={saving || !form.amount || parseFloat(form.amount) <= 0}
            style={{
              ...ST.btn, flex: 2, padding: 11, fontSize: 13,
              background: form.amount && parseFloat(form.amount) > 0 ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'rgba(0,74,173,.2)',
              color: '#fff', opacity: form.amount && parseFloat(form.amount) > 0 ? 1 : .5,
            }}
          >
            {saving ? '⏳ Guardando...' : `💾 Guardar gasto (Enter)`}
          </button>
        </div>
      </div>
    </div>
  )

  // ── RENDER ──────────────────────────────────────────────────
  return (
    <div style={ST.page}>
      {showModal && <Modal />}

      {/* TOPBAR */}
      <div style={ST.topbar}>
        <div style={ST.logo} onClick={() => router.push('/dashboard')}>MP</div>
        <span style={{ fontWeight: 700, fontSize: 13 }}>Finanzas — {company?.name}</span>
        <div style={{ flex: 1 }} />
        {fetching && <span style={{ fontSize: 11, color: '#8899BB' }}>⏳ Actualizando...</span>}
        <button
          onClick={openModal}
          style={{ ...ST.btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '5px 16px', fontSize: 11 }}
        >
          + Nuevo Gasto
        </button>
        <button
          onClick={() => loadData()}
          style={{ ...ST.btn, background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.2)', color: '#5DE0E6', padding: '4px 10px', fontSize: 11 }}
        >
          🔄
        </button>
        <button
          onClick={() => router.push('/dashboard')}
          style={{ ...ST.btn, background: 'transparent', border: '1px solid rgba(93,224,230,.2)', color: '#8899BB', padding: '4px 12px', fontSize: 11 }}
        >
          ← Dashboard
        </button>
      </div>

      <div style={ST.body}>

        {/* SELECTOR DE PERÍODO */}
        <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16, flexWrap: 'wrap' as const, gap: 10 }}>
          <div>
            <div style={{ fontSize: 16, fontWeight: 800, color: '#F0F4FF' }}>{periodLabel}</div>
            <div style={{ fontSize: 11, color: '#8899BB' }}>
              {from === to ? fmtDate(from) : `${fmtDate(from)} → ${fmtDate(to)}`}
            </div>
          </div>
          <div style={{ display: 'flex', gap: 4, background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 10, padding: 4 }}>
            {(['today', 'week', 'month', 'custom'] as PeriodKey[]).map(p => (
              <button
                key={p}
                onClick={() => setPeriod(p)}
                style={{
                  ...ST.btn, padding: '5px 12px', fontSize: 11, borderRadius: 7,
                  background: period === p ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent',
                  color: period === p ? '#fff' : '#8899BB',
                }}
              >
                {{ today: 'Hoy', week: 'Semana', month: 'Mes', custom: 'Rango' }[p]}
              </button>
            ))}
          </div>
        </div>

        {/* RANGO PERSONALIZADO */}
        {period === 'custom' && (
          <div style={{ display: 'flex', gap: 10, marginBottom: 14, alignItems: 'center' }}>
            <input type="date" value={customFrom} onChange={e => setCustomFrom(e.target.value)} style={{ ...ST.input, flex: 1 }} />
            <span style={{ color: '#8899BB', fontSize: 13 }}>→</span>
            <input type="date" value={customTo} onChange={e => setCustomTo(e.target.value)} style={{ ...ST.input, flex: 1 }} />
          </div>
        )}

        {/* KPI CARDS */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(3,1fr)', gap: 12, marginBottom: 20 }}>

          <div style={{ ...ST.card, marginBottom: 0 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>💵</div>
            <div style={{ fontSize: 11, color: '#8899BB', fontWeight: 600, marginBottom: 4 }}>Ventas del período</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#5DE0E6' }}>{fmt(summary?.sales_total || 0)}</div>
            <div style={{ fontSize: 11, color: '#8899BB', marginTop: 4 }}>{periodLabel.toLowerCase()}</div>
          </div>

          <div style={{ ...ST.card, marginBottom: 0 }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>💸</div>
            <div style={{ fontSize: 11, color: '#8899BB', fontWeight: 600, marginBottom: 4 }}>Total gastos</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: '#EF4444' }}>{fmt(summary?.expenses_total || 0)}</div>
            <div style={{ fontSize: 11, color: '#8899BB', marginTop: 4 }}>
              {(summary?.by_category || []).length} categorías · {expenses.length} registros
            </div>
          </div>

          <div style={{
            background: '#111827',
            border: `1px solid ${netPositive ? 'rgba(34,197,94,.3)' : 'rgba(239,68,68,.3)'}`,
            borderRadius: 12, padding: '20px 22px', marginBottom: 0,
          }}>
            <div style={{ fontSize: 20, marginBottom: 6 }}>📊</div>
            <div style={{ fontSize: 11, color: '#8899BB', fontWeight: 600, marginBottom: 4 }}>Flujo neto</div>
            <div style={{ fontSize: 24, fontWeight: 800, color: netPositive ? '#22C55E' : '#EF4444' }}>
              {(summary?.net_flow || 0) >= 0 ? '+' : ''}{fmt(summary?.net_flow || 0)}
            </div>
            <div style={{ fontSize: 11, marginTop: 4, color: netPositive ? '#22C55E' : '#EF4444' }}>
              {netPositive ? '✅ Positivo' : '⚠️ Déficit'}
              {ratio !== null && ` · ${ratio}% ratio gasto/venta`}
            </div>
          </div>
        </div>

        {/* TABS */}
        <div style={{ display: 'flex', gap: 2, background: '#111827', border: '1px solid rgba(93,224,230,.1)', borderRadius: 10, padding: 4, marginBottom: 18, width: 'fit-content' }}>
          {([
            { key: 'dashboard',  label: '🏦 Dashboard'     },
            { key: 'gastos',     label: '💸 Gastos'        },
            { key: 'flujo',      label: '📊 Flujo'          },
            { key: 'resultado',  label: '📋 Resultados'     },
            { key: 'situacion',  label: '⚖️ Balance General' },
            { key: 'tributario', label: '🧾 Tributario SII' },
            { key: 'ia',         label: '🤖 IA Insights'    },
          ] as { key: Tab; label: string }[]).map(t => (
            <button
              key={t.key}
              onClick={() => setActiveTab(t.key)}
              style={{
                ...ST.btn, padding: '6px 18px', fontSize: 12, borderRadius: 8,
                background: activeTab === t.key ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : 'transparent',
                color: activeTab === t.key ? '#fff' : '#8899BB',
              }}
            >
              {t.label}
            </button>
          ))}
        </div>

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: DASHBOARD                                         */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'dashboard' && summary && (
          <div style={{ display: 'flex', flexDirection: 'column', gap: 18 }}>
            {/* KPI row */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(180px,1fr))', gap: 12 }}>
              {[
                { icon: '📈', label: 'Ingresos Netos',     value: fmt(summary.sales_total),             color: '#22C55E', sub: periodLabel },
                { icon: '💸', label: 'Gastos Totales',     value: fmt(summary.expenses_total),          color: '#EF4444', sub: periodLabel },
                { icon: '💰', label: 'Flujo Neto',         value: fmt(summary.net_flow),                color: summary.net_flow >= 0 ? '#22C55E' : '#EF4444', sub: 'Ingr. - Gastos' },
                { icon: '📊', label: 'Margen Operacional', value: summary.sales_total > 0 ? `${((summary.net_flow / summary.sales_total) * 100).toFixed(1)}%` : '—', color: '#5DE0E6', sub: 'del período' },
              ].map(k => (
                <div key={k.label} style={{ background: '#111827', borderRadius: 12, padding: '14px 16px', border: `1px solid rgba(93,224,230,.08)`, display: 'flex', flexDirection: 'column', gap: 6 }}>
                  <div style={{ display: 'flex', gap: 8, alignItems: 'center' }}>
                    <span style={{ fontSize: 22 }}>{k.icon}</span>
                    <div>
                      <div style={{ fontSize: 10, color: '#8899BB' }}>{k.label}</div>
                      <div style={{ fontSize: 10, color: '#556080' }}>{k.sub}</div>
                    </div>
                  </div>
                  <div style={{ fontSize: 22, fontWeight: 800, color: k.color }}>{k.value}</div>
                </div>
              ))}
            </div>

            {/* Instruments grid */}
            <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(280px,1fr))', gap: 14 }}>
              {/* Estado de Resultados */}
              <div style={{ background: '#111827', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(93,224,230,.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5DE0E6', marginBottom: 10 }}>📋 Estado de Resultados</div>
                {[
                  { label: 'Ingresos Netos',   val: summary.sales_total,    color: '#22C55E' },
                  { label: 'Costos',           val: summary.expenses_total * .6, color: '#EF4444' },
                  { label: 'Utilidad Bruta',   val: summary.sales_total - summary.expenses_total * .6, color: '#5DE0E6' },
                  { label: 'EBITDA',           val: summary.net_flow * 1.1,  color: '#A78BFA' },
                  { label: 'Utilidad Neta',    val: summary.net_flow,        color: summary.net_flow >= 0 ? '#22C55E' : '#EF4444' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#8899BB' }}>{r.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{fmt(r.val)}</span>
                  </div>
                ))}
                <button onClick={() => setActiveTab('resultado')} style={{ ...ST.btn, background: 'rgba(93,224,230,.06)', color: '#5DE0E6', border: '1px solid rgba(93,224,230,.15)', padding: '5px 10px', fontSize: 10, marginTop: 8, width: '100%' }}>Ver completo →</button>
              </div>

              {/* IVA / F29 */}
              <div style={{ background: '#111827', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(93,224,230,.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5DE0E6', marginBottom: 10 }}>🧾 IVA / F29</div>
                {[
                  { label: 'Ventas Afectas',  val: summary.sales_total,          color: '#22C55E' },
                  { label: 'IVA Débito (19%)', val: summary.sales_total * .19,    color: '#F59E0B' },
                  { label: 'IVA Crédito',      val: summary.expenses_total * .19 * .6, color: '#5DE0E6' },
                  { label: 'IVA Neto a Pagar', val: summary.sales_total * .19 - summary.expenses_total * .19 * .6, color: '#EF4444' },
                  { label: 'PPM (1.1%)',       val: summary.sales_total * .011,   color: '#A78BFA' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#8899BB' }}>{r.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{fmt(r.val)}</span>
                  </div>
                ))}
                <button onClick={() => setActiveTab('tributario')} style={{ ...ST.btn, background: 'rgba(93,224,230,.06)', color: '#5DE0E6', border: '1px solid rgba(93,224,230,.15)', padding: '5px 10px', fontSize: 10, marginTop: 8, width: '100%' }}>Ver Tributario →</button>
              </div>

              {/* Remuneraciones / Gastos categorías */}
              <div style={{ background: '#111827', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(93,224,230,.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5DE0E6', marginBottom: 10 }}>👥 Gastos por Categoría</div>
                {(summary.by_category?.slice(0, 5) || []).map(c => (
                  <div key={c.category} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#8899BB' }}>{catLabel(c.category)}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: catColor(c.category) }}>{fmt(c.total)}</span>
                  </div>
                ))}
                <button onClick={() => setActiveTab('gastos')} style={{ ...ST.btn, background: 'rgba(93,224,230,.06)', color: '#5DE0E6', border: '1px solid rgba(93,224,230,.15)', padding: '5px 10px', fontSize: 10, marginTop: 8, width: '100%' }}>Ver Gastos →</button>
              </div>

              {/* Situación Financiera */}
              <div style={{ background: '#111827', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(93,224,230,.08)' }}>
                <div style={{ fontSize: 11, fontWeight: 800, color: '#5DE0E6', marginBottom: 10 }}>⚖️ Balance General</div>
                {[
                  { label: 'Activo Corriente',   val: summary.sales_total * .4,     color: '#22C55E' },
                  { label: 'Activo No Corriente', val: summary.sales_total * .6,     color: '#5DE0E6' },
                  { label: 'Pasivo Total',         val: summary.expenses_total,       color: '#EF4444' },
                  { label: 'Patrimonio Neto',      val: summary.sales_total - summary.expenses_total, color: '#A78BFA' },
                ].map(r => (
                  <div key={r.label} style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 5 }}>
                    <span style={{ fontSize: 11, color: '#8899BB' }}>{r.label}</span>
                    <span style={{ fontSize: 11, fontWeight: 700, color: r.color }}>{fmt(r.val)}</span>
                  </div>
                ))}
                <button onClick={() => setActiveTab('situacion')} style={{ ...ST.btn, background: 'rgba(93,224,230,.06)', color: '#5DE0E6', border: '1px solid rgba(93,224,230,.15)', padding: '5px 10px', fontSize: 10, marginTop: 8, width: '100%' }}>Ver Balance General →</button>
              </div>
            </div>

            {/* Calendar obligations */}
            <div style={{ background: '#111827', borderRadius: 12, padding: '14px 16px', border: '1px solid rgba(93,224,230,.08)' }}>
              <div style={{ fontSize: 11, fontWeight: 800, color: '#5DE0E6', marginBottom: 10 }}>📅 Obligaciones Próximas</div>
              <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fit,minmax(200px,1fr))', gap: 8 }}>
                {[
                  { label: 'F29 (PYMES hasta día 20)',    date: 'Día 20 de cada mes',  color: '#F59E0B', icon: '🧾' },
                  { label: 'F29 (Grandes contrib. día 12)', date: 'Día 12 de cada mes', color: '#EF4444', icon: '🧾' },
                  { label: 'Remuneraciones',              date: 'Último día del mes',   color: '#A78BFA', icon: '👥' },
                  { label: 'Cotizaciones (AFC/AFP)',       date: 'Día 10 del mes sig.',  color: '#5DE0E6', icon: '🏦' },
                  { label: 'Operación Renta',             date: 'Abril cada año',       color: '#22C55E', icon: '📋' },
                  { label: 'IVA Crédito / Débito',        date: 'Con F29 mensual',       color: '#C19E4D', icon: '💳' },
                ].map(o => (
                  <div key={o.label} style={{ display: 'flex', gap: 8, padding: '8px 10px', borderRadius: 8, background: `${o.color}0D`, border: `1px solid ${o.color}25` }}>
                    <span style={{ fontSize: 16 }}>{o.icon}</span>
                    <div>
                      <div style={{ fontSize: 10, fontWeight: 700, color: o.color }}>{o.label}</div>
                      <div style={{ fontSize: 9, color: '#8899BB' }}>{o.date}</div>
                    </div>
                  </div>
                ))}
              </div>
            </div>
          </div>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: GASTOS                                            */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'gastos' && (
          <>
            {/* Filtros */}
            <div style={{ display: 'flex', gap: 8, marginBottom: 14, flexWrap: 'wrap' as const, alignItems: 'center' }}>
              <select
                value={filterCat}
                onChange={e => setFilterCat(e.target.value)}
                style={{ ...ST.input, width: 'auto', minWidth: 180 }}
              >
                <option value="">Todas las categorías</option>
                {CATEGORIES.map(c => (
                  <option key={c.value} value={c.value}>{c.label}</option>
                ))}
              </select>
              {filterCat && (
                <button
                  onClick={() => setFilterCat('')}
                  style={{ ...ST.btn, background: 'none', color: '#8899BB', fontSize: 12, padding: '4px 10px', border: '1px solid rgba(93,224,230,.15)' }}
                >
                  × Limpiar filtro
                </button>
              )}
              <div style={{ flex: 1 }} />
              <button
                onClick={openModal}
                style={{ ...ST.btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '10px 20px', fontSize: 12 }}
              >
                + Nuevo Gasto
              </button>
            </div>

            {/* Lista vacía */}
            {expenses.length === 0 ? (
              <div style={{ ...ST.card, textAlign: 'center', padding: '50px 20px' }}>
                <div style={{ fontSize: 40, marginBottom: 10 }}>💸</div>
                <div style={{ fontSize: 15, fontWeight: 700, marginBottom: 6 }}>
                  {filterCat ? `Sin gastos en categoría "${filterCat}"` : 'No hay gastos en este período'}
                </div>
                <div style={{ fontSize: 12, color: '#8899BB', marginBottom: 22, lineHeight: 1.7 }}>
                  Registra los gastos del negocio para visualizar el flujo de caja real<br />
                  y compararlo con tus ventas.
                </div>
                <button
                  onClick={openModal}
                  style={{ ...ST.btn, background: 'linear-gradient(90deg,#004AAD,#5DE0E6)', color: '#fff', padding: '12px 28px', fontSize: 13 }}
                >
                  Registrar primer gasto
                </button>
              </div>
            ) : (
              <div style={ST.card}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 14 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, color: '#5DE0E6' }}>
                    {expenses.length} registro{expenses.length !== 1 ? 's' : ''} · {fmt(expTotal)} total
                  </div>
                  {filterCat && (
                    <span style={{ fontSize: 11, color: catColor(filterCat), background: `rgba(${hexToRgb(catColor(filterCat))}, .08)`, border: `1px solid ${catColor(filterCat)}`, borderRadius: 20, padding: '2px 10px' }}>
                      {catLabel(filterCat)}
                    </span>
                  )}
                </div>

                {/* Cabecera tabla */}
                <div style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 110px 90px 28px', gap: '0 12px', padding: '0 4px 8px', borderBottom: '1px solid rgba(93,224,230,.1)', fontSize: 10, color: '#8899BB', fontWeight: 700, textTransform: 'uppercase' as const, letterSpacing: '.3px' }}>
                  <span>Monto</span>
                  <span>Descripción</span>
                  <span>Categoría</span>
                  <span>Método</span>
                  <span>Fecha</span>
                  <span></span>
                </div>

                {/* Filas */}
                {expenses.map(e => (
                  <div
                    key={e.id}
                    style={{ display: 'grid', gridTemplateColumns: '110px 1fr 110px 110px 90px 28px', gap: '0 12px', padding: '10px 4px', borderBottom: '1px solid rgba(93,224,230,.05)', fontSize: 12, alignItems: 'center' }}
                  >
                    <div style={{ fontWeight: 800, color: '#EF4444', fontSize: 14 }}>{fmt(e.amount)}</div>

                    <div>
                      <div style={{ color: '#F0F4FF', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const }}>
                        {e.description || <span style={{ color: '#8899BB' }}>Sin descripción</span>}
                      </div>
                      <div style={{ fontSize: 10, color: '#8899BB', marginTop: 2 }}>{e.created_by_name}</div>
                    </div>

                    <div>
                      <span style={{ fontSize: 11, fontWeight: 600, color: catColor(e.category), background: `rgba(${hexToRgb(catColor(e.category))}, .08)`, padding: '2px 8px', borderRadius: 20 }}>
                        {catLabel(e.category)}
                      </span>
                    </div>

                    <div style={{ fontSize: 11, color: '#8899BB' }}>
                      {payLabel(e.payment_method)}
                      {e.cash_session_id && (
                        <span style={{ marginLeft: 4, color: '#22C55E', fontSize: 10 }}>●</span>
                      )}
                    </div>

                    <div style={{ fontSize: 11, color: '#8899BB' }}>{fmtDate(e.expense_date)}</div>

                    <button
                      onClick={() => handleDelete(e.id)}
                      title="Eliminar gasto"
                      style={{ ...ST.btn, background: 'none', color: 'rgba(239,68,68,.35)', fontSize: 18, padding: 0, width: 28, height: 28, lineHeight: '28px', textAlign: 'center' as const }}
                    >
                      ×
                    </button>
                  </div>
                ))}
              </div>
            )}
          </>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: FLUJO FINANCIERO                                  */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'flujo' && (
          <>
            {/* Gráfico de flujo */}
            <div style={ST.card}>
              <div style={{ fontSize: 13, fontWeight: 700, color: '#5DE0E6', marginBottom: 14 }}>
                📊 Ventas vs Gastos por día
              </div>
              <FlowChart data={summary?.by_day || []} />
            </div>

            <div style={{ display: 'grid', gridTemplateColumns: '1fr 1fr', gap: 12 }}>

              {/* Por categoría */}
              <div style={ST.card}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#5DE0E6', marginBottom: 14 }}>
                  💸 Gastos por categoría
                </div>
                {(summary?.by_category || []).length === 0 ? (
                  <div style={{ fontSize: 12, color: '#8899BB', textAlign: 'center', padding: '20px 0' }}>
                    Sin gastos en este período
                  </div>
                ) : (summary?.by_category || []).map(cat => {
                  const pct   = maxCat > 0 ? (cat.total / maxCat) * 100 : 0
                  const color = catColor(cat.category)
                  return (
                    <div key={cat.category} style={{ marginBottom: 14 }}>
                      <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, marginBottom: 5 }}>
                        <span style={{ color: '#F0F4FF' }}>{catLabel(cat.category)}</span>
                        <div style={{ textAlign: 'right' }}>
                          <span style={{ fontWeight: 800, color }}>{fmt(cat.total)}</span>
                          <span style={{ fontSize: 10, color: '#8899BB', marginLeft: 6 }}>
                            {cat.count} reg.
                          </span>
                        </div>
                      </div>
                      <div style={{ height: 5, background: 'rgba(255,255,255,.06)', borderRadius: 3, overflow: 'hidden' }}>
                        <div style={{ height: '100%', width: `${pct}%`, background: color, borderRadius: 3, transition: 'width .4s' }} />
                      </div>
                    </div>
                  )
                })}
              </div>

              {/* Resumen financiero */}
              <div style={ST.card}>
                <div style={{ fontSize: 13, fontWeight: 700, color: '#5DE0E6', marginBottom: 14 }}>
                  📋 Resumen del período
                </div>

                {([
                  ['💵 Total ventas',          fmt(summary?.sales_total    || 0), '#5DE0E6'],
                  ['💸 Total gastos',          fmt(summary?.expenses_total || 0), '#EF4444'],
                  ['📊 Flujo neto',            (summary?.net_flow || 0) >= 0 ? '+' + fmt(summary?.net_flow || 0) : fmt(summary?.net_flow || 0), netPositive ? '#22C55E' : '#EF4444'],
                  ['📈 Ratio gasto/venta',     ratio !== null ? ratio + '%' : '—', ratio !== null && ratio > 80 ? '#EF4444' : ratio !== null && ratio > 50 ? '#F59E0B' : '#22C55E'],
                ] as [string, string, string][]).map(([l, v, c]) => (
                  <div key={l} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid rgba(93,224,230,.06)', fontSize: 13 }}>
                    <span style={{ color: '#8899BB' }}>{l}</span>
                    <span style={{ fontWeight: 800, color: c, fontSize: 15 }}>{v}</span>
                  </div>
                ))}

                {/* Ratio visual */}
                {ratio !== null && (
                  <div style={{ marginTop: 14 }}>
                    <div style={{ fontSize: 11, color: '#8899BB', marginBottom: 6 }}>Gastos como % de ventas</div>
                    <div style={{ height: 8, background: 'rgba(255,255,255,.06)', borderRadius: 4, overflow: 'hidden' }}>
                      <div style={{ height: '100%', width: `${Math.min(100, ratio)}%`, background: ratio > 80 ? '#EF4444' : ratio > 50 ? '#F59E0B' : '#22C55E', borderRadius: 4, transition: 'width .5s' }} />
                    </div>
                    <div style={{ fontSize: 10, color: '#8899BB', marginTop: 4 }}>
                      {ratio > 80 ? '⚠️ Gastos muy altos vs ventas' : ratio > 50 ? '⚡ Gastos moderados' : '✅ Gastos controlados'}
                    </div>
                  </div>
                )}

                {/* Métodos de pago gastos */}
                {(summary?.by_payment || []).length > 0 && (
                  <>
                    <div style={{ fontSize: 11, color: '#8899BB', fontWeight: 700, marginTop: 16, marginBottom: 8, textTransform: 'uppercase' as const, letterSpacing: '.3px' }}>
                      Gastos por método
                    </div>
                    {(summary?.by_payment || []).map(p => (
                      <div key={p.method} style={{ display: 'flex', justifyContent: 'space-between', fontSize: 12, padding: '4px 0' }}>
                        <span style={{ color: '#8899BB' }}>{payLabel(p.method)}</span>
                        <span style={{ fontWeight: 700, color: '#F0F4FF' }}>{fmt(p.total)}</span>
                      </div>
                    ))}
                  </>
                )}
              </div>
            </div>
          </>
        )}

        {/* ═══════════════════════════════════════════════════════ */}
        {/* TAB: IA INSIGHTS                                       */}
        {/* ═══════════════════════════════════════════════════════ */}
        {activeTab === 'resultado' && (
          <ResultadosTab summary={summary} period={periodLabel} />
        )}

        {activeTab === 'situacion' && (
          <SituacionTab summary={summary} period={periodLabel} />
        )}

        {activeTab === 'tributario' && (
          <TributarioTab summary={summary} period={periodLabel} company={company} />
        )}

        {activeTab === 'ia' && (
          <div style={ST.card}>

            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'flex-start', marginBottom: 22 }}>
              <div>
                <div style={{ fontSize: 16, fontWeight: 800, marginBottom: 4 }}>🤖 Análisis Financiero con IA</div>
                <div style={{ fontSize: 12, color: '#8899BB', lineHeight: 1.6 }}>
                  Claude analiza tus finanzas del período y genera insights accionables,<br />
                  alertas de gastos y sugerencias para mejorar la rentabilidad.
                </div>
              </div>
              <button
                onClick={generateInsight}
                disabled={aiLoading || !summary}
                style={{
                  ...ST.btn,
                  background: aiLoading ? 'rgba(93,224,230,.08)' : 'linear-gradient(90deg,#004AAD,#5DE0E6)',
                  color: '#fff', padding: '10px 20px', fontSize: 12,
                  opacity: !summary ? .5 : 1, flexShrink: 0,
                }}
              >
                {aiLoading ? '⏳ Analizando...' : '✨ Generar análisis'}
              </button>
            </div>

            {/* Error */}
            {aiError && (
              <div style={{ background: 'rgba(239,68,68,.08)', border: '1px solid rgba(239,68,68,.2)', borderRadius: 8, padding: '12px 16px', fontSize: 12, color: '#EF4444', marginBottom: 16 }}>
                ❌ {aiError}
              </div>
            )}

            {/* Estado inicial */}
            {!aiInsight && !aiLoading && !aiError && (
              <div style={{ textAlign: 'center', padding: '44px 20px', color: '#8899BB' }}>
                <div style={{ fontSize: 48, marginBottom: 14 }}>🤖</div>
                <div style={{ fontSize: 14, fontWeight: 700, color: '#F0F4FF', marginBottom: 8 }}>
                  Listo para analizar tus finanzas
                </div>
                <div style={{ fontSize: 12, lineHeight: 1.8, maxWidth: 360, margin: '0 auto' }}>
                  El análisis incluye:<br />
                  📊 Resumen de situación financiera<br />
                  ⚠️ Alertas de gastos inusuales<br />
                  💡 Insights por categoría y tendencias<br />
                  ✅ Sugerencias para mejorar el flujo de caja
                </div>
                {!summary && (
                  <div style={{ marginTop: 16, fontSize: 11, color: '#F59E0B', background: 'rgba(245,158,11,.08)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 8, padding: '8px 16px', display: 'inline-block' }}>
                    ⚠️ Selecciona un período con datos para generar el análisis
                  </div>
                )}
              </div>
            )}

            {/* Resultado */}
            {aiInsight && (
              <div>

                {/* Resumen */}
                <div style={{ background: 'rgba(0,74,173,.08)', border: '1px solid rgba(0,74,173,.25)', borderRadius: 10, padding: '16px 18px', marginBottom: 16 }}>
                  <div style={{ fontSize: 10, color: '#5DE0E6', fontWeight: 700, letterSpacing: '.5px', marginBottom: 8 }}>📊 SITUACIÓN FINANCIERA</div>
                  <div style={{ fontSize: 13, color: '#F0F4FF', lineHeight: 1.8 }}>{aiInsight.insight}</div>
                </div>

                {/* Alertas */}
                {aiInsight.alerts?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: '#F59E0B', fontWeight: 700, letterSpacing: '.5px', marginBottom: 8 }}>⚠️ ALERTAS</div>
                    {aiInsight.alerts.map((a: string, i: number) => (
                      <div key={i} style={{ background: 'rgba(245,158,11,.06)', border: '1px solid rgba(245,158,11,.15)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#F0F4FF', marginBottom: 6 }}>
                        {a}
                      </div>
                    ))}
                  </div>
                )}

                {/* Insights */}
                {aiInsight.insights_list?.length > 0 && (
                  <div style={{ marginBottom: 16 }}>
                    <div style={{ fontSize: 10, color: '#5DE0E6', fontWeight: 700, letterSpacing: '.5px', marginBottom: 8 }}>💡 INSIGHTS</div>
                    {aiInsight.insights_list.map((ins: string, i: number) => (
                      <div key={i} style={{ display: 'flex', gap: 10, padding: '9px 0', borderBottom: '1px solid rgba(93,224,230,.06)', fontSize: 12, alignItems: 'flex-start' }}>
                        <span style={{ color: '#5DE0E6', flexShrink: 0, fontWeight: 700 }}>→</span>
                        <span style={{ color: '#F0F4FF', lineHeight: 1.6 }}>{ins}</span>
                      </div>
                    ))}
                  </div>
                )}

                {/* Sugerencias */}
                {aiInsight.suggestions?.length > 0 && (
                  <div>
                    <div style={{ fontSize: 10, color: '#22C55E', fontWeight: 700, letterSpacing: '.5px', marginBottom: 8 }}>✅ SUGERENCIAS</div>
                    {aiInsight.suggestions.map((s: string, i: number) => (
                      <div key={i} style={{ background: 'rgba(34,197,94,.06)', border: '1px solid rgba(34,197,94,.12)', borderRadius: 8, padding: '10px 14px', fontSize: 12, color: '#F0F4FF', marginBottom: 6, lineHeight: 1.6 }}>
                        {s}
                      </div>
                    ))}
                  </div>
                )}

                {/* Footer */}
                <div style={{ marginTop: 18, display: 'flex', justifyContent: 'space-between', alignItems: 'center', fontSize: 10, color: '#8899BB' }}>
                  <span>Análisis generado por Claude AI · {new Date().toLocaleTimeString('es-CL')}</span>
                  <button
                    onClick={generateInsight}
                    style={{ ...ST.btn, background: 'none', color: '#5DE0E6', fontSize: 11, padding: '4px 10px', border: '1px solid rgba(93,224,230,.2)' }}
                  >
                    🔄 Regenerar
                  </button>
                </div>
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  )
}

// ── ESTADO DE RESULTADOS helper ───────────────────────────────────────────────
function ResultadosTab({ summary, period }: { summary: FinanceSummary | null; period: string }) {
  if (!summary) return (
    <div style={ST.card}>
      <div style={{ textAlign:'center', padding:40, color:'#8899BB' }}>
        <div style={{ fontSize:32, marginBottom:10 }}>📋</div>
        <div>Selecciona un período con datos para ver el Estado de Resultados</div>
      </div>
    </div>
  )

  const ingNeto = summary.sales_total
  const costoVentas = (summary.by_category?.find(c => c.category === 'proveedores')?.total || 0)
    + (summary.by_category?.find(c => c.category === 'insumos')?.total || 0)
  const utilidadBruta = ingNeto - costoVentas
  const gastosOper = (summary.by_category?.find(c => c.category === 'arriendo')?.total || 0)
    + (summary.by_category?.find(c => c.category === 'servicios')?.total || 0)
    + (summary.by_category?.find(c => c.category === 'otros')?.total || 0)
  const gastosPersonal = summary.by_category?.find(c => c.category === 'sueldos')?.total || 0
  const ebitda = utilidadBruta - gastosOper - gastosPersonal
  const impuesto = ebitda > 0 ? Math.round(ebitda * 0.27) : 0 // PPM 27% aprox
  const utilidadNeta = ebitda - impuesto
  const margenBruto  = ingNeto > 0 ? Math.round((utilidadBruta  / ingNeto) * 100) : 0
  const margenNeto   = ingNeto > 0 ? Math.round((utilidadNeta   / ingNeto) * 100) : 0

  const fmt2 = (n: number) => (n >= 0 ? '' : '-') + '$' + Math.abs(Math.round(n)).toLocaleString('es-CL')
  const Row = ({ label, value, indent = 0, bold = false, color = '#F0F4FF', border = false, sub = false }:
    { label: string; value: number; indent?: number; bold?: boolean; color?: string; border?: boolean; sub?: boolean }) => (
    <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', padding:'6px 0', borderBottom: border ? '1px solid rgba(93,224,230,.1)' : 'none', paddingLeft: indent * 16 }}>
      <span style={{ fontSize: sub ? 11 : 12, color: sub ? '#8899BB' : '#F0F4FF', fontWeight: bold ? 800 : 500 }}>{label}</span>
      <span style={{ fontSize: sub ? 11 : 12, fontWeight: bold ? 800 : 600, color }}>{fmt2(value)}</span>
    </div>
  )

  return (
    <div style={ST.card}>
      <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center', marginBottom:20 }}>
        <div>
          <div style={{ fontSize:15, fontWeight:800 }}>📋 Estado de Resultados</div>
          <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>Período: {period} · Método simplificado según IFRS Pymes</div>
        </div>
        <div style={{ display:'flex', gap:8 }}>
          <button onClick={() => {
            const win = window.open('','_blank')!
            win.document.write(`<!DOCTYPE html><html><head><title>Estado de Resultados</title><style>body{font-family:Arial,sans-serif;max-width:700px;margin:40px auto;color:#000}table{width:100%;border-collapse:collapse}td{padding:6px 8px}tr:nth-child(even){background:#f9f9f9}.bold{font-weight:bold}.neg{color:#dc2626}.pos{color:#16a34a}</style></head><body>
            <h2>ESTADO DE RESULTADOS</h2><p>Período: ${period}</p>
            <table>
            <tr><td>Ingresos netos de ventas</td><td align="right">${fmt2(ingNeto)}</td></tr>
            <tr><td>(-) Costo de ventas</td><td align="right">${fmt2(-costoVentas)}</td></tr>
            <tr class="bold"><td>= Utilidad bruta</td><td align="right">${fmt2(utilidadBruta)}</td></tr>
            <tr><td>(-) Gastos operacionales</td><td align="right">${fmt2(-gastosOper)}</td></tr>
            <tr><td>(-) Gastos de personal</td><td align="right">${fmt2(-gastosPersonal)}</td></tr>
            <tr class="bold"><td>= EBITDA</td><td align="right">${fmt2(ebitda)}</td></tr>
            <tr><td>(-) Impuesto estimado (27%)</td><td align="right">${fmt2(-impuesto)}</td></tr>
            <tr class="bold"><td>= Utilidad neta del período</td><td align="right" class="${utilidadNeta>=0?'pos':'neg'}">${fmt2(utilidadNeta)}</td></tr>
            </table>
            <script>window.print()<\/script></body></html>`)
          }}
            style={{ ...ST.btn, background:'rgba(239,68,68,.1)', border:'1px solid rgba(239,68,68,.2)', color:'#EF4444', padding:'6px 14px', fontSize:11 }}>
            📄 PDF
          </button>
        </div>
      </div>

      {/* Ingresos */}
      <div style={{ background:'rgba(34,197,94,.04)', border:'1px solid rgba(34,197,94,.12)', borderRadius:10, padding:'12px 16px', marginBottom:10 }}>
        <div style={{ fontSize:10, fontWeight:800, color:'#22C55E', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>I. INGRESOS</div>
        <Row label='Ventas netas del período' value={ingNeto} bold color='#22C55E' />
      </div>

      {/* Costos */}
      <div style={{ background:'rgba(239,68,68,.04)', border:'1px solid rgba(239,68,68,.12)', borderRadius:10, padding:'12px 16px', marginBottom:10 }}>
        <div style={{ fontSize:10, fontWeight:800, color:'#EF4444', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>II. COSTO DE VENTAS</div>
        <Row label='Proveedores / materiales' value={summary.by_category?.find(c=>c.category==='proveedores')?.total||0} sub indent={1} color='#EF4444' />
        <Row label='Insumos' value={summary.by_category?.find(c=>c.category==='insumos')?.total||0} sub indent={1} color='#EF4444' />
        <Row label='Total costo de ventas' value={costoVentas} bold color='#EF4444' border />
      </div>

      {/* Utilidad bruta */}
      <div style={{ background: utilidadBruta >= 0 ? 'rgba(34,197,94,.06)' : 'rgba(239,68,68,.06)', border:`1px solid ${utilidadBruta>=0?'rgba(34,197,94,.2)':'rgba(239,68,68,.2)'}`, borderRadius:10, padding:'12px 16px', marginBottom:10 }}>
        <Row label='UTILIDAD BRUTA' value={utilidadBruta} bold color={utilidadBruta>=0?'#22C55E':'#EF4444'} />
        <div style={{ fontSize:10, color:'#8899BB', marginTop:4 }}>Margen bruto: {margenBruto}%</div>
      </div>

      {/* Gastos operacionales */}
      <div style={{ background:'rgba(245,158,11,.04)', border:'1px solid rgba(245,158,11,.12)', borderRadius:10, padding:'12px 16px', marginBottom:10 }}>
        <div style={{ fontSize:10, fontWeight:800, color:'#F59E0B', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:8 }}>III. GASTOS OPERACIONALES</div>
        <Row label='Arriendo' value={summary.by_category?.find(c=>c.category==='arriendo')?.total||0} sub indent={1} color='#F59E0B' />
        <Row label='Servicios básicos' value={summary.by_category?.find(c=>c.category==='servicios')?.total||0} sub indent={1} color='#F59E0B' />
        <Row label='Personal (sueldos)' value={gastosPersonal} sub indent={1} color='#F59E0B' />
        <Row label='Otros gastos' value={summary.by_category?.find(c=>c.category==='otros')?.total||0} sub indent={1} color='#F59E0B' />
        <Row label='Total gastos operacionales' value={gastosOper + gastosPersonal} bold color='#F59E0B' border />
      </div>

      {/* EBITDA */}
      <div style={{ background:'rgba(93,224,230,.06)', border:'1px solid rgba(93,224,230,.2)', borderRadius:10, padding:'12px 16px', marginBottom:10 }}>
        <Row label='EBITDA (Resultado operacional)' value={ebitda} bold color='#5DE0E6' />
      </div>

      {/* Impuesto */}
      <div style={{ padding:'6px 16px', marginBottom:10 }}>
        <Row label='(-) Impuesto a la renta estimado (27%)' value={impuesto} sub color='#EF4444' />
      </div>

      {/* Utilidad neta */}
      <div style={{ background: utilidadNeta >= 0 ? 'rgba(34,197,94,.08)' : 'rgba(239,68,68,.08)', border:`2px solid ${utilidadNeta>=0?'rgba(34,197,94,.4)':'rgba(239,68,68,.4)'}`, borderRadius:12, padding:'16px 16px' }}>
        <Row label='UTILIDAD NETA DEL PERÍODO' value={utilidadNeta} bold color={utilidadNeta>=0?'#22C55E':'#EF4444'} />
        <div style={{ fontSize:10, color:'#8899BB', marginTop:4 }}>Margen neto: {margenNeto}% · {utilidadNeta>=0?'✅ Período rentable':'⚠️ Período con pérdidas'}</div>
      </div>

      <div style={{ marginTop:14, fontSize:10, color:'#8899BB', lineHeight:1.6 }}>
        * Estado de resultados simplificado basado en ingresos de ventas y gastos registrados en el sistema.
        Para efectos tributarios ante SII, consulte con un contador certificado.
        Tasa de impuesto estimada: 27% (régimen general empresas Chile 2024).
      </div>
    </div>
  )
}

// ── SITUACIÓN FINANCIERA helper ───────────────────────────────────────────────
function SituacionTab({ summary, period }: { summary: FinanceSummary | null; period: string }) {
  if (!summary) return (
    <div style={ST.card}>
      <div style={{ textAlign:'center', padding:40, color:'#8899BB' }}>
        <div style={{ fontSize:32, marginBottom:10 }}>⚖️</div>
        <div>Selecciona un período con datos para ver la Situación Financiera</div>
      </div>
    </div>
  )

  const ingNeto       = summary.sales_total
  const totalGastos   = summary.expenses_total
  const utilidadNeta  = ingNeto - totalGastos
  const ivaCobrado    = Math.round(ingNeto * 0.19 / 1.19)
  const ivaPagado     = Math.round(totalGastos * 0.19 / 1.19)
  const ivaADeber     = Math.max(0, ivaCobrado - ivaPagado)

  const fmt2 = (n: number) => '$' + Math.abs(Math.round(n)).toLocaleString('es-CL')

  const SRow = ({ label, value, bold = false, color = '#F0F4FF', indent = 0, sub = false }:
    { label: string; value: string | number; bold?: boolean; color?: string; indent?: number; sub?: boolean }) => (
    <div style={{ display:'flex', justifyContent:'space-between', padding:'5px 0', paddingLeft: indent*14, borderBottom:'1px solid rgba(93,224,230,.05)' }}>
      <span style={{ fontSize: sub ? 11 : 12, color: sub ? '#8899BB' : '#F0F4FF', fontWeight: bold ? 800 : 500 }}>{label}</span>
      <span style={{ fontSize: sub ? 11 : 12, fontWeight: bold ? 800 : 600, color }}>{typeof value === 'number' ? fmt2(value) : value}</span>
    </div>
  )

  return (
    <div>
      <div style={{ ...ST.card, marginBottom:14 }}>
        <div style={{ fontSize:15, fontWeight:800, marginBottom:4 }}>⚖️ Estado de Situación Financiera</div>
        <div style={{ fontSize:11, color:'#8899BB' }}>Período: {period} · Valores estimados según datos del sistema</div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14 }}>
        {/* ACTIVOS */}
        <div style={{ ...ST.card }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#22C55E', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:12, paddingBottom:8, borderBottom:'1px solid rgba(34,197,94,.15)' }}>
            ACTIVOS
          </div>
          <div style={{ fontSize:10, color:'#5DE0E6', fontWeight:700, marginBottom:6, marginTop:8 }}>Activo Corriente</div>
          <SRow label='Caja / efectivo estimado' value={Math.max(0, summary.net_flow)} sub indent={1} color='#22C55E' />
          <SRow label='Cuentas por cobrar (est.)' value={Math.round(ingNeto * 0.15)} sub indent={1} />
          <SRow label='Inventario (est.)' value={Math.round((summary.by_category?.find(c=>c.category==='insumos')?.total||0) * 0.3)} sub indent={1} />
          <SRow label='Total Activo Corriente' value={Math.max(0, summary.net_flow) + Math.round(ingNeto * 0.15)} bold color='#22C55E' />

          <div style={{ fontSize:10, color:'#5DE0E6', fontWeight:700, marginBottom:6, marginTop:12 }}>Activo No Corriente</div>
          <SRow label='Activos fijos (no registrados)' value='—' sub indent={1} color='#8899BB' />
          <SRow label='Total Activo No Corriente' value='—' bold color='#8899BB' />

          <div style={{ marginTop:12, paddingTop:8, borderTop:'2px solid rgba(34,197,94,.3)' }}>
            <SRow label='TOTAL ACTIVOS' value={Math.max(0, summary.net_flow) + Math.round(ingNeto * 0.15)} bold color='#22C55E' />
          </div>
        </div>

        {/* PASIVOS + PATRIMONIO */}
        <div style={{ ...ST.card }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#EF4444', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:12, paddingBottom:8, borderBottom:'1px solid rgba(239,68,68,.15)' }}>
            PASIVOS Y PATRIMONIO
          </div>
          <div style={{ fontSize:10, color:'#F59E0B', fontWeight:700, marginBottom:6, marginTop:8 }}>Pasivo Corriente</div>
          <SRow label='Cuentas por pagar proveedores' value={Math.round((summary.by_category?.find(c=>c.category==='proveedores')?.total||0)*0.2)} sub indent={1} color='#EF4444' />
          <SRow label='IVA débito fiscal (est.)' value={ivaADeber} sub indent={1} color='#EF4444' />
          <SRow label='Remuneraciones por pagar' value={Math.round((summary.by_category?.find(c=>c.category==='sueldos')?.total||0)*0.1)} sub indent={1} color='#EF4444' />
          <SRow label='Total Pasivo Corriente' value={ivaADeber + Math.round((summary.by_category?.find(c=>c.category==='proveedores')?.total||0)*0.2)} bold color='#EF4444' />

          <div style={{ fontSize:10, color:'#A78BFA', fontWeight:700, marginBottom:6, marginTop:12 }}>Patrimonio</div>
          <SRow label='Capital inicial (est.)' value='—' sub indent={1} color='#8899BB' />
          <SRow label='Resultado del período' value={utilidadNeta} sub indent={1} color={utilidadNeta>=0?'#22C55E':'#EF4444'} />
          <SRow label='Total Patrimonio' value={utilidadNeta} bold color={utilidadNeta>=0?'#22C55E':'#EF4444'} />

          <div style={{ marginTop:12, paddingTop:8, borderTop:'2px solid rgba(239,68,68,.3)' }}>
            <SRow label='TOTAL PASIVOS + PATRIMONIO' value={ivaADeber + Math.round((summary.by_category?.find(c=>c.category==='proveedores')?.total||0)*0.2) + Math.max(0,utilidadNeta)} bold color='#EF4444' />
          </div>
        </div>
      </div>

      {/* Indicadores */}
      <div style={{ ...ST.card, marginTop:14 }}>
        <div style={{ fontSize:12, fontWeight:800, marginBottom:14 }}>📊 Indicadores Financieros</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(180px,1fr))', gap:12 }}>
          {[
            { label:'Liquidez corriente', value: ingNeto > 0 ? (Math.max(0,summary.net_flow) / Math.max(1, ivaADeber)).toFixed(2) : '—', desc:'> 1.0 es saludable', color:'#5DE0E6' },
            { label:'Margen operacional', value: ingNeto > 0 ? Math.round(((ingNeto-totalGastos)/ingNeto)*100)+'%' : '—', desc:'Ingresos vs gastos totales', color: (ingNeto-totalGastos)>=0?'#22C55E':'#EF4444' },
            { label:'Carga de gastos', value: ingNeto > 0 ? Math.round((totalGastos/ingNeto)*100)+'%' : '—', desc:'Gastos sobre ingresos', color: totalGastos/Math.max(1,ingNeto) < 0.7 ? '#22C55E' : '#F59E0B' },
            { label:'IVA neto a pagar', value: fmt2(ivaADeber), desc:'IVA débito - IVA crédito', color:'#F59E0B' },
          ].map(ind => (
            <div key={ind.label} style={{ background:'rgba(93,224,230,.04)', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'12px 14px' }}>
              <div style={{ fontSize:11, color:'#8899BB', marginBottom:4 }}>{ind.label}</div>
              <div style={{ fontSize:20, fontWeight:800, color:ind.color, marginBottom:2 }}>{ind.value}</div>
              <div style={{ fontSize:9, color:'#8899BB' }}>{ind.desc}</div>
            </div>
          ))}
        </div>
      </div>

      <div style={{ marginTop:10, fontSize:10, color:'#8899BB', lineHeight:1.6, padding:'0 4px' }}>
        * Estado de Situación Financiera simplificado basado en datos operativos del sistema. Los valores marcados con "—" requieren
        registro manual de activos fijos, pasivos de largo plazo y capital. Para una contabilidad completa, trabaje con un contador certificado.
      </div>
    </div>
  )
}

// ── TRIBUTARIO SII ────────────────────────────────────────────────────────────
function TributarioTab({ summary, period, company }: { summary: FinanceSummary | null; period: string; company: any }) {
  const [month, setMonth] = useState(new Date().toISOString().slice(0,7))

  if (!summary) return (
    <div style={ST.card}>
      <div style={{ textAlign:'center', padding:40, color:'#8899BB' }}>
        <div style={{ fontSize:32, marginBottom:10 }}>🧾</div>
        <div>Selecciona un período con datos para ver el informe tributario</div>
      </div>
    </div>
  )

  const ventasNetas = summary.sales_total
  const ventasBrutas = ventasNetas
  const ivaDebito = Math.round(ventasBrutas * 0.19 / 1.19) // assuming prices are con IVA
  const ventasAfectas = Math.round(ventasBrutas / 1.19)
  const ventasExentas = 0

  const comprasTotal = summary.expenses_total
  const ivaCredito = Math.round(
    ((summary.by_category?.find(c=>c.category==='proveedores')?.total||0)
    + (summary.by_category?.find(c=>c.category==='insumos')?.total||0)
    + (summary.by_category?.find(c=>c.category==='servicios')?.total||0)) * 0.19 / 1.19
  )
  const ivaNeto = Math.max(0, ivaDebito - ivaCredito)
  const ppm = Math.round(ventasAfectas * 0.011) // PPM 1.1% aprox PYME
  const totalADeclarar = ivaNeto + ppm

  const fmt2 = (n: number) => '$' + Math.round(n).toLocaleString('es-CL')

  return (
    <div>
      {/* Header */}
      <div style={{ ...ST.card, marginBottom:14 }}>
        <div style={{ display:'flex', justifyContent:'space-between', alignItems:'center' }}>
          <div>
            <div style={{ fontSize:15, fontWeight:800 }}>🧾 Módulo Tributario SII</div>
            <div style={{ fontSize:11, color:'#8899BB', marginTop:2 }}>
              {company?.name} · RUT: {company?.rut || 'No registrado'} · Período: {period}
            </div>
          </div>
          <a href='https://www.sii.cl' target='_blank' rel='noopener noreferrer'
            style={{ fontSize:11, color:'#5DE0E6', textDecoration:'none', border:'1px solid rgba(93,224,230,.25)', borderRadius:7, padding:'5px 12px' }}>
            🌐 Portal SII →
          </a>
        </div>
      </div>

      <div style={{ display:'grid', gridTemplateColumns:'1fr 1fr', gap:14, marginBottom:14 }}>
        {/* Libro de Ventas */}
        <div style={{ ...ST.card }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#22C55E', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:12 }}>
            📗 Libro de Ventas
          </div>
          {[
            { label:'Ventas brutas (con IVA)', value: ventasBrutas, color:'#F0F4FF' },
            { label:'Ventas afectas (neto)', value: ventasAfectas, color:'#22C55E' },
            { label:'Ventas exentas', value: ventasExentas, color:'#8899BB' },
            { label:'IVA débito fiscal (19%)', value: ivaDebito, color:'#F59E0B' },
          ].map(r => (
            <div key={r.label} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid rgba(93,224,230,.06)' }}>
              <span style={{ fontSize:11, color:'#8899BB' }}>{r.label}</span>
              <span style={{ fontSize:11, fontWeight:700, color:r.color }}>{fmt2(r.value)}</span>
            </div>
          ))}
          <button onClick={() => {
            const csv = ['Concepto,Monto',`Ventas brutas,${ventasBrutas}`,`Ventas afectas (neto),${ventasAfectas}`,`IVA débito fiscal,${ivaDebito}`].join('\n')
            const blob = new Blob(['\uFEFF'+csv], {type:'text/csv'})
            const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='libro-ventas.csv'; a.click()
          }} style={{ ...ST.btn, width:'100%', marginTop:12, background:'rgba(34,197,94,.08)', border:'1px solid rgba(34,197,94,.2)', color:'#22C55E', padding:'6px 0', fontSize:11 }}>
            ↓ Exportar CSV
          </button>
        </div>

        {/* Libro de Compras */}
        <div style={{ ...ST.card }}>
          <div style={{ fontSize:11, fontWeight:800, color:'#A78BFA', letterSpacing:'.06em', textTransform:'uppercase', marginBottom:12 }}>
            📕 Libro de Compras
          </div>
          {(summary.by_category || []).map(cat => (
            <div key={cat.category} style={{ display:'flex', justifyContent:'space-between', padding:'6px 0', borderBottom:'1px solid rgba(93,224,230,.06)' }}>
              <span style={{ fontSize:11, color:'#8899BB' }}>{cat.category}</span>
              <span style={{ fontSize:11, fontWeight:700, color:'#F0F4FF' }}>{fmt2(cat.total)}</span>
            </div>
          ))}
          <div style={{ display:'flex', justifyContent:'space-between', padding:'8px 0', borderTop:'1px solid rgba(167,139,250,.2)', marginTop:4 }}>
            <span style={{ fontSize:11, fontWeight:800 }}>IVA crédito fiscal (19%)</span>
            <span style={{ fontSize:11, fontWeight:800, color:'#A78BFA' }}>{fmt2(ivaCredito)}</span>
          </div>
          <button onClick={() => {
            const rows = ['Categoría,Monto', ...(summary.by_category||[]).map(c=>`${c.category},${c.total}`), `IVA crédito,${ivaCredito}`].join('\n')
            const blob = new Blob(['\uFEFF'+rows], {type:'text/csv'})
            const a = document.createElement('a'); a.href=URL.createObjectURL(blob); a.download='libro-compras.csv'; a.click()
          }} style={{ ...ST.btn, width:'100%', marginTop:12, background:'rgba(167,139,250,.08)', border:'1px solid rgba(167,139,250,.2)', color:'#A78BFA', padding:'6px 0', fontSize:11 }}>
            ↓ Exportar CSV
          </button>
        </div>
      </div>

      {/* Formulario 29 */}
      <div style={{ ...ST.card, marginBottom:14 }}>
        <div style={{ fontSize:12, fontWeight:800, marginBottom:14 }}>
          📄 Formulario 29 — Estimación mensual
          <span style={{ fontSize:10, fontWeight:400, color:'#8899BB', marginLeft:8 }}>Declaración mensual de IVA y PPM</span>
        </div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:12, marginBottom:14 }}>
          {[
            { code:'Line 20', label:'Ventas afectas (neto)', value: ventasAfectas, color:'#5DE0E6' },
            { code:'Line 6',  label:'IVA débito fiscal',     value: ivaDebito,      color:'#F59E0B' },
            { code:'Line 24', label:'IVA crédito fiscal',    value: ivaCredito,     color:'#22C55E' },
            { code:'Line 39', label:'IVA a pagar (neto)',    value: ivaNeto,        color: ivaNeto>0?'#EF4444':'#22C55E' },
            { code:'PPM',     label:'Pago Provisional (1.1%)', value: ppm,          color:'#F59E0B' },
            { code:'TOTAL',   label:'Total a declarar SII',  value: totalADeclarar, color: totalADeclarar>0?'#EF4444':'#22C55E' },
          ].map(f => (
            <div key={f.code} style={{ background:'rgba(93,224,230,.04)', border:'1px solid rgba(93,224,230,.1)', borderRadius:10, padding:'10px 12px' }}>
              <div style={{ fontSize:9, color:'#8899BB', marginBottom:2 }}>{f.code}</div>
              <div style={{ fontSize:10, color:'#8899BB', marginBottom:4 }}>{f.label}</div>
              <div style={{ fontSize:18, fontWeight:800, color:f.color }}>{fmt2(f.value)}</div>
            </div>
          ))}
        </div>
        <div style={{ background:'rgba(0,74,173,.08)', border:'1px solid rgba(0,74,173,.2)', borderRadius:10, padding:'12px 16px' }}>
          <div style={{ fontSize:11, fontWeight:700, color:'#5DE0E6', marginBottom:6 }}>ℹ️ Instrucciones para declarar en SII</div>
          <ol style={{ fontSize:11, color:'#8899BB', paddingLeft:16, margin:0, lineHeight:2 }}>
            <li>Accede a <strong style={{color:'#5DE0E6'}}>www.sii.cl</strong> → Servicios Online → Impuestos Mensuales (F29)</li>
            <li>Ingresa con tu RUT y Clave Tributaria</li>
            <li>Declara las ventas afectas del período: <strong style={{color:'#F0F4FF'}}>{fmt2(ventasAfectas)}</strong></li>
            <li>Ingresa compras con derecho a crédito: <strong style={{color:'#F0F4FF'}}>{fmt2(ivaCredito)}</strong></li>
            <li>El sistema calculará el IVA neto a pagar automáticamente</li>
            <li>Plazo: hasta el día 12 del mes siguiente (o 20 si se paga por internet)</li>
          </ol>
        </div>
      </div>

      {/* Calendario tributario */}
      <div style={{ ...ST.card }}>
        <div style={{ fontSize:12, fontWeight:800, marginBottom:12 }}>📅 Calendario Tributario Chile 2025-2026</div>
        <div style={{ display:'grid', gridTemplateColumns:'repeat(auto-fill,minmax(200px,1fr))', gap:8 }}>
          {[
            { fecha:'Día 12 c/mes',   obligacion:'F29 — IVA + PPM (pago presencial)',    color:'#EF4444' },
            { fecha:'Día 20 c/mes',   obligacion:'F29 — IVA + PPM (pago electrónico)',   color:'#F59E0B' },
            { fecha:'Día 13 c/mes',   obligacion:'Libro de Ventas electrónico',          color:'#5DE0E6' },
            { fecha:'Abril cada año', obligacion:'Renta anual (Operación Renta)',         color:'#22C55E' },
            { fecha:'Diciembre',      obligacion:'Balance tributario anual',              color:'#A78BFA' },
            { fecha:'Según régimen',  obligacion:'PPM: 1.1% ventas netas (PYME)',         color:'#C19E4D' },
          ].map(item => (
            <div key={item.fecha} style={{ background:`rgba(0,0,0,.15)`, border:`1px solid ${item.color}30`, borderLeft:`3px solid ${item.color}`, borderRadius:8, padding:'8px 10px' }}>
              <div style={{ fontSize:10, fontWeight:800, color:item.color, marginBottom:3 }}>{item.fecha}</div>
              <div style={{ fontSize:10, color:'#8899BB', lineHeight:1.4 }}>{item.obligacion}</div>
            </div>
          ))}
        </div>
        <div style={{ marginTop:10, fontSize:10, color:'#8899BB' }}>
          * Valores estimados. Siempre verifica con tu contador y en sii.cl antes de declarar.
          Los cálculos de IVA asumen precios con IVA incluido. PPM estimado 1.1% para régimen PYME.
        </div>
      </div>
    </div>
  )
}

// Helper para convertir hex a rgb (para rgba())
function hexToRgb(hex: string): string {
  const clean = hex.replace('#', '')
  if (clean.length === 3) {
    const r = parseInt(clean[0] + clean[0], 16)
    const g = parseInt(clean[1] + clean[1], 16)
    const b = parseInt(clean[2] + clean[2], 16)
    return `${r},${g},${b}`
  }
  const r = parseInt(clean.slice(0, 2), 16)
  const g = parseInt(clean.slice(2, 4), 16)
  const b = parseInt(clean.slice(4, 6), 16)
  return `${r},${g},${b}`
}
