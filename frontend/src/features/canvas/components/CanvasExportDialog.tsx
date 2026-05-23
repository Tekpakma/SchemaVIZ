import { useCallback, useEffect, useEffectEvent, useState } from 'react'
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
import { CANVAS_BACKGROUND_FALLBACKS } from '../themeColors'
import type { ResolvedTheme } from '@/features/theme/constants'

type ExportFormat = 'png' | 'svg' | 'drawio'
type ExportAppearance = ResolvedTheme

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

const FORMAT_META: Record<
  ExportFormat,
  { label: string; hint: string; ext: string }
> = {
  png: { label: 'PNG', hint: 'Bild fuer Slides, E-Mail, Slack.', ext: '.png' },
  svg: {
    label: 'SVG',
    hint: 'Vektor — verlustfrei skalierbar.',
    ext: '.svg',
  },
  drawio: {
    label: 'draw.io',
    hint: 'Editierbares Diagramm (mxfile).',
    ext: '.drawio',
  },
}

const APPEARANCE_OPTIONS: Array<{ id: ExportAppearance; label: string }> = [
  { id: 'light', label: 'Light' },
  { id: 'dark', label: 'Dark' },
]

const SCALE_OPTIONS = [
  { value: 1, label: '1x', hint: 'Standard' },
  { value: 2, label: '2x', hint: 'Retina' },
  { value: 3, label: '3x', hint: 'Print' },
]

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

