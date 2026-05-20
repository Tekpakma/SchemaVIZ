import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, DownloadIcon, Loader2, Save, UploadCloud } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type BuilderHeaderProps = {
  saveError?: string | null
  saving?: boolean
  title: string
  onPublish: () => void
  onSave: () => void
  onShare: () => void
  onTitleChange: (title: string) => void
}

export function BuilderHeader({
  onPublish,
  onSave,
  onShare,
  onTitleChange,
  saveError,
  saving = false,
  title,
}: BuilderHeaderProps) {
  const navigate = useNavigate()
  const { t } = useTranslation()

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <Button
        variant="ghost"
        size="sm"
        className="gap-1.5 text-[13px] text-muted-foreground"
        onClick={() => navigate({ to: '/' })}
      >
        <ArrowLeft className="size-3.5" />
        {t('builder.header.back')}
      </Button>

      <Input
        aria-label={t('builder.header.titleLabel')}
        className="h-8 min-w-0 flex-1 border-none bg-transparent px-0 text-[14px] font-semibold shadow-none focus-visible:ring-0"
        value={title}
        onChange={(event) => onTitleChange(event.target.value)}
        placeholder={t('builder.header.titlePlaceholder')}
      />

      <div className="flex items-center gap-2">
        {saveError && (
          <span className="max-w-64 truncate text-[12px] text-destructive">
            {saveError}
          </span>
        )}
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[13px]"
          disabled={saving}
          onClick={onSave}
        >
          {saving ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <Save className="size-3.5" />
          )}
          {saving ? t('builder.header.saving') : t('builder.header.save')}
        </Button>
        <Button
          variant="ghost"
          size="sm"
          className="gap-1.5 text-[13px]"
          onClick={onShare}
        >
          <DownloadIcon className="size-3.5" />
          {t('builder.header.share')}
        </Button>
        <Button size="sm" className="gap-1.5 text-[13px]" onClick={onPublish}>
          <UploadCloud className="size-3.5" />
          {t('builder.header.publish')}
        </Button>
      </div>
    </header>
  )
}
