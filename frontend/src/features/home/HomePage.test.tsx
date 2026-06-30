import { renderToStaticMarkup } from 'react-dom/server'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import { HomePage } from './HomePage'

const mocks = vi.hoisted(() => ({
  mode: 'error' as 'error' | 'success',
  navigateMock: vi.fn(),
  refetchMock: vi.fn(),
}))

function createTemplateEntry({
  featured = false,
  id,
  name,
  owned = false,
  source,
}: {
  featured?: boolean
  id: string
  name: string
  owned?: boolean
  source: 'featured' | 'global' | 'own'
}) {
  return {
    previewStatus: 'ready',
    result: null,
    run: null,
    sampleRecordDisplayName: 'Example record',
    sampleRecordId: 'record-1',
    source,
    styleTemplates: [],
    template: {
      id,
      name,
      description: `${name} description`,
      rootModel: 'infrastructure.CloudProvider',
      scope: source === 'own' ? 'owner' : 'global',
      ownedByCurrentUser: owned,
      featured: {
        enabled: featured,
        rank: featured ? 1 : null,
      },
      shareSlug: id,
      draftVersion: null,
      publishedVersion: null,
      publishedAt: null,
      publishedBy: null,
      createdAt: '2026-05-13T12:00:00+00:00',
      updatedAt: '2026-05-13T12:00:00+00:00',
    },
  }
}

const ownedEntry = createTemplateEntry({
  id: 'owned-template',
  name: 'Owned topology',
  owned: true,
  source: 'own',
})
const featuredEntry = createTemplateEntry({
  featured: true,
  id: 'featured-template',
  name: 'Featured topology',
  source: 'featured',
})
const globalEntry = createTemplateEntry({
  id: 'global-template',
  name: 'Global topology',
  source: 'global',
})

vi.mock('@tanstack/react-query', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@tanstack/react-query')>()

  return {
    ...actual,
    useQuery: vi.fn((options: { queryKey?: readonly unknown[] }) => {
      const queryKey = options.queryKey ?? []

      if (queryKey[0] === 'start-auth') {
        return {
          data: {
            mode: 'dev',
            authRequired: false,
            user: null,
            auth: {
              providerLabel: 'Local',
              loginUrl: '/login',
              logoutUrl: '/logout',
            },
          },
          error: null,
          isError: false,
          isFetching: false,
          isLoading: false,
          isSuccess: true,
          refetch: mocks.refetchMock,
        }
      }

      if (queryKey.includes('all')) {
        return mocks.mode === 'error'
          ? {
              data: [],
              error: new Error('Backend unavailable'),
              isError: true,
              isLoading: false,
              refetch: mocks.refetchMock,
            }
          : {
              data: [ownedEntry, featuredEntry, globalEntry],
              error: null,
              isError: false,
              isLoading: false,
              refetch: mocks.refetchMock,
            }
      }

      if (queryKey.includes('featured')) {
        return {
          data: {
            count: mocks.mode === 'success' ? 1 : 0,
            next: null,
            previous: null,
            results: mocks.mode === 'success' ? [featuredEntry] : [],
          },
          error: null,
          isError: false,
          isLoading: false,
          refetch: mocks.refetchMock,
        }
      }

      return {
        data: {
          ownRecent: mocks.mode === 'success' ? [ownedEntry] : [],
        },
        error: null,
        isError: false,
        isLoading: false,
        refetch: mocks.refetchMock,
      }
    }),
  }
})

vi.mock('@tanstack/react-router', () => ({
  useNavigate: () => mocks.navigateMock,
}))

vi.mock('react-i18next', () => ({
  useTranslation: () => ({
    t: (key: string, values?: Record<string, unknown>) => {
      if (key === 'home.auth.retry') return 'Retry'
      if (key === 'home.badge.featured') return 'Featured'
      if (key === 'home.card.details') return 'Details'
      if (key === 'home.hero.title') return 'Landscapes'
      if (key === 'home.hero.newFromScratch') return 'New from scratch'
      if (key === 'home.hero.reviewFeatured') return 'Review featured'
      if (key === 'home.hero.reviewLastOpened') return 'Review owned template'
      if (key === 'home.promoted.kicker') return 'Promoted templates'
      if (key === 'home.promoted.title') return 'Curated templates'
      if (key === 'home.stats.featured') return 'featured'
      if (key === 'home.stats.recentOwned') return 'owned templates'
      if (key === 'home.stats.readyPreviews') return 'ready previews'
      if (key === 'home.stats.needAttention') return 'need attention'
      if (key === 'home.sections.recent') return 'Owned templates'
      if (key === 'home.sections.allTemplates') return 'All templates'
      if (key === 'home.sections.emptyRecent') return 'No owned templates yet'
      if (key === 'home.sections.emptyFilter')
        return 'No templates match this filter'
      if (key === 'home.editor.title') return 'Recipe editor'
      if (key === 'home.editor.description') return 'Author templates.'
      if (key === 'home.editor.open') return 'Open editor'
      if (key === 'home.source.featured') return 'Featured'
      if (key === 'home.source.global') return 'Global'
      if (key === 'home.source.own') return 'Owned template'
      if (key === 'home.status.ready') return 'Ready'
      if (key.startsWith('home.filters.'))
        return key.slice('home.filters.'.length)
      if (key === 'home.count.owned') return `${values?.count ?? 0} owned`
      if (key === 'home.count.featured') return `${values?.count ?? 0} featured`
      if (key === 'home.count.nodes') return `${values?.count ?? 0} nodes`
      if (key === 'home.count.edges') return `${values?.count ?? 0} edges`
      return key
    },
  }),
}))

describe('HomePage', () => {
  beforeEach(() => {
    mocks.mode = 'error'
    mocks.navigateMock.mockReset()
    mocks.refetchMock.mockReset()
  })

  it('renders the template load error banner with a retry action', () => {
    const markup = renderToStaticMarkup(<HomePage />)

    expect(markup).toContain('Backend unavailable')
    expect(markup).toContain('Retry')
    expect(markup).toContain('All templates')
  })

  it('renders featured, owned, and global templates from the home queries', () => {
    mocks.mode = 'success'

    const markup = renderToStaticMarkup(<HomePage />)

    expect(markup).toContain('Curated templates')
    expect(markup).toContain('Owned templates')
    expect(markup).toContain('All templates')
    expect(markup).toContain('Featured topology')
    expect(markup).toContain('Owned topology')
    expect(markup).toContain('Global topology')
    expect(markup).toContain('>3</span>')
    expect(markup).toContain('ready previews')
  })
})
