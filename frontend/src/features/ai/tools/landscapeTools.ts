import * as z from 'zod'
import { toolDefinition } from '@tanstack/ai'
import * as R from 'remeda'

import { schemaVizGraphRetrieve } from '@/api/generated/schema-viz'
import type { SchemaGraph } from '@/api/contracts'

import type { AiToolContext } from './context'
import { backendRequestInit, unwrapOk } from './context'
import {
  defaultColor,
  diagramSpecSchema,
  guessShape,
  pickDisplayFields,
} from './diagramSpec'
import type { DiagramSpec } from './diagramSpec'

const MAX_DEPTH = 4
const DEFAULT_DEPTH = 2
const MAX_MODELS = 60
const DEFAULT_MAX_MODELS = 25
const MAX_SKIPPED_REPORTED = 30
// Cross links beyond this turn a landscape into a hairball.
const MAX_REFERENCES = 12

type SchemaEdge = SchemaGraph['edges'][number]

/**
 * `contains` marks the parent side of a plain foreign key: the source record
 * owns many target records, which is what a containment box expresses.
 * Many-to-many and one-to-one hops never contain (a record cannot sit in two
 * boxes, and 1:1 is a peer, not a child). `forward` hops follow a field on
 * the source model; only those become reference lines, so a link is drawn
 * once and in the direction the schema states it.
 */
type Hop = {
  to: string
  relationship: string
  contains: boolean
  forward: boolean
}

// A schema edge can be walked from either end: forwards via the field on the
// source model, backwards via the reverse accessor on the target model.
function hopsFrom(edges: Array<SchemaEdge>, modelId: string): Array<Hop> {
  const hops: Array<Hop> = []
  for (const edge of edges) {
    if (edge.isSubclass || edge.isProxy || edge.source === edge.target) continue
    if (edge.source === modelId && edge.sourceField) {
      hops.push({
        to: edge.target,
        relationship: edge.sourceField,
        contains: false,
        forward: true,
      })
    }
    // Django reports related_name='+' as a missing or '+'-suffixed accessor.
    if (
      edge.target === modelId &&
      edge.reverseName &&
      !edge.reverseName.endsWith('+')
    ) {
      hops.push({
        to: edge.source,
        relationship: edge.reverseName,
        contains: Boolean(edge.isForeignKey) && !edge.isManyToMany,
        forward: false,
      })
    }
  }
  return R.sortBy(hops, (hop) => hop.relationship)
}

function appLabelOf(modelId: string): string {
  return modelId.split('.')[0] ?? ''
}

const skipReasonSchema = z.enum(['excluded', 'already_reached', 'limit'])

const skippedHopSchema = z.object({
  fromModel: z.string(),
  toModel: z.string(),
  relationship: z.string(),
  reason: skipReasonSchema,
})

type SkippedHop = z.infer<typeof skippedHopSchema>

export type LandscapeOptions = {
  rootModel: string
  title?: string
  maxDepth?: number
  maxModels?: number
  apps?: Array<string>
  excludeModels?: Array<string>
  layoutDirection?: DiagramSpec['layoutDirection']
  /** 'containment' nests 1:n children inside their parent box; 'none' draws lines only. */
  grouping?: 'containment' | 'none'
}

type LandscapeGraphNode = {
  id: string
  name: string
  fields?: Array<Array<string>>
}

/**
 * Breadth-first walk from the root. Each model appears once because diagram
 * steps are keyed by model id, so the first path to a model wins. A later
 * forward path to a drawn model becomes a reference line (server -> subnet);
 * everything else that is not followed is reported instead.
 */
