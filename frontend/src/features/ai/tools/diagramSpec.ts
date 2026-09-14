import * as z from 'zod'
import * as R from 'remeda'

import { createBlankRecipe } from '@/features/builder/templateRecipe'
import type {
  RecipeData,
  RecipeGroupRule,
  RecipeModel,
  RecipeStyleDraft,
  TraversalEdge,
} from '@/features/builder/types'
import { DEFAULT_RECIPE_GROUP_LAYOUT } from '@/features/builder/types'
import { splitModelId } from '@/features/lexical/dataReference/modelUtils'

/**
 * Browser-safe part of the AI tooling: the diagram shape the model produces
 * and its conversion into a recipe. Server-only modules import from here, never
 * the other way round, so client tools stay free of server dependencies.
 *
 * Deliberately far smaller than RecipeData: everything the builder needs but
 * an author would not decide (layers, swatches, style drafts) is filled in
 * from the blank recipe.
 */

/** Shape keys the canvas, the SVG export and draw.io all know. */
export const DIAGRAM_SHAPES = [
  'default',
  'server',
  'cylinder',
  'cloud',
  'hexagon',
  'diamond',
  'shield',
  'queue',
  'person',
  'document',
  'network',
] as const

export type DiagramShape = (typeof DIAGRAM_SHAPES)[number]

/** Placeholder that renders a record's display name (`str(record)`). */
export const DISPLAY_NAME_FIELD = '$display'

