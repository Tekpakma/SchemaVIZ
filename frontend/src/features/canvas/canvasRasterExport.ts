import type Konva from 'konva'

export type CanvasRasterBounds = {
  x: number
  y: number
  width: number
  height: number
}

export type CanvasRasterLimits = {
  maxArea: number
  maxSide: number
}

export type CanvasRasterPlan = {
  bounds: CanvasRasterBounds
  clamped: boolean
  outputHeight: number
  outputWidth: number
  pixelRatio: number
  requestedPixelRatio: number
}

type RasterCompositeEnvironment = {
  createCanvas?: (width: number, height: number) => HTMLCanvasElement
  loadImage?: (dataUrl: string) => Promise<CanvasImageSource>
}

export const CANVAS_EXPORT_PADDING = 32
export const CANVAS_PREVIEW_RASTER_LIMITS: CanvasRasterLimits = {
  maxArea: 4_000_000,
  maxSide: 2048,
}
export const CANVAS_DOWNLOAD_RASTER_LIMITS: CanvasRasterLimits = {
  maxArea: 48_000_000,
  maxSide: 12_000,
}

const MIN_PIXEL_RATIO = 0.001

function createBrowserCanvas(width: number, height: number) {
  const canvas = document.createElement('canvas')
  canvas.width = width
  canvas.height = height
  return canvas
}

function loadBrowserImage(dataUrl: string) {
  return new Promise<HTMLImageElement>((resolve, reject) => {
    const image = new Image()
    image.onload = () => resolve(image)
    image.onerror = () => reject(new Error('Canvas export image could not load'))
    image.src = dataUrl
  })
}

function roundBounds(bounds: CanvasRasterBounds): CanvasRasterBounds {
  const x = Math.floor(bounds.x)
  const y = Math.floor(bounds.y)
  const right = Math.ceil(bounds.x + bounds.width)
  const bottom = Math.ceil(bounds.y + bounds.height)

  return {
    x,
    y,
    width: Math.max(1, right - x),
    height: Math.max(1, bottom - y),
  }
}

export function createRasterPlan(
  bounds: CanvasRasterBounds,
  requestedPixelRatio: number,
  limits: CanvasRasterLimits,
): CanvasRasterPlan {
  const normalizedBounds = roundBounds(bounds)
  const safeRequestedPixelRatio = Math.max(MIN_PIXEL_RATIO, requestedPixelRatio)
  const sideRatio = Math.min(
    limits.maxSide / normalizedBounds.width,
    limits.maxSide / normalizedBounds.height,
  )
  const areaRatio = Math.sqrt(
    limits.maxArea / (normalizedBounds.width * normalizedBounds.height),
  )
  const pixelRatio = Math.max(
    MIN_PIXEL_RATIO,
    Math.min(safeRequestedPixelRatio, sideRatio, areaRatio),
  )
  const outputWidth = Math.max(
    1,
    Math.round(normalizedBounds.width * pixelRatio),
  )
  const outputHeight = Math.max(
    1,
    Math.round(normalizedBounds.height * pixelRatio),
  )

  return {
    bounds: normalizedBounds,
    clamped: pixelRatio < safeRequestedPixelRatio - 0.0001,
    outputHeight,
    outputWidth,
    pixelRatio,
    requestedPixelRatio: safeRequestedPixelRatio,
  }
}

export function getStageContentBounds(
  stage: Konva.Stage,
  padding = CANVAS_EXPORT_PADDING,
): CanvasRasterBounds | null {
  let minX = Infinity
  let minY = Infinity
  let maxX = -Infinity
  let maxY = -Infinity

  for (const layer of stage.getLayers()) {
    for (const child of layer.getChildren()) {
      if (!child.isVisible()) continue
      const rect = child.getClientRect({ relativeTo: stage })
      if (rect.width <= 0 || rect.height <= 0) continue

      minX = Math.min(minX, rect.x)
      minY = Math.min(minY, rect.y)
      maxX = Math.max(maxX, rect.x + rect.width)
      maxY = Math.max(maxY, rect.y + rect.height)
    }
  }

  if (!Number.isFinite(minX) || maxX - minX <= 1 || maxY - minY <= 1) {
    return null
  }

  return roundBounds({
    x: minX - padding,
    y: minY - padding,
    width: maxX - minX + padding * 2,
    height: maxY - minY + padding * 2,
  })
}

export function normalizeRasterBackground(background?: string | null) {
  const value = background?.trim()
  if (!value || value === 'transparent') {
    return null
  }
  return value
}

export async function compositeRasterBackground(
  dataUrl: string,
  outputWidth: number,
  outputHeight: number,
  background?: string | null,
  environment: RasterCompositeEnvironment = {},
) {
  const fill = normalizeRasterBackground(background)
  if (!fill) {
    return dataUrl
  }

  const createCanvas = environment.createCanvas ?? createBrowserCanvas
  const loadImage = environment.loadImage ?? loadBrowserImage
  const canvas = createCanvas(outputWidth, outputHeight)
  canvas.width = outputWidth
  canvas.height = outputHeight

  const context = canvas.getContext('2d')
  if (!context) {
    throw new Error('Canvas export could not create a 2D context')
  }

  const image = await loadImage(dataUrl)
  context.fillStyle = fill
  context.fillRect(0, 0, outputWidth, outputHeight)
  context.drawImage(image, 0, 0, outputWidth, outputHeight)

  const composedDataUrl = canvas.toDataURL('image/png')
  if (!composedDataUrl.startsWith('data:image/png')) {
    throw new Error('Canvas export returned an empty image')
  }
  return composedDataUrl
}

export async function renderStageRasterDataUrl(
  stage: Konva.Stage,
  plan: CanvasRasterPlan,
  options: { background?: string | null } = {},
): Promise<string> {
  const previous = {
    scaleX: stage.scaleX(),
    scaleY: stage.scaleY(),
    x: stage.x(),
    y: stage.y(),
  }

  try {
    stage.position({
      x: -plan.bounds.x,
      y: -plan.bounds.y,
    })
    stage.scale({ x: 1, y: 1 })

    const dataUrl = stage.toDataURL({
      x: 0,
      y: 0,
      width: plan.bounds.width,
      height: plan.bounds.height,
      pixelRatio: plan.pixelRatio,
      mimeType: 'image/png',
    })

    if (!dataUrl.startsWith('data:image/png')) {
      throw new Error('Canvas export returned an empty image')
    }

    return await compositeRasterBackground(
      dataUrl,
      plan.outputWidth,
      plan.outputHeight,
      options.background,
    )
  } finally {
    stage.position({ x: previous.x, y: previous.y })
    stage.scale({ x: previous.scaleX, y: previous.scaleY })
    stage.batchDraw()
  }
}
