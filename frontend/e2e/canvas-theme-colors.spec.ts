import { expect, test } from '@playwright/test'

import { DEFAULT_CANVAS_NODE } from '@/features/canvas/constants'
import { THEME_COOKIE_NAME } from '@/features/theme/constants'

type Rgba = {
  a: number
  b: number
  g: number
  r: number
}

function parseRgba(value: string): Rgba {
  const match = value.match(
    /rgba?\(\s*([\d.]+)\s*,\s*([\d.]+)\s*,\s*([\d.]+)(?:\s*,\s*([\d.]+))?\s*\)/,
  )

  if (!match) {
    throw new Error(`Unsupported color format: ${value}`)
  }

  return {
    r: Number(match[1]),
    g: Number(match[2]),
    b: Number(match[3]),
    a: match[4] === undefined ? 1 : Number(match[4]),
  }
}

function expectCloseColor(actual: Rgba, expected: Rgba, tolerance = 1) {
  expect(Math.abs(actual.r - expected.r)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.g - expected.g)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.b - expected.b)).toBeLessThanOrEqual(tolerance)
  expect(Math.abs(actual.a - expected.a)).toBeLessThanOrEqual(tolerance / 255)
}

async function sampleViewportPixel(
  pageScreenshot: Buffer,
  point: { x: number; y: number },
) {
  const { PNG } = await import('pngjs')
  const png = PNG.sync.read(pageScreenshot)
  const x = Math.round(point.x)
  const y = Math.round(point.y)
  const index = (y * png.width + x) * 4

  return {
    r: png.data[index] ?? 0,
    g: png.data[index + 1] ?? 0,
    b: png.data[index + 2] ?? 0,
    a: (png.data[index + 3] ?? 0) / 255,
  }
}

for (const theme of ['light', 'dark'] as const) {
  test(`preview canvas surface and lexical overlay match in ${theme} theme`, async ({
    context,
    page,
  }) => {
    await context.addCookies([
      {
        domain: '127.0.0.1',
        name: THEME_COOKIE_NAME,
        path: '/',
        value: theme,
      },
    ])

    await page.goto('/')

    const canvas = page.locator('canvas').first()
    await expect(canvas).toBeVisible()
    await expect
      .poll(() => page.locator('canvas').count())
      .toBeGreaterThanOrEqual(2)

    const surfaceColor = parseRgba(
      await page.evaluate(() =>
        getComputedStyle(document.documentElement)
          .getPropertyValue('--surface-strong')
          .trim(),
      ),
    )

    const canvasPixel = await canvas.evaluate((canvasElement, node) => {
      const canvas = canvasElement as HTMLCanvasElement
      const context = canvas.getContext('2d')
      if (!context) throw new Error('Expected a 2D canvas context')

      const [r = 0, g = 0, b = 0, a = 0] = context.getImageData(
        node.x + 20,
        node.y + 20,
        1,
        1,
      ).data

      return {
        r,
        g,
        b,
        a: a / 255,
      }
    }, DEFAULT_CANVAS_NODE)

    expectCloseColor(canvasPixel, surfaceColor)

    const canvasBox = await canvas.boundingBox()
    if (!canvasBox) throw new Error('Expected a canvas bounding box')

    const quietSurfacePoint = {
      x: canvasBox.x + DEFAULT_CANVAS_NODE.x + DEFAULT_CANVAS_NODE.width - 24,
      y: canvasBox.y + DEFAULT_CANVAS_NODE.y + DEFAULT_CANVAS_NODE.height - 24,
    }
    const previewVisiblePixel = await sampleViewportPixel(
      await page.screenshot(),
      quietSurfacePoint,
    )

    await page.mouse.dblclick(
      canvasBox.x + DEFAULT_CANVAS_NODE.x + DEFAULT_CANVAS_NODE.width / 2,
      canvasBox.y + DEFAULT_CANVAS_NODE.y + DEFAULT_CANVAS_NODE.height / 2,
    )

    const overlay = page.getByTestId('lexical-overlay')
    await expect(overlay).toBeVisible()

    const overlayColor = parseRgba(
      await overlay.evaluate(
        (element) => getComputedStyle(element).backgroundColor,
      ),
    )

    expectCloseColor(overlayColor, surfaceColor)

    const overlayVisiblePixel = await sampleViewportPixel(
      await page.screenshot(),
      quietSurfacePoint,
    )

    expectCloseColor(overlayVisiblePixel, previewVisiblePixel)
  })
}
