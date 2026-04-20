import { redirect } from 'next/navigation'

// La ruta raíz redirige al dashboard.
// El middleware se encarga de redirigir a /login si no hay sesión,
// o a /onboarding si hay sesión pero sin empresa.
export default function RootPage() {
  redirect('/dashboard')
}
