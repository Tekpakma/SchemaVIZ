import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import {
  ReadOnlySourceBanner,
  SourcePicker,
  buildSourceSwitchUrl,
} from './SourcePicker'

const mocks = vi.hoisted(() => {
  const state: { session: unknown } = { session: undefined }
  return state
})

vi.mock('@tanstack/react-query', () => ({
  queryOptions: (options: unknown) => options,
  useQuery: () => ({ data: mocks.session }),
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({ t: (key: string) => key }),
}))

const stagedev = { id: 'stagedev', label: 'Stage Dev', readOnly: false }
const prod = { id: 'prod', label: 'COSMOS', readOnly: true }

function sessionWith(
  source: typeof stagedev | typeof prod,
  sources: Array<typeof stagedev | typeof prod>,
) {
  return {
    mode: 'oidc',
    authRequired: true,
    user: null,
    source,
    sources,
    auth: { providerLabel: 'x', loginUrl: '/login', logoutUrl: '/logout' },
  }
}

beforeEach(() => {
  mocks.session = undefined
})

describe('buildSourceSwitchUrl', () => {
  it('encodes the target source and the page to come back to', () => {
    expect(buildSourceSwitchUrl('qas', '/builder?templateId=1#top')).toBe(
      '/_schema-viz/auth/source?source=qas&next=%2Fbuilder%3FtemplateId%3D1%23top',
    )
  })
})

describe('SourcePicker', () => {
  it('renders nothing before the session is known', () => {
    expect(renderToStaticMarkup(<SourcePicker />)).toBe('')
  })

  it('renders nothing when there is only one source', () => {
    mocks.session = sessionWith(stagedev, [stagedev])

    expect(renderToStaticMarkup(<SourcePicker />)).toBe('')
  })

  it('renders nothing for servers that do not send sources', () => {
    mocks.session = { ...sessionWith(stagedev, []), source: undefined }

    expect(renderToStaticMarkup(<SourcePicker />)).toBe('')
  })

  it('shows the active source when several are available', () => {
    mocks.session = sessionWith(stagedev, [stagedev, prod])

    const html = renderToStaticMarkup(<SourcePicker />)

    expect(html).toContain('Stage Dev')
    expect(html).toContain('aria-label="source.switch"')
  })
})

describe('ReadOnlySourceBanner', () => {
  it('is hidden on a writable source', () => {
    mocks.session = sessionWith(stagedev, [stagedev, prod])

    expect(renderToStaticMarkup(<ReadOnlySourceBanner />)).toBe('')
  })

  it('names the read-only source', () => {
    mocks.session = sessionWith(prod, [stagedev, prod])

    const html = renderToStaticMarkup(<ReadOnlySourceBanner />)

    expect(html).toContain('COSMOS')
    expect(html).toContain('source.readOnlyBanner')
    expect(html).toContain('role="status"')
  })
})
