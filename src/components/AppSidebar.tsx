'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from '@/lib/theme'

// ── Module registry ──────────────────────────────────────────────────────────
const MODULES = [
  { key: 'dashboard',      label: 'Dashboard',       icon: '🏠', path: '/dashboard',      group: 'main' },
  { key: 'pos',            label: 'Punto de Venta',  icon: '🛒', path: '/pos',             group: 'ops'  },
  { key: 'caja',           label: 'Caja',            icon: '💰', path: '/caja',            group: 'ops'  },
  { key: 'ventas',         label: 'Ventas',          icon: '📈', path: '/ventas',          group: 'ops'  },
  { key: 'inventario',     label: 'Inventario',      icon: '📦', path: '/inventario',      group: 'ops'  },
  { key: 'crm',            label: 'CRM',             icon: '👥', path: '/crm',             group: 'clientes' },
  { key: 'marketing',      label: 'Marketing',       icon: '📣', path: '/marketing',       group: 'clientes' },
  { key: 'proveedores',    label: 'Proveedores',     icon: '🚚', path: '/proveedores',     group: 'finanzas' },
  { key: 'finanzas',       label: 'Finanzas',        icon: '💳', path: '/finanzas',        group: 'finanzas' },
  { key: 'reportes',       label: 'Reportes',        icon: '📊', path: '/reportes',        group: 'finanzas' },
  { key: 'rrhh',           label: 'RRHH',            icon: '🧑‍💼', path: '/rrhh',            group: 'personas' },
  { key: 'remuneraciones', label: 'Remuneraciones',  icon: '💵', path: '/remuneraciones',  group: 'personas' },
  { key: 'contratos',      label: 'Contratos',       icon: '📄', path: '/contratos',       group: 'personas' },
  { key: 'configuracion',  label: 'Configuración',   icon: '⚙️', path: '/configuracion',   group: 'sistema' },
  { key: 'empresas',       label: 'Empresas',        icon: '🏢', path: '/empresas',        group: 'sistema' },
]

const GROUPS = [
  { key: 'main',     label: '' },
  { key: 'ops',      label: 'Operaciones' },
  { key: 'clientes', label: 'Clientes' },
  { key: 'finanzas', label: 'Finanzas' },
  { key: 'personas', label: 'Personas' },
  { key: 'sistema',  label: 'Sistema' },
]

const ACCENT_PRESETS = ['#5DE0E6','#004AAD','#22C55E','#F59E0B','#A78BFA','#EC4899','#F97316','#C19E4D']

function getFavorites(): string[] {
  try { return JSON.parse(localStorage.getItem('mp_favorites') || '[]') } catch { return [] }
}
function saveFavorites(f: string[]) {
  try { localStorage.setItem('mp_favorites', JSON.stringify(f)) } catch {}
}
function trackVisit(mod: string) {
  try {
    const v = JSON.parse(localStorage.getItem('mp_visits') || '{}')
    v[mod] = (v[mod] || 0) + 1
    localStorage.setItem('mp_visits', JSON.stringify(v))
  } catch {}
}

const COLLAPSED_W = 52
const EXPANDED_W  = 230

