import type { Metadata } from 'next'
import { Geist, Geist_Mono } from 'next/font/google'
import './globals.css'
import { ThemeProvider } from '@/components/ThemeProvider'
import SidebarMount from '@/components/SidebarMount'
import { Toaster } from '@/components/ui/sonner'

const geistSans = Geist({ variable: '--font-geist-sans', subsets: ['latin'] })
const geistMono = Geist_Mono({ variable: '--font-geist-mono', subsets: ['latin'] })

export const metadata: Metadata = {
  title: 'Mosaico Pro',
  description: 'Sistema de gestión inteligente para negocios',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang='es' suppressHydrationWarning className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className='min-h-full flex flex-col bg-background text-foreground'>
        <ThemeProvider attribute='class' defaultTheme='dark' enableSystem={false}>
          <SidebarMount />
          <div style={{ marginLeft: 'var(--sidebar-w, 52px)', paddingBottom: 'var(--bottom-nav-h, 0px)', transition: 'margin-left .2s cubic-bezier(.4,0,.2,1)', minHeight: '100vh' }}>{children}</div>
          <Toaster />
        </ThemeProvider>
      </body>
    </html>
  )
}
