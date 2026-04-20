'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

// ─── Types ───────────────────────────────────────────────────────────────────

interface FormData {
  // Step 1 — Credenciales
  email: string
  password: string
  confirmPassword: string
  // Step 2 — Datos personales
  firstName: string
  lastName: string
  // Step 3 — Empresa
  companyName: string
  rut: string
  address: string
  city: string
}

// ─── Estilos compartidos ──────────────────────────────────────────────────────

const S = {
  label: {
    display: 'block',
    fontSize: '12px',
    fontWeight: '600',
    color: '#8899BB',
    marginBottom: '6px',
  } as React.CSSProperties,
  input: {
    width: '100%',
    background: '#0A1628',
    border: '1px solid rgba(93,224,230,0.12)',
    borderRadius: '8px',
    padding: '10px 12px',
    fontSize: '13px',
    color: '#F0F4FF',
    outline: 'none',
    boxSizing: 'border-box',
    fontFamily: 'Montserrat, sans-serif',
  } as React.CSSProperties,
  field: { marginBottom: '16px' } as React.CSSProperties,
  row: { display: 'grid', gridTemplateColumns: '1fr 1fr', gap: '12px' } as React.CSSProperties,
}

// ─── Paso 1 — Credenciales ───────────────────────────────────────────────────

function Step1({
  data,
  onChange,
}: {
  data: FormData
  onChange: (k: keyof FormData, v: string) => void
}) {
  return (
    <>
      <div style={S.field}>
        <label style={S.label}>Correo electrónico *</label>
        <input
          type="email"
          value={data.email}
          onChange={(e) => onChange('email', e.target.value)}
          placeholder="tu@correo.com"
          required
          style={S.input}
        />
      </div>
      <div style={S.field}>
        <label style={S.label}>Contraseña *</label>
        <input
          type="password"
          value={data.password}
          onChange={(e) => onChange('password', e.target.value)}
          placeholder="Mínimo 8 caracteres"
          required
          style={S.input}
        />
      </div>
      <div style={S.field}>
        <label style={S.label}>Confirmar contraseña *</label>
        <input
          type="password"
          value={data.confirmPassword}
          onChange={(e) => onChange('confirmPassword', e.target.value)}
          placeholder="Repite tu contraseña"
          required
          style={S.input}
        />
      </div>
    </>
  )
}

// ─── Paso 2 — Datos personales ────────────────────────────────────────────────

function Step2({
  data,
  onChange,
}: {
  data: FormData
  onChange: (k: keyof FormData, v: string) => void
}) {
  return (
    <>
      <div style={S.row}>
        <div style={S.field}>
          <label style={S.label}>Nombre *</label>
          <input
            value={data.firstName}
            onChange={(e) => onChange('firstName', e.target.value)}
            placeholder="Juan"
            required
            style={S.input}
          />
        </div>
        <div style={S.field}>
          <label style={S.label}>Apellido</label>
          <input
            value={data.lastName}
            onChange={(e) => onChange('lastName', e.target.value)}
            placeholder="Pérez"
            style={S.input}
          />
        </div>
      </div>
      <div style={{
        background: 'rgba(93,224,230,0.05)',
        border: '1px solid rgba(93,224,230,0.12)',
        borderRadius: '8px',
        padding: '12px',
        fontSize: '12px',
        color: '#8899BB',
        lineHeight: '1.6',
      }}>
        Serás el <strong style={{ color: '#5DE0E6' }}>administrador</strong> de tu empresa en Mosaico Pro.
        Podrás invitar colaboradores desde la sección Configuración.
      </div>
    </>
  )
}

// ─── Paso 3 — Empresa ────────────────────────────────────────────────────────

function Step3({
  data,
  onChange,
}: {
  data: FormData
  onChange: (k: keyof FormData, v: string) => void
}) {
  return (
    <>
      <div style={S.field}>
        <label style={S.label}>Nombre de la empresa *</label>
        <input
          value={data.companyName}
          onChange={(e) => onChange('companyName', e.target.value)}
          placeholder="Mi Empresa SpA"
          required
          style={S.input}
        />
      </div>
      <div style={S.field}>
        <label style={S.label}>RUT empresa</label>
        <input
          value={data.rut}
          onChange={(e) => onChange('rut', e.target.value)}
          placeholder="12.345.678-9"
          style={S.input}
        />
      </div>
      <div style={S.field}>
        <label style={S.label}>Dirección</label>
        <input
          value={data.address}
          onChange={(e) => onChange('address', e.target.value)}
          placeholder="Av. Providencia 1234"
          style={S.input}
        />
      </div>
      <div style={S.field}>
        <label style={S.label}>Ciudad</label>
        <input
          value={data.city}
          onChange={(e) => onChange('city', e.target.value)}
          placeholder="Santiago"
          style={S.input}
        />
      </div>
    </>
  )
}

// ─── Paso 4 — Confirmación ────────────────────────────────────────────────────

