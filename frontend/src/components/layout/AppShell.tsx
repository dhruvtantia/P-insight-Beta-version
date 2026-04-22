'use client'

import { useState, useEffect, useCallback, useRef } from 'react'
import { Sidebar }            from './Sidebar'
import { Topbar }             from './Topbar'
import { PortfolioProvider }  from '@/context/PortfolioContext'

interface AppShellProps {
  children: React.ReactNode
}

const SIDEBAR_DEFAULT  = 240   // px  (== w-60)
const SIDEBAR_MIN      = 180   // px
const SIDEBAR_MAX      = 340   // px
const STORAGE_KEY      = 'p-insight-sidebar-width'

/**
 * AppShell — persistent layout wrapper.
 * Sidebar (left, resizable via drag handle) + Topbar (top) + scrollable main.
 *
 * Sidebar width is persisted in localStorage under `p-insight-sidebar-width`.
 * Drag the thin handle on the right edge of the sidebar to resize.
 *
 * Fix: drag effect only depends on [isDragging] — removes the listener
 * detach/re-attach loop that fired on every pixel of movement.
 * currentWidthRef stays in sync with sidebarWidth for use inside the
 * drag closure without stale-closure issues.
 */
export function AppShell({ children }: AppShellProps) {
  const [sidebarWidth, setSidebarWidth] = useState(SIDEBAR_DEFAULT)
  const [isDragging,   setIsDragging]   = useState(false)
  const dragStartX    = useRef(0)
  const dragStartW    = useRef(SIDEBAR_DEFAULT)
  // Mirrors sidebarWidth as a ref so the drag effect closure can read the
  // current value without needing to re-run (and re-attach listeners) on
  // every width change.
  const currentWidthRef = useRef(SIDEBAR_DEFAULT)

  // Keep ref in sync with state
  useEffect(() => {
    currentWidthRef.current = sidebarWidth
  }, [sidebarWidth])

  // Restore persisted width on mount
  useEffect(() => {
    try {
      const stored = localStorage.getItem(STORAGE_KEY)
      if (stored) {
        const w = parseInt(stored, 10)
        if (w >= SIDEBAR_MIN && w <= SIDEBAR_MAX) {
          setSidebarWidth(w)
          currentWidthRef.current = w
          dragStartW.current = w
        }
      }
    } catch { /* localStorage not available (SSR guard) */ }
  }, [])

  // ── Drag handlers ──────────────────────────────────────────────────────────

  const startDrag = useCallback((e: React.MouseEvent) => {
    e.preventDefault()
    dragStartX.current = e.clientX
    dragStartW.current = currentWidthRef.current
    setIsDragging(true)
  }, [])

  // Drag effect: only runs when isDragging changes — NOT on every width update.
  // currentWidthRef is read via ref so we never stale-close on sidebarWidth.
  useEffect(() => {
    if (!isDragging) return

    const onMove = (e: MouseEvent) => {
      const delta = e.clientX - dragStartX.current
      const newW  = Math.max(SIDEBAR_MIN, Math.min(SIDEBAR_MAX, dragStartW.current + delta))
      setSidebarWidth(newW)
    }

    const onUp = () => {
      setIsDragging(false)
      try {
        localStorage.setItem(STORAGE_KEY, String(currentWidthRef.current))
      } catch { /* noop */ }
    }

    document.addEventListener('mousemove', onMove)
    document.addEventListener('mouseup',   onUp)
    return () => {
      document.removeEventListener('mousemove', onMove)
      document.removeEventListener('mouseup',   onUp)
    }
  }, [isDragging])   // ← only [isDragging], not [isDragging, sidebarWidth]

  return (
    <div className={`min-h-screen bg-slate-50 ${isDragging ? 'select-none cursor-col-resize' : ''}`}>
      {/* Sidebar — width controlled by state */}
      <Sidebar width={sidebarWidth} />

      {/* Drag handle — sits on the right edge of the sidebar */}
      <div
        onMouseDown={startDrag}
        style={{ left: sidebarWidth - 3 }}
        className={`
          fixed top-0 z-40 h-screen w-1.5 cursor-col-resize
          transition-colors duration-150
          ${isDragging
            ? 'bg-indigo-400/60'
            : 'bg-transparent hover:bg-indigo-300/40'}
        `}
        title="Drag to resize sidebar"
      />

      {/* Content area — left padding tracks sidebar width dynamically */}
      <div style={{ paddingLeft: sidebarWidth }}>
        <Topbar sidebarWidth={sidebarWidth} />
        <main className="pt-[76px] min-h-screen">
          <div className="p-6">
            {/*
              PortfolioProvider mounts here — one level below the chrome (Sidebar,
              Topbar) so layout renders immediately while portfolio data loads.
              All pages consume portfolio data via usePortfolio() without triggering
              independent fetches.
            */}
            <PortfolioProvider>
              {children}
            </PortfolioProvider>
          </div>
        </main>
      </div>
    </div>
  )
}