export default function AppSidebar() {
  const router   = useRouter()
  const pathname = usePathname()
  const { config, toggleGlobal, global, setAccent } = useTheme()

  const [expanded,  setExpanded]  = useState(false)
  const [pinned,    setPinned]    = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [showTheme, setShowTheme] = useState(false)
  const [customAccent, setCustomAccent] = useState('')
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setFavorites(getFavorites()) }, [])

  const isExpanded = expanded || pinned

  function onMouseEnter() {
    if (pinned) return
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setExpanded(true), 80)
  }
  function onMouseLeave() {
    if (pinned) return
    if (hoverTimer.current) clearTimeout(hoverTimer.current)
    hoverTimer.current = setTimeout(() => setExpanded(false), 200)
  }

  const navigate = useCallback((path: string, key: string) => {
    trackVisit(key)
    router.push(path)
  }, [router])

  const toggleFav = useCallback((key: string) => {
    setFavorites(prev => {
      const next = prev.includes(key) ? prev.filter(f => f !== key) : [...prev, key]
      saveFavorites(next); return next
    })
  }, [])

  // Sidebar is always dark — uses var(--sidebar-bg) so CSS attr-selector light mode
  // overrides (which only match literal hex strings) cannot affect it.
  // #EFF4FF and #889ABB are imperceptibly different from #F0F4FF/#8899BB so they
  // are also immune to the light-mode text overrides in globals.css.
  const isDark     = global === 'dark'
  const railBg     = 'var(--sidebar-bg, #0D1B2E)'
  const borderC    = 'rgba(93,224,230,.14)'
  const textC      = '#EFF4FF'
  const mutedC     = '#889ABB'
  const hoverBg    = 'rgba(93,224,230,.08)'
  const activeC    = config.accentColor

  return (
    <>
      {/* ── Sidebar rail ── */}
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{
          position: 'fixed', top: 0, left: 0, bottom: 0, zIndex: 500,
          width: isExpanded ? EXPANDED_W : COLLAPSED_W,
          background: railBg,
          borderRight: `1px solid ${borderC}`,
          boxShadow: isExpanded ? '4px 0 32px rgba(0,0,0,.25)' : '1px 0 8px rgba(0,0,0,.12)',
          display: 'flex', flexDirection: 'column',
          transition: 'width .2s cubic-bezier(.4,0,.2,1)',
          overflow: 'hidden',
          fontFamily: 'Montserrat,sans-serif',
        }}
      >
        {/* Logo */}
        <div style={{
          height: 52, display: 'flex', alignItems: 'center',
          padding: isExpanded ? '0 12px' : '0 10px',
          borderBottom: `1px solid ${borderC}`, flexShrink: 0, gap: 10,
          cursor: 'pointer',
        }} onClick={() => router.push('/dashboard')}>
          <div style={{
            width: 32, height: 32, borderRadius: 8, flexShrink: 0,
            background: 'linear-gradient(135deg,#004AAD,#5DE0E6)',
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            fontSize: 11, fontWeight: 900, color: '#fff',
          }}>MP</div>
          {isExpanded && (
            <div style={{ overflow: 'hidden' }}>
              <div style={{ fontSize: 12, fontWeight: 800, color: textC, whiteSpace: 'nowrap' }}>Mosaico Pro</div>
              <div style={{ fontSize: 9, color: mutedC, whiteSpace: 'nowrap' }}>Sistema de Gestión</div>
            </div>
          )}
          {isExpanded && (
            <button
              onClick={e => { e.stopPropagation(); setPinned(v => !v) }}
              title={pinned ? 'Contraer sidebar' : 'Mantener expandido'}
              style={{
                marginLeft: 'auto', background: pinned ? `${activeC}20` : 'transparent',
                border: `1px solid ${pinned ? activeC + '60' : borderC}`,
                borderRadius: 5, width: 22, height: 22, cursor: 'pointer', fontSize: 11,
                color: pinned ? activeC : mutedC, flexShrink: 0,
              }}>
              {pinned ? '◀' : '▶'}
            </button>
          )}
        </div>

        {/* Nav items (scrollable) */}
        <div style={{ flex: 1, overflowY: 'auto', overflowX: 'hidden', paddingBottom: 8 }}>
          {GROUPS.map(group => {
            const mods = MODULES.filter(m => m.group === group.key)
            return (
              <div key={group.key}>
                {isExpanded && group.label && (
                  <div style={{ fontSize: 9, fontWeight: 800, color: mutedC, letterSpacing: '.08em', textTransform: 'uppercase', padding: '10px 12px 3px', userSelect: 'none' }}>
                    {group.label}
                  </div>
                )}
                {!isExpanded && group.label && <div style={{ height: 1, background: borderC, margin: '6px 8px' }} />}
                {mods.map(m => {
                  const isActive = pathname === m.path || pathname?.startsWith(m.path + '/')
                  const isFav    = favorites.includes(m.key)
                  return (
                    <div key={m.key}
                      title={!isExpanded ? m.label : undefined}
                      style={{
                        display: 'flex', alignItems: 'center', gap: 10,
                        padding: isExpanded ? '7px 12px' : '7px 0',
                        justifyContent: isExpanded ? 'flex-start' : 'center',
                        background: isActive ? `${activeC}18` : 'transparent',
                        borderLeft: isActive ? `3px solid ${activeC}` : '3px solid transparent',
                        cursor: 'pointer', transition: 'background .1s',
                        position: 'relative',
                      }}
                      onClick={() => navigate(m.path, m.key)}
                      onMouseEnter={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = hoverBg }}
                      onMouseLeave={e => { if (!isActive) (e.currentTarget as HTMLElement).style.background = 'transparent' }}
                    >
                      <span style={{ fontSize: 17, flexShrink: 0, lineHeight: 1 }}>{m.icon}</span>
                      {isExpanded && (
                        <>
                          <span style={{ fontSize: 12, fontWeight: isActive ? 700 : 500, color: isActive ? activeC : textC, flex: 1, whiteSpace: 'nowrap', overflow: 'hidden', textOverflow: 'ellipsis' }}>
                            {m.label}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); toggleFav(m.key) }}
                            style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 11, color: isFav ? '#F59E0B' : mutedC, opacity: isFav ? 1 : 0.4, padding: 2, flexShrink: 0 }}
                            title={isFav ? 'Quitar favorito' : 'Favorito'}>
                            {isFav ? '★' : '☆'}
                          </button>
                        </>
                      )}
                      {isActive && !isExpanded && (
                        <div style={{ position: 'absolute', right: 0, top: '50%', transform: 'translateY(-50%)', width: 3, height: 20, background: activeC, borderRadius: '2px 0 0 2px' }} />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Bottom — theme & collapse */}
        <div style={{ borderTop: `1px solid ${borderC}`, flexShrink: 0 }}>
          {/* Theme toggle */}
          <div
            style={{ display: 'flex', alignItems: 'center', gap: 10, padding: isExpanded ? '8px 12px' : '8px 0', justifyContent: isExpanded ? 'flex-start' : 'center', cursor: 'pointer' }}
            onClick={() => setShowTheme(v => !v)}
            title={!isExpanded ? 'Apariencia' : undefined}
          >
            <span style={{ fontSize: 16, flexShrink: 0 }}>🎨</span>
            {isExpanded && <span style={{ fontSize: 11, color: mutedC, whiteSpace: 'nowrap' }}>Apariencia</span>}
          </div>

          {/* Theme panel (expanded only) */}
          {isExpanded && showTheme && (
            <div style={{ padding: '10px 12px', borderTop: `1px solid ${borderC}`, background: isDark ? 'rgba(0,0,0,.2)' : 'rgba(0,0,0,.03)' }}>
              {/* Dark / Light */}
              <div style={{ display: 'flex', gap: 5, marginBottom: 10 }}>
                {(['dark','light'] as const).map(m => (
                  <button key={m}
                    onClick={() => { if (global !== m) toggleGlobal() }}
                    style={{
                      flex: 1, padding: '5px 4px', fontSize: 10, fontWeight: 700,
                      borderRadius: 6, border: `1px solid ${global === m ? activeC + '60' : borderC}`,
                      background: global === m ? `${activeC}18` : 'transparent',
                      color: global === m ? activeC : mutedC, cursor: 'pointer', fontFamily: 'Montserrat,sans-serif',
                    }}>
                    {m === 'dark' ? '🌙 Oscuro' : '☀️ Claro'}
                  </button>
                ))}
              </div>

              {/* Accent colors */}
              <div style={{ fontSize: 9, color: mutedC, marginBottom: 5, letterSpacing: '.05em', textTransform: 'uppercase', fontWeight: 700 }}>Color de acento</div>
              <div style={{ display: 'flex', gap: 4, flexWrap: 'wrap', marginBottom: 8 }}>
                {ACCENT_PRESETS.map(c => (
                  <button key={c} onClick={() => setAccent(c)}
                    style={{ width: 20, height: 20, borderRadius: 4, background: c, border: config.accentColor === c ? '2px solid #fff' : '2px solid transparent', cursor: 'pointer', padding: 0, flexShrink: 0 }} />
                ))}
              </div>
              <div style={{ display: 'flex', gap: 5, alignItems: 'center' }}>
                <input
                  type='color' value={customAccent || config.accentColor}
                  onChange={e => { setCustomAccent(e.target.value); setAccent(e.target.value) }}
                  style={{ width: 28, height: 28, border: 'none', padding: 0, background: 'transparent', cursor: 'pointer', borderRadius: 4 }}
                  title='Color personalizado'
                />
                <span style={{ fontSize: 9, color: mutedC }}>Personalizado</span>
              </div>
            </div>
          )}
        </div>
      </div>

      {/* Spacer so page content doesn't hide behind the rail */}
      <div style={{ width: COLLAPSED_W, flexShrink: 0 }} />
    </>
  )
}
