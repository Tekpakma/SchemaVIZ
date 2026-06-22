export type ReleaseFeature = 'ai' | 'freedraw' | 'schemaDiscovery'

export const RELEASE_FEATURES: Record<ReleaseFeature, boolean> = {
  ai: false,
  freedraw: false,
  schemaDiscovery: false,
}

export function isReleaseFeatureEnabled(feature: ReleaseFeature) {
  return RELEASE_FEATURES[feature]
}
