import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL = process.env.NEXT_PUBLIC_SUPABASE_URL!
const SERVICE_KEY  = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()
    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    const adminClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    // Resolve secondary email → primary auth email
    const { data: resolvedData } = await adminClient
      .rpc('resolve_login_email', { p_email: normalizedEmail })
    const authEmail: string = resolvedData || normalizedEmail

    // Sign in using admin client (avoids anon key restrictions)
    const { data: authData, error: authError } = await adminClient.auth.signInWithPassword({
      email: authEmail,
      password,
    })

    if (authError || !authData.session) {
      return NextResponse.json({ error: 'Correo o contraseña incorrectos' }, { status: 401 })
    }

    return NextResponse.json({
      session: {
        access_token:  authData.session.access_token,
        refresh_token: authData.session.refresh_token,
        expires_at:    authData.session.expires_at,
      },
    })
  } catch (e: unknown) {
    const msg = e instanceof Error ? e.message : 'Error interno'
    return NextResponse.json({ error: msg }, { status: 500 })
  }
}
