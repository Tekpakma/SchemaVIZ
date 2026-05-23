import { useCallback, useEffect, useMemo, useState } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Lock,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { GenerationTemplateRead } from '@/api/contracts'
import { schemaVizTemplateUniquenessCreate } from '@/api/generated/schema-viz'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import type { RecipeData } from '../types'

export type PublishPayload = {
  shareSlug: string
  scope: 'owner' | 'global'
}

type PublishRecipeDialogProps = {
  open: boolean
  publishError?: string | null
  publishing?: boolean
  recipe: RecipeData
  template: GenerationTemplateRead | null
  onOpenChange: (open: boolean) => void
  onPublish: (payload: PublishPayload) => void
}

function slugifyTemplateTitle(title: string) {
  return title
    .trim()
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
}

function getShareUrl(shareSlug: string | null | undefined) {
  if (!shareSlug || typeof window === 'undefined') return null
  return new URL(`/generate/${shareSlug}/`, window.location.origin).href
}

type SlugStatus = 'idle' | 'checking' | 'available' | 'taken'

type PublishDialogState = {
  copied: boolean
  isGlobal: boolean
  nameTaken: boolean
  shareSlug: string
  slugStatus: SlugStatus
}

function isSharedTemplate(
  templateScope: GenerationTemplateRead['scope'] | undefined,
  promoteVisibility: RecipeData['promoteVisibility'],
) {
  return templateScope === 'global' || promoteVisibility === 'shared'
}

