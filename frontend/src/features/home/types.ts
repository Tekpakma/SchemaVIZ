import type {
  GenerationRunResponse,
  GenerationTemplateRead,
} from '@/api/contracts'
import type { RecipeData } from '@/features/builder/types'

export type TemplateHue = 'pink' | 'green' | 'plum'

export type PromotionLevel = 'featured' | 'personal' | 'system'

export type HomeTemplatePreviewStatus = 'ready' | 'no_record' | 'error'

export type HomeTemplateSource = 'own' | 'featured'

export type HomeTemplateFilter =
  | 'all'
  | 'ready'
  | 'needs_record'
  | 'issues'
  | 'own'
  | 'featured'

export type HomeTemplateNavigationTarget =
  | {
      type: 'generation-run'
      shareSlug: string
      recordId: string
    }
  | {
      type: 'generation-select-record'
      shareSlug: string
    }
  | {
      type: 'builder'
      templateId: string
    }

export interface HomeTemplatePreview {
  accent: string
  author: string
  description: string
  edgeCount: number
  generationResponse: GenerationRunResponse | null
  hue: TemplateHue
  id: string
  navigationTarget: HomeTemplateNavigationTarget
  nodeCount: number
  promotion: PromotionLevel
  recipe: RecipeData
  rootModel: string
  sampleRecordDisplayName: string | null
  sampleRecordId: string | null
  shareSlug: string | null
  source: HomeTemplateSource
  sourceLabel: string
  status: HomeTemplatePreviewStatus
  statusLabel: string
  template: GenerationTemplateRead
  title: string
  updatedAt: string
}
