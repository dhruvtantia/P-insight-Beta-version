import { redirect } from 'next/navigation'

/**
 * Root route — immediately redirects to /dashboard.
 * All page content lives under /dashboard and its siblings.
 */
export default function HomePage() {
  redirect('/dashboard')
}
