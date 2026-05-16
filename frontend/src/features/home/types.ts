export type TemplateHue = 'pink' | 'green' | 'plum'

export type PromotionLevel = 'featured' | 'personal' | 'system'

export interface TemplateStart {
  id: string
  label: string
  kind: string
  count: number
}

// TODO: Align with backend GenerationTemplate shape once API is wired
// The backend GenerationTemplate (god node, 105 edges) likely has fields like:
//   - version, scope, steps[], publishedBy, etc.
// This POC type captures the homepage-relevant subset.
export interface Template {
  id: string
  title: string
  author: string
  nodes: number
  edges: number
  hue: TemplateHue
  desc: string
  recent?: boolean
  promotion?: PromotionLevel
  promotedBy?: string | null
  promotedWhen?: string | null
  usedBy?: number
  starts?: TemplateStart[]
}

// TODO: Wire to backend stats endpoint
export interface HomeStats {
  templateCount: number
  ownedLandscapes: number
  sharedWithYou: number
  nodePresets: number
}
