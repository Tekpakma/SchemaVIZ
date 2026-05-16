import { useNavigate } from '@tanstack/react-router'
import { ArrowLeft, Eye, Save, Star } from 'lucide-react'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'

type BuilderHeaderProps = {
  title: string
  onTitleChange: (title: string) => void
}

export function BuilderHeader({ onTitleChange, title }: BuilderHeaderProps) {
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
        <Button variant="ghost" size="sm" className="gap-1.5 text-[13px]">
          <Eye className="size-3.5" />
          {t('builder.header.preview')}
        </Button>
        <Button variant="ghost" size="sm" className="gap-1.5 text-[13px]">
          <Save className="size-3.5" />
          {t('builder.header.save')}
        </Button>
        <Button size="sm" className="gap-1.5 text-[13px]">
          <Star className="size-3.5" />
          {t('builder.header.promote')}
        </Button>
      </div>
    </header>
  )
}
