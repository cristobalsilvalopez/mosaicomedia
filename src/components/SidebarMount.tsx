'use client'

import { usePathname } from 'next/navigation'
import dynamic from 'next/dynamic'

// Dynamic import so AppSidebar doesn't SSR
const AppSidebar = dynamic(() => import('./AppSidebar'), { ssr: false })

// Don't show sidebar on these routes
const HIDE_ON = ['/login', '/landing', '/onboarding', '/']

export default function SidebarMount() {
  const pathname = usePathname()
  const hide = HIDE_ON.some(p => pathname === p || pathname?.startsWith(p + '?'))
  if (hide) return null
  return <AppSidebar />
}
