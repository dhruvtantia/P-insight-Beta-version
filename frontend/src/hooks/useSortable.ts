/**
 * useSortable — generic sort state for any table
 * ------------------------------------------------
 * Returns a (key, dir) pair plus a toggle function.
 * Clicking the same key twice reverses direction.
 * Clicking a new key sets ascending as the default.
 *
 * Usage:
 *   const { sortKey, sortDir, toggleSort } = useSortable<'name' | 'weight'>('weight', 'desc')
 *   const sorted = [...rows].sort((a, b) => {
 *     const sign = sortDir === 'asc' ? 1 : -1
 *     return sign * (a[sortKey] > b[sortKey] ? 1 : -1)
 *   })
 */

'use client'

import { useState, useCallback } from 'react'

export type SortDir = 'asc' | 'desc'

export interface UseSortableResult<K extends string> {
  sortKey: K
  sortDir: SortDir
  toggleSort: (key: K) => void
}

export function useSortable<K extends string>(
  defaultKey: K,
  defaultDir: SortDir = 'asc',
): UseSortableResult<K> {
  const [sortKey, setSortKey] = useState<K>(defaultKey)
  const [sortDir, setSortDir] = useState<SortDir>(defaultDir)

  const toggleSort = useCallback((key: K) => {
    setSortKey((prev) => {
      if (prev === key) {
        setSortDir((d) => (d === 'asc' ? 'desc' : 'asc'))
      } else {
        setSortDir('asc')
      }
      return key
    })
  }, [])

  return { sortKey, sortDir, toggleSort }
}
