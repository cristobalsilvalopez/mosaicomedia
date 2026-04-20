'use client'

import { useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'

export default function LoginPage() {
  const [email, setEmail] = useState('')
  const [password, setPassword] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState('')
  const router = useRouter()
  const supabase = createClient()

  async function handleLogin(e: React.FormEvent) {
    e.preventDefault()
    setLoading(true)
    setError('')

    try {
      // Custom endpoint: resuelve emails secundarios al email principal de Auth
      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email: email.trim().toLowerCase(), password }),
      })
      const data = await res.json()

      if (!res.ok || data.error) {
        setError(data.error || 'Correo o contraseña incorrectos')
        setLoading(false)
        return
      }

      // Establecer la sesión en el cliente Supabase
      await supabase.auth.setSession({
        access_token:  data.session.access_token,
        refresh_token: data.session.refresh_token,
      })

      router.push('/dashboard')
    } catch {
      setError('Error de conexión. Intenta de nuevo.')
      setLoading(false)
    }
  }

  return (
    <div style={{
      minHeight: '100vh',
      background: '#0A1628',
      display: 'flex',
      alignItems: 'center',
      justifyContent: 'center',
      fontFamily: 'Montserrat, sans-serif'
    }}>
      <div style={{
        background: '#111827',
        border: '1px solid rgba(93,224,230,0.12)',
        borderRadius: '16px',
        padding: '40px',
        width: '100%',
        maxWidth: '400px',
      }}>
        {/* Logo */}
        <div style={{ textAlign: 'center', marginBottom: '32px' }}>
          <div style={{
            width: '60px',
            height: '60px',
            borderRadius: '14px',
            background: 'linear-gradient(135deg, #004AAD, #5DE0E6)',
            display: 'flex',
            alignItems: 'center',
            justifyContent: 'center',
            fontSize: '22px',
            fontWeight: '700',
            color: '#fff',
            margin: '0 auto 16px',
          }}>MP</div>
          <div style={{ fontSize: '22px', fontWeight: '700', color: '#F0F4FF' }}>
            Mosaico Pro
          </div>
          <div style={{ fontSize: '13px', color: '#8899BB', marginTop: '4px' }}>
            Ingresa a tu cuenta
          </div>
        </div>

        {/* Formulario */}
        <form onSubmit={handleLogin}>
          <div style={{ marginBottom: '16px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#8899BB',
              marginBottom: '6px'
            }}>
              Correo electrónico
            </label>
            <input
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              placeholder="tu@correo.com"
              style={{
                width: '100%',
                background: '#0A1628',
                border: '1px solid rgba(93,224,230,0.12)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                color: '#F0F4FF',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          <div style={{ marginBottom: '24px' }}>
            <label style={{
              display: 'block',
              fontSize: '12px',
              fontWeight: '600',
              color: '#8899BB',
              marginBottom: '6px'
            }}>
              Contraseña
            </label>
            <input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              placeholder="••••••••"
              style={{
                width: '100%',
                background: '#0A1628',
                border: '1px solid rgba(93,224,230,0.12)',
                borderRadius: '8px',
                padding: '10px 12px',
                fontSize: '13px',
                color: '#F0F4FF',
                outline: 'none',
                boxSizing: 'border-box',
              }}
            />
          </div>

          {error && (
            <div style={{
              background: 'rgba(239,68,68,0.1)',
              border: '1px solid rgba(239,68,68,0.3)',
              borderRadius: '8px',
              padding: '10px 12px',
              fontSize: '12px',
              color: '#EF4444',
              marginBottom: '16px',
              textAlign: 'center'
            }}>
              {error}
            </div>
          )}

          <button
            type="submit"
            disabled={loading}
            style={{
              width: '100%',
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
            {loading ? 'Ingresando...' : 'Ingresar al sistema'}
          </button>
        </form>

        <div style={{
          textAlign: 'center',
          marginTop: '20px',
          fontSize: '12px',
          color: '#8899BB',
        }}>
          ¿Primera vez?{' '}
          <a
            href="/onboarding"
            style={{ color: '#5DE0E6', fontWeight: '600', textDecoration: 'none' }}
          >
            Crear nueva empresa →
          </a>
        </div>

        <div style={{
          textAlign: 'center',
          marginTop: '12px',
          fontSize: '11px',
          color: 'rgba(136,153,187,0.5)'
        }}>
          Mosaico Pro v1.0 · Mosaico Media SpA
        </div>
      </div>
    </div>
  )
}