export function CanvasExportDialog({
  filterNotice,
  open,
  onOpenChange,
  stageRef,
}: CanvasExportDialogProps) {
  const { resolvedTheme, setExportThemeOverride } = useTheme()
  const { getCanvasExportSnapshot } = useCanvasSnapshotGetters()
  const [format, setFormat] = useState<ExportFormat>('png')
  const [exportAppearance, setExportAppearance] =
    useState<ExportAppearance>(() => resolvedTheme)
  const [transparentBackground, setTransparentBackground] = useState(false)

  // Temporarily override the app theme so the Konva stage re-renders with
  // the chosen export appearance. Reverts on dialog close.
  useEffect(() => {
    if (open) {
      setExportThemeOverride(exportAppearance)
    }
    return () => setExportThemeOverride(null)
  }, [open, exportAppearance, setExportThemeOverride])
  const [scale, setScale] = useState(2)
  const [busy, setBusy] = useState(false)
  const [done, setDone] = useState<string | null>(null)
  const [previewUrl, setPreviewUrl] = useState<string | null>(null)
  const [rasterPlan, setRasterPlan] = useState<CanvasRasterPlan | null>(null)

  const exportBackground = transparentBackground
    ? 'transparent'
    : CANVAS_BACKGROUND_FALLBACKS[exportAppearance]

  const createDownloadRasterPlan = useCallback(() => {
    const stage = stageRef.current
    if (!stage) return null

    const bounds = getStageContentBounds(stage)
    if (!bounds) return null

    return createRasterPlan(bounds, scale, CANVAS_DOWNLOAD_RASTER_LIMITS)
  }, [scale, stageRef])

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
          setPreviewUrl(preview?.dataUrl ?? null)
          setRasterPlan(preview?.downloadPlan ?? null)
        })
      }, 50)
      return () => {
        cancelled = true
        clearTimeout(timer)
      }
    }
    setPreviewUrl(null)
    setRasterPlan(null)
    setDone(null)
    setBusy(false)
  }, [exportAppearance, exportBackground, open, scale, transparentBackground])

  const handleExportPng = useCallback(async () => {
    const stage = stageRef.current
    if (!stage) return

    setBusy(true)
    try {
      const plan = createDownloadRasterPlan()
      if (!plan) return

      const dataUrl = await renderStageRasterDataUrl(stage, plan, {
        background: exportBackground,
      })

      const response = await fetch(dataUrl)
      const blob = await response.blob()
      const scaleLabel = plan.clamped ? 'bounded' : `${scale}x`
      downloadBlob(blob, `canvas-export@${scaleLabel}.png`)
      setDone('png')
      setTimeout(() => setDone(null), 1600)
    } catch (e) {
      console.error('PNG export failed:', e)
    } finally {
      setBusy(false)
    }
  }, [createDownloadRasterPlan, exportBackground, scale, stageRef])

  const handleExportServer = useCallback(
    async (exportFormat: 'svg' | 'drawio') => {
      setBusy(true)
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
          throw new Error('Export failed')
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
        setDone(exportFormat)
        setTimeout(() => setDone(null), 1600)
      } catch (e) {
        console.error(`${exportFormat} export failed:`, e)
      } finally {
        setBusy(false)
      }
    },
    [exportAppearance, exportBackground, getCanvasExportSnapshot],
  )

  const handleDownload = useCallback(() => {
    if (format === 'png') {
      handleExportPng()
    } else {
      handleExportServer(format)
    }
  }, [format, handleExportPng, handleExportServer])

  const handleCopyImage = useCallback(async () => {
    const stage = stageRef.current
    if (!stage || !('clipboard' in navigator) || !('ClipboardItem' in window)) {
      return
    }

    setBusy(true)
    try {
      const plan = createDownloadRasterPlan()
      if (!plan) return

      const dataUrl = await renderStageRasterDataUrl(stage, plan, {
        background: exportBackground,
      })
      const response = await fetch(dataUrl)
      const blob = await response.blob()
      await navigator.clipboard.write([
        new ClipboardItem({ 'image/png': blob }),
      ])
      setDone('clip')
      setTimeout(() => setDone(null), 1600)
    } catch (e) {
      console.error('Copy to clipboard failed:', e)
    } finally {
      setBusy(false)
    }
  }, [createDownloadRasterPlan, exportBackground, stageRef])

  const handleOpenInDrawio = useCallback(async () => {
    setBusy(true)
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
        throw new Error('Export failed')
      }
      const xml = response.data as unknown as string
      const encoded = await deflateToBase64(xml)
      const url = `https://app.diagrams.net/#R${encodeURIComponent(encoded)}`
      if (url.length > DRAWIO_URL_MAX_LENGTH) {
        console.warn('draw.io URL too long, falling back to download')
        const blob = new Blob([xml], { type: 'application/xml;charset=utf-8' })
        downloadBlob(blob, 'canvas-export.drawio')
        setDone('drawio')
      } else {
        window.open(url, '_blank', 'noopener,noreferrer')
        setDone('drawio-open')
      }
      setTimeout(() => setDone(null), 1600)
    } catch (e) {
      console.error('Open in diagrams.net failed:', e)
    } finally {
      setBusy(false)
    }
  }, [exportAppearance, exportBackground, getCanvasExportSnapshot])

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent
        className="grid h-[min(680px,calc(100dvh-2rem))] max-w-[min(1080px,92vw)] grid-rows-[auto_minmax(0,1fr)] gap-0 overflow-hidden p-0 sm:max-w-[min(1080px,92vw)]"
        showCloseButton
      >
        <DialogHeader className="border-b px-5 py-3.5">
          <div className="flex items-center gap-3">
            <div className="flex flex-col gap-0.5">
              <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                EXPORT
              </span>
              <DialogTitle className="text-[15px]">
                Diagramm exportieren
              </DialogTitle>
            </div>
          </div>
        </DialogHeader>

        <div className="grid min-h-0 grid-cols-[minmax(0,1fr)_340px] overflow-hidden">
          {/* Preview pane */}
          <div className="flex min-h-0 flex-col border-r">
            <div className="flex items-center gap-2.5 border-b bg-muted/30 px-4 py-2.5">
              <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                VORSCHAU
              </span>
              {rasterPlan && format === 'png' && (
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  {rasterPlan.outputWidth} x {rasterPlan.outputHeight} px
                  {rasterPlan.clamped ? ' max' : ''}
                </span>
              )}
              {format === 'svg' && (
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  Vektor
                </span>
              )}
              {format === 'drawio' && (
                <span className="ml-auto font-mono text-[11px] text-muted-foreground">
                  mxfile
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
                  alt="Diagramm-Vorschau"
                  className={cn(
                    'max-h-full max-w-full object-contain',
                    exportAppearance === 'light' &&
                      'rounded-md ring-1 ring-border/40',
                    exportAppearance === 'dark' &&
                      'rounded-md ring-1 ring-white/10',
                  )}
                />
              ) : (
                <div className="flex flex-col items-center gap-2 text-muted-foreground">
                  <ImageIcon className="size-8 opacity-40" />
                  <span className="text-sm">Keine Vorschau</span>
                </div>
              )}
            </div>
          </div>

          {/* Sidebar */}
          <div className="flex min-h-0 flex-col gap-5 overflow-y-auto bg-background p-5">
            {/* Format */}
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                FORMAT
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
                    onClick={() => setFormat(key)}
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
                        {meta.hint}
                      </em>
                    </span>
                    <code className="rounded bg-muted px-1.5 py-0.5 font-mono text-[10.5px] text-muted-foreground">
                      {meta.ext}
                    </code>
                  </button>
                ))}
              </div>
            </div>

            {/* Appearance */}
            <div className="flex flex-col gap-2.5">
              <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                APPEARANCE
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
                    onClick={() => setExportAppearance(opt.id)}
                  >
                    <span
                      className={cn(
                        'size-3 rounded-full border',
                        opt.id === 'light' && 'border-border bg-white',
                        opt.id === 'dark' && 'border-zinc-800 bg-[#09090b]',
                      )}
                    />
                    <span>{opt.label}</span>
                  </button>
                ))}
              </div>
              <label className="flex items-center gap-2 rounded-lg border border-border px-2.5 py-2 text-[12px] text-foreground">
                <input
                  aria-label="Transparent background"
                  type="checkbox"
                  className="size-3.5 accent-foreground"
                  checked={transparentBackground}
                  onChange={(event) =>
                    setTransparentBackground(event.currentTarget.checked)
                  }
                />
                <span>Transparent background</span>
              </label>
            </div>

            {/* Scale (PNG only) */}
            {format === 'png' && (
              <div className="flex flex-col gap-2.5">
                <span className="font-mono text-[10px] tracking-[0.16em] text-muted-foreground">
                  AUFLOESUNG
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
                      onClick={() => setScale(opt.value)}
                    >
                      <b className="text-[14px] font-semibold">{opt.label}</b>
                      <em className="text-[10.5px] not-italic text-muted-foreground">
                        {opt.hint}
                      </em>
                    </button>
                  ))}
                </div>
              </div>
            )}

            {/* Actions */}
            <div className="mt-auto flex flex-col gap-2">
              {filterNotice ? (
                <div className="flex items-start gap-2 rounded-lg border border-amber-200 bg-amber-50 px-2.5 py-2 text-[11.5px] leading-relaxed text-amber-950 dark:border-amber-900/60 dark:bg-amber-950/35 dark:text-amber-100">
                  <InfoIcon className="mt-0.5 size-3.5 shrink-0" />
                  <span>{filterNotice}</span>
                </div>
              ) : null}

              <Button
                className="w-full gap-2"
                disabled={busy}
                onClick={handleDownload}
              >
                {done === format ? (
                  <>
                    <CheckIcon className="size-4" />
                    Gespeichert
                  </>
                ) : (
                  <>
                    <DownloadIcon className="size-4" />
                    {busy
                      ? 'Wird gerendert…'
                      : `Herunterladen als ${FORMAT_META[format].label}`}
                  </>
                )}
              </Button>

              {format === 'png' && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={handleCopyImage}
                >
                  {done === 'clip' ? (
                    <>
                      <CheckIcon className="size-4" />
                      In Zwischenablage
                    </>
                  ) : (
                    <>
                      <ClipboardCopyIcon className="size-4" />
                      Als Bild kopieren
                    </>
                  )}
                </Button>
              )}
              {format === 'drawio' && (
                <Button
                  variant="outline"
                  className="w-full gap-2"
                  disabled={busy}
                  onClick={handleOpenInDrawio}
                >
                  {done === 'drawio-open' ? (
                    <>
                      <CheckIcon className="size-4" />
                      Geoeffnet
                    </>
                  ) : (
                    <>
                      <ExternalLinkIcon className="size-4" />
                      {busy ? 'Wird geladen…' : 'In diagrams.net oeffnen'}
                    </>
                  )}
                </Button>
              )}
            </div>

            {/* Tip */}
            <div className="flex items-start gap-1.5 rounded-lg bg-muted/50 px-2.5 py-2 text-[11.5px] leading-relaxed text-muted-foreground">
              <ShareIcon className="mt-0.5 size-3.5 shrink-0 opacity-60" />
              {format === 'svg' &&
                'SVG behaelt Schrift und Vektor. Ideal fuer Print-PDFs.'}
              {format === 'png' &&
                `${scale}x Aufloesung — Retina ist fuer die meisten Slides ausreichend.`}
              {format === 'drawio' &&
                'Oeffne die .drawio-Datei direkt in diagrams.net oder VS Code.'}
            </div>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  )
}
