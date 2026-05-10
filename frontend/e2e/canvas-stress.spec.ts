import { expect, test } from '@playwright/test'
import type { Page } from '@playwright/test'

import { TEST_IDS } from './constants'

const STRESS_NODE_COUNT = 240
const MAX_READY_DURATION_MS = 3_500
const MAX_LAYOUT_DURATION_MS = 15_000
const MAX_FIT_VIEW_DURATION_MS = 400
const MAX_ZOOM_DURATION_MS = 250
const MAX_PAN_DURATION_MS = 450

async function waitForAnimationFrames(page: Page, frameCount = 2) {
  await page.evaluate(
    (count: number) =>
      new Promise<void>((resolve) => {
        const step = (remainingFrames: number) => {
          if (remainingFrames <= 0) {
            resolve()
            return
          }

          requestAnimationFrame(() => step(remainingFrames - 1))
        }

        step(count)
      }),
    frameCount,
  )
}

async function measureInteractionDuration(
  page: Page,
  action: () => Promise<void>,
) {
  const startedAt = await page.evaluate(() => performance.now())

  await action()
  await waitForAnimationFrames(page)

  return page.evaluate((start: number) => performance.now() - start, startedAt)
}

test('canvas stress scene stays responsive during viewport interactions', async ({
  page,
}) => {
  test.slow()

  const layoutErrors: Array<string> = []
  page.on('console', (message) => {
    if (
      message.type() === 'error' &&
      message.text().includes('Failed to layout canvas graph')
    ) {
      layoutErrors.push(message.text())
    }
  })

  const stageContainer = page.getByTestId(TEST_IDS.CANVAS_STAGE_CONTAINER)
  const readyStartedAt = Date.now()

  await page.goto(`/?stress=${STRESS_NODE_COUNT}`)

  await expect(stageContainer).toBeVisible()
  await expect(stageContainer).toHaveAttribute(
    'data-node-count',
    String(STRESS_NODE_COUNT),
  )
  await expect
    .poll(() => page.locator('canvas').count())
    .toBeGreaterThanOrEqual(1)

  const readyDuration = Date.now() - readyStartedAt
  expect(readyDuration).toBeLessThan(MAX_READY_DURATION_MS)

  const layoutButton = page.getByRole('button', { name: 'Layout graph' })
  const layoutStartedAt = Date.now()
  await layoutButton.click()
  await expect(layoutButton).toBeEnabled({
    timeout: MAX_LAYOUT_DURATION_MS,
  })
  expect(Date.now() - layoutStartedAt).toBeLessThan(MAX_LAYOUT_DURATION_MS)
  await expect(stageContainer).toHaveAttribute(
    'data-node-count',
    String(STRESS_NODE_COUNT),
  )
  expect(layoutErrors).toEqual([])

  const fitViewDuration = await measureInteractionDuration(page, async () => {
    await page.getByRole('button', { name: 'Fit view' }).click()
  })
  expect(fitViewDuration).toBeLessThan(MAX_FIT_VIEW_DURATION_MS)

  const zoomInDuration = await measureInteractionDuration(page, async () => {
    await page.getByRole('button', { name: 'Zoom in' }).click()
  })
  expect(zoomInDuration).toBeLessThan(MAX_ZOOM_DURATION_MS)

  const zoomOutDuration = await measureInteractionDuration(page, async () => {
    await page.getByRole('button', { name: 'Zoom out' }).click()
  })
  expect(zoomOutDuration).toBeLessThan(MAX_ZOOM_DURATION_MS)

  const stageBox = await stageContainer.boundingBox()
  if (!stageBox) {
    throw new Error('Expected the canvas stage container to be measurable')
  }

  const panDuration = await measureInteractionDuration(page, async () => {
    await page.mouse.move(stageBox.x + 24, stageBox.y + 24)
    await page.mouse.down()
    await page.mouse.move(stageBox.x + 184, stageBox.y + 112, {
      steps: 12,
    })
    await page.mouse.up()
  })
  expect(panDuration).toBeLessThan(MAX_PAN_DURATION_MS)
})