function Step4({ data }: { data: FormData }) {
  const row = (label: string, value: string) =>
    value ? (
      <div style={{ display: 'flex', justifyContent: 'space-between', padding: '6px 0', borderBottom: '1px solid rgba(93,224,230,0.07)', fontSize: '13px' }}>
        <span style={{ color: '#8899BB' }}>{label}</span>
        <span style={{ color: '#F0F4FF', fontWeight: '600' }}>{value}</span>
      </div>
    ) : null

  return (
    <>
      <div style={{ fontSize: '13px', color: '#8899BB', marginBottom: '16px' }}>
        Revisa los datos antes de crear tu cuenta.
      </div>
      <div style={{ background: '#0A1628', borderRadius: '10px', padding: '16px', marginBottom: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#5DE0E6', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Tu cuenta
        </div>
        {row('Email', data.email)}
        {row('Nombre', `${data.firstName} ${data.lastName}`.trim())}
      </div>
      <div style={{ background: '#0A1628', borderRadius: '10px', padding: '16px' }}>
        <div style={{ fontSize: '11px', fontWeight: '700', color: '#5DE0E6', marginBottom: '10px', textTransform: 'uppercase', letterSpacing: '0.08em' }}>
          Tu empresa
        </div>
        {row('Nombre', data.companyName)}
        {row('RUT', data.rut)}
        {row('Dirección', data.address)}
        {row('Ciudad', data.city || 'Santiago')}
        {row('Plan', 'Free')}
      </div>
    </>
  )
}

// ─── Componente principal ─────────────────────────────────────────────────────

const STEPS = [
  { num: 1, label: 'Acceso' },
  { num: 2, label: 'Tus datos' },
  { num: 3, label: 'Empresa' },
  { num: 4, label: 'Confirmar' },
]

const EMPTY: FormData = {
  email: '',
  password: '',
  confirmPassword: '',
  firstName: '',
  lastName: '',
  companyName: '',
  rut: '',
  address: '',
  city: '',
}

export default function OnboardingPage() {
  const [step, setStep] = useState(1)
  const [data, setData] = useState<FormData>(EMPTY)
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  function handleChange(k: keyof FormData, v: string) {
    setData((prev) => ({ ...prev, [k]: v }))
    setError('')
  }

  function validate(): string {
    if (step === 1) {
      if (!data.email || !data.password || !data.confirmPassword)
        return 'Completa todos los campos obligatorios.'
      if (data.password.length < 8)
        return 'La contraseña debe tener al menos 8 caracteres.'
      if (data.password !== data.confirmPassword)
        return 'Las contraseñas no coinciden.'
    }
    if (step === 2) {
      if (!data.firstName.trim()) return 'Ingresa tu nombre.'
    }
    if (step === 3) {
      if (!data.companyName.trim()) return 'Ingresa el nombre de tu empresa.'
    }
    return ''
  }

  function handleNext() {
    const err = validate()
    if (err) { setError(err); return }
    setError('')
    setStep((s) => s + 1)
  }

  async function handleSubmit() {
    setLoading(true)
    setError('')

    try {
      // 1. Crear cuenta en Supabase Auth
      const { data: authData, error: signUpError } = await supabase.auth.signUp({
        email: data.email,
        password: data.password,
      })

      if (signUpError) throw new Error(signUpError.message)
      if (!authData.user) throw new Error('No se pudo crear el usuario.')

      // 2. Crear empresa + registro de usuario via RPC
      const { data: rpcData, error: rpcError } = await supabase.rpc(
        'create_company_with_owner',
        {
          p_data: {
            auth_user_id: authData.user.id,
            email: data.email,
            first_name: data.firstName,
            last_name: data.lastName,
            company_name: data.companyName,
            rut: data.rut,
            address: data.address,
            city: data.city || 'Santiago',
          },
        }
      )

      if (rpcError) throw new Error(rpcError.message)
      if (!rpcData?.success) throw new Error(rpcData?.error ?? 'Error al crear la empresa.')

      // 3. Redirigir al dashboard
      router.push('/dashboard')
    } catch (err: unknown) {
      const msg = err instanceof Error ? err.message : 'Error inesperado. Intenta de nuevo.'
      setError(msg)
      setLoading(false)
    }
  }

  const isLastStep = step === STEPS.length

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A1628',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Montserrat, sans-serif',
      padding: '24px',
    }}>
      <div style={{
        background: '#111827',
        border: '1px solid rgba(93,224,230,0.12)',
        borderRadius: '16px',
        padding: '40px',
        width: '100%',
        maxWidth: '480px',
      }}>

        {/* Header */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '52px',
            height: '52px',
            borderRadius: '12px',
            background: 'linear-gradient(135deg, #004AAD, #5DE0E6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '18px',
            fontWeight: '700',
            color: '#fff',
            margin: '0 auto 14px',
          }}>MP</div>
          <div style={{ fontSize: '20px', fontWeight: '700', color: '#F0F4FF' }}>
            Crear tu cuenta
          </div>
          <div style={{ fontSize: '12px', color: '#8899BB', marginTop: '4px' }}>
            Comienza gratis — sin tarjeta de crédito
          </div>
        </div>

        {/* Stepper */}
        <div style={{ display: 'flex', alignItems: 'center', marginBottom: '32px' }}>
          {STEPS.map((s, i) => (
            <div key={s.num} style={{ display: 'flex', alignItems: 'center', flex: i < STEPS.length - 1 ? 1 : 0 }}>
              <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', gap: '4px' }}>
                <div style={{
                  width: '28px',
                  height: '28px',
                  borderRadius: '50%',
                  background: step > s.num
                    ? '#5DE0E6'
                    : step === s.num
                    ? 'linear-gradient(135deg, #004AAD, #5DE0E6)'
                    : 'rgba(136,153,187,0.1)',
                  border: step === s.num ? 'none' : step > s.num ? 'none' : '1px solid rgba(136,153,187,0.2)',
                  display: 'flex',
                  alignItems: 'center',
                  justifyContent: 'center',
                  fontSize: '11px',
                  fontWeight: '700',
                  color: step >= s.num ? (step > s.num ? '#0A1628' : '#fff') : '#8899BB',
                  flexShrink: 0,
                }}>
                  {step > s.num ? '✓' : s.num}
                </div>
                <span style={{
                  fontSize: '10px',
                  color: step === s.num ? '#5DE0E6' : step > s.num ? '#8899BB' : 'rgba(136,153,187,0.4)',
                  fontWeight: step === s.num ? '700' : '400',
                  whiteSpace: 'nowrap',
                }}>
                  {s.label}
                </span>
              </div>
              {i < STEPS.length - 1 && (
                <div style={{
                  flex: 1,
                  height: '1px',
                  background: step > s.num ? 'rgba(93,224,230,0.4)' : 'rgba(136,153,187,0.15)',
                  margin: '0 6px',
                  marginBottom: '18px',
                }} />
              )}
            </div>
          ))}
        </div>

        {/* Título del paso */}
        <div style={{ marginBottom: '20px' }}>
          <div style={{ fontSize: '15px', fontWeight: '700', color: '#F0F4FF' }}>
            {step === 1 && 'Crea tus credenciales de acceso'}
            {step === 2 && '¿Cómo te llamas?'}
            {step === 3 && 'Datos de tu empresa'}
            {step === 4 && 'Confirma y activa tu cuenta'}
          </div>
        </div>

        {/* Contenido del paso */}
        {step === 1 && <Step1 data={data} onChange={handleChange} />}
        {step === 2 && <Step2 data={data} onChange={handleChange} />}
        {step === 3 && <Step3 data={data} onChange={handleChange} />}
        {step === 4 && <Step4 data={data} />}

        {/* Error */}
        {error && (
          <div style={{
            background: 'rgba(239,68,68,0.1)',
            border: '1px solid rgba(239,68,68,0.3)',
            borderRadius: '8px',
            padding: '10px 12px',
            fontSize: '12px',
            color: '#EF4444',
            marginTop: '8px',
            marginBottom: '16px',
          }}>
            {error}
          </div>
        )}

        {/* Acciones */}
        <div style={{ display: 'flex', gap: '10px', marginTop: '20px' }}>
          {step > 1 && (
            <button
              onClick={() => { setStep((s) => s - 1); setError('') }}
              disabled={loading}
              style={{
                flex: '0 0 auto',
                background: 'rgba(136,153,187,0.08)',
                border: '1px solid rgba(136,153,187,0.15)',
                borderRadius: '8px',
                padding: '11px 18px',
                fontSize: '13px',
                fontWeight: '600',
                color: '#8899BB',
                cursor: 'pointer',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              ← Atrás
            </button>
          )}

          {!isLastStep ? (
            <button
              onClick={handleNext}
              style={{
                flex: 1,
                background: 'linear-gradient(90deg, #004AAD, #5DE0E6)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                fontWeight: '700',
                color: '#fff',
                cursor: 'pointer',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              Continuar →
            </button>
          ) : (
            <button
              onClick={handleSubmit}
              disabled={loading}
              style={{
                flex: 1,
                background: loading
                  ? 'rgba(0,74,173,0.5)'
                  : 'linear-gradient(90deg, #004AAD, #5DE0E6)',
                border: 'none',
                borderRadius: '8px',
                padding: '12px',
                fontSize: '13px',
                fontWeight: '700',
                color: '#fff',
                cursor: loading ? 'not-allowed' : 'pointer',
                fontFamily: 'Montserrat, sans-serif',
              }}
            >
              {loading ? 'Creando tu cuenta...' : '🚀 Activar mi cuenta'}
            </button>
          )}
        </div>

        {/* Link login */}
        <div style={{ textAlign: 'center', marginTop: '20px', fontSize: '12px', color: '#8899BB' }}>
          ¿Ya tienes cuenta?{' '}
          <a
            href="/login"
            style={{ color: '#5DE0E6', fontWeight: '600', textDecoration: 'none' }}
          >
            Ingresar aquí
          </a>
        </div>

      </div>
    </div>
  )
}
