import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@/lib/supabase/server'
import { createServiceClient } from '@/lib/supabase/service'

export async function POST(req: NextRequest) {
  try {
    // ── 1. Leer payload primero (body solo se puede leer una vez) ──────────
    const body = await req.json()
    const { email, password, firstName, lastName, role, company_id: bodyCompanyId } = body as {
      email: string; password: string; firstName: string
      lastName?: string; role: string; company_id?: string
    }

    if (!email || !password || !firstName || !role) {
      return NextResponse.json({ error: 'Faltan campos obligatorios' }, { status: 400 })
    }
    if (password.length < 6) {
      return NextResponse.json({ error: 'La contraseña debe tener al menos 6 caracteres' }, { status: 400 })
    }

    // ── 2. Verificar sesión del caller ─────────────────────────────────────
    const serverClient = await createClient()
    const { data: { user: caller }, error: authError } = await serverClient.auth.getUser()
    if (authError || !caller) {
      return NextResponse.json({ error: 'No autenticado' }, { status: 401 })
    }

    // ── 3. Verificar permisos ──────────────────────────────────────────────
    const { data: callerRecord, error: callerErr } = await serverClient
      .from('users')
      .select('id, role, company_id, is_super_admin')
      .eq('auth_user_id', caller.id)
      .single()

    if (callerErr || !callerRecord) {
      return NextResponse.json({ error: 'Usuario no encontrado' }, { status: 403 })
    }

    const isSuperAdmin = !!callerRecord.is_super_admin
    const canCreate    = isSuperAdmin || ['admin', 'owner'].includes(callerRecord.role)
    if (!canCreate) {
      return NextResponse.json({ error: 'Solo administradores pueden crear usuarios' }, { status: 403 })
    }

    // super_admin puede especificar company_id en el body; otros usan la suya
    const companyId: string = isSuperAdmin
      ? (bodyCompanyId || callerRecord.company_id)
      : callerRecord.company_id

    // ── 4. Validar rol ─────────────────────────────────────────────────────
    const VALID_ROLES = ['owner', 'admin', 'supervisor', 'cajero', 'vendedor']
    if (!VALID_ROLES.includes(role)) {
      return NextResponse.json({ error: 'Rol inválido' }, { status: 400 })
    }

    // ── 5. Crear en Supabase Auth ──────────────────────────────────────────
    const service = createServiceClient()
    const { data: newAuthUser, error: createAuthError } = await service.auth.admin.createUser({
      email,
      password,
      email_confirm: true,
      user_metadata: { firstName, lastName },
    })

    if (createAuthError || !newAuthUser.user) {
      return NextResponse.json({ error: createAuthError?.message ?? 'Error al crear cuenta Auth' }, { status: 400 })
    }

    const authUserId = newAuthUser.user.id

    // ── 6. Insertar en tabla users ─────────────────────────────────────────
    const { error: insertError } = await service
      .from('users')
      .insert({
        auth_user_id: authUserId,
        company_id:   companyId,
        first_name:   firstName,
        last_name:    lastName ?? null,
        email,
        role,
        is_active: true,
      })

    if (insertError) {
      await service.auth.admin.deleteUser(authUserId)
      return NextResponse.json({ error: insertError.message }, { status: 500 })
    }

    return NextResponse.json({ success: true, authUserId })

  } catch (err: unknown) {
    const msg = err instanceof Error ? err.message : 'Error interno del servidor'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
