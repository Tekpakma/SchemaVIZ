import { useEffect, useEffectEvent, useReducer } from 'react'
import {
  CheckIcon,
  ClipboardCopyIcon,
  DownloadIcon,
  ExternalLinkIcon,
  ImageIcon,
  InfoIcon,
  ShareIcon,
} from 'lucide-react'
import type Konva from 'konva'
import { useTranslation } from 'react-i18next'

import { Button } from '@/components/ui/button'
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog'
import { cn } from '@/lib/utils'
import { useTheme } from '@/features/theme/useTheme'
import { useCanvasSnapshotGetters } from '@/store/canvasStore'
import { createStatelessExportRequestFromCanvas } from '../export'
import { schemaVizExportCreate } from '@/api/generated/schema-viz'
import {
  CANVAS_DOWNLOAD_RASTER_LIMITS,
  CANVAS_PREVIEW_RASTER_LIMITS,
  createRasterPlan,
  getStageContentBounds,
  renderStageRasterDataUrl,
} from '../canvasRasterExport'
import type { CanvasRasterPlan } from '../canvasRasterExport'
import { resolveCanvasExportBackground } from '../themeColors'
import type { ResolvedTheme } from '@/features/theme/constants'

type ExportFormat = 'png' | 'svg' | 'drawio'
type ExportAppearance = ResolvedTheme
type ExportDoneState = ExportFormat | 'clip' | 'drawio-open' | null

type CanvasExportDialogProps = {
  filterNotice?: string
  open: boolean
  onOpenChange: (open: boolean) => void
  stageRef: React.RefObject<Konva.Stage | null>
}

function downloadBlob(blob: Blob, filename: string) {
  const url = URL.createObjectURL(blob)
  const a = document.createElement('a')
  a.href = url
  a.download = filename
  a.style.display = 'none'
  document.body.appendChild(a)
  a.click()
  setTimeout(() => {
    document.body.removeChild(a)
    URL.revokeObjectURL(url)
  }, 100)
}

const DRAWIO_URL_MAX_LENGTH = 32_000

async function deflateToBase64(input: string): Promise<string> {
  const encoder = new TextEncoder()
  const stream = new Blob([encoder.encode(input)])
    .stream()
    .pipeThrough(new CompressionStream('deflate-raw'))
  const compressed = await new Response(stream).arrayBuffer()
  const bytes = new Uint8Array(compressed)
  let binary = ''
  for (const byte of bytes) {
    binary += String.fromCharCode(byte)
  }
  return btoa(binary)
}

const FORMAT_META: Record<ExportFormat, { label: string; ext: string }> = {
  png: { label: 'PNG', ext: '.png' },
  svg: { label: 'SVG', ext: '.svg' },
  drawio: { label: 'draw.io', ext: '.drawio' },
}

const APPEARANCE_OPTIONS: Array<{ id: ExportAppearance }> = [
  { id: 'light' },
  { id: 'dark' },
]

const SCALE_OPTIONS = [
  { value: 1, label: '1x', hintKey: 'standard' },
  { value: 2, label: '2x', hintKey: 'retina' },
  { value: 3, label: '3x', hintKey: 'print' },
]

const FORMAT_HINT_KEYS: Record<ExportFormat, string> = {
  png: 'canvas.export.formats.png.hint',
  svg: 'canvas.export.formats.svg.hint',
  drawio: 'canvas.export.formats.drawio.hint',
}

const FORMAT_META_KEYS: Record<ExportFormat, string> = {
  png: 'canvas.export.formats.png.meta',
  svg: 'canvas.export.formats.svg.meta',
  drawio: 'canvas.export.formats.drawio.meta',
}

const FORMAT_TIP_KEYS: Record<ExportFormat, string> = {
  png: 'canvas.export.tips.png',
  svg: 'canvas.export.tips.svg',
  drawio: 'canvas.export.tips.drawio',
}

const SCALE_HINT_KEYS: Record<number, string> = {
  1: 'canvas.export.scale.standard',
  2: 'canvas.export.scale.retina',
  3: 'canvas.export.scale.print',
}

type ExportDialogState = {
  busy: boolean
  done: ExportDoneState
  exportAppearance: ExportAppearance
  format: ExportFormat
  previewUrl: string | null
  rasterPlan: CanvasRasterPlan | null
  scale: number
  transparentBackground: boolean
}

