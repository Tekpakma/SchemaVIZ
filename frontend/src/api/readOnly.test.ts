import { describe, expect, it } from 'vitest'

import { isReadOnlyRequestAllowed } from './readOnly'

describe('isReadOnlyRequestAllowed', () => {
  it.each(['GET', 'HEAD', 'OPTIONS', 'TRACE', 'get'])(
    'allows the safe method %s on any path',
    (method) => {
      expect(isReadOnlyRequestAllowed(method, '/drawings/')).toBe(true)
    },
  )

  it('treats a missing method as GET', () => {
    expect(isReadOnlyRequestAllowed(undefined, '/drawings/')).toBe(true)
  })

  it.each([
    '/query/metadata/',
    '/query/neighborhood/',
    '/query/record/',
    '/query/records/',
    '/query/records',
    '/query/records/?page=2',
    '/export/',
    '/route/probe/',
    '/template-compatibility/',
    '/template-uniqueness/',
    '/generation-runs/',
    '/generation-runs/validate/',
  ])('allows the read-only POST %s', (path) => {
    expect(isReadOnlyRequestAllowed('POST', path)).toBe(true)
  })

  it.each([
    '/drawings/',
    '/drawings/import/',
    '/generation-templates/',
    '/generation-templates/1/publish/',
    '/templates/',
    '/group-templates/',
    '/model-registry/',
    '/model-template-defaults/',
  ])('blocks the writing POST %s', (path) => {
    expect(isReadOnlyRequestAllowed('POST', path)).toBe(false)
  })

  it.each(['PUT', 'PATCH', 'DELETE'])('blocks %s even on a read path', (method) => {
    expect(isReadOnlyRequestAllowed(method, '/query/records/')).toBe(false)
    expect(isReadOnlyRequestAllowed(method, '/drawings/1/')).toBe(false)
  })

  it('blocks user preference writes', () => {
    expect(isReadOnlyRequestAllowed('PATCH', '/session/')).toBe(false)
    expect(isReadOnlyRequestAllowed('PUT', '/template-favorites/')).toBe(false)
    expect(isReadOnlyRequestAllowed('PUT', '/tours/intro/progress/')).toBe(false)
  })

  it('does not let a read path smuggle a write through path tricks', () => {
    expect(isReadOnlyRequestAllowed('POST', '/query/records/../drawings/')).toBe(
      false,
    )
    expect(
      isReadOnlyRequestAllowed('POST', '/query/records/%2e%2e/drawings/'),
    ).toBe(false)
    expect(isReadOnlyRequestAllowed('POST', '//drawings/')).toBe(false)
    expect(isReadOnlyRequestAllowed('POST', '/query/records/%zz')).toBe(false)
    expect(isReadOnlyRequestAllowed('POST', '/query/records/extra/')).toBe(false)
  })
})
