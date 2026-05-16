import { useQuery } from '@tanstack/react-query'
import {
  AlertTriangle,
  ArrowRight,
  Check,
  Loader2,
  MapPin,
  Route,
  Unlink,
  X,
} from 'lucide-react'
import { useCallback, useEffect, useMemo, useState } from 'react'
import { useTranslation } from 'react-i18next'

import type { ModelInfoShort, SchemaRoute } from '@/api/contracts'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'
import type { BuilderDocumentActions } from '../builderWorkbench'
import { BUILDER_SCHEMA_QUERIES } from '../schemaModelQueries'
import type {
  RecipeLayer,
  RecipeModel,
  TraversalEdge,
  TraversalRouteStep,
} from '../types'

// ---------------------------------------------------------------------------
// Model pair derivation
// ---------------------------------------------------------------------------

interface ModelPair {
  from: RecipeModel
  to: RecipeModel
  pairKey: string
}

function getModelPairs(
  layers: RecipeLayer[],
  models: RecipeModel[],
): ModelPair[] {
  if (layers.length < 2 || models.length < 2) return []

  const modelsByLayerId = new Map<string, RecipeModel[]>()
  for (const layer of layers) {
    modelsByLayerId.set(layer.id, [])
  }
  for (const model of models) {
    modelsByLayerId.get(model.layerId)?.push(model)
  }

  const layerModels = layers
    .map((layer) => modelsByLayerId.get(layer.id) ?? [])
    .filter((group) => group.length > 0)

  const pairs: ModelPair[] = []
  for (let i = 0; i < layerModels.length - 1; i++) {
    const fromGroup = layerModels[i]!
    const toGroup = layerModels[i + 1]!
    for (const from of fromGroup) {
      for (const to of toGroup) {
        pairs.push({ from, to, pairKey: `${from.id}--${to.id}` })
      }
    }
  }
  return pairs
}

// ---------------------------------------------------------------------------
// Edge helpers
// ---------------------------------------------------------------------------

function edgeIdForRoute(pairKey: string, routeIndex: number) {
  return `edge-${pairKey}-r${routeIndex}`
}

function toTraversalEdge(
  pair: ModelPair,
  routeSteps: TraversalRouteStep[],
  routeIndex: number,
): TraversalEdge {
  return {
    id: edgeIdForRoute(pair.pairKey, routeIndex),
    from: pair.from.displayName,
    to: pair.to.displayName,
    fromModelId: pair.from.id,
    toModelId: pair.to.id,
    via: routeLabel(routeSteps),
    routeSteps,
    auto: routeSteps.length === 1,
    cost: routeSteps.length,
  }
}

function routeLabel(route: Pick<TraversalRouteStep, 'viaField'>[]) {
  return route.map((s) => s.viaField).join(' → ')
}

// ---------------------------------------------------------------------------
// Group routes by hop count for the command palette
// ---------------------------------------------------------------------------

function groupRoutesByHops(routes: SchemaRoute[]) {
  const direct: { route: SchemaRoute; index: number }[] = []
  const twoHop: { route: SchemaRoute; index: number }[] = []
  const threeHop: { route: SchemaRoute; index: number }[] = []
  const manyHop: { route: SchemaRoute; index: number }[] = []

  routes.forEach((route, index) => {
    const hops = route.route.length
    if (hops === 1) direct.push({ route, index })
    else if (hops === 2) twoHop.push({ route, index })
    else if (hops === 3) threeHop.push({ route, index })
    else manyHop.push({ route, index })
  })

  return { direct, twoHop, threeHop, manyHop }
}

// ---------------------------------------------------------------------------
// Waypoint chip bar
// ---------------------------------------------------------------------------

