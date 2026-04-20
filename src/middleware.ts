import { createServerClient } from '@supabase/ssr'
import { NextRequest, NextResponse } from 'next/server'

// Rutas que NO requieren sesión
const PUBLIC_ROUTES = ['/login', '/onboarding']

// Rutas de API y archivos estáticos que siempre pasan
const SKIP_PREFIXES = ['/api/', '/_next/', '/favicon', '/robots', '/sitemap', '/empresas']

export async function middleware(request: NextRequest) {
  const { pathname } = request.nextUrl

  // Dejar pasar recursos estáticos y API routes
  if (SKIP_PREFIXES.some((p) => pathname.startsWith(p))) {
    return NextResponse.next()
  }

  // Construir respuesta base (permite que @supabase/ssr refresque cookies)
  const response = NextResponse.next({
    request: { headers: request.headers },
  })

  const supabase = createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!,
    {
      cookies: {
        getAll() {
          return request.cookies.getAll()
        },
        setAll(cookiesToSet) {
          cookiesToSet.forEach(({ name, value, options }) => {
            request.cookies.set(name, value)
            response.cookies.set(name, value, options)
          })
        },
      },
    }
  )

  // Verificar sesión (refresca el token si está por vencer)
  const {
    data: { user },
  } = await supabase.auth.getUser()

  const isPublicRoute = PUBLIC_ROUTES.includes(pathname)

  // ── Sin sesión → solo pueden estar en rutas públicas ──────────────────────
  if (!user) {
    if (isPublicRoute) return response
    const url = request.nextUrl.clone()
    url.pathname = '/login'
    return NextResponse.redirect(url)
  }

  // ── Con sesión en ruta pública → redirigir fuera ──────────────────────────
  if (isPublicRoute) {
    const url = request.nextUrl.clone()
    url.pathname = '/dashboard'
    return NextResponse.redirect(url)
  }

  // ── Con sesión en ruta protegida → verificar que tenga empresa ────────────
  // (excepto /onboarding que ya está en PUBLIC_ROUTES)
  if (pathname !== '/onboarding') {
    const { data: userRecord } = await supabase
      .from('users')
      .select('company_id')
      .eq('auth_user_id', user.id)
      .single()

    if (!userRecord?.company_id) {
      const url = request.nextUrl.clone()
      url.pathname = '/onboarding'
      return NextResponse.redirect(url)
    }
  }

  return response
}

export const config = {
  matcher: [
    /*
     * Aplica a todas las rutas EXCEPTO:
     * - _next/static (archivos estáticos)
     * - _next/image  (optimización de imágenes)
     * - favicon.ico
     */
    '/((?!_next/static|_next/image|favicon.ico).*)',
  ],
}
