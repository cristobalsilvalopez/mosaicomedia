'use client'

import { createContext, useContext, useEffect, useState, useCallback } from 'react'

export type ThemeMode = 'dark' | 'light'

export interface ThemeVars {
  bg: string; card: string; input: string; cardHover: string
  text: string; muted: string; border: string; divider: string
  accent: string; accent2: string; accentBg: string
  danger: string; success: string; warning: string
  shadow: string
}

export const DARK: ThemeVars = {
  bg:       '#0A1628', card:    '#111827', input:    '#1E2A3A', cardHover: '#1A2540',
  text:     '#F0F4FF', muted:   '#8899BB', border:   'rgba(93,224,230,.12)', divider: 'rgba(93,224,230,.06)',
  accent:   '#5DE0E6', accent2: '#004AAD', accentBg: 'rgba(93,224,230,.08)',
  danger:   '#EF4444', success: '#22C55E', warning:  '#F59E0B',
  shadow:   '0 4px 20px rgba(0,0,0,.4)',
}

export const LIGHT: ThemeVars = {
  bg:       '#F4F7FF', card:    '#FFFFFF', input:    '#EEF2FF', cardHover: '#E8EEFF',
  text:     '#0A1628', muted:   '#556080', border:   'rgba(0,74,173,.12)', divider: 'rgba(0,74,173,.05)',
  accent:   '#004AAD', accent2: '#5DE0E6', accentBg: 'rgba(0,74,173,.06)',
  danger:   '#DC2626', success: '#16A34A', warning:  '#D97706',
  shadow:   '0 4px 20px rgba(0,74,173,.1)',
}

interface ThemeConfig {
  globalMode: ThemeMode
  accentColor: string
  modules: Record<string, ThemeMode>
}

const DEFAULT: ThemeConfig = { globalMode: 'dark', accentColor: '#5DE0E6', modules: {} }

interface ThemeCtx {
  config: ThemeConfig
  global: ThemeMode
  getMode:      (mod: string) => ThemeMode
  getVars:      (mod: string) => ThemeVars
  toggleGlobal: () => void
  setGlobal:    (m: ThemeMode) => void
  setModule:    (mod: string, m: ThemeMode) => void
  resetModule:  (mod: string) => void
  setAccent:    (c: string) => void
  V:            ThemeVars
}

const Ctx = createContext<ThemeCtx | null>(null)

export function ThemeProvider({ children }: { children: React.ReactNode }) {
  const [config, setConfig] = useState<ThemeConfig>(() => {
    if (typeof window === 'undefined') return DEFAULT
    try { return { ...DEFAULT, ...JSON.parse(localStorage.getItem('mp_theme') || '{}') } }
    catch { return DEFAULT }
  })

  useEffect(() => {
    try { localStorage.setItem('mp_theme', JSON.stringify(config)) } catch {}
    const root = document.documentElement
    root.setAttribute('data-mp', config.globalMode)
    const v = config.globalMode === 'dark' ? DARK : LIGHT
    root.style.setProperty('--mp-bg',      v.bg)
    root.style.setProperty('--mp-card',    v.card)
    root.style.setProperty('--mp-text',    v.text)
    root.style.setProperty('--mp-muted',   v.muted)
    root.style.setProperty('--mp-accent',  config.accentColor)
    root.style.setProperty('--mp-border',  v.border)
    root.style.setProperty('--mp-input',   v.input)

    // Force body background + smooth transition
    document.body.style.background = v.bg
    document.body.style.color = v.text
    document.body.style.transition = 'background .25s, color .25s'
  }, [config])

  const getMode = useCallback((mod: string): ThemeMode =>
    config.modules[mod] ?? config.globalMode, [config])

  const getVars = useCallback((mod: string): ThemeVars => {
    const m = config.modules[mod] ?? config.globalMode
    const v = m === 'dark' ? { ...DARK } : { ...LIGHT }
    v.accent = config.accentColor
    return v
  }, [config])

  const toggleGlobal = useCallback(() =>
    setConfig(c => ({ ...c, globalMode: c.globalMode === 'dark' ? 'light' : 'dark' })), [])

  const setGlobal = useCallback((m: ThemeMode) =>
    setConfig(c => ({ ...c, globalMode: m })), [])

  const setModule = useCallback((mod: string, m: ThemeMode) =>
    setConfig(c => ({ ...c, modules: { ...c.modules, [mod]: m } })), [])

  const resetModule = useCallback((mod: string) =>
    setConfig(c => { const { [mod]: _, ...rest } = c.modules; return { ...c, modules: rest } }), [])

  const setAccent = useCallback((color: string) =>
    setConfig(c => ({ ...c, accentColor: color })), [])

  const V = getVars('__global__')

  return (
    <Ctx.Provider value={{ config, global: config.globalMode, getMode, getVars, toggleGlobal, setGlobal, setModule, resetModule, setAccent, V }}>
      {children}
    </Ctx.Provider>
  )
}

export function useTheme() {
  const ctx = useContext(Ctx)
  if (!ctx) throw new Error('useTheme outside ThemeProvider')
  return ctx
}

export function useModuleTheme(module: string) {
  const { getMode, getVars, setModule, resetModule, global } = useTheme()
  const mode = getMode(module)
  const V    = getVars(module)
  return { mode, V, isOverridden: mode !== global, setMode: (m: ThemeMode) => setModule(module, m), reset: () => resetModule(module) }
}