export const diagramModelStyleSchema = z.object({
  shape: z
    .enum(DIAGRAM_SHAPES)
    .optional()
    .describe(
      'Symbol for records of this model. server = machines/hosts, cylinder = databases/storage, cloud = providers/regions, hexagon = applications/services, diamond = load balancers/routers, shield = security groups/firewalls/policies, queue = message queues/topics, person = people/teams/owners, document = configs/templates/contracts, network = networks/subnets/VPCs.',
    ),
  color: z
    .string()
    .regex(/^#[0-9a-fA-F]{6}$/)
    .optional()
    .describe('Accent colour as #rrggbb. Omit for an automatic colour.'),
  fields: z
    .array(z.string())
    .max(3)
    .optional()
    .describe(
      'Field names to print under the record name, e.g. ["ip_address", "status"]. Use names from getModelDetails.',
    ),
})

export type DiagramModelStyle = z.infer<typeof diagramModelStyleSchema>

export const diagramSpecSchema = z.object({
  title: z.string().describe('Human-readable title for the diagram.'),
  rootModel: z
    .string()
    .describe(
      'Model id the traversal starts from, e.g. "infrastructure.BusinessGroup".',
    ),
  steps: z
    .array(
      z.object({
        fromModel: z.string().describe('Model id the hop starts at.'),
        toModel: z.string().describe('Model id the hop arrives at.'),
        relationship: z
          .string()
          .describe(
            'Exact field or reverse-accessor name connecting the two models. Verify it with getModelDetails first.',
          ),
        groupMode: z
          .enum(['group', 'edge', 'breakout', 'reference'])
          .optional()
          .describe(
            '"group" draws the target records inside the source record\'s box (containment, e.g. servers inside their environment); "edge" connects them with a line and adds the target records next to the source, inside the same box; "breakout" draws each target record once, outside every box, with a line from each record that points to it (shared lookups such as regions, templates or owners); "reference" only draws a line to the record where it already appears in the diagram (cross links such as server -> subnet when subnets are drawn inside their network). Defaults to "edge".',
          ),
      }),
    )
    .describe(
      'Relationship hops, each starting at a model already reachable from the root.',
    ),
  styles: z
    .record(z.string(), diagramModelStyleSchema)
    .optional()
    .describe(
      'Per-model appearance keyed by model id. Models without an entry get an automatic shape and colour.',
    ),
  edgeLabels: z
    .enum(['auto', 'none', 'all'])
    .optional()
    .describe(
      'Relationship names on the lines: "auto" hides labels that merely repeat the target model (default), "none" hides all, "all" shows all.',
    ),
  layoutDirection: z
    .enum(['LR', 'RL', 'TB', 'BT'])
    .optional()
    .describe('Flow direction of the layout. Defaults to left-to-right.'),
})

export type DiagramSpec = z.infer<typeof diagramSpecSchema>

// ---------------------------------------------------------------------------
// Defaults: a diagram should look reasonable before anyone styles it.
// ---------------------------------------------------------------------------

// Distinct hues that read well as 4px accent bars and 2px borders on white.
const MODEL_PALETTE = [
  '#C4006A',
  '#1D8B68',
  '#2563EB',
  '#D97706',
  '#7C3AED',
  '#0891B2',
  '#DC2626',
  '#4D7C0F',
  '#6A2B4D',
  '#0F766E',
]

// Checked in order against the words of the model name, so specific words
// beat generic ones (a "ServerTemplate" is a document, a "DatabaseServer" a
// server) and "business" never matches "bus".
const SHAPE_HINTS: Array<[ReadonlySet<string>, DiagramShape]> = [
  [
    new Set([
      'template',
      'document',
      'contract',
      'config',
      'configuration',
      'manifest',
      'report',
      'license',
      'policy',
      'runbook',
    ]),
    'document',
  ],
  [
    new Set([
      'security',
      'firewall',
      'rule',
      'acl',
      'certificate',
      'secret',
      'permission',
      'waf',
    ]),
    'shield',
  ],
  [
    new Set([
      'balancer',
      'loadbalancer',
      'gateway',
      'router',
      'proxy',
      'switch',
      'ingress',
      'dns',
    ]),
    'diamond',
  ],
  [new Set(['queue', 'topic', 'stream', 'broker', 'event', 'kafka']), 'queue'],
  [
    new Set(['database', 'db', 'storage', 'bucket', 'volume', 'disk', 'cache']),
    'cylinder',
  ],
  [
    new Set(['server', 'host', 'machine', 'vm', 'instance', 'compute', 'node']),
    'server',
  ],
  [new Set(['network', 'subnet', 'vpc', 'vlan', 'cidr', 'segment']), 'network'],
  [
    new Set([
      'cloud',
      'provider',
      'region',
      'zone',
      'datacenter',
      'data_center',
      'site',
    ]),
    'cloud',
  ],
  [
    new Set([
      'person',
      'people',
      'user',
      'owner',
      'team',
      'group',
      'contact',
      'employee',
      'customer',
      'department',
    ]),
    'person',
  ],
  [
    new Set([
      'application',
      'service',
      'app',
      'api',
      'component',
      'module',
      'system',
      'deployment',
      'microservice',
    ]),
    'hexagon',
  ],
]

const RELATION_FIELD_TYPE = /(ForeignKey|ManyToMany|OneToOne|Rel\b|Relation)/

const FIELD_PRIORITY = [
  'hostname',
  'ip_address',
  'ip',
  'address',
  'status',
  'state',
  'environment',
  'version',
  'url',
  'email',
  'role',
  'type',
  'kind',
  'tier',
  'size',
  'region',
  'cidr',
  'port',
]

function hashString(value: string): number {
  let hash = 0
  for (const char of value) {
    hash = (hash * 31 + char.charCodeAt(0)) >>> 0
  }
  return hash
}

function modelNameWords(modelName: string): Array<string> {
  return modelName
    .replace(/([a-z0-9])([A-Z])/g, '$1_$2')
    .replace(/[-\s]+/g, '_')
    .toLowerCase()
    .split('_')
    .filter(Boolean)
    .flatMap((word) =>
      word.endsWith('s') ? [word, word.slice(0, -1)] : [word],
    )
}

export function guessShape(modelId: string): DiagramShape {
  const words = modelNameWords(splitModelId(modelId)?.modelName ?? modelId)
  for (const [keywords, shape] of SHAPE_HINTS) {
    if (words.some((word) => keywords.has(word))) return shape
  }
  return 'default'
}

export function defaultColor(modelId: string): string {
  return MODEL_PALETTE[
    hashString(modelId.toLowerCase()) % MODEL_PALETTE.length
  ]!
}

/**
 * Picks up to `max` telling fields. Accepts bare names or `[name, type]`
 * pairs as the schema graph reports them; relation fields are skipped because
 * they would only print an id.
 */
export function pickDisplayFields(
  fields: ReadonlyArray<string | ReadonlyArray<string>>,
  max = 2,
): Array<string> {
  const available = new Set(
    fields.flatMap((field) => {
      if (typeof field === 'string') return [field]
      const [name, type] = field
      return name && !(type && RELATION_FIELD_TYPE.test(type)) ? [name] : []
    }),
  )
  return FIELD_PRIORITY.filter((name) => available.has(name)).slice(0, max)
}

export function resolveModelStyle(
  modelId: string,
  style: DiagramModelStyle | undefined,
): { shape: DiagramShape; color: string; fields: Array<string> } {
  return {
    shape: style?.shape ?? guessShape(modelId),
    color: style?.color ?? defaultColor(modelId),
    fields: style?.fields ?? [],
  }
}

// ---------------------------------------------------------------------------
// Spec → recipe
// ---------------------------------------------------------------------------

const SHAPE_SIZES: Record<DiagramShape, { width: number; height: number }> = {
  default: { width: 220, height: 120 },
  server: { width: 200, height: 130 },
  cylinder: { width: 190, height: 140 },
  cloud: { width: 230, height: 130 },
  hexagon: { width: 240, height: 120 },
  diamond: { width: 260, height: 160 },
  shield: { width: 200, height: 140 },
  queue: { width: 230, height: 110 },
  person: { width: 190, height: 150 },
  document: { width: 210, height: 130 },
  network: { width: 230, height: 120 },
}

const FIELD_LINE_HEIGHT = 16

function textNode(text: string, format = 0, style?: string) {
  return {
    type: 'text',
    text,
    format,
    detail: 0,
    mode: 'normal',
    version: 1,
    ...(style ? { style } : {}),
  }
}

function paragraph(children: Array<unknown>) {
  return {
    type: 'paragraph',
    format: '',
    indent: 0,
    direction: null,
    version: 1,
    children,
  }
}

/** Lexical state: bold record name, then one muted line per field. */
export function createStyleTextContent(fields: ReadonlyArray<string>) {
  return {
    root: {
      type: 'root',
      format: '',
      indent: 0,
      direction: null,
      version: 1,
      children: [
        paragraph([textNode(`{{${DISPLAY_NAME_FIELD}}}`, 1)]),
        ...fields.map((field) =>
          paragraph([
            textNode(`{{${field}}}`, 0, 'font-size: 11px; color: #6b7280;'),
          ]),
        ),
      ],
    },
  }
}

export function createStyleDraft(
  modelId: string,
  style: DiagramModelStyle | undefined,
): RecipeStyleDraft {
  const resolved = resolveModelStyle(modelId, style)
  const size = SHAPE_SIZES[resolved.shape]
  const modelName = splitModelId(modelId)?.modelName ?? modelId

  return {
    sourceTemplateId: null,
    persistedTemplateId: null,
    name: `${modelName} node`,
    textContent: createStyleTextContent(resolved.fields),
    visualStyles: {},
    dimensions: {
      width: size.width,
      height: size.height + resolved.fields.length * FIELD_LINE_HEIGHT,
    },
    // The accent bar is canvas-only; the border carries the colour into SVG/draw.io.
    typeSpecificData: {
      shapeKey: resolved.shape,
      accent: resolved.color,
      borderColor: resolved.color,
    },
    dirty: false,
    saveState: 'idle',
  }
}

function toRecipeModel(modelId: string, layerId: string): RecipeModel | null {
  const ref = splitModelId(modelId)
  if (!ref) return null

  return {
    id: modelId,
    appLabel: ref.appLabel,
    appVerboseName: ref.appLabel,
    modelName: ref.modelName,
    modelId,
    displayName: ref.modelName,
    layerId,
  }
}

export function orderedSpecModelIds(spec: DiagramSpec): Array<string> {
  return R.unique([
    spec.rootModel,
    ...spec.steps.flatMap((step) => [step.fromModel, step.toModel]),
  ])
}

/**
 * Model ids double as recipe step ids, which lets the traversal edges fall
 * back to a single-hop route step without a separate path lookup.
 */
export function specToRecipe(spec: DiagramSpec): RecipeData {
  const blank = createBlankRecipe()
  const layerId = blank.layers[0]!.id

  const models = orderedSpecModelIds(spec)
    .map((modelId) => toRecipeModel(modelId, layerId))
    .filter((model) => model !== null)

  const edges: TraversalEdge[] = spec.steps.map((step, index) => ({
    id: `edge-${index + 1}`,
    from: step.fromModel,
    to: step.toModel,
    fromModelId: step.fromModel,
    toModelId: step.toModel,
    via: step.relationship,
    auto: false,
    cost: 1,
  }))

  // A "group" step turns its source into a container for all of that source's
  // children; plain "edge" siblings stay nested, which reads fine and keeps
  // every edge inside one ELK hierarchy level. "breakout" lifts the target out
  // of every box and "reference" keeps the edge but tells the engine to point
  // at the record's existing node.
  const groupRules: RecipeGroupRule[] = spec.steps.flatMap((step, index) =>
    step.groupMode && step.groupMode !== 'edge'
      ? [
          {
            id: `group-${index + 1}`,
            parentModelId: step.fromModel,
            childModelId: step.toModel,
            via: step.relationship,
            mode: step.groupMode,
            layout: { ...DEFAULT_RECIPE_GROUP_LAYOUT },
          },
        ]
      : [],
  )

  const styleDrafts = Object.fromEntries(
    models.map((model) => [
      model.id,
      createStyleDraft(model.modelId, spec.styles?.[model.modelId]),
    ]),
  )

  return {
    ...blank,
    title: spec.title,
    models,
    edges,
    groupRules,
    styleDrafts,
    edgeLabels: spec.edgeLabels ?? 'auto',
    layoutDirection: spec.layoutDirection ?? blank.layoutDirection,
  }
}