type ExportDialogAction =
  | { type: 'close' }
  | { type: 'done-cleared' }
  | { type: 'format-changed'; format: ExportFormat }
  | {
      type: 'preview-loaded'
      preview: { dataUrl: string; downloadPlan: CanvasRasterPlan } | null
    }
  | { type: 'scale-changed'; scale: number }
  | { type: 'started' }
  | { type: 'stopped' }
  | { type: 'succeeded'; done: Exclude<ExportDoneState, null> }
  | { type: 'appearance-changed'; appearance: ExportAppearance }
  | { type: 'transparent-background-changed'; transparent: boolean }

function createInitialExportDialogState(
  resolvedTheme: ExportAppearance,
): ExportDialogState {
  return {
    busy: false,
    done: null,
    exportAppearance: resolvedTheme,
    format: 'png',
    previewUrl: null,
    rasterPlan: null,
    scale: 2,
    transparentBackground: false,
  }
}

function exportDialogReducer(
  state: ExportDialogState,
  action: ExportDialogAction,
): ExportDialogState {
  switch (action.type) {
    case 'appearance-changed':
      return { ...state, exportAppearance: action.appearance }
    case 'close':
      return {
        ...state,
        busy: false,
        done: null,
        previewUrl: null,
        rasterPlan: null,
      }
    case 'done-cleared':
      return { ...state, done: null }
    case 'format-changed':
      return { ...state, format: action.format }
    case 'preview-loaded':
      return {
        ...state,
        previewUrl: action.preview?.dataUrl ?? null,
        rasterPlan: action.preview?.downloadPlan ?? null,
      }
    case 'scale-changed':
      return { ...state, scale: action.scale }
    case 'started':
      return { ...state, busy: true }
    case 'stopped':
      return { ...state, busy: false }
    case 'succeeded':
      return { ...state, busy: false, done: action.done }
    case 'transparent-background-changed':
      return { ...state, transparentBackground: action.transparent }
  }
}

function FormatIcon({ format }: { format: ExportFormat }) {
  if (format === 'png') {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        className="text-current"
      >
        <rect
          x="2.5"
          y="3.5"
          width="15"
          height="13"
          rx="1.5"
          stroke="currentColor"
          strokeWidth="1.4"
        />
        <path
          d="M2.5 12.5l4-3 3.5 2.5 3-2 4.5 3.5"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
          fill="none"
        />
        <circle
          cx="13"
          cy="7.5"
          r="1.3"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    )
  }
  if (format === 'svg') {
    return (
      <svg
        width="18"
        height="18"
        viewBox="0 0 20 20"
        fill="none"
        className="text-current"
      >
        <path
          d="M3 6.5L10 3l7 3.5v7L10 17l-7-3.5z"
          stroke="currentColor"
          strokeWidth="1.4"
          strokeLinejoin="round"
        />
        <path
          d="M3 6.5L10 10l7-3.5M10 10v7"
          stroke="currentColor"
          strokeWidth="1.3"
        />
      </svg>
    )
  }
  return (
    <svg
      width="18"
      height="18"
      viewBox="0 0 20 20"
      fill="none"
      className="text-current"
    >
      <rect
        x="2"
        y="3.5"
        width="6"
        height="5"
        rx="0.8"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="12"
        y="3.5"
        width="6"
        height="5"
        rx="0.8"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <rect
        x="7"
        y="12"
        width="6"
        height="5"
        rx="0.8"
        stroke="currentColor"
        strokeWidth="1.3"
      />
      <path
        d="M5 8.5v2.5h5v1M15 8.5v2.5h-5"
        stroke="currentColor"
        strokeWidth="1.2"
        fill="none"
      />
    </svg>
  )
}

