import type { Metadata } from 'next'
import { Inter } from 'next/font/google'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'

const inter = Inter({
  subsets: ['latin'],
  variable: '--font-inter',
  display: 'swap',
})

export const metadata: Metadata = {
  title: {
    default: 'P-Insight — Portfolio Analytics',
    template: '%s | P-Insight',
  },
  description: 'Modern portfolio analytics platform for Indian and global equities.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en" className={inter.variable}>
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
