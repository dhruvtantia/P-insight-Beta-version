import type { Metadata } from 'next'
import { AppShell } from '@/components/layout/AppShell'
import './globals.css'

export const metadata: Metadata = {
  title: {
    default: 'P-Insight — Portfolio Analytics',
    template: '%s | P-Insight',
  },
  description: 'Modern portfolio analytics platform for Indian and global equities.',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="en">
      <body className="font-sans antialiased">
        <AppShell>{children}</AppShell>
      </body>
    </html>
  )
}
