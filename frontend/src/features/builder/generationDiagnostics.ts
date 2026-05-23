import type { GenerationRunResponse } from './generationPreviewQuery'

export type GenerationFilterImpact = NonNullable<
  GenerationRunResponse['filterImpact']
>[number]

export function getFilterImpactItems(
  response: GenerationRunResponse | null | undefined,
): GenerationFilterImpact[] {
  return response?.filterImpact ?? []
}

export function hasFilterImpact(
  response: GenerationRunResponse | null | undefined,
): boolean {
  return getFilterImpactItems(response).length > 0
}