export function buildLandscapeSpec(
  graph: {
    nodes: Array<LandscapeGraphNode>
    edges: Array<SchemaEdge>
  },
  options: LandscapeOptions,
): { spec: DiagramSpec; skipped: Array<SkippedHop> } {
  // listModels reports Django's lowercase model_name, the graph uses class
  // names; the backend accepts either, so match loosely and answer in graph ids.
  const wanted = options.rootModel.toLowerCase()
  const root = graph.nodes.find((node) => node.id.toLowerCase() === wanted)
  if (!root) {
    throw new Error(
      `Unknown model "${options.rootModel}". Use listModels to find the exact id.`,
    )
  }

  const maxDepth = Math.min(options.maxDepth ?? DEFAULT_DEPTH, MAX_DEPTH)
  const maxModels = Math.min(
    options.maxModels ?? DEFAULT_MAX_MODELS,
    MAX_MODELS,
  )
  const allowedApps = options.apps?.length
    ? new Set(options.apps.map((app) => app.toLowerCase()))
    : null
  const excluded = new Set(
    (options.excludeModels ?? []).map((id) => id.toLowerCase()),
  )
  const contain = (options.grouping ?? 'containment') === 'containment'

  const depthOf = new Map<string, number>([[root.id, 0]])
  const parentOf = new Map<string, string>()
  // Whether the step that placed a model followed a forward field.
  const forwardOf = new Map<string, boolean>()
  const steps: DiagramSpec['steps'] = []
  const references: DiagramSpec['steps'] = []
  const skipped: Array<SkippedHop> = []
  const queue = [root.id]

  const isAncestor = (candidate: string, model: string) => {
    for (let id = parentOf.get(model); id; id = parentOf.get(id)) {
      if (id === candidate) return true
    }
    return false
  }
  // A model sits inside a box when any step on its path is a containment,
  // unless it (or a model on the way) broke out of the boxes first.
  const insideBox = (model: string) => {
    for (let id: string | undefined = model; id; id = parentOf.get(id)) {
      const step = steps.find((entry) => entry.toModel === id)
      if (step?.groupMode === 'breakout') return false
      if (step?.groupMode === 'group') return true
    }
    return false
  }

  while (queue.length > 0) {
    const current = queue.shift()!
    const depth = depthOf.get(current)!
    if (depth >= maxDepth) continue

    for (const hop of hopsFrom(graph.edges, current)) {
      const skip = (reason: SkippedHop['reason']) =>
        skipped.push({
          fromModel: current,
          toModel: hop.to,
          relationship: hop.relationship,
          reason,
        })

      if (
        excluded.has(hop.to.toLowerCase()) ||
        (allowedApps && !allowedApps.has(appLabelOf(hop.to).toLowerCase()))
      ) {
        skip('excluded')
        continue
      }
      if (depthOf.has(hop.to)) {
        // Links to a container the model already sits in are implied by
        // the nesting; the way back to the parent is the common case.
        if (isAncestor(hop.to, current)) continue

        // A record owned by several parents belongs in the most specific
        // box: a server is drawn inside its environment, not loose inside
        // the business group both of them hang off. A record reached by a
        // plain link first moves into any box that claims it, unless the
        // claimant is a broken-out lookup (servers do not sit inside their
        // admin).
        const stepIndex = steps.findIndex((step) => step.toModel === hop.to)
        const owned = steps[stepIndex]
        const claimant = steps.find((step) => step.toModel === current)
        if (
          contain &&
          hop.contains &&
          owned &&
          claimant?.groupMode !== 'breakout' &&
          (owned.groupMode !== 'group' || depth > depthOf.get(owned.fromModel)!)
        ) {
          const previous = {
            fromModel: owned.fromModel,
            toModel: hop.to,
            relationship: owned.relationship,
          }
          if (
            owned.groupMode !== 'group' &&
            forwardOf.get(hop.to) &&
            references.length < MAX_REFERENCES
          ) {
            references.push({ ...previous, groupMode: 'reference' })
          } else {
            skipped.push({ ...previous, reason: 'already_reached' })
          }
          steps[stepIndex] = {
            fromModel: current,
            toModel: hop.to,
            relationship: hop.relationship,
            groupMode: 'group',
          }
          parentOf.set(hop.to, current)
          forwardOf.set(hop.to, false)
          continue
        }

        if (hop.forward && references.length < MAX_REFERENCES) {
          references.push({
            fromModel: current,
            toModel: hop.to,
            relationship: hop.relationship,
            groupMode: 'reference',
          })
        } else {
          skip('already_reached')
        }
        continue
      }
      if (depthOf.size >= maxModels) {
        skip('limit')
        continue
      }

      depthOf.set(hop.to, depth + 1)
      parentOf.set(hop.to, current)
      forwardOf.set(hop.to, hop.forward)
      // A forward key leaving a box points at something many records share
      // (region, template, owner); drawing it once outside the boxes beats
      // one copy per container.
      const groupMode = !contain
        ? 'edge'
        : hop.contains
          ? 'group'
          : hop.forward && insideBox(current)
            ? 'breakout'
            : 'edge'
      steps.push({
        fromModel: current,
        toModel: hop.to,
        relationship: hop.relationship,
        groupMode,
      })
      queue.push(hop.to)
    }
  }

  // Every model gets a shape and colour; fields only where the graph knows them.
  const fieldsById = new Map(
    graph.nodes.map((node) => [node.id, node.fields ?? []]),
  )
  const styles = Object.fromEntries(
    [...depthOf.keys()].map((modelId) => {
      const fields = pickDisplayFields(fieldsById.get(modelId) ?? [])
      return [
        modelId,
        {
          shape: guessShape(modelId),
          color: defaultColor(modelId),
          ...(fields.length > 0 ? { fields } : {}),
        },
      ]
    }),
  )

  return {
    spec: {
      title: options.title?.trim() || `${root.name} landscape`,
      rootModel: root.id,
      steps: [...steps, ...references],
      styles,
      edgeLabels: 'auto',
      ...(options.layoutDirection
        ? { layoutDirection: options.layoutDirection }
        : {}),
    },
    skipped,
  }
}