function WaypointChips({
  waypoints,
  allModels,
  onRemove,
  onAdd,
}: {
  waypoints: string[]
  allModels: ModelInfoShort[]
  onRemove: (modelId: string) => void
  onAdd: () => void
}) {
  const { t } = useTranslation()

  const waypointLabels = useMemo(() => {
    const map = new Map<string, string>()
    for (const m of allModels) {
      map.set(
        `${m.appLabel}.${m.modelName}`,
        m.verboseName || m.modelName,
      )
    }
    return map
  }, [allModels])

  return (
    <div className="flex flex-wrap items-center gap-1">
      {waypoints.map((wp) => (
        <span
          key={wp}
          className="inline-flex items-center gap-1 rounded-full bg-muted px-2 py-0.5 text-[10.5px]"
        >
          <MapPin className="size-3 text-muted-foreground" />
          <span className="max-w-[120px] truncate font-mono">
            {waypointLabels.get(wp) ?? wp}
          </span>
          <button
            type="button"
            onClick={() => onRemove(wp)}
            className="rounded-full p-0.5 hover:bg-background"
          >
            <X className="size-2.5" />
          </button>
        </span>
      ))}
      <button
        type="button"
        onClick={onAdd}
        className="inline-flex items-center gap-1 rounded-full border border-dashed border-border px-2 py-0.5 text-[10.5px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
      >
        <MapPin className="size-3" />
        {t('builder.traversal.addWaypoint')}
      </button>
    </div>
  )
}

// ---------------------------------------------------------------------------
// Waypoint picker dialog (reuses model list)
// ---------------------------------------------------------------------------

function WaypointPickerDialog({
  open,
  onOpenChange,
  allModels,
  existingWaypoints,
  excludeModelIds,
  onPick,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  allModels: ModelInfoShort[]
  existingWaypoints: string[]
  excludeModelIds: Set<string>
  onPick: (modelId: string) => void
}) {
  const { t } = useTranslation()

  const existingSet = useMemo(
    () => new Set(existingWaypoints),
    [existingWaypoints],
  )

  const groupedModels = useMemo(() => {
    const groups = new Map<string, ModelInfoShort[]>()
    for (const model of allModels) {
      const modelId = `${model.appLabel}.${model.modelName}`
      if (excludeModelIds.has(modelId)) continue
      const appName = model.appVerboseName || model.appLabel
      groups.set(appName, [...(groups.get(appName) ?? []), model])
    }
    return [...groups.entries()]
  }, [allModels, excludeModelIds])

  return (
    <CommandDialog
      title={t('builder.traversal.addWaypoint')}
      description={t('builder.traversal.addWaypoint')}
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
    >
      <CommandInput placeholder={t('builder.modelPicker.search')} />
      <CommandList>
        <CommandEmpty>{t('builder.modelPicker.empty')}</CommandEmpty>
        {groupedModels.map(([appName, appModels]) => (
          <CommandGroup key={appName} heading={appName}>
            {appModels.map((model) => {
              const modelId = `${model.appLabel}.${model.modelName}`
              const isAdded = existingSet.has(modelId)

              return (
                <CommandItem
                  key={modelId}
                  value={`${model.verboseName} ${modelId}`}
                  disabled={isAdded}
                  onSelect={() => {
                    onPick(modelId)
                    onOpenChange(false)
                  }}
                >
                  {isAdded ? (
                    <Check className="size-4 text-brand" />
                  ) : (
                    <MapPin className="size-4" />
                  )}
                  <span className="min-w-0 flex-1 truncate">
                    {model.verboseName || model.modelName}
                  </span>
                  <span className="font-mono text-[10.5px] text-muted-foreground">
                    {model.modelName}
                  </span>
                </CommandItem>
              )
            })}
          </CommandGroup>
        ))}
      </CommandList>
    </CommandDialog>
  )
}

// ---------------------------------------------------------------------------
// Route picker command dialog
// ---------------------------------------------------------------------------

