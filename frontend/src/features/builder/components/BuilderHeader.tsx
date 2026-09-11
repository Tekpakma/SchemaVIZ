import { useRef } from 'react'
import {
  ArrowLeft,
  FileDown,
  FileUp,
  Loader2,
  Save,
  UploadCloud,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { HomeLink } from '@/components/router/RouterLink'
import { Input } from '@/components/ui/input'

type BuilderHeaderProps = {
  saveError?: string | null
  exporting?: boolean
  importing?: boolean
  saving?: boolean
  title: string
  onExport: () => void
  onImport: (file: File) => void
  onPublish: () => void
  onSave: () => void
  onTitleChange: (title: string) => void
}

export function BuilderHeader({
  exporting = false,
  importing = false,
  onExport,
  onImport,
  onPublish,
  onSave,
  onTitleChange,
  saveError,
  saving = false,
  title,
}: BuilderHeaderProps) {
  const { t } = useTranslation()
  const fileInputRef = useRef<HTMLInputElement>(null)

  return (
    <header className="flex h-12 shrink-0 items-center gap-3 border-b border-border px-4">
      <HomeLink className="inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-[13px] text-muted-foreground transition-colors hover:bg-accent hover:text-foreground">
        <ArrowLeft className="size-3.5" />
        {t('builder.header.back')}
      </HomeLink>

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
        <input
          ref={fileInputRef}
          className="hidden"
          type="file"
          accept="application/json,.json"
          onChange={(event) => {
            const file = event.currentTarget.files?.[0]
            event.currentTarget.value = ''
            if (file) onImport(file)
          }}
        />
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('builder.header.importTemplate')}
          title={t('builder.header.importTemplate')}
          disabled={importing}
          onClick={() => fileInputRef.current?.click()}
        >
          {importing ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileUp className="size-3.5" />
          )}
        </Button>
        <Button
          variant="ghost"
          size="icon-sm"
          aria-label={t('builder.header.exportTemplate')}
          title={t('builder.header.exportTemplate')}
          disabled={exporting}
          onClick={onExport}
        >
          {exporting ? (
            <Loader2 className="size-3.5 animate-spin" />
          ) : (
            <FileDown className="size-3.5" />
          )}
        </Button>
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
        <Button size="sm" className="gap-1.5 text-[13px]" onClick={onPublish}>
          <UploadCloud className="size-3.5" />
          {t('builder.header.publish')}
        </Button>
      </div>
    </header>
  )
}
