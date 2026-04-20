'use client'

import { createClient } from '@/lib/supabase/client'

const supabase = createClient()

export interface AuthUser {
  id: string
  first_name: string
  last_name: string
  role: string
  company_id: string
  is_super_admin: boolean
}

export interface AuthCompany {
  id: string
  name: string
  slug?: string
  is_platform_owner?: boolean
}

export interface AuthContext {
  user: AuthUser
  company: AuthCompany
  companyId: string
  isSuperAdmin: boolean
  isPlatformOwner: boolean
}

const STORAGE_KEY = 'mosaico_company'

export function getStoredCompany(): AuthCompany | null {
  if (typeof window === 'undefined') return null
  try {
    const raw = localStorage.getItem(STORAGE_KEY)
    return raw ? JSON.parse(raw) : null
  } catch {
    return null
  }
}

export function setStoredCompany(company: AuthCompany): void {
  if (typeof window === 'undefined') return
  localStorage.setItem(STORAGE_KEY, JSON.stringify(company))
}

export function clearStoredCompany(): void {
  if (typeof window === 'undefined') return
  localStorage.removeItem(STORAGE_KEY)
}

export async function getAuthContext(): Promise<AuthContext | null> {
  const { data: { session } } = await supabase.auth.getSession()
  if (!session) return null

  // Try with is_super_admin; fall back gracefully if column doesn't exist yet
  let u: any = null
  let isSuperAdmin = false

  const { data: uFull, error: uErr } = await supabase
    .from('users')
    .select('id, first_name, last_name, role, company_id, is_super_admin')
    .eq('auth_user_id', session.user.id)
    .single()

  if (uErr || !uFull) {
    const { data: uBasic } = await supabase
      .from('users')
      .select('id, first_name, last_name, role, company_id')
      .eq('auth_user_id', session.user.id)
      .single()
    u = uBasic
    isSuperAdmin = false
  } else {
    u = uFull
    isSuperAdmin = !!uFull.is_super_admin
  }

  if (!u) return null

  let companyId: string | null = u.company_id

  if (isSuperAdmin) {
    const stored = getStoredCompany()
    if (stored?.id) companyId = stored.id
  }

  if (!companyId) return null

  const { data: c } = await supabase
    .from('companies')
    .select('id, name, slug, is_platform_owner')
    .eq('id', companyId)
    .single()

  if (!c) return null

  const isPlatformOwner = isSuperAdmin && !!(c as any).is_platform_owner

  return {
    user: { ...u, is_super_admin: isSuperAdmin } as AuthUser,
    company: c as AuthCompany,
    companyId: c.id,
    isSuperAdmin,
    isPlatformOwner,
  }
}
