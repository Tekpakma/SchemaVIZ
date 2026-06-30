import { useState, type Dispatch, type SetStateAction } from 'react'
import {
  AlertCircle,
  CheckCircle2,
  Copy,
  ExternalLink,
  Globe2,
  Loader2,
  Lock,
  Star,
  Users,
} from 'lucide-react'
import { useTranslation } from 'react-i18next'

import type { GenerationTemplateRead } from '@/api/contracts'
import { schemaVizTemplateUniquenessCreate } from '@/api/generated/schema-viz'
import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogClose,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { Input } from '@/components/ui/input'
import { Switch } from '@/components/ui/switch'
import type { RecipeData } from '../types'

export type PublishPayload = {
  featured?: GenerationTemplateRead['featured']
  shareSlug: string
  scope: 'owner' | 'global'
}

type PublishRecipeDialogProps = {
  canManageFeaturedTemplates?: boolean
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
  featureRank: string
  isFeatured: boolean
  isGlobal: boolean
  nameTaken: boolean
  shareSlug: string
  slugStatus: SlugStatus
}

type PublishDialogStateSetter = Dispatch<SetStateAction<PublishDialogState>>

function isSharedTemplate(
  templateScope: GenerationTemplateRead['scope'] | undefined,
  promoteVisibility: RecipeData['promoteVisibility'],
) {
  return templateScope === 'global' || promoteVisibility === 'shared'
}

function getInitialFeatureRank(template: GenerationTemplateRead | null) {
  return template?.featured.rank == null ? '' : String(template.featured.rank)
}

function parseFeatureRank(value: string) {
  const trimmed = value.trim()
  if (!trimmed) return null

  const parsed = Number(trimmed)
  return Number.isFinite(parsed) && parsed >= 0 ? Math.trunc(parsed) : null
}

function ShareSlugField({
  setDialogState,
  shareSlug,
  slugStatus,
  onSlugBlur,
}: {
  setDialogState: PublishDialogStateSetter
  shareSlug: string
  slugStatus: SlugStatus
  onSlugBlur: () => void
}) {
  const { t } = useTranslation()

  return (
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
          onBlur={onSlugBlur}
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
  )
}

function VisibilityControl({
  isGlobal,
  onVisibilityChange,
}: {
  isGlobal: boolean
  onVisibilityChange: (isGlobal: boolean) => void
}) {
  const { t } = useTranslation()
  const VisibilityIcon = isGlobal ? Globe2 : Lock

  return (
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
      <Switch checked={isGlobal} onCheckedChange={onVisibilityChange} />
    </div>
  )
}

function FeaturedTemplateControls({
  featureRank,
  isFeatured,
  setDialogState,
  onFeaturedChange,
}: {
  featureRank: string
  isFeatured: boolean
  setDialogState: PublishDialogStateSetter
  onFeaturedChange: (isFeatured: boolean) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="grid gap-2 rounded-md border border-border bg-muted/35 px-3 py-2.5">
      <div className="flex items-center justify-between gap-3">
        <div className="flex items-start gap-3">
          <Star className="mt-0.5 size-4 text-muted-foreground" />
          <div className="min-w-0">
            <div className="text-[13px] text-foreground">
              {t('builder.publish.featuredLabel')}
            </div>
            <div className="text-[12px] text-muted-foreground">
              {t('builder.publish.featuredHint')}
            </div>
          </div>
        </div>
        <Switch checked={isFeatured} onCheckedChange={onFeaturedChange} />
      </div>

      {isFeatured && (
        <label className="grid gap-1.5 pl-7">
          <span className="text-[12px] text-muted-foreground">
            {t('builder.publish.featureRank')}
          </span>
          <Input
            type="number"
            min={0}
            step={1}
            value={featureRank}
            onChange={(event) =>
              setDialogState((current) => ({
                ...current,
                featureRank: event.target.value,
              }))
            }
            placeholder={t('builder.publish.featureRankPlaceholder')}
            className="h-8"
          />
        </label>
      )}
    </div>
  )
}

function PromoteTargetSummary({ recipe }: { recipe: RecipeData }) {
  const { t } = useTranslation()

  if (!recipe.promoteTarget) return null

  return (
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
  )
}