export function PublishRecipeDialog({
  onOpenChange,
  onPublish,
  open,
  publishError,
  publishing = false,
  recipe,
  template,
}: PublishRecipeDialogProps) {
  const { t } = useTranslation()
  const [dialogState, setDialogState] = useState<PublishDialogState>(() => ({
    copied: false,
    isGlobal: isSharedTemplate(template?.scope, recipe.promoteVisibility),
    nameTaken: false,
    shareSlug: '',
    slugStatus: 'idle',
  }))
  const { copied, isGlobal, nameTaken, shareSlug, slugStatus } = dialogState
  const VisibilityIcon = isGlobal ? Globe2 : Lock
  const templateTitle =
    recipe.title.trim() || t('builder.header.titlePlaceholder')
  const suggestedShareSlug = useMemo(
    () =>
      recipe.shareSlug ||
      template?.shareSlug ||
      slugifyTemplateTitle(templateTitle) ||
      'template',
    [recipe.shareSlug, template?.shareSlug, templateTitle],
  )
  const shareUrl = getShareUrl(template?.shareSlug)

  useEffect(() => {
    if (open) {
      setDialogState({
        copied: false,
        isGlobal: isSharedTemplate(template?.scope, recipe.promoteVisibility),
        nameTaken: false,
        shareSlug: suggestedShareSlug,
        slugStatus: 'idle',
      })
    }
  }, [open, recipe.promoteVisibility, suggestedShareSlug, template?.scope])

  // Run an initial uniqueness check when the dialog opens with a pre-filled slug
  useEffect(() => {
    if (open && suggestedShareSlug.trim()) {
      void checkSlugUniqueness(suggestedShareSlug)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [open])

  const checkSlugUniqueness = useCallback(
    async (slug: string) => {
      const trimmed = slug.trim()
      if (!trimmed) {
        setDialogState((current) => ({
          ...current,
          slugStatus: 'idle',
          nameTaken: false,
        }))
        return
      }
      setDialogState((current) => ({ ...current, slugStatus: 'checking' }))
      try {
        const result = await schemaVizTemplateUniquenessCreate({
          templateKind: 'generation',
          name: template?.name ?? (recipe.title || 'Untitled'),
          exportName: trimmed,
          isGlobal,
          ...(template?.id ? { templateId: template.id } : {}),
        })
        if (result.status === 200) {
          const nextStatus =
            result.data.exportNameUnique === false ? 'taken' : 'available'
          setDialogState((current) => ({
            ...current,
            slugStatus: nextStatus,
            nameTaken: result.data.nameUnique === false,
          }))
        } else {
          setDialogState((current) => ({
            ...current,
            slugStatus: 'idle',
            nameTaken: false,
          }))
        }
      } catch {
        setDialogState((current) => ({
          ...current,
          slugStatus: 'idle',
          nameTaken: false,
        }))
      }
    },
    [isGlobal, recipe.title, template?.id, template?.name],
  )

  // Re-check uniqueness when the visibility scope changes
  useEffect(() => {
    if (open && shareSlug.trim()) {
      void checkSlugUniqueness(shareSlug)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [isGlobal])

  const handleSlugBlur = useCallback(() => {
    void checkSlugUniqueness(shareSlug)
  }, [checkSlugUniqueness, shareSlug])

  const handleCopy = async () => {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setDialogState((current) => ({ ...current, copied: true }))
  }

  const handlePublish = () => {
    onPublish({
      shareSlug,
      scope: isGlobal ? 'global' : 'owner',
    })
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[460px]">
        <DialogHeader>
          <DialogTitle>{t('builder.publish.title')}</DialogTitle>
          <DialogDescription>
            {t('builder.publish.description')}
          </DialogDescription>
        </DialogHeader>

        <div className="rounded-md border border-border">
          <div className="border-b border-border px-4 py-3">
            <div className="text-[13px] font-semibold text-foreground">
              {templateTitle}
            </div>
            <div className="mt-1 text-[12px] text-muted-foreground">
              {t('builder.publish.templateLabel')}
            </div>
          </div>

          <div className="grid gap-3 px-4 py-3">
            <label className="grid gap-1.5">
              <span className="text-[12px] text-muted-foreground">
                {t('builder.publish.shareSlug')}
              </span>
              <div className="relative">
                <Input
                  value={shareSlug}
                  onChange={(event) => {
                    setDialogState((current) => ({
                      ...current,
                      shareSlug: event.target.value,
                      slugStatus: 'idle',
                    }))
                  }}
                  onBlur={handleSlugBlur}
                  placeholder={t('builder.publish.shareSlugPlaceholder')}
                  className={
                    slugStatus === 'taken'
                      ? 'border-destructive pr-8'
                      : slugStatus === 'available'
                        ? 'border-green-600 pr-8'
                        : ''
                  }
                />
                {slugStatus === 'checking' && (
                  <Loader2 className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 animate-spin text-muted-foreground" />
                )}
                {slugStatus === 'available' && (
                  <CheckCircle2 className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-green-600" />
                )}
                {slugStatus === 'taken' && (
                  <AlertCircle className="absolute top-1/2 right-2.5 size-3.5 -translate-y-1/2 text-destructive" />
                )}
              </div>
              {slugStatus === 'taken' && (
                <span className="text-[11px] text-destructive">
                  {t('builder.publish.slugTaken')}
                </span>
              )}
            </label>

            <div className="flex items-center justify-between gap-3">
              <div className="flex items-start gap-3">
                <VisibilityIcon className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-[13px] text-foreground">
                    {isGlobal
                      ? t('builder.publish.visibilityGlobal')
                      : t('builder.publish.visibilityPrivate')}
                  </div>
                  <div className="text-[12px] text-muted-foreground">
                    {t('builder.publish.visibilityHint')}
                  </div>
                </div>
              </div>
              <Switch
                checked={isGlobal}
                onCheckedChange={(nextIsGlobal) =>
                  setDialogState((current) => ({
                    ...current,
                    isGlobal: nextIsGlobal,
                  }))
                }
              />
            </div>

            {recipe.promoteTarget && (
              <div className="flex items-start gap-3">
                <Users className="mt-0.5 size-4 text-muted-foreground" />
                <div className="min-w-0">
                  <div className="text-[13px] text-foreground">
                    {t('builder.publish.targetLabel', {
                      target: recipe.promoteTarget,
                    })}
                  </div>
                  {recipe.promoteAudience && (
                    <div className="text-[12px] text-muted-foreground">
                      {recipe.promoteAudience}
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        </div>

        {shareUrl && (
          <div className="grid gap-2 rounded-md border border-border px-4 py-3">
            <div className="text-[13px] font-medium text-foreground">
              {t('builder.publish.shareLink')}
            </div>
            <div className="flex min-w-0 items-center gap-2">
              <Input readOnly value={shareUrl} className="h-8 text-[12px]" />
              <Button
                type="button"
                variant="outline"
                size="sm"
                onClick={handleCopy}
              >
                <Copy className="size-3.5" />
                {copied
                  ? t('builder.publish.copied')
                  : t('builder.publish.copy')}
              </Button>
              <Button type="button" variant="outline" size="sm" asChild>
                <a href={shareUrl} target="_blank" rel="noreferrer">
                  <ExternalLink className="size-3.5" />
                  {t('builder.publish.open')}
                </a>
              </Button>
            </div>
          </div>
        )}

        {nameTaken && (
          <p className="text-[12.5px] text-destructive">
            {t('builder.publish.nameTaken', {
              name: recipe.title.trim() || t('builder.header.titlePlaceholder'),
            })}
          </p>
        )}

        {publishError && (
          <p className="text-[12.5px] text-destructive">{publishError}</p>
        )}

        <DialogFooter>
          <DialogClose asChild>
            <Button variant="outline">{t('builder.publish.cancel')}</Button>
          </DialogClose>
          <Button
            disabled={
              publishing ||
              shareSlug.trim().length === 0 ||
              slugStatus === 'taken' ||
              nameTaken
            }
            onClick={handlePublish}
          >
            {publishing ? (
              <Loader2 className="size-4 animate-spin" />
            ) : (
              <CheckCircle2 className="size-4" />
            )}
            {publishing
              ? t('builder.publish.publishing')
              : template
                ? t('builder.publish.confirm')
                : t('builder.publish.saveAndPublish')}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  )
}