export const suggestDiagramDef = toolDefinition({
  name: 'suggestDiagram',
  description:
    'Draft a complete diagram specification by walking the schema outwards from a root model and following every relationship up to maxDepth hops. Use this for requests like "draw my whole landscape starting at X" instead of assembling steps by hand. Parent-child (1:n) hops become containment boxes, foreign keys to models that are already drawn become reference lines between the boxes, and every model gets a shape, colour and telling fields; adjust the returned spec if the user wants something else, then pass it to validateDiagram and publishDiagram.',
  inputSchema: z.object({
    rootModel: z
      .string()
      .describe(
        'Model id the landscape starts from, e.g. "infrastructure.BusinessGroup".',
      ),
    title: z
      .string()
      .optional()
      .describe('Diagram title; defaults to "<Model> landscape".'),
    maxDepth: z
      .number()
      .int()
      .min(1)
      .max(MAX_DEPTH)
      .optional()
      .describe(
        `How many relationship hops to follow from the root. Defaults to ${DEFAULT_DEPTH}.`,
      ),
    maxModels: z
      .number()
      .int()
      .min(2)
      .max(MAX_MODELS)
      .optional()
      .describe(
        `Stop adding models beyond this count. Defaults to ${DEFAULT_MAX_MODELS}.`,
      ),
    apps: z
      .array(z.string())
      .optional()
      .describe(
        'Only follow relationships into models of these Django app labels.',
      ),
    excludeModels: z
      .array(z.string())
      .optional()
      .describe('Model ids that must not appear, e.g. audit or log tables.'),
    layoutDirection: z.enum(['LR', 'RL', 'TB', 'BT']).optional(),
    grouping: z
      .enum(['containment', 'none'])
      .optional()
      .describe(
        '"containment" (default) nests records inside the record that owns them (servers inside their environment); "none" draws every relationship as a line.',
      ),
  }),
  outputSchema: z.object({
    spec: diagramSpecSchema,
    modelCount: z.number(),
    skipped: z
      .array(skippedHopSchema)
      .describe(
        'Relationships not followed: "already_reached" means a second reverse path to a model the spec already contains (forward foreign keys to drawn models are kept as "reference" steps instead), "limit" means maxModels or maxDepth cut it off.',
      ),
    skippedTotal: z.number(),
  }),
})

export const suggestDiagram = suggestDiagramDef.server<AiToolContext>(
  async (options, { context }) => {
    // Field lists are needed to choose what each card prints.
    const response = await schemaVizGraphRetrieve(
      { includeFields: true },
      backendRequestInit(context),
    )
    const graph = unwrapOk(response, 'load schema graph')

    const { spec, skipped } = buildLandscapeSpec(graph, options)

    return {
      spec,
      modelCount: spec.steps.length + 1,
      skipped: skipped.slice(0, MAX_SKIPPED_REPORTED),
      skippedTotal: skipped.length,
    }
  },
)
