import { useMemo } from 'react'
import { LayersIcon, LockIcon, PlusIcon, TrashIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
  CommandSeparator,
} from '@/components/ui/command'
import type { RecipeLayer, RecipeModel } from '@/features/builder/types'

interface LayerManagerDialogProps {
  layers: RecipeLayer[]
  models: RecipeModel[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onAddLayer: (layer: RecipeLayer) => void
  onRemoveLayer: (layerId: string) => void
}

export function LayerManagerDialog({
  layers,
  models,
  open,
  onOpenChange,
  onAddLayer,
  onRemoveLayer,
}: LayerManagerDialogProps) {
  const { t } = useTranslation()
  const modelCountByLayerId = useMemo(() => {
    const counts = new Map<string, number>()
    for (const model of models) {
      counts.set(model.layerId, (counts.get(model.layerId) ?? 0) + 1)
    }
    return counts
  }, [models])

  const canRemove = layers.length > 1

  return (
    <CommandDialog
      title={t('builder.layerManager.title')}
      description={t('builder.layerManager.description')}
      open={open}
      onOpenChange={onOpenChange}
      showCloseButton={false}
    >
      <CommandInput placeholder={t('builder.layerManager.search')} />
      <CommandList>
        <CommandEmpty>{t('builder.layerManager.empty')}</CommandEmpty>
        {layers.length > 0 ? (
          <CommandGroup heading={t('builder.layerManager.group')}>
            {layers.map((layer) => {
              const modelCount = modelCountByLayerId.get(layer.id) ?? 0

              return (
                <CommandItem
                  key={layer.id}
                  value={layer.label}
                  disabled={!canRemove}
                  onSelect={() => {
                    if (canRemove) onRemoveLayer(layer.id)
                  }}
                >
                  <LayersIcon className="size-4" />
                  <span className="min-w-0 flex-1 truncate font-medium">
                    {layer.label}
                  </span>
                  <span className="text-[11px] text-muted-foreground">
                    {t('builder.layerManager.modelCount', {
                      count: modelCount,
                    })}
                  </span>
                  {canRemove ? (
                    <TrashIcon className="size-3.5 text-muted-foreground" />
                  ) : (
                    <LockIcon className="size-3.5 text-muted-foreground" />
                  )}
                </CommandItem>
              )
            })}
          </CommandGroup>
        ) : null}
        <CommandSeparator />
        <CommandGroup>
          <CommandItem
            value="add-new-layer"
            onSelect={() => {
              onAddLayer({
                id: `layer-${crypto.randomUUID().slice(0, 8)}`,
                label: `L${layers.length + 1}`,
              })
            }}
          >
            <PlusIcon className="size-4" />
            <span className="flex-1">{t('builder.layerManager.add')}</span>
            <span className="text-[11px] text-muted-foreground">
              L{layers.length + 1}
            </span>
          </CommandItem>
        </CommandGroup>
      </CommandList>
    </CommandDialog>
  )
}
