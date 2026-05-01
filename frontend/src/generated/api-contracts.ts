import type { components } from './api-types'

type ApiSchemas = components['schemas']

export type ApiConfirmResponse = ApiSchemas['ConfirmResponse']
export type ApiFeatureRegistryResponse = ApiSchemas['FeatureRegistryResponse']
export type ApiParseResponse = ApiSchemas['ParseResponse']
export type ApiRefreshResponse = ApiSchemas['RefreshResponse']
export type ApiV2ConfirmResponse = ApiSchemas['V2ConfirmResponse']
export type ApiV2StatusResponse = ApiSchemas['V2StatusResponse']
