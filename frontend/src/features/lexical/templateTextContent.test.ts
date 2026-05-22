import { describe, expect, it } from 'vitest'

import {
  createTemplateTextContent,
  renderTemplateTextContent,
} from './templateTextContent'

describe('template text content rendering', () => {
  it('renders plain template text content', () => {
    expect(
      renderTemplateTextContent(createTemplateTextContent('Server')),
    ).toContain('Server')
  })

  it('renders data references with record fields when available', () => {
    const html = renderTemplateTextContent(
      {
        root: {
          children: [
            {
              children: [
                {
                  detail: 0,
                  format: 0,
                  mode: 'normal',
                  style: '',
                  text: 'Host ',
                  type: 'text',
                  version: 1,
                },
                {
                  path: 'hostname',
                  styles: {},
                  type: 'data-reference',
                  version: 1,
                },
              ],
              type: 'paragraph',
              version: 1,
            },
          ],
          type: 'root',
          version: 1,
        },
      },
      {
        hostname: 'api-01',
      },
    )

    expect(html).toContain('Host')
    expect(html).toContain('api-01')
    expect(html).toContain('data-lexical-data-reference')
  })

  it('resolves raw text template placeholders from record fields', () => {
    const html = renderTemplateTextContent(
      createTemplateTextContent('Provider {{name}}'),
      {
        name: 'AWS',
      },
    )

    expect(html).toContain('Provider AWS')
    expect(html).not.toContain('{{name}}')
  })

  it('resolves raw text relation paths from nested record fields', () => {
    const html = renderTemplateTextContent(
      createTemplateTextContent('{{templates.name}}'),
      {
        templates: [{ name: 'ubuntu-22' }, { name: 'ubuntu-24' }],
      },
    )

    expect(html).toContain('ubuntu-22, ubuntu-24')
    expect(html).not.toContain('{{templates.name}}')
  })

  function lexWithRef(path: string) {
    return {
      root: {
        children: [
          {
            children: [
              {
                path,
                styles: {},
                type: 'data-reference',
                version: 1,
              },
            ],
            type: 'paragraph',
            version: 1,
          },
        ],
        type: 'root',
        version: 1,
      },
    }
  }

  it('resolves a forward FK relation path (object → key)', () => {
    const html = renderTemplateTextContent(lexWithRef('region.code'), {
      region: { code: 'eu-central-1' },
    })

    expect(html).toContain('eu-central-1')
    expect(html).not.toContain('{{region.code}}')
  })

  it('resolves a reverse FK relation path (list → joined)', () => {
    const html = renderTemplateTextContent(lexWithRef('templates.name'), {
      templates: [{ name: 'ubuntu-22' }, { name: 'ubuntu-24' }],
    })

    expect(html).toContain('ubuntu-22, ubuntu-24')
  })

  it('truncates large collections with a "+N more" suffix', () => {
    const html = renderTemplateTextContent(lexWithRef('templates.name'), {
      templates: Array.from({ length: 9 }, (_, i) => ({ name: `t${i}` })),
    })

    expect(html).toContain('t0, t1, t2, t3, t4 (+4 more)')
  })

  it('renders the literal token when a relation segment is missing', () => {
    const html = renderTemplateTextContent(lexWithRef('templates.name'), {
      // No 'templates' key — relation never resolved.
      name: 'AWS',
    })

    expect(html).toContain('{{templates.name}}')
  })

  it('renders the literal token when the collection is empty', () => {
    const html = renderTemplateTextContent(lexWithRef('templates.name'), {
      templates: [],
    })

    expect(html).toContain('{{templates.name}}')
  })

  it('falls back to the FK id when the related object is not nested', () => {
    // Backend may emit `region_id` without resolving `region.*` if no path
    // referenced it. Flat-field rendering still works via the _id suffix.
    const html = renderTemplateTextContent(lexWithRef('region'), {
      region_id: 42,
    })

    expect(html).toContain('42')
  })

  it('renders data reference styles as CSS properties', () => {
    const html = renderTemplateTextContent({
      root: {
        children: [
          {
            children: [
              {
                path: 'hostname',
                styles: {
                  color: '#dc2626',
                  fontWeight: 'bold',
                  textDecoration: 'underline',
                },
                type: 'data-reference',
                version: 1,
              },
            ],
            type: 'paragraph',
            version: 1,
          },
        ],
        type: 'root',
        version: 1,
      },
    })

    expect(html).toContain('color: #dc2626')
    expect(html).toContain('font-weight: bold')
    expect(html).toContain('text-decoration: underline')
  })
})
