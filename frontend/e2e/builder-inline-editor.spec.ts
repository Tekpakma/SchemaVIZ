import { expect, test } from '@playwright/test'

const model = {
  abstract: false,
  appLabel: 'infra',
  appVerboseName: 'Infrastructure',
  dbTable: 'infra_server',
  managed: true,
  modelName: 'Server',
  verboseName: 'Server',
  verboseNamePlural: 'Servers',
}

const modelDetails = {
  ...model,
  fields: [
    {
      name: 'id',
      type: 'AutoField',
      verboseName: 'ID',
      primaryKey: true,
    },
    {
      name: 'hostname',
      type: 'CharField',
      verboseName: 'Hostname',
      maxLength: 255,
    },
  ],
  methods: [],
  relations: [],
}

test('builder style step opens and commits the inline node editor', async ({
  page,
}) => {
  await page.route('**/schema-viz/models/**', async (route) => {
    await route.fulfill({ json: [model] })
  })
  await page.route('**/schema-viz/templates/**', async (route) => {
    await route.fulfill({ json: [] })
  })
  await page.route('**/schema-viz/model-template-defaults/**', async (route) => {
    await route.fulfill({ json: [] })
  })
  await page.route('**/schema-viz/model-details/**', async (route) => {
    await route.fulfill({ json: modelDetails })
  })

  await page.goto('/builder')

  await page.getByRole('button', { name: 'Add start model' }).click()
  await page.getByRole('option', { name: 'Server Server' }).click()
  await expect(page.getByText('infra.Server')).toBeVisible()

  await page.getByRole('button', { name: 'Style each layer' }).click()

  const stage = page.getByTestId('canvas-stage-container')
  await expect(stage).toBeVisible()
  await expect(stage).toHaveAttribute('data-node-count', '1')

  const stageBox = await stage.boundingBox()
  if (!stageBox) {
    throw new Error('Expected the builder preview stage to be measurable')
  }

  const nodeCenter = {
    x: stageBox.x + stageBox.width / 2,
    y: stageBox.y + stageBox.height / 2,
  }

  await page.mouse.dblclick(nodeCenter.x, nodeCenter.y)

  const overlay = page.getByTestId('lexical-overlay')
  await expect(overlay).toBeVisible()

  const editor = overlay.locator('[contenteditable="true"]')
  await expect(editor).toBeVisible()
  await expect(editor).toBeFocused()

  await editor.type(' edited')
  await expect(editor).toContainText('edited')

  await page.keyboard.press('Control+Enter')
  await expect(overlay).toBeHidden()

  await page.mouse.dblclick(nodeCenter.x, nodeCenter.y)
  await expect(page.getByTestId('lexical-overlay')).toBeVisible()
  await expect(
    page.getByTestId('lexical-overlay').locator('[contenteditable="true"]'),
  ).toContainText('edited')
})
