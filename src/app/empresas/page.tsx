'use client'

import { useEffect, useState } from 'react'
import { createClient } from '@/lib/supabase/client'
import { useRouter } from 'next/navigation'
import { setStoredCompany, clearStoredCompany, type AuthCompany } from '@/lib/auth-company'

const supabase = createClient()

interface Company {
  id: string
  name: string
  slug: string
  industry: string | null
  is_platform_owner: boolean
  created_at: string
}

const INDUSTRY_LABELS: Record<string, string> = {
  salud:       'Salud',
  retail:      'Retail',
  gastronomia: 'Gastronomía',
  belleza:     'Belleza',
  tecnologia:  'Tecnología',
  educacion:   'Educación',
  servicios:   'Servicios',
  otro:        'Otro',
}

const INDUSTRY_COLORS: Record<string, string> = {
  salud:       '#22C55E',
  retail:      '#F59E0B',
  gastronomia: '#EF4444',
  belleza:     '#EC4899',
  tecnologia:  '#5DE0E6',
  educacion:   '#7C3AED',
  servicios:   '#60A5FA',
  otro:        '#8899BB',
}

export default function EmpresasPage() {
  const router = useRouter()
  const [loading, setLoading]     = useState(true)
  const [companies, setCompanies] = useState<Company[]>([])
  const [search, setSearch]       = useState('')
  const [error, setError]         = useState('')

  useEffect(() => {
    async function init() {
      const { data: { session } } = await supabase.auth.getSession()
      if (!session) { router.push('/login'); return }

      const { data: u } = await supabase
        .from('users')
        .select('id, is_super_admin')
        .eq('auth_user_id', session.user.id)
        .single()

      if (!u?.is_super_admin) {
        router.push('/dashboard')
        return
      }

      const { data: cs, error: e } = await supabase
        .from('companies')
        .select('id, name, slug, industry, is_platform_owner, created_at')
        .order('is_platform_owner', { ascending: false })
        .order('name')

      if (e) { setError(e.message); setLoading(false); return }
      setCompanies(cs || [])
      setLoading(false)
    }
    init()
  }, [])

  function selectCompany(c: Company) {
    const company: AuthCompany = { id: c.id, name: c.name, slug: c.slug }
    setStoredCompany(company)
    router.push('/dashboard')
  }

  function clearSelection() {
    clearStoredCompany()
    router.push('/dashboard')
  }

  const filtered = companies.filter(c =>
    c.name.toLowerCase().includes(search.toLowerCase()) ||
    (c.industry || '').toLowerCase().includes(search.toLowerCase())
  )

  const cardStyle = (c: Company): React.CSSProperties => ({
    background: '#111827',
    border: '1px solid rgba(93,224,230,.12)',
    borderRadius: 14,
    padding: '20px 22px',
    cursor: 'pointer',
    transition: 'all .15s',
    display: 'flex',
    flexDirection: 'column',
    gap: 10,
  })

  if (loading) {
    return (
      <div style={{ minHeight: '100vh', background: '#0A1628', display: 'flex', alignItems: 'center', justifyContent: 'center' }}>
        <div style={{ color: '#5DE0E6', fontFamily: 'Montserrat,sans-serif', fontSize: 14 }}>Cargando empresas...</div>
      </div>
    )
  }

  return (
    <div style={{ minHeight: '100vh', background: '#0A1628', fontFamily: 'Montserrat,sans-serif', padding: '40px 24px' }}>
      {/* Header */}
      <div style={{ maxWidth: 800, margin: '0 auto' }}>
        <div style={{ marginBottom: 32, textAlign: 'center' }}>
          <div style={{ fontSize: 11, fontWeight: 700, color: '#5DE0E6', letterSpacing: 3, textTransform: 'uppercase', marginBottom: 8 }}>
            Panel Super Admin
          </div>
          <div style={{ fontSize: 28, fontWeight: 900, color: '#F0F4FF', marginBottom: 8 }}>
            Selecciona una empresa
          </div>
          <div style={{ fontSize: 13, color: '#8899BB' }}>
            Elige la empresa con la que deseas trabajar. Tendrás acceso completo a todos sus datos.
          </div>
        </div>

        {/* Search */}
        <div style={{ position: 'relative', marginBottom: 24 }}>
          <input
            value={search}
            onChange={e => setSearch(e.target.value)}
            placeholder="Buscar empresa..."
            style={{
              width: '100%', boxSizing: 'border-box',
              background: '#111827', border: '1px solid rgba(93,224,230,.2)',
              borderRadius: 10, padding: '11px 16px 11px 40px',
              color: '#F0F4FF', fontSize: 13, fontFamily: 'Montserrat,sans-serif',
              outline: 'none',
            }}
          />
          <span style={{ position: 'absolute', left: 14, top: '50%', transform: 'translateY(-50%)', fontSize: 16, color: '#8899BB' }}>🔍</span>
        </div>

        {error && (
          <div style={{ background: 'rgba(239,68,68,.1)', border: '1px solid rgba(239,68,68,.3)', borderRadius: 10, padding: '10px 14px', color: '#EF4444', fontSize: 12, marginBottom: 20 }}>
            {error}
          </div>
        )}

        {/* Company grid */}
        <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(220px, 1fr))', gap: 14, marginBottom: 32 }}>
          {filtered.map(c => {
            const isPO = c.is_platform_owner
            const col  = isPO ? '#5DE0E6' : (INDUSTRY_COLORS[c.industry || 'otro'] || '#8899BB')
            const ind  = isPO ? 'Mi empresa — Plataforma' : (INDUSTRY_LABELS[c.industry || 'otro'] || c.industry || '—')
            return (
              <div
                key={c.id}
                style={{
                  ...cardStyle(c),
                  ...(isPO ? {
                    background: 'linear-gradient(135deg, #0D1E36, #111827)',
                    border: '1.5px solid rgba(93,224,230,.4)',
                    boxShadow: '0 0 20px rgba(93,224,230,.08)',
                  } : {}),
                }}
                onClick={() => selectCompany(c)}
                onMouseEnter={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.borderColor = isPO ? 'rgba(93,224,230,.7)' : 'rgba(93,224,230,.4)'
                  el.style.transform = 'translateY(-2px)'
                  el.style.boxShadow = '0 8px 24px rgba(0,0,0,.3)'
                }}
                onMouseLeave={e => {
                  const el = e.currentTarget as HTMLDivElement
                  el.style.borderColor = isPO ? 'rgba(93,224,230,.4)' : 'rgba(93,224,230,.12)'
                  el.style.transform = 'none'
                  el.style.boxShadow = isPO ? '0 0 20px rgba(93,224,230,.08)' : 'none'
                }}
              >
                {/* Color strip */}
                <div style={{ height: 3, borderRadius: 2, background: isPO ? 'linear-gradient(90deg,#004AAD,#5DE0E6)' : col }} />

                {/* Platform owner badge */}
                {isPO && (
                  <span style={{ alignSelf:'flex-start', fontSize:9, fontWeight:800, background:'linear-gradient(90deg,rgba(0,74,173,.3),rgba(93,224,230,.2))', border:'1px solid rgba(93,224,230,.3)', color:'#5DE0E6', padding:'2px 8px', borderRadius:20, letterSpacing:'.06em' }}>
                    MI EMPRESA
                  </span>
                )}

                {/* Name */}
                <div style={{ fontSize: 15, fontWeight: 800, color: isPO ? '#5DE0E6' : '#F0F4FF', lineHeight: 1.3 }}>
                  {c.name}
                </div>

                {/* Industry badge */}
                <div style={{ display: 'inline-flex', alignItems: 'center', gap: 5, alignSelf: 'flex-start' }}>
                  <div style={{ width: 7, height: 7, borderRadius: '50%', background: col }} />
                  <span style={{ fontSize: 11, color: col, fontWeight: 600 }}>{ind}</span>
                </div>

                {/* Slug */}
                <div style={{ fontSize: 10, color: '#8899BB', fontFamily: 'monospace' }}>
                  /{c.slug}
                </div>

                {/* CTA */}
                <div style={{ marginTop: 4, fontSize: 11, color: '#5DE0E6', fontWeight: 700, display: 'flex', alignItems: 'center', gap: 5 }}>
                  {isPO ? 'Panel de plataforma →' : 'Entrar →'}
                </div>
              </div>
            )
          })}

          {filtered.length === 0 && (
            <div style={{ gridColumn: '1/-1', textAlign: 'center', color: '#8899BB', fontSize: 13, padding: '40px 0' }}>
              No se encontraron empresas
            </div>
          )}
        </div>

        {/* Divider */}
        <div style={{ height: 1, background: 'rgba(93,224,230,.08)', marginBottom: 20 }} />

        {/* Admin actions */}
        <div style={{ display: 'flex', gap: 12, justifyContent: 'center' }}>
          <button
            onClick={clearSelection}
            style={{
              background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.2)',
              borderRadius: 8, padding: '9px 18px', color: '#5DE0E6',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif',
            }}
          >
            Sin filtro de empresa
          </button>
          <button
            onClick={() => router.push('/configuracion')}
            style={{
              background: 'rgba(93,224,230,.08)', border: '1px solid rgba(93,224,230,.2)',
              borderRadius: 8, padding: '9px 18px', color: '#5DE0E6',
              fontSize: 12, fontWeight: 700, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif',
            }}
          >
            Configuración global
          </button>
        </div>

        <div style={{ textAlign: 'center', marginTop: 24, fontSize: 10, color: '#8899BB' }}>
          Mosaico Pro · Super Admin · {companies.length} empresa{companies.length !== 1 ? 's' : ''} registrada{companies.length !== 1 ? 's' : ''}
        </div>
      </div>
    </div>
  )
}
