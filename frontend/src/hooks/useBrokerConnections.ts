/**
 * useBrokerConnections
 * ----------------------
 * Hook that manages broker connector list + per-portfolio connection state.
 *
 * Responsibilities:
 *   - Fetches available broker connectors once (stable across re-renders)
 *   - Fetches the active connection for a given portfolioId
 *   - Exposes connect / sync / disconnect actions
 *   - Tracks loading / error / syncing state
 *
 * Usage:
 *   const { brokers, connection, isLoading, connect, sync, disconnect } =
 *     useBrokerConnections(portfolioId)
 */

import { useState, useEffect, useCallback, useRef } from 'react'
import { brokerApi } from '@/services/api'
import type {
  BrokerInfo,
  BrokerConnection,
  BrokerConnectResponse,
  BrokerSyncResponse,
} from '@/types'

// ─── Types ────────────────────────────────────────────────────────────────────

export interface UseBrokerConnectionsReturn {
  /** All registered broker connectors (static list from backend registry) */
  brokers:        BrokerInfo[]
  /**
   * Connection state for the active portfolio, keyed by broker_name.
   * Empty object means no connections have been established.
   */
  connections:    Record<string, BrokerConnection>
  isLoading:      boolean
  error:          string | null
  /** Which broker_name is currently syncing (null if none) */
  syncingBroker:  string | null

  /** Trigger the connect flow — returns the connect response */
  connect: (brokerName: string, accountId?: string, config?: Record<string, string>) => Promise<BrokerConnectResponse>
  /** Trigger a sync for the connected broker */
  sync:    (brokerName: string) => Promise<BrokerSyncResponse>
  /** Disconnect the broker */
  disconnect: (brokerName: string) => Promise<void>
  /** Re-fetch everything */
  refresh: () => void
}

// ─── Hook ─────────────────────────────────────────────────────────────────────

export function useBrokerConnections(portfolioId: number | null): UseBrokerConnectionsReturn {
  const [brokers,       setBrokers]       = useState<BrokerInfo[]>([])
  const [connections,   setConnections]   = useState<Record<string, BrokerConnection>>({})
  const [isLoading,     setIsLoading]     = useState(false)
  const [error,         setError]         = useState<string | null>(null)
  const [syncingBroker, setSyncingBroker] = useState<string | null>(null)

  // Prevent stale state updates after unmount
  const mountedRef = useRef(true)
  useEffect(() => {
    mountedRef.current = true
    return () => { mountedRef.current = false }
  }, [])

  // ── Fetch ────────────────────────────────────────────────────────────────

  const fetchData = useCallback(async () => {
    if (!portfolioId) return
    if (!mountedRef.current) return

    setIsLoading(true)
    setError(null)

    try {
      const [listResp, connResp] = await Promise.allSettled([
        brokerApi.listConnectors(),
        brokerApi.getConnection(portfolioId),
      ])

      if (!mountedRef.current) return

      if (listResp.status === 'fulfilled') {
        setBrokers(listResp.value.brokers)
      } else {
        throw new Error(listResp.reason?.message ?? 'Failed to load brokers')
      }

      if (connResp.status === 'fulfilled') {
        const conn = connResp.value
        // The API returns a single BrokerConnection or a default "disconnected" record.
        // Index by broker_name for the grid.
        if (conn.broker_name) {
          setConnections({ [conn.broker_name]: conn })
        } else {
          setConnections({})
        }
      }
      // Connection fetch failure is non-fatal — portfolio may have no connection yet
    } catch (e) {
      if (mountedRef.current) {
        setError(e instanceof Error ? e.message : 'Unknown error')
      }
    } finally {
      if (mountedRef.current) setIsLoading(false)
    }
  }, [portfolioId])

  useEffect(() => {
    fetchData()
  }, [fetchData])

  // ── Actions ──────────────────────────────────────────────────────────────

  const connect = useCallback(async (
    brokerName: string,
    accountId?: string,
    config?: Record<string, string>,
  ): Promise<BrokerConnectResponse> => {
    if (!portfolioId) throw new Error('No portfolio selected')
    const res = await brokerApi.connect(portfolioId, brokerName, accountId, config)
    // Refresh connections after connecting
    if (mountedRef.current) {
      setConnections(prev => ({
        ...prev,
        [brokerName]: {
          ...prev[brokerName],
          broker_name:      brokerName,
          connection_state: res.connection_state as BrokerConnection['connection_state'],
          account_id:       res.account_id ?? prev[brokerName]?.account_id ?? null,
          last_sync_at:     prev[brokerName]?.last_sync_at ?? null,
          sync_error:       null,
        },
      }))
    }
    return res
  }, [portfolioId])

  const sync = useCallback(async (brokerName: string): Promise<BrokerSyncResponse> => {
    if (!portfolioId) throw new Error('No portfolio selected')
    setSyncingBroker(brokerName)
    try {
      const res = await brokerApi.sync(portfolioId)
      if (mountedRef.current) {
        setConnections(prev => ({
          ...prev,
          [brokerName]: {
            ...prev[brokerName],
            connection_state: res.scaffolded ? 'pending' : 'connected',
            last_sync_at:     res.last_sync_at ?? null,
            sync_error:       null,
          },
        }))
      }
      return res
    } catch (e) {
      if (mountedRef.current) {
        setConnections(prev => ({
          ...prev,
          [brokerName]: {
            ...prev[brokerName],
            connection_state: 'error',
            sync_error: e instanceof Error ? e.message : 'Sync failed',
          },
        }))
      }
      throw e
    } finally {
      if (mountedRef.current) setSyncingBroker(null)
    }
  }, [portfolioId])

  const disconnect = useCallback(async (brokerName: string): Promise<void> => {
    if (!portfolioId) throw new Error('No portfolio selected')
    await brokerApi.disconnect(portfolioId)
    if (mountedRef.current) {
      setConnections(prev => {
        const next = { ...prev }
        delete next[brokerName]
        return next
      })
    }
  }, [portfolioId])

  return {
    brokers,
    connections,
    isLoading,
    error,
    syncingBroker,
    connect,
    sync,
    disconnect,
    refresh: fetchData,
  }
}
