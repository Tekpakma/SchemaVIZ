import { describe, expect, it } from 'vitest'

import {
  createTemplateTextContent,
  renderTemplateTextContent,
} from './templateTextContent'

describe('template text content rendering', () => {
  it('renders plain template text content', () => {
    expect(renderTemplateTextContent(createTemplateTextContent('Server'))).toContain(
      'Server',
    )
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
})
