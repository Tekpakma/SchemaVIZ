import * as z from 'zod'

import { GenerationDefinitionSchema } from '@/api/contracts'
import type {
  GenerationTemplateWriteRequest,
  StyleTemplate,
} from '@/api/contracts'

const TRANSFER_FORMAT = 'schemaviz-generation-template'
const TRANSFER_VERSION = 1

const PortableTemplateSchema = z.object({
  name: z.string().trim().min(1).max(200),
  description: z.string().default(''),
  rootModel: z.string().trim().min(1).max(200),
  definition: GenerationDefinitionSchema,
  layoutSettings: z.record(z.string(), z.unknown()).default({}),
})

const GenerationTemplateTransferSchema = z.object({
  format: z.literal(TRANSFER_FORMAT),
  version: z.literal(TRANSFER_VERSION),
  template: PortableTemplateSchema,
})

export class GenerationTemplateTransferError extends Error {
  constructor(message: string) {
    super(message)
    this.name = 'GenerationTemplateTransferError'
  }
}

export function serializeGenerationTemplate(
  request: GenerationTemplateWriteRequest,
  styleTemplates: StyleTemplate[] = [],
): string {
  const parsedTemplate = PortableTemplateSchema.parse(request)
  const templatesById = new Map(
    styleTemplates.flatMap((template) =>
      template.id ? [[template.id, template] as const] : [],
    ),
  )
  const styleDrafts = {
    ...readStyleDrafts(parsedTemplate.layoutSettings),
  }
  const stepsById = Object.fromEntries(
    Object.entries(parsedTemplate.definition.stepsById).map(
      ([stepId, step]) => {
        const styleTemplate = step.styleTemplateId
          ? templatesById.get(step.styleTemplateId)
          : undefined
        if (!styleTemplate) return [stepId, step]

        styleDrafts[stepId] = {
          sourceTemplateId: null,
          persistedTemplateId: null,
          name: styleTemplate.name,
          textContent: styleTemplate.textContent ?? null,
          visualStyles: styleTemplate.visualStyles ?? {},
          dimensions: styleTemplate.dimensions ?? {},
          typeSpecificData: styleTemplate.typeSpecificData ?? {},
        }
        return [stepId, { ...step, styleTemplateId: null }]
      },
    ),
  )
  const template = {
    ...parsedTemplate,
    definition: { ...parsedTemplate.definition, stepsById },
    layoutSettings: {
      ...parsedTemplate.layoutSettings,
      ...(Object.keys(styleDrafts).length > 0 ? { styleDrafts } : {}),
    },
  }

  return `${JSON.stringify(
    {
      format: TRANSFER_FORMAT,
      version: TRANSFER_VERSION,
      template,
    },
    null,
    2,
  )}\n`
}

function readStyleDrafts(
  layoutSettings: Record<string, unknown>,
): Record<string, unknown> {
  const value = layoutSettings.styleDrafts
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return value as Record<string, unknown>
}

export function parseGenerationTemplateFile(
  contents: string,
): GenerationTemplateWriteRequest {
  let decoded: unknown
  try {
    decoded = JSON.parse(contents)
  } catch {
    throw new GenerationTemplateTransferError(
      'The selected file does not contain valid JSON.',
    )
  }

  const parsed = GenerationTemplateTransferSchema.safeParse(decoded)
  if (!parsed.success) {
    throw new GenerationTemplateTransferError(
      'The selected file is not a supported SchemaVIZ template.',
    )
  }

  return {
    ...parsed.data.template,
    scope: 'owner',
    featured: { enabled: false, rank: null },
  }
}

export function getGenerationTemplateFilename(name: string): string {
  const safeName = name
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')

  return `${safeName || 'template'}.schemaviz-template.json`
}
