/**
 * Root route — immediately redirects to the Market landing page.
 *
 * The Market page is the primary entry point for P-Insight.
 * Portfolio analytics are accessible from the Sidebar once a portfolio is uploaded.
 *
 * Server component: no JavaScript sent to client, redirect happens at the edge.
 */
import { redirect } from 'next/navigation'

export default function HomePage() {
  redirect('/market')
}