function ShareLinkPanel({
  copied,
  shareUrl,
  onCopy,
}: {
  copied: boolean
  shareUrl: string | null
  onCopy: () => void
}) {
  const { t } = useTranslation()

  if (!shareUrl) return null

  return (
    <div className="grid gap-2 rounded-md border border-border px-4 py-3">
      <div className="text-[13px] font-medium text-foreground">
        {t('builder.publish.shareLink')}
      </div>
      <div className="flex min-w-0 items-center gap-2">
        <Input readOnly value={shareUrl} className="h-8 text-[12px]" />
        <Button type="button" variant="outline" size="sm" onClick={onCopy}>
          <Copy className="size-3.5" />
          {copied ? t('builder.publish.copied') : t('builder.publish.copy')}
        </Button>
        <Button type="button" variant="outline" size="sm" asChild>
          <a href={shareUrl} target="_blank" rel="noreferrer">
            <ExternalLink className="size-3.5" />
            {t('builder.publish.open')}
          </a>
        </Button>
      </div>
    </div>
  )
}

export function PublishRecipeDialog({
  canManageFeaturedTemplates = false,
  onOpenChange,
  onPublish,
  open,
  publishError,
  publishing = false,
  recipe,
  template,
}: PublishRecipeDialogProps) {
  const { t } = useTranslation()
  const templateTitle =
    recipe.title.trim() || t('builder.header.titlePlaceholder')
  const suggestedShareSlug =
    recipe.shareSlug ||
    template?.shareSlug ||
    slugifyTemplateTitle(templateTitle) ||
    'template'
  const [dialogState, setDialogState] = useState<PublishDialogState>(() => ({
    copied: false,
    featureRank: getInitialFeatureRank(template),
    isFeatured: template?.featured.enabled ?? false,
    isGlobal: isSharedTemplate(template?.scope, recipe.promoteVisibility),
    nameTaken: false,
    shareSlug: suggestedShareSlug,
    slugStatus: 'idle',
  }))
  const {
    copied,
    featureRank,
    isFeatured,
    isGlobal,
    nameTaken,
    shareSlug,
    slugStatus,
  } = dialogState
  const shareUrl = getShareUrl(template?.shareSlug)

  async function checkSlugUniqueness(slug: string, nextIsGlobal = isGlobal) {
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
        isGlobal: nextIsGlobal,
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
  }

  function handleVisibilityChange(nextIsGlobal: boolean) {
    setDialogState((current) => ({
      ...current,
      isFeatured: nextIsGlobal ? current.isFeatured : false,
      isGlobal: nextIsGlobal,
    }))
    void checkSlugUniqueness(shareSlug, nextIsGlobal)
  }

  function handleFeaturedChange(nextIsFeatured: boolean) {
    setDialogState((current) => ({
      ...current,
      isFeatured: nextIsFeatured,
      isGlobal: nextIsFeatured ? true : current.isGlobal,
    }))
    if (nextIsFeatured) {
      void checkSlugUniqueness(shareSlug, true)
    }
  }

  async function handleCopy() {
    if (!shareUrl) return
    await navigator.clipboard.writeText(shareUrl)
    setDialogState((current) => ({ ...current, copied: true }))
  }

  function handlePublish() {
    onPublish({
      ...(canManageFeaturedTemplates
        ? {
            featured: {
              enabled: isFeatured,
              rank: isFeatured ? parseFeatureRank(featureRank) : null,
            },
          }
        : {}),
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
            <ShareSlugField
              setDialogState={setDialogState}
              shareSlug={shareSlug}
              slugStatus={slugStatus}
              onSlugBlur={() => void checkSlugUniqueness(shareSlug)}
            />
            <VisibilityControl
              isGlobal={isGlobal}
              onVisibilityChange={handleVisibilityChange}
            />
            {canManageFeaturedTemplates && (
              <FeaturedTemplateControls
                featureRank={featureRank}
                isFeatured={isFeatured}
                setDialogState={setDialogState}
                onFeaturedChange={handleFeaturedChange}
              />
            )}
            <PromoteTargetSummary recipe={recipe} />
          </div>
        </div>

        <ShareLinkPanel
          copied={copied}
          shareUrl={shareUrl}
          onCopy={handleCopy}
        />

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
