export type FeatureRequestStatus = 'idle' | 'loading' | 'ready' | 'stale' | 'error'

interface FeatureRequestState {
  loading: boolean
  error: string | null
  stale?: boolean
  hasData?: boolean
}

export function resolveFeatureRequestStatus({
  loading,
  error,
  stale = false,
  hasData = false,
}: FeatureRequestState): FeatureRequestStatus {
  if (loading && !hasData) return 'loading'
  if (error && !hasData) return 'error'
  if (stale && hasData) return 'stale'
  if (hasData) return 'ready'
  return 'idle'
}
