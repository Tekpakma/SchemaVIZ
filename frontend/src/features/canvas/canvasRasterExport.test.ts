import { describe, expect, it } from 'vitest'

import {
  compositeRasterBackground,
  createRasterPlan,
  normalizeRasterBackground,
} from './canvasRasterExport'

describe('canvas raster export planning', () => {
  it('keeps the requested ratio when output stays under browser limits', () => {
    const plan = createRasterPlan({ x: 0, y: 0, width: 800, height: 400 }, 2, {
      maxArea: 4_000_000,
      maxSide: 2048,
    })

    expect(plan).toMatchObject({
      clamped: false,
      outputWidth: 1600,
      outputHeight: 800,
      pixelRatio: 2,
    })
  })

  it('clamps by maximum side length for very wide graphs', () => {
    const plan = createRasterPlan(
      { x: 0, y: 0, width: 50_000, height: 1_000 },
      2,
      { maxArea: 48_000_000, maxSide: 12_000 },
    )

    expect(plan.clamped).toBe(true)
    expect(plan.outputWidth).toBeLessThanOrEqual(12_000)
    expect(plan.outputHeight).toBeLessThan(1_000)
  })

  it('clamps by maximum area when the side limit alone is not enough', () => {
    const plan = createRasterPlan(
      { x: 0, y: 0, width: 10_000, height: 10_000 },
      1,
      { maxArea: 16_000_000, maxSide: 12_000 },
    )

    expect(plan.clamped).toBe(true)
    expect(plan.outputWidth * plan.outputHeight).toBeLessThanOrEqual(16_000_000)
  })

  it('rounds fractional crop bounds outward', () => {
    const plan = createRasterPlan(
      { x: 10.4, y: 20.6, width: 99.2, height: 49.1 },
      1,
      { maxArea: 10_000, maxSide: 200 },
    )

    expect(plan.bounds).toEqual({ x: 10, y: 20, width: 100, height: 50 })
    expect(plan.outputWidth).toBe(100)
    expect(plan.outputHeight).toBe(50)
  })

  it('normalizes transparent raster backgrounds to no fill', () => {
    expect(normalizeRasterBackground('transparent')).toBeNull()
    expect(normalizeRasterBackground('')).toBeNull()
    expect(normalizeRasterBackground(null)).toBeNull()
    expect(normalizeRasterBackground('  #ffffff  ')).toBe('#ffffff')
  })

  it('composites an explicit raster background behind PNG pixels', async () => {
    const calls: Array<[string, ...unknown[]]> = []
    const context = {
      fillStyle: '',
      fillRect: (...args: unknown[]) => calls.push(['fillRect', ...args]),
      drawImage: (...args: unknown[]) => calls.push(['drawImage', ...args]),
    }
    const canvas = {
      width: 0,
      height: 0,
      getContext: () => context,
      toDataURL: () => 'data:image/png;base64,composited',
    }
    const image = { src: 'data:image/png;base64,raw' } as CanvasImageSource

    const result = await compositeRasterBackground(
      'data:image/png;base64,raw',
      120,
      80,
      '#18181b',
      {
        createCanvas: () => canvas as unknown as HTMLCanvasElement,
        loadImage: async () => image,
      },
    )

    expect(result).toBe('data:image/png;base64,composited')
    expect(canvas).toMatchObject({ width: 120, height: 80 })
    expect(context.fillStyle).toBe('#18181b')
    expect(calls).toEqual([
      ['fillRect', 0, 0, 120, 80],
      ['drawImage', image, 0, 0, 120, 80],
    ])
  })

  it('leaves transparent raster exports untouched', async () => {
    const result = await compositeRasterBackground(
      'data:image/png;base64,raw',
      120,
      80,
      'transparent',
      {
        createCanvas: () => {
          throw new Error('transparent export should not create a canvas')
        },
      },
    )

    expect(result).toBe('data:image/png;base64,raw')
  })
})
