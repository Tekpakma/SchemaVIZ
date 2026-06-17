import { readFileSync } from 'node:fs'

import { describe, expect, it } from 'vitest'

import { DEFAULT_LOCALE } from './constants'
import { resources } from './resources'

const exportKeys = [
  'appearance',
  'copied',
  'copyImage',
  'downloadAs',
  'format',
  'label',
  'loading',
  'noPreview',
  'openDrawio',
  'opened',
  'preview',
  'previewAlt',
  'rendering',
  'resolution',
  'saved',
  'title',
  'transparentBackground',
] as const

const aboutKeys = [
  'app',
  'backend',
  'description',
  'frontend',
  'loading',
  'open',
  'title',
  'unavailable',
] as const

describe('i18n resources', () => {
  it('defaults to English unless another locale is selected', () => {
    expect(DEFAULT_LOCALE).toBe('en')
  })

  it('provides export dialog copy in English and German', () => {
    for (const key of exportKeys) {
      expect(resources.en.translation.canvas.export[key]).toBeTruthy()
      expect(resources.de.translation.canvas.export[key]).toBeTruthy()
    }

    expect(resources.en.translation.canvas.export.title).toBe('Export diagram')
    expect(resources.de.translation.canvas.export.title).toBe(
      'Diagramm exportieren',
    )
  })

  it('provides about dialog copy in English and German', () => {
    for (const key of aboutKeys) {
      expect(resources.en.translation.about[key]).toBeTruthy()
      expect(resources.de.translation.about[key]).toBeTruthy()
    }

    expect(resources.en.translation.about.frontend).toBe('Frontend')
    expect(resources.de.translation.about.backend).toBe('Backend')
  })

  it('keeps export dialog visible copy in resource files', () => {
    const source = readFileSync(
      new URL('../canvas/components/CanvasExportDialog.tsx', import.meta.url),
      'utf8',
    )

    expect(source).not.toContain('Diagramm exportieren')
    expect(source).not.toContain('VORSCHAU')
    expect(source).not.toContain('AUFLOESUNG')
    expect(source).not.toContain('Keine Vorschau')
    expect(source).not.toContain('Herunterladen als')
    expect(source).not.toContain('Wird gerendert')
  })
})