function ExportPreviewPane({
  exportAppearance,
  exportBackground,
  format,
  previewUrl,
  rasterPlan,
  transparentBackground,
}: {
  exportAppearance: ExportAppearance
  exportBackground: string
  format: ExportFormat
  previewUrl: string | null
  rasterPlan: CanvasRasterPlan | null
  transparentBackground: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="flex min-h-0 flex-col border-r">
      <div className="flex items-center gap-2.5 border-b bg-muted/30 px-4 py-2.5">
        <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
          {t('canvas.export.preview')}
        </span>
        {rasterPlan && format === 'png' && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {rasterPlan.outputWidth} x {rasterPlan.outputHeight} px
            {rasterPlan.clamped ? ' max' : ''}
          </span>
        )}
        {format !== 'png' && (
          <span className="ml-auto font-mono text-[11px] text-muted-foreground">
            {t(FORMAT_META_KEYS[format])}
          </span>
        )}
      </div>
      <div
        className={cn(
          'relative flex min-h-0 flex-1 items-center justify-center overflow-hidden p-5',
          transparentBackground &&
            'bg-[length:16px_16px] bg-[position:0_0,0_8px,8px_-8px,-8px_0]',
        )}
        style={
          transparentBackground
            ? {
                backgroundImage: [
                  'linear-gradient(45deg, hsl(var(--muted)) 25%, transparent 25%)',
                  'linear-gradient(-45deg, hsl(var(--muted)) 25%, transparent 25%)',
                  'linear-gradient(45deg, transparent 75%, hsl(var(--muted)) 75%)',
                  'linear-gradient(-45deg, transparent 75%, hsl(var(--muted)) 75%)',
                ].join(','),
              }
            : { backgroundColor: exportBackground }
        }
      >
        {previewUrl ? (
          <img
            src={previewUrl}
            alt={t('canvas.export.previewAlt')}
            className={cn(
              'max-h-full max-w-full object-contain',
              exportAppearance === 'light' &&
                'rounded-md ring-1 ring-border/40',
              exportAppearance === 'dark' && 'rounded-md ring-1 ring-white/10',
            )}
          />
        ) : (
          <div className="flex flex-col items-center gap-2 text-muted-foreground">
            <ImageIcon className="size-8 opacity-40" />
            <span className="text-sm">{t('canvas.export.noPreview')}</span>
          </div>
        )}
      </div>
    </div>
  )
}

function ExportFormatSection({
  format,
  onFormatChange,
}: {
  format: ExportFormat
  onFormatChange: (format: ExportFormat) => void
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
        {t('canvas.export.format')}
      </span>
      <div className="flex flex-col gap-1.5">
        {(
          Object.entries(FORMAT_META) as Array<
            [ExportFormat, typeof FORMAT_META.png]
          >
        ).map(([key, meta]) => (
          <button
            key={key}
            type="button"
            className={cn(
              'grid grid-cols-[auto_1fr_auto] items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors',
              format === key
                ? 'border-foreground bg-muted/50 shadow-[inset_0_0_0_1px_hsl(var(--foreground))]'
                : 'border-border hover:border-muted-foreground/50',
            )}
            onClick={() => onFormatChange(key)}
          >
            <span
              className={cn(
                'flex size-8 items-center justify-center rounded-md',
                format === key
                  ? 'bg-primary/10 text-primary'
                  : 'bg-muted text-foreground',
              )}
            >
              <FormatIcon format={key} />
            </span>
            <span className="flex flex-col gap-px">
              <b className="text-[13px] font-semibold">{meta.label}</b>
              <em className="text-[11.5px] not-italic text-muted-foreground">
                {t(FORMAT_HINT_KEYS[key])}
              </em>
            </span>
            <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
              {meta.ext}
            </code>
          </button>
        ))}
      </div>
    </div>
  )
}

function ExportAppearanceSection({
  exportAppearance,
  onAppearanceChange,
  onTransparentBackgroundChange,
  transparentBackground,
}: {
  exportAppearance: ExportAppearance
  onAppearanceChange: (appearance: ExportAppearance) => void
  onTransparentBackgroundChange: (transparent: boolean) => void
  transparentBackground: boolean
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
        {t('canvas.export.appearance')}
      </span>
      <div className="grid grid-cols-2 gap-1.5">
        {APPEARANCE_OPTIONS.map((opt) => (
          <button
            key={opt.id}
            type="button"
            className={cn(
              'flex items-center justify-center gap-2 rounded-lg border px-2 py-2 text-[12px] transition-colors',
              exportAppearance === opt.id
                ? 'border-foreground bg-muted/50 shadow-[inset_0_0_0_1px_hsl(var(--foreground))]'
                : 'border-border hover:border-muted-foreground/50',
            )}
            onClick={() => onAppearanceChange(opt.id)}
          >
            <span
              className={cn(
                'size-3 rounded-full border',
                opt.id === 'light' && 'border-border bg-white',
                opt.id === 'dark' && 'border-zinc-800 bg-[#09090b]',
              )}
            />
            <span>{t(`theme.${opt.id}`)}</span>
          </button>
        ))}
      </div>
      <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[12px] text-foreground">
        <input
          aria-label={t('canvas.export.transparentBackground')}
          type="checkbox"
          className="size-3.5 accent-foreground"
          checked={transparentBackground}
          onChange={(event) =>
            onTransparentBackgroundChange(event.currentTarget.checked)
          }
        />
        <span>{t('canvas.export.transparentBackground')}</span>
      </label>
    </div>
  )
}

