import { useQuery } from '@tanstack/react-query'
import { InfoIcon } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { SYSTEM_VERSION_QUERIES } from '@/api/systemVersionQueries'
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'

interface AboutDialogProps {
  open: boolean
  onOpenChange: (open: boolean) => void
}

export function AboutDialog({ open, onOpenChange }: AboutDialogProps) {
  const { t } = useTranslation()
  const backendVersionQuery = useQuery({
    ...SYSTEM_VERSION_QUERIES.backend(),
    enabled: open,
  })
  const backendVersion = backendVersionQuery.data
    ? `v${backendVersionQuery.data}`
    : backendVersionQuery.isError
      ? t('about.unavailable')
      : t('about.loading')

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="gap-5 sm:max-w-md">
        <DialogHeader className="gap-2">
          <div className="flex items-center gap-2">
            <InfoIcon className="size-4 text-muted-foreground" />
            <DialogTitle>{t('about.title')}</DialogTitle>
          </div>
          <DialogDescription>{t('about.description')}</DialogDescription>
        </DialogHeader>

        <div className="grid gap-2">
          <VersionRow label={t('about.app')} value="SchemaVIZ" />
          <VersionRow
            label={t('about.frontend')}
            value={`v${__APP_VERSION__}`}
          />
          <VersionRow label={t('about.backend')} value={backendVersion} />
        </div>
      </DialogContent>
    </Dialog>
  )
}

function VersionRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex items-center justify-between gap-4 border-b border-border py-2 text-sm last:border-b-0">
      <span className="text-muted-foreground">{label}</span>
      <span className="font-medium text-foreground">{value}</span>
    </div>
  )
}
