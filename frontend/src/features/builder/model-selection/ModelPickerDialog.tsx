import { useMemo } from 'react'
import { CheckIcon, DatabaseIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { ModelInfoShort } from '@/api/contracts'
import {
  CommandDialog,
  CommandEmpty,
  CommandGroup,
  CommandInput,
  CommandItem,
  CommandList,
} from '@/components/ui/command'

function getSchemaModelId(model: ModelInfoShort) {
  return `${model.appLabel}.${model.modelName}`
}

/**
 * Groups the flat schema model endpoint response by app for command-palette scanning.
 */
function groupModelsByApp(models: ModelInfoShort[]) {
  const groups = new Map<string, ModelInfoShort[]>()

  for (const model of models) {
    const appName = model.appVerboseName || model.appLabel
    groups.set(appName, [...(groups.get(appName) ?? []), model])
  }

  return [...groups.entries()]
}

interface ModelPickerDialogProps {
  addedModelIds: Set<string>
  models: ModelInfoShort[]
  open: boolean
  onOpenChange: (open: boolean) => void
  onPickModel: (model: ModelInfoShort) => void
}

export function ModelPickerDialog({
  addedModelIds,
  models,
  open,
  onOpenChange,
  onPickModel,
}: ModelPickerDialogProps) {
  const { t } = useTranslation()
  const groupedModels = useMemo(() => groupModelsByApp(models), [models])

  return (
    <CommandDialog
      title={t('builder.modelPicker.title')}
      description={t('builder.modelPicker.description')}
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
              const modelId = getSchemaModelId(model)
              const isAdded = addedModelIds.has(modelId)

              return (
                <CommandItem
                  key={modelId}
                  value={`${model.verboseName} ${modelId}`}
                  disabled={isAdded}
                  onSelect={() => {
                    onPickModel(model)
                    onOpenChange(false)
                  }}
                >
                  {isAdded ? (
                    <CheckIcon className="size-4 text-brand" />
                  ) : (
                    <DatabaseIcon className="size-4" />
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