function ExportScaleSection({
  onScaleChange,
  scale,
}: {
  onScaleChange: (scale: number) => void
  scale: number
}) {
  const { t } = useTranslation()

  return (
    <div className="flex flex-col gap-2.5">
      <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
        {t('canvas.export.resolution')}
      </span>
      <div className="grid grid-cols-3 gap-1.5">
        {SCALE_OPTIONS.map((opt) => (
          <button
            key={opt.value}
            type="button"
            className={cn(
              'flex flex-col items-center gap-px rounded-lg border px-2 py-2 transition-colors',
              scale === opt.value
                ? 'border-foreground bg-muted/50 shadow-[inset_0_0_0_1px_hsl(var(--foreground))]'
                : 'border-border hover:border-muted-foreground/50',
            )}
            onClick={() => onScaleChange(opt.value)}
          >
            <b className="text-[14px] font-semibold">{opt.label}</b>
            <em className="text-[10.5px] not-italic text-muted-foreground">
              {t(SCALE_HINT_KEYS[opt.value])}
            </em>
          </button>
        ))}
      </div>
    </div>
  )
}

function ExportActions({
  busy,
  done,
  filterNotice,
  format,
  onCopyImage,
  onDownload,
  onOpenDrawio,
}: {
  busy: boolean
  done: ExportDoneState
  filterNotice?: string
  format: ExportFormat
  onCopyImage: () => Promise<void>
  onDownload: () => void
  onOpenDrawio: () => Promise<void>
}) {
  const { t } = useTranslation()

  return (
    <div className="mt-auto flex flex-col gap-2">
      {filterNotice ? (
        <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100">
          <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
          <span>{filterNotice}</span>
        </div>
      ) : null}

      <Button className="w-full gap-2" disabled={busy} onClick={onDownload}>
        {done === format ? (
          <>
            <CheckIcon className="size-4" />
            {t('canvas.export.saved')}
          </>
        ) : (
          <>
            <DownloadIcon className="size-4" />
            {busy
              ? t('canvas.export.rendering')
              : t('canvas.export.downloadAs', {
                  format: FORMAT_META[format].label,
                })}
          </>
        )}
      </Button>

      {format === 'png' && (
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={busy}
          onClick={() => void onCopyImage()}
        >
          {done === 'clip' ? (
            <>
              <CheckIcon className="size-4" />
              {t('canvas.export.copied')}
            </>
          ) : (
            <>
              <ClipboardCopyIcon className="size-4" />
              {t('canvas.export.copyImage')}
            </>
          )}
        </Button>
      )}
      {format === 'drawio' && (
        <Button
          variant="outline"
          className="w-full gap-2"
          disabled={busy}
          onClick={() => void onOpenDrawio()}
        >
          {done === 'drawio-open' ? (
            <>
              <CheckIcon className="size-4" />
              {t('canvas.export.opened')}
            </>
          ) : (
            <>
              <ExternalLinkIcon className="size-4" />
              {busy
                ? t('canvas.export.loading')
                : t('canvas.export.openDrawio')}
            </>
          )}
        </Button>
      )}
    </div>
  )
}

function ExportTip({ format, scale }: { format: ExportFormat; scale: number }) {
  const { t } = useTranslation()

  return (
    <div className="flex items-start gap-1.5 rounded-lg bg-muted/50 px-2.5 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
      <ShareIcon className="mt-0.5 size-3.5 shrink-0 opacity-60" />
      {t(FORMAT_TIP_KEYS[format], {
        scale,
      })}
    </div>
  )
}

