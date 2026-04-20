import { NextRequest, NextResponse } from 'next/server'
import { createClient } from '@supabase/supabase-js'

const SUPABASE_URL  = process.env.NEXT_PUBLIC_SUPABASE_URL!
const ANON_KEY      = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!
const SERVICE_KEY   = process.env.SUPABASE_SERVICE_ROLE_KEY!

export async function POST(req: NextRequest) {
  try {
    const { email, password } = await req.json()

    if (!email || !password) {
      return NextResponse.json({ error: 'Email y contraseña requeridos' }, { status: 400 })
    }

    const normalizedEmail = email.toLowerCase().trim()

    // ── Step 1: Resolve email → primary auth email via DB function ────────────
    // Uses service role so it can read user_emails bypassing RLS
    const serviceClient = createClient(SUPABASE_URL, SERVICE_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: resolvedData } = await serviceClient
      .rpc('resolve_login_email', { p_email: normalizedEmail })

    const authEmail: string = resolvedData || normalizedEmail

    // ── Step 2: Authenticate with the primary auth email ─────────────────────
    const anonClient = createClient(SUPABASE_URL, ANON_KEY, {
      auth: { autoRefreshToken: false, persistSession: false },
    })

    const { data: authData, error: authError } = await anonClient.auth.signInWithPassword({
      email: authEmail,
      password,
    })

    if (authError || !authData.session) {
      return NextResponse.json(
        { error: 'Correo o contraseña incorrectos' },
        { status: 401 }
      )
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