function RoutePickerDialog({
  open,
  onOpenChange,
  pair,
  routes,
  isLoading,
  isError,
  existingEdge,
  onSelectRoute,
}: {
  open: boolean
  onOpenChange: (open: boolean) => void
  pair: ModelPair
  routes: SchemaRoute[] | undefined
  isLoading: boolean
  isError: boolean
  existingEdge: TraversalEdge | undefined
  onSelectRoute: (routeIndex: number) => void
}) {
  const { t } = useTranslation()
  const grouped = useMemo(
    () => (routes ? groupRoutesByHops(routes) : null),
    [routes],
  )

  return (
    <CommandDialog
      title={t('builder.traversal.dialogTitle')}
      description={t('builder.traversal.dialogDescription', {
        from: pair.from.displayName,
        to: pair.to.displayName,
      })}
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
    >
      <CommandInput placeholder={t('builder.traversal.searchRoutes')} />
      <CommandList>
        {isLoading && (
          <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-muted-foreground">
            <Loader2 className="size-4 animate-spin" />
            {t('builder.traversal.findingRoutes')}
          </div>
        )}

        {isError && (
          <div className="flex items-center justify-center gap-2 py-6 text-[12px] text-destructive">
            <AlertTriangle className="size-4" />
            {t('builder.traversal.routeError')}
          </div>
        )}

        {!isLoading && !isError && routes && routes.length === 0 && (
          <CommandEmpty>{t('builder.traversal.noRouteFound')}</CommandEmpty>
        )}

        {grouped && (
          <>
            {grouped.direct.length > 0 && (
              <CommandGroup heading={t('builder.traversal.directGroup')}>
                {grouped.direct.map(({ route: schemaRoute, index }) => {
                  const candidateId = edgeIdForRoute(pair.pairKey, index)
                  const isSelected = existingEdge?.id === candidateId
                  const label = routeLabel(schemaRoute.route)

                  return (
                    <CommandItem
                      key={index}
                      value={label}
                      onSelect={() => {
                        onSelectRoute(index)
                        onOpenChange(false)
                      }}
                    >
                      <Route className="size-4" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {label}
                      </span>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-brand" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {grouped.twoHop.length > 0 && (
              <CommandGroup
                heading={t('builder.traversal.hopsGroup', { count: 2 })}
              >
                {grouped.twoHop.map(({ route: schemaRoute, index }) => {
                  const candidateId = edgeIdForRoute(pair.pairKey, index)
                  const isSelected = existingEdge?.id === candidateId
                  const label = routeLabel(schemaRoute.route)

                  return (
                    <CommandItem
                      key={index}
                      value={label}
                      onSelect={() => {
                        onSelectRoute(index)
                        onOpenChange(false)
                      }}
                    >
                      <Route className="size-4" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {label}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        2 hops
                      </span>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-brand" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {grouped.threeHop.length > 0 && (
              <CommandGroup
                heading={t('builder.traversal.hopsGroup', { count: 3 })}
              >
                {grouped.threeHop.map(({ route: schemaRoute, index }) => {
                  const candidateId = edgeIdForRoute(pair.pairKey, index)
                  const isSelected = existingEdge?.id === candidateId
                  const label = routeLabel(schemaRoute.route)

                  return (
                    <CommandItem
                      key={index}
                      value={label}
                      onSelect={() => {
                        onSelectRoute(index)
                        onOpenChange(false)
                      }}
                    >
                      <Route className="size-4" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {label}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        3 hops
                      </span>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-brand" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}

            {grouped.manyHop.length > 0 && (
              <CommandGroup
                heading={t('builder.traversal.manyHopsGroup', { count: 4 })}
              >
                {grouped.manyHop.map(({ route: schemaRoute, index }) => {
                  const candidateId = edgeIdForRoute(pair.pairKey, index)
                  const isSelected = existingEdge?.id === candidateId
                  const hops = schemaRoute.route.length
                  const label = routeLabel(schemaRoute.route)

                  return (
                    <CommandItem
                      key={index}
                      value={label}
                      onSelect={() => {
                        onSelectRoute(index)
                        onOpenChange(false)
                      }}
                    >
                      <Route className="size-4" />
                      <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                        {label}
                      </span>
                      <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                        {hops} hops
                      </span>
                      {isSelected && (
                        <Check className="size-4 shrink-0 text-brand" />
                      )}
                    </CommandItem>
                  )
                })}
              </CommandGroup>
            )}
          </>
        )}
      </CommandList>
    </CommandDialog>
  )
}

// ---------------------------------------------------------------------------
// Per-pair card with inline selected route + pick/change button
// ---------------------------------------------------------------------------

function ModelPairCard({
  pair,
  existingEdge,
  allModels,
  waypoints,
  onWaypointsChange,
  onSelectRoute,
  onOpenWaypointPicker,
}: {
  pair: ModelPair
  existingEdge: TraversalEdge | undefined
  allModels: ModelInfoShort[]
  waypoints: string[]
  onWaypointsChange: (waypoints: string[]) => void
  onSelectRoute: (
    pair: ModelPair,
    routeIndex: number,
    routeSteps: TraversalRouteStep[],
  ) => void
  onOpenWaypointPicker: () => void
}) {
  const { t } = useTranslation()
  const [dialogOpen, setDialogOpen] = useState(false)

  const query = useQuery(
    BUILDER_SCHEMA_QUERIES.routes(
      pair.from.modelId,
      pair.to.modelId,
      waypoints.length > 0 ? waypoints : undefined,
    ),
  )

  const routes = query.data

  // Auto-select the first direct route when there's only one and nothing selected
  const hasAutoSelected = useMemo(() => {
    if (existingEdge || !routes || routes.length === 0) return false
    // Only auto-select if there's exactly one direct (1-hop) route
    const directRoutes = routes.filter((r) => r.route.length === 1)
    if (directRoutes.length === 1) {
      const routeIndex = routes.indexOf(directRoutes[0]!)
      return routeIndex
    }
    return false
  }, [existingEdge, routes])

  // Auto-select the only direct route
  useEffect(() => {
    if (hasAutoSelected !== false && routes) {
      const route = routes[hasAutoSelected]
      if (route?.route[0]) {
        onSelectRoute(pair, hasAutoSelected, route.route)
      }
    }
  }, [hasAutoSelected, routes, pair, onSelectRoute])

  const handleSelectRoute = useCallback(
    (routeIndex: number) => {
      if (!routes) return
      const schemaRoute = routes[routeIndex]
      if (!schemaRoute) return
      onSelectRoute(pair, routeIndex, schemaRoute.route)
    },
    [routes, pair, onSelectRoute],
  )

  const handleRemoveWaypoint = useCallback(
    (modelId: string) => {
      onWaypointsChange(waypoints.filter((wp) => wp !== modelId))
    },
    [waypoints, onWaypointsChange],
  )

  // Find the selected route's full label
  const selectedRouteLabel = useMemo(() => {
    if (!existingEdge || !routes) return null
    for (let i = 0; i < routes.length; i++) {
      const candidateId = edgeIdForRoute(pair.pairKey, i)
      if (existingEdge.id === candidateId) {
        return routeLabel(routes[i]!.route)
      }
    }
    // Edge exists but route list changed (e.g. waypoint added) — show via field
    return existingEdge.via
  }, [existingEdge, routes, pair.pairKey])

  return (
    <>
      <div className="flex flex-col gap-2 rounded-xl border border-border bg-background p-3">
        {/* Header: From → To */}
        <div className="flex items-center gap-2 text-[12.5px]">
          <span className="font-medium">{pair.from.displayName}</span>
          <ArrowRight className="size-3.5 text-muted-foreground" />
          <span className="font-medium">{pair.to.displayName}</span>

          {query.isLoading && (
            <Loader2 className="ml-auto size-3.5 animate-spin text-muted-foreground" />
          )}
          {query.isError && (
            <AlertTriangle className="ml-auto size-3.5 text-destructive" />
          )}
        </div>

        {/* Waypoint chips */}
        <WaypointChips
          waypoints={waypoints}
          allModels={allModels}
          onRemove={handleRemoveWaypoint}
          onAdd={onOpenWaypointPicker}
        />

        {/* Selected route display + pick/change button */}
        {!query.isLoading && !query.isError && routes && routes.length === 0 && (
          <div className="flex items-center gap-2 py-1 text-[12px] text-muted-foreground">
            <Unlink className="size-3.5" />
            {t('builder.traversal.noRouteFound')}
          </div>
        )}

        {selectedRouteLabel ? (
          <div className="flex items-center gap-2">
            <div className="flex min-w-0 flex-1 items-center gap-2 rounded-md border border-brand/40 bg-brand-muted px-3 py-2">
              <Route className="size-3.5 shrink-0 text-brand" />
              <span className="min-w-0 flex-1 truncate font-mono text-[11px]">
                {selectedRouteLabel}
              </span>
              {existingEdge?.auto && (
                <span className="shrink-0 rounded-full bg-brand/10 px-1.5 py-0.5 font-mono text-[9px] text-brand">
                  {t('builder.traversal.autoBadge')}
                </span>
              )}
              {existingEdge && existingEdge.cost > 1 && (
                <span className="shrink-0 rounded-full bg-muted px-1.5 py-0.5 font-mono text-[9px] text-muted-foreground">
                  {existingEdge.cost} hops
                </span>
              )}
              <Check className="size-3.5 shrink-0 text-brand" />
            </div>
            <button
              type="button"
              onClick={() => setDialogOpen(true)}
              className="shrink-0 rounded-md border border-border px-2.5 py-2 text-[11px] text-muted-foreground transition-colors hover:border-brand/25 hover:text-foreground"
            >
              {t('builder.traversal.changeRoute')}
            </button>
          </div>
        ) : routes && routes.length > 0 ? (
          <button
            type="button"
            onClick={() => setDialogOpen(true)}
            className="flex w-full items-center justify-center gap-2 rounded-md border border-dashed border-border px-3 py-2 text-[12px] text-muted-foreground transition-colors hover:border-brand/40 hover:text-foreground"
          >
            <Route className="size-3.5" />
            {t('builder.traversal.pickRoute')}
            {routes.length > 0 && (
              <span className="font-mono text-[10px]">
                ({routes.length})
              </span>
            )}
          </button>
        ) : null}
      </div>

      {/* Route picker dialog */}
      <RoutePickerDialog
        open={dialogOpen}
        onOpenChange={setDialogOpen}
        pair={pair}
        routes={routes}
        isLoading={query.isLoading}
        isError={query.isError}
        existingEdge={existingEdge}
        onSelectRoute={handleSelectRoute}
      />
    </>
  )
}

// ---------------------------------------------------------------------------
// Main traversal step
// ---------------------------------------------------------------------------

interface TraversalStepProps {
  actions: Pick<BuilderDocumentActions, 'addEdge' | 'removeEdge'>
  edges: TraversalEdge[]
  layers: RecipeLayer[]
  models: RecipeModel[]
}

export function TraversalStep({
  actions,
  edges,
  layers,
  models,
}: TraversalStepProps) {
  const { t } = useTranslation()
  const pairs = useMemo(() => getModelPairs(layers, models), [layers, models])

  // Load all schema models for waypoint picker
  const schemaModelsQuery = useQuery(BUILDER_SCHEMA_QUERIES.models())
  const allSchemaModels = schemaModelsQuery.data ?? []

  // Per-pair waypoint state
  const [waypointsByPair, setWaypointsByPair] = useState<
    Map<string, string[]>
  >(new Map())

  // Waypoint picker state
  const [waypointPickerPairKey, setWaypointPickerPairKey] = useState<
    string | null
  >(null)
  const waypointPickerPair = useMemo(
    () => pairs.find((p) => p.pairKey === waypointPickerPairKey) ?? null,
    [pairs, waypointPickerPairKey],
  )

  const edgeByPairKey = useMemo(() => {
    const map = new Map<string, TraversalEdge>()
    for (const edge of edges) {
      if (edge.fromModelId && edge.toModelId) {
        map.set(`${edge.fromModelId}--${edge.toModelId}`, edge)
      }
    }
    return map
  }, [edges])

  const handleSelectRoute = useCallback(
    (
      pair: ModelPair,
      routeIndex: number,
      routeSteps: TraversalRouteStep[],
    ) => {
      const existing = edgeByPairKey.get(pair.pairKey)
      if (existing) {
        actions.removeEdge(existing.id)
      }

      const candidateId = edgeIdForRoute(pair.pairKey, routeIndex)
      if (existing?.id === candidateId) return

      const firstStep = routeSteps[0]
      if (!firstStep) return

      actions.addEdge(toTraversalEdge(pair, routeSteps, routeIndex))
    },
    [actions, edgeByPairKey],
  )

  const handleWaypointsChange = useCallback(
    (pairKey: string, waypoints: string[]) => {
      setWaypointsByPair((prev) => {
        const next = new Map(prev)
        if (waypoints.length === 0) {
          next.delete(pairKey)
        } else {
          next.set(pairKey, waypoints)
        }
        return next
      })
    },
    [],
  )

  const handleWaypointPicked = useCallback(
    (modelId: string) => {
      if (!waypointPickerPairKey) return
      const existing = waypointsByPair.get(waypointPickerPairKey) ?? []
      if (existing.includes(modelId)) return
      handleWaypointsChange(waypointPickerPairKey, [...existing, modelId])
    },
    [waypointPickerPairKey, waypointsByPair, handleWaypointsChange],
  )

  // Models that are start/end of the current waypoint picker pair (excluded from waypoint choices)
  const waypointExcludeIds = useMemo(() => {
    const set = new Set<string>()
    if (waypointPickerPair) {
      set.add(waypointPickerPair.from.modelId)
      set.add(waypointPickerPair.to.modelId)
    }
    return set
  }, [waypointPickerPair])

  if (models.length < 2) {
    return (
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.traversal.needsModels')}
      </p>
    )
  }

  if (pairs.length === 0) {
    return (
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.traversal.sameLayerHint')}
      </p>
    )
  }

  const selectedCount = pairs.filter((p) =>
    edgeByPairKey.has(p.pairKey),
  ).length

  return (
    <div className="flex flex-col gap-3">
      <p className="text-[12.5px] leading-relaxed text-muted-foreground">
        {t('builder.traversal.description')}
      </p>

      <div className="flex flex-col gap-2">
        {pairs.map((pair) => (
          <ModelPairCard
            key={pair.pairKey}
            pair={pair}
            existingEdge={edgeByPairKey.get(pair.pairKey)}
            allModels={allSchemaModels}
            waypoints={waypointsByPair.get(pair.pairKey) ?? []}
            onWaypointsChange={(wps) =>
              handleWaypointsChange(pair.pairKey, wps)
            }
            onSelectRoute={handleSelectRoute}
            onOpenWaypointPicker={() =>
              setWaypointPickerPairKey(pair.pairKey)
            }
          />
        ))}
      </div>

      <div className="flex items-center gap-2 text-[12px] text-muted-foreground">
        <Route className="size-3.5" />
        {selectedCount}/{pairs.length} routes selected
      </div>

      {/* Shared waypoint picker dialog */}
      <WaypointPickerDialog
        open={waypointPickerPairKey !== null}
        onOpenChange={(open) => {
          if (!open) setWaypointPickerPairKey(null)
        }}
        allModels={allSchemaModels}
        existingWaypoints={
          waypointPickerPairKey
            ? (waypointsByPair.get(waypointPickerPairKey) ?? [])
            : []
        }
        excludeModelIds={waypointExcludeIds}
        onPick={handleWaypointPicked}
      />
    </div>
  )
}