function ExportDialogHeader() {
  const { t } = useTranslation()

  return (
    <DialogHeader className="border-b px-5 py-3.5">
      <div className="flex items-center gap-3">
        <div className="flex flex-col gap-0.5">
          <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
            {t('canvas.export.label')}
          </span>
          <DialogTitle className="text-[15px]">
            {t('canvas.export.title')}
          </DialogTitle>
        </div>
      </div>
    </DialogHeader>
  )
}

export function CanvasExportDialog({
  filterNotice,
  open,
  onOpenChange,
  stageRef,
}: CanvasExportDialogProps) {
  const { resolvedTheme, setExportThemeOverride } = useTheme()
  const { getCanvasExportSnapshot } = useCanvasSnapshotGetters()
  const [state, dispatch] = useReducer(
    exportDialogReducer,
    resolvedTheme,
    createInitialExportDialogState,
  )
  const {
    busy,
    done,
    exportAppearance,
    format,
    previewUrl,
    rasterPlan,
    scale,
    transparentBackground,
  } = state

  // Temporarily override the app theme so the Konva stage re-renders with
  // the chosen export appearance. Reverts on dialog close.
  useEffect(() => {
    if (!open) {
      setExportThemeOverride(null)
      return
    }
    setExportThemeOverride(exportAppearance)
    return () => setExportThemeOverride(null)
  }, [open, exportAppearance, setExportThemeOverride])

  const exportBackground = resolveCanvasExportBackground({
    appearance: exportAppearance,
    transparent: transparentBackground,
  })

  const createDownloadRasterPlan = () => {
    const stage = stageRef.current
    if (!stage) return null

    const bounds = getStageContentBounds(stage)
    if (!bounds) return null

    return createRasterPlan(bounds, scale, CANVAS_DOWNLOAD_RASTER_LIMITS)
  }

  const generatePreview = useEffectEvent(async () => {
    const stage = stageRef.current
    if (!stage || !open) {
      return null
    }

    try {
      const bounds = getStageContentBounds(stage)
      if (!bounds) {
        return null
      }

      const previewPlan = createRasterPlan(
        bounds,
        2,
        CANVAS_PREVIEW_RASTER_LIMITS,
      )
      const downloadPlan = createRasterPlan(
        bounds,
        scale,
        CANVAS_DOWNLOAD_RASTER_LIMITS,
      )
      const dataUrl = await renderStageRasterDataUrl(stage, previewPlan, {
        background: exportBackground,
      })
      return { dataUrl, downloadPlan }
    } catch {
      return null
    }
  })

  useEffect(() => {
    if (open) {
      let cancelled = false
      const timer = setTimeout(() => {
        void generatePreview().then((preview) => {
          if (cancelled) return
          dispatch({ type: 'preview-loaded', preview })
        })
      }, 50)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }
    dispatch({ type: 'close' })
  }, [exportAppearance, exportBackground, open, scale, transparentBackground])

  const handleExportPng = async () => {
    const stage = stageRef.current
    if (!stage) return

    dispatch({ type: 'started' })
    try {
      const plan = createDownloadRasterPlan()
      if (!plan) {
        dispatch({ type: 'stopped' })
        return
      }

      const dataUrl = await renderStageRasterDataUrl(stage, plan, {
        background: exportBackground,
      })

      const response = await fetch(dataUrl)
      const blob = await response.blob()
      const scaleLabel = plan.clamped ? 'bounded' : `${scale}x`
      downloadBlob(blob, `canvas-export@${scaleLabel}.png`)
      dispatch({ type: 'succeeded', done: 'png' })
      setTimeout(() => dispatch({ type: 'done-cleared' }), 1600)
    } catch (e) {
      console.error('PNG export failed:', e)
      dispatch({ type: 'stopped' })
    }
  }

  const handleExportServer = async (exportFormat: 'svg' | 'drawio') => {
    dispatch({ type: 'started' })
    try {
      const snapshot = getCanvasExportSnapshot()
      const request = createStatelessExportRequestFromCanvas(snapshot, {
        resolvedTheme: exportAppearance,
        exportFormat,
        fileName: 'canvas-export',
        background: exportBackground,
      })

      const response = await schemaVizExportCreate(request)
      if (response.status !== 200) {
        console.error(`${exportFormat} export failed: unexpected status`)
        dispatch({ type: 'stopped' })
        return
      }

      const contentType =
        exportFormat === 'svg'
          ? 'image/svg+xml;charset=utf-8'
          : 'application/xml;charset=utf-8'
      const ext = exportFormat === 'svg' ? '.svg' : '.drawio'
      const blob = new Blob([response.data], {
        type: contentType,
      })
      downloadBlob(blob, `canvas-export${ext}`)
      dispatch({ type: 'succeeded', done: exportFormat })
      setTimeout(() => dispatch({ type: 'done-cleared' }), 1600)
    } catch (e) {
      console.error(`${exportFormat} export failed:`, e)
      dispatch({ type: 'stopped' })
    }
  }

  const handleDownload = () => {
    if (format === 'png') {
      void handleExportPng()
    } else {
      void handleExportServer(format)
    }
  }

  const handleCopyImage = async () => {
    const stage = stageRef.current
    if (!stage || !('clipboard' in navigator) || !('ClipboardItem' in window)) {
      return
    }

    dispatch({ type: 'started' })
    try {
      const plan = createDownloadRasterPlan()
      if (!plan) {
        dispatch({ type: 'stopped' })
        return
      }

      const dataUrl = await renderStageRasterDataUrl(stage, plan, {
        background: exportBackground,
      })
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      dispatch({ type: 'succeeded', done: 'clip' })
      setTimeout(() => dispatch({ type: 'done-cleared' }), 1600)
    } catch (e) {
      console.error('Copy to clipboard failed:', e)
      dispatch({ type: 'stopped' })
    }
  }

  const handleOpenInDrawio = async () => {
    dispatch({ type: 'started' })
    try {
      const snapshot = getCanvasExportSnapshot()
      const request = createStatelessExportRequestFromCanvas(snapshot, {
        resolvedTheme: exportAppearance,
        exportFormat: 'drawio',
        fileName: 'canvas-export',
        background: exportBackground,
      })
      const response = await schemaVizExportCreate(request)
      if (response.status !== 200) {
        console.error('Open in diagrams.net failed: unexpected status')
        dispatch({ type: 'stopped' })
        return
      }
      const xml = response.data as unknown as string
      const encoded = await deflateToBase64(xml)
      const url = `https://app.diagrams.net/#R${encodeURIComponent(encoded)}`
      if (url.length > DRAWIO_URL_MAX_LENGTH) {
        console.warn('draw.io URL too long, falling back to download')
        const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
        downloadBlob(blob, 'canvas-export.drawio')
        dispatch({ type: 'succeeded', done: 'drawio' })
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
        dispatch({ type: 'succeeded', done: 'drawio-open' })
      }
      setTimeout(() => dispatch({ type: 'done-cleared' }), 1600)
    } catch (e) {
      console.error('Open in diagrams.net failed:', e)
      dispatch({ type: 'stopped' })
    }
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[min(680px,calc(100dvh-2rem))] max-w-[min(1080px,92vw)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[min(1080px,92vw)]"
        showCloseButton
      >
        <ExportDialogHeader />
        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px] overflow-hidden">
          <ExportPreviewPane
            exportAppearance={exportAppearance}
            exportBackground={exportBackground}
            format={format}
            previewUrl={previewUrl}
            rasterPlan={rasterPlan}
            transparentBackground={transparentBackground}
          />
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto bg-background p-5">
            <ExportFormatSection
              format={format}
              onFormatChange={(nextFormat) =>
                dispatch({ type: 'format-changed', format: nextFormat })
              }
            />
            <ExportAppearanceSection
              exportAppearance={exportAppearance}
              onAppearanceChange={(appearance) =>
                dispatch({ type: 'appearance-changed', appearance })
              }
              onTransparentBackgroundChange={(transparent) =>
                dispatch({
                  type: 'transparent-background-changed',
                  transparent,
                })
              }
              transparentBackground={transparentBackground}
            />
            {format === 'png' && (
              <ExportScaleSection
                onScaleChange={(nextScale) =>
                  dispatch({ type: 'scale-changed', scale: nextScale })
                }
                scale={scale}
              />
            )}
            <ExportActions
              busy={busy}
              done={done}
              filterNotice={filterNotice}
              format={format}
              onCopyImage={handleCopyImage}
              onDownload={handleDownload}
              onOpenDrawio={handleOpenInDrawio}
            />
            <ExportTip format={format} scale={scale} />
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
