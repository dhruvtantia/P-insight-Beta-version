'use client'

import { useCallback, useEffect, useMemo, useState } from 'react'
import { systemApi, ApiError } from '@/services/api'
import type { FeatureHealth, FeatureId, FeatureRegistryResponse } from '@/types'

let _featureCache: FeatureRegistryResponse | null = null

export function useFeatureRegistry() {
  const [data, setData]       = useState<FeatureRegistryResponse | null>(_featureCache)
  const [loading, setLoading] = useState(_featureCache === null)
  const [error, setError]     = useState<string | null>(null)
  const [stale, setStale]     = useState(false)

  const refetch = useCallback(async () => {
    setLoading(_featureCache === null)
    setError(null)

    try {
      const next = await systemApi.getFeatures()
      _featureCache = next
      setData(next)
      setStale(false)
    } catch (err) {
      const message = err instanceof ApiError
        ? err.friendlyMessage
        : err instanceof Error
          ? err.message
          : 'Could not load feature registry.'
      setError(message)
      if (_featureCache) {
        setStale(true)
      }
    } finally {
      setLoading(false)
    }
  }, [])

  useEffect(() => {
    refetch()
  }, [refetch])

  const byId = useMemo(() => {
    const map = new Map<FeatureId, FeatureHealth>()
    for (const feature of data?.features ?? []) {
      map.set(feature.feature_id, feature)
    }
    return map
  }, [data])

  const isDisabled = useCallback((featureId?: FeatureId) => {
    if (!featureId) return false
    const feature = byId.get(featureId)
    return feature?.status === 'disabled'
  }, [byId])

  return {
    data,
    features: data?.features ?? [],
    byId,
    loading,
    error,
    stale,
    refetch,
    isDisabled,
  }
}
