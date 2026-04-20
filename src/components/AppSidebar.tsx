'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { useRouter, usePathname } from 'next/navigation'
import { useTheme } from 'next-themes'
import { cn } from '@/lib/utils'

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

const COLLAPSED_W = 52
const EXPANDED_W  = 230

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

export default function AppSidebar() {
  const router   = useRouter()
  const pathname = usePathname()
  const { theme, setTheme } = useTheme()

  const [expanded,  setExpanded]  = useState(false)
  const [pinned,    setPinned]    = useState(false)
  const [favorites, setFavorites] = useState<string[]>([])
  const [showTheme, setShowTheme] = useState(false)
  const hoverTimer = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => { setFavorites(getFavorites()) }, [])

  useEffect(() => {
    document.documentElement.style.setProperty('--sidebar-w', pinned ? `${EXPANDED_W}px` : `${COLLAPSED_W}px`)
  }, [pinned])

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

  return (
    <>
      <div
        onMouseEnter={onMouseEnter}
        onMouseLeave={onMouseLeave}
        style={{ width: isExpanded ? EXPANDED_W : COLLAPSED_W }}
        className='fixed top-0 left-0 bottom-0 z-50 flex flex-col bg-sidebar border-r border-sidebar-border transition-[width] duration-200 overflow-hidden font-sans'
        >
        {/* Logo */}
        <div
          className='h-[52px] flex items-center gap-2.5 border-b border-sidebar-border flex-shrink-0 cursor-pointer px-3'
          onClick={() => router.push('/dashboard')}
        >
          <div className='w-8 h-8 rounded-lg flex-shrink-0 flex items-center justify-center text-[11px] font-black text-white'
            style={{ background: 'linear-gradient(135deg,#004AAD,#5DE0E6)' }}>
            MP
          </div>
          {isExpanded && (
            <div className='overflow-hidden flex-1'>
              <div className='text-[12px] font-extrabold text-sidebar-foreground whitespace-nowrap'>Mosaico Pro</div>
              <div className='text-[9px] text-sidebar-foreground/50 whitespace-nowrap'>Sistema de Gestión</div>
            </div>
          )}
          {isExpanded && (
            <button
              onClick={e => { e.stopPropagation(); setPinned(v => !v) }}
              title={pinned ? 'Contraer sidebar' : 'Mantener expandido'}
              className={cn(
                'ml-auto w-[22px] h-[22px] rounded flex items-center justify-center text-[11px] flex-shrink-0 border cursor-pointer',
                pinned
                  ? 'bg-sidebar-primary/20 border-sidebar-primary/60 text-sidebar-primary'
                  : 'bg-transparent border-sidebar-border text-sidebar-foreground/50'
              )}>
              {pinned ? '◀' : '▶'}
            </button>
          )}
        </div>

        {/* Nav items */}
        <div className='flex-1 overflow-y-auto overflow-x-hidden pb-2'>
          {GROUPS.map(group => {
            const mods = MODULES.filter(m => m.group === group.key)
            return (
              <div key={group.key}>
                {isExpanded && group.label && (
                  <div className='text-[9px] font-extrabold text-sidebar-foreground/40 tracking-wider uppercase px-3 pt-2.5 pb-1 select-none'>
                    {group.label}
                  </div>
                )}
                {!isExpanded && group.label && <div className='h-px bg-sidebar-border mx-2 my-1.5' />}
                {mods.map(m => {
                  const isActive = pathname === m.path || pathname?.startsWith(m.path + '/')
                  const isFav    = favorites.includes(m.key)
                  return (
                    <div key={m.key}
                      title={!isExpanded ? m.label : undefined}
                      className={cn(
                        'flex items-center gap-2.5 cursor-pointer transition-colors duration-100 relative border-l-[3px]',
                        isExpanded ? 'px-3 py-[7px]' : 'py-[7px] justify-center',
                        isActive
                          ? 'border-sidebar-primary bg-sidebar-primary/10'
                          : 'border-transparent hover:bg-sidebar-accent'
                      )}
                      onClick={() => navigate(m.path, m.key)}
                    >
                      <span className='text-[17px] flex-shrink-0 leading-none'>{m.icon}</span>
                      {isExpanded && (
                        <>
                          <span className={cn(
                            'text-[12px] flex-1 whitespace-nowrap overflow-hidden text-ellipsis',
                            isActive ? 'font-bold text-sidebar-primary' : 'font-medium text-sidebar-foreground'
                          )}>
                            {m.label}
                          </span>
                          <button
                            onClick={e => { e.stopPropagation(); toggleFav(m.key) }}
                            className={cn('bg-transparent border-none cursor-pointer text-[11px] p-0.5 flex-shrink-0',
                              isFav ? 'text-yellow-400' : 'text-sidebar-foreground/30'
                            )}
                            title={isFav ? 'Quitar favorito' : 'Favorito'}>
                            {isFav ? '★' : '☆'}
                          </button>
                        </>
                      )}
                      {isActive && !isExpanded && (
                        <div className='absolute right-0 top-1/2 -translate-y-1/2 w-[3px] h-5 bg-sidebar-primary rounded-l' />
                      )}
                    </div>
                  )
                })}
              </div>
            )
          })}
        </div>

        {/* Bottom — theme */}
        <div className='border-t border-sidebar-border flex-shrink-0'>
          <div
            className={cn('flex items-center gap-2.5 cursor-pointer', isExpanded ? 'px-3 py-2' : 'py-2 justify-center')}
            onClick={() => setShowTheme(v => !v)}
            title={!isExpanded ? 'Apariencia' : undefined}
          >
            <span className='text-base flex-shrink-0'>🎨</span>
            {isExpanded && <span className='text-[11px] text-sidebar-foreground/50 whitespace-nowrap'>Apariencia</span>}
          </div>

          {isExpanded && showTheme && (
            <div className='px-3 py-2.5 border-t border-sidebar-border bg-black/20'>
              <div className='flex gap-1.5'>
                {(['dark', 'light'] as const).map(m => (
                  <button key={m}
                    onClick={() => setTheme(m)}
                    className={cn(
                      'flex-1 py-1 px-1 text-[10px] font-bold rounded border cursor-pointer font-sans',
                      theme === m
                        ? 'border-sidebar-primary/60 bg-sidebar-primary/20 text-sidebar-primary'
                        : 'border-sidebar-border bg-transparent text-sidebar-foreground/50'
                    )}>
                    {m === 'dark' ? '🌙 Oscuro' : '☀️ Claro'}
                  </button>
                ))}
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ width: COLLAPSED_W, flexShrink: 0 }} />
    </>
  )
}
