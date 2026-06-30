import { randomBytes } from 'node:crypto'
import * as oauth from 'oauth4webapi'
import { sealData, unsealData } from 'iron-session'

import {
  getDefaultStartAuthTokenStore,
  resetDefaultStartAuthTokenStoreForTests,
} from './tokenStore'
import type { StartAuthTokenRecord, StartAuthTokenStore } from './tokenStore'

type OidcTokens = {
  access_token?: string
  id_token?: string
  refresh_token?: string
  expires_in?: number
  token_type?: string
}

export type StartAuthUser = {
  sub: string
  name: string
  email?: string
  identifier?: string
}

type SessionCookiePayload = {
  sessionId: string
  createdAt: number
}

export type StartAuthBackend = {
  label: string
  description?: string
  backendBaseUrl: string
  basePath?: string
  oidc?: {
    issuer: string
    clientId: string
    clientSecret?: string
    scope: string
    providerLabel?: string
  }
}

export type PublicStartAuthSession = {
  mode: 'dev' | 'oidc' | 'session'
  authRequired: boolean
  user: StartAuthUser | null
  auth: {
    providerLabel: string
    loginUrl: string
    logoutUrl: string
  }
}

export type StartAuthContext = {
  kind: 'browser' | 'dev'
  sessionId?: string
  user: StartAuthUser
  accessToken?: string
}

type TransactionCookie = {
  state: string
  codeVerifier: string
  next: string
  createdAt: number
}

type OAuthOverrides = {
  authorizationServer?: oauth.AuthorizationServer
  refreshTokenGrantRequest?: typeof oauth.refreshTokenGrantRequest
  processRefreshTokenResponse?: typeof oauth.processRefreshTokenResponse
}

const SESSION_COOKIE = 'sv_session'
const TX_COOKIE = 'sv_start_oidc_tx'
const SESSION_MAX_AGE_SECONDS = 60 * 60 * 24 * 7
const TX_MAX_AGE_SECONDS = 60 * 10
const DEFAULT_SCOPE = 'openid profile email'
const ACCESS_TOKEN_REFRESH_BUFFER_MS = 30_000
const DJANGO_SESSION_AUTH_MODES = new Set(['session', 'django-session'])

const authServerCache = new Map<string, Promise<oauth.AuthorizationServer>>()
const sessionLocks = new Map<string, Promise<unknown>>()

let tokenStoreOverride: StartAuthTokenStore | null = null
let oauthOverrides: OAuthOverrides = {}

function isProd() {
  return process.env.NODE_ENV === 'production'
}

function getAuthSecret(): string {
  const secret = process.env.SCHEMA_VIZ_AUTH_SECRET?.trim()
  if (secret) return secret
  if (isProd()) {
    throw new Error('SCHEMA_VIZ_AUTH_SECRET is required in production.')
  }
  return 'schema-viz-dev-auth-secret-32chr'
}

function getAuthMode(): 'dev' | 'oidc' | 'session' {
  const configured = process.env.SCHEMA_VIZ_AUTH_MODE?.trim().toLowerCase()
  if (configured === 'dev' || configured === 'oidc') {
    return configured
  }
  if (configured && DJANGO_SESSION_AUTH_MODES.has(configured)) {
    return 'session'
  }
  return isProd() ? 'oidc' : 'dev'
}

async function seal<T>(value: T, ttl: number): Promise<string> {
  return sealData(value, { password: getAuthSecret(), ttl })
}

async function unseal<T>(sealed: string | undefined | null): Promise<T | null> {
  if (!sealed) return null
  try {
    return await unsealData<T>(sealed, { password: getAuthSecret() })
  } catch {
    return null
  }
}

function parseCookies(request: Request): Record<string, string> {
  const cookieHeader = request.headers.get('cookie')
  if (!cookieHeader) return {}

  return Object.fromEntries(
    cookieHeader
      .split(';')
      .map((entry) => entry.trim())
      .filter(Boolean)
      .map((entry) => {
        const index = entry.indexOf('=')
        if (index === -1) return [entry, '']
        return [
          entry.slice(0, index),
          decodeURIComponent(entry.slice(index + 1)),
        ]
      }),
  )
}

function serializeCookie(
  name: string,
  value: string,
  options: { maxAge?: number; path?: string; httpOnly?: boolean } = {},
): string {
  const parts = [
    `${name}=${encodeURIComponent(value)}`,
    `Path=${options.path ?? '/'}`,
    'SameSite=Lax',
  ]
  if (options.httpOnly !== false) parts.push('HttpOnly')
  if (isProd()) parts.push('Secure')
  if (typeof options.maxAge === 'number')
    parts.push(`Max-Age=${options.maxAge}`)
  return parts.join('; ')
}

function clearCookie(name: string): string {
  return serializeCookie(name, '', { maxAge: 0 })
}

async function readSessionCookie(
  request: Request,
): Promise<SessionCookiePayload | null> {
  return unseal<SessionCookiePayload>(parseCookies(request)[SESSION_COOKIE])
}

async function sealSessionCookie(sessionId: string): Promise<string> {
  const sealed = await seal<SessionCookiePayload>(
    { sessionId, createdAt: Date.now() },
    SESSION_MAX_AGE_SECONDS,
  )
  return serializeCookie(SESSION_COOKIE, sealed, {
    maxAge: SESSION_MAX_AGE_SECONDS,
  })
}

function redirect(
  location: string,
  cookies: string[] = [],
  status = 302,
): Response {
  const headers = new Headers({ location })
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(null, { status, headers })
}

function json(
  data: unknown,
  init: ResponseInit = {},
  cookies: string[] = [],
): Response {
  const headers = new Headers(init.headers)
  headers.set('content-type', 'application/json')
  for (const cookie of cookies) headers.append('set-cookie', cookie)
  return new Response(JSON.stringify(data), { ...init, headers })
}

function normalizeBackendBaseUrl(value?: string): string {
  const configured =
    value?.trim() || process.env.SCHEMA_VIZ_SERVER_BASE_URL?.trim()
  if (configured) return configured.replace(/\/+$/g, '')
  return 'http://localhost:8000/schema-viz'
}

export function getStartAuthBackend(): StartAuthBackend {
  const issuer = process.env.SCHEMA_VIZ_OIDC_ISSUER?.trim()
  const clientId = process.env.SCHEMA_VIZ_OIDC_CLIENT_ID?.trim()
  return {
    label: process.env.SCHEMA_VIZ_BACKEND_LABEL?.trim() || 'Schema Viz',
    description:
      process.env.SCHEMA_VIZ_BACKEND_DESCRIPTION?.trim() || undefined,
    backendBaseUrl: normalizeBackendBaseUrl(),
    basePath: process.env.SCHEMA_VIZ_BASE_PATH?.trim() || undefined,
    oidc:
      issuer && clientId
        ? {
            issuer: issuer.replace(/\/+$/g, ''),
            clientId,
            clientSecret: process.env.SCHEMA_VIZ_OIDC_CLIENT_SECRET?.trim(),
            scope: process.env.SCHEMA_VIZ_OIDC_SCOPE?.trim() || DEFAULT_SCOPE,
            providerLabel: process.env.SCHEMA_VIZ_OIDC_PROVIDER_LABEL?.trim(),
          }
        : undefined,
  }
}

function publicSession(user: StartAuthUser | null): PublicStartAuthSession {
  const backend = getStartAuthBackend()
  const mode = getAuthMode()
  return {
    mode,
    authRequired: mode === 'oidc',
    user,
    auth: {
      providerLabel: backend.oidc?.providerLabel ?? backend.label,
      loginUrl: '/_schema-viz/auth/login',
      logoutUrl: '/_schema-viz/auth/logout',
    },
  }
}

function getDjangoSessionLoginUrl(request: Request): string {
  const configured = process.env.SCHEMA_VIZ_DJANGO_LOGIN_URL?.trim()
  if (configured) return new URL(configured, request.url).toString()

  const backend = getStartAuthBackend()
  const backendUrl = new URL(backend.backendBaseUrl, request.url)
  return new URL('/django/admin/login/', backendUrl.origin).toString()
}

function getTokenStore(): StartAuthTokenStore {
  return tokenStoreOverride ?? getDefaultStartAuthTokenStore()
}

function hasFreshAccessToken(
  record: StartAuthTokenRecord,
): record is StartAuthTokenRecord & {
  accessToken: string
  accessTokenExpiresAt: number
} {
  return Boolean(
    record.accessToken &&
    record.accessTokenExpiresAt &&
    record.accessTokenExpiresAt > Date.now() + ACCESS_TOKEN_REFRESH_BUFFER_MS,
  )
}

async function withSessionLock<T>(
  sessionId: string,
  fn: () => Promise<T>,
): Promise<T> {
  const previous = sessionLocks.get(sessionId) ?? Promise.resolve()
  let release!: () => void
  const current = new Promise<void>((resolve) => {
    release = resolve
  })
  const chained = previous.catch(() => undefined).then(() => current)
  sessionLocks.set(sessionId, chained)

  await previous.catch(() => undefined)
  try {
    return await fn()
  } finally {
    release()
    if (sessionLocks.get(sessionId) === chained) {
      sessionLocks.delete(sessionId)
    }
  }
}

export async function getValidAccessToken(
  sessionId: string,
): Promise<string | null> {
  const store = getTokenStore()
  const current = await store.read(sessionId)
  if (!current) return null
  if (hasFreshAccessToken(current)) return current.accessToken

  return withSessionLock(sessionId, async () => {
    const lockedRecord = await store.read(sessionId)
    if (!lockedRecord) return null
    if (hasFreshAccessToken(lockedRecord)) return lockedRecord.accessToken
    if (!lockedRecord.refreshToken) return null

    const refreshed = await refreshTokenRecord(lockedRecord)
    if (!refreshed) return null

    await store.write(refreshed)
    return refreshed.accessToken ?? null
  })
}

export async function invalidateAccessToken(sessionId: string): Promise<void> {
  await withSessionLock(sessionId, async () => {
    const store = getTokenStore()
    const record = await store.read(sessionId)
    if (!record) return
    await store.write({
      ...record,
      accessToken: undefined,
      accessTokenExpiresAt: undefined,
      version: record.version + 1,
      updatedAt: Date.now(),
    })
  })
}

async function refreshTokenRecord(
  record: StartAuthTokenRecord,
): Promise<StartAuthTokenRecord | null> {
  const backend = getStartAuthBackend()
  if (!backend.oidc) return null

  try {
    const as = await discoverAuthServer(backend)
    const client = oauthClient(backend)
    const refreshTokenGrantRequest =
      oauthOverrides.refreshTokenGrantRequest ?? oauth.refreshTokenGrantRequest
    const processRefreshTokenResponse =
      oauthOverrides.processRefreshTokenResponse ??
      oauth.processRefreshTokenResponse
    const tokenResponse = await refreshTokenGrantRequest(
      as,
      client,
      clientAuth(backend),
      record.refreshToken,
      devOptions(),
    )
    const result = await processRefreshTokenResponse(as, client, tokenResponse)
    const now = Date.now()
    return {
      ...record,
      refreshToken: result.refresh_token ?? record.refreshToken,
      idToken: result.id_token ?? record.idToken,
      accessToken: result.access_token,
      accessTokenExpiresAt:
        now + Math.max(60, result.expires_in ?? 3600) * 1000,
      version: record.version + 1,
      updatedAt: now,
    }
  } catch (err) {
    console.error('[startAuth] Token refresh failed:', err)
    const oauthError = (err as { error?: string }).error
    if (
      oauthError === 'invalid_grant' ||
      oauthError === 'unauthorized_client'
    ) {
      await getTokenStore().delete(record.sessionId)
    }
    return null
  }
}

function devUser(): StartAuthUser {
  return {
    sub: 'schema-viz-dev-user',
    name: 'Dev User',
    email: 'dev@localhost',
    identifier: 'dev',
  }
}

function devOptions(): { [oauth.allowInsecureRequests]?: true } {
  return isProd() ? {} : { [oauth.allowInsecureRequests]: true }
}

async function discoverAuthServer(
  backend: StartAuthBackend,
): Promise<oauth.AuthorizationServer> {
  if (oauthOverrides.authorizationServer)
    return oauthOverrides.authorizationServer
  if (!backend.oidc) throw new Error('OIDC configuration is missing.')
  const cached = authServerCache.get(backend.oidc.issuer)
  if (cached) return cached

  const issuerUrl = new URL(backend.oidc.issuer)
  const promise = oauth
    .discoveryRequest(issuerUrl, devOptions())
    .then((response) => oauth.processDiscoveryResponse(issuerUrl, response))
  authServerCache.set(backend.oidc.issuer, promise)
  return promise
}

function oauthClient(backend: StartAuthBackend): oauth.Client {
  const hasClientSecret = Boolean(backend.oidc?.clientSecret)
  return {
    client_id: backend.oidc!.clientId,
    token_endpoint_auth_method: hasClientSecret
      ? 'client_secret_basic'
      : 'none',
  }
}

function clientAuth(backend: StartAuthBackend): oauth.ClientAuth {
  return backend.oidc?.clientSecret
    ? oauth.ClientSecretBasic(backend.oidc.clientSecret)
    : oauth.None()
}

function requestOrigin(request: Request): string {
  const url = new URL(request.url)
  const forwardedProto = request.headers.get('x-forwarded-proto')
  const forwardedHost = request.headers.get('x-forwarded-host')
  if (forwardedProto && forwardedHost) {
    return `${forwardedProto}://${forwardedHost}`
  }
  return url.origin
}

function callbackUrl(request: Request): string {
  return `${requestOrigin(request)}/_schema-viz/auth/callback`
}

function safeNext(request: Request, value: string | null): string {
  if (!value) return '/'
  try {
    const url = new URL(value, request.url)
    if (url.origin !== new URL(request.url).origin) return '/'
    return `${url.pathname}${url.search}${url.hash}`
  } catch {
    return '/'
  }
}

function stringClaim(
  claims: Record<string, unknown>,
  key: string,
): string | undefined {
  const value = claims[key]
  return typeof value === 'string' && value.trim() ? value.trim() : undefined
}

function extractUser(claims: Record<string, unknown>): StartAuthUser {
  const sub = stringClaim(claims, 'sub') ?? stringClaim(claims, 'email')
  if (!sub) {
    throw new Error('OIDC user is missing a subject.')
  }
  const email = stringClaim(claims, 'email')
  const identifier =
    stringClaim(claims, 'preferred_username') ??
    stringClaim(claims, 'username') ??
    stringClaim(claims, 'nickname')
  return {
    sub,
    name: stringClaim(claims, 'name') ?? identifier ?? email ?? sub,
    email,
    identifier,
  }
}

export async function handleStartAuthRequest(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url)
  if (!url.pathname.startsWith('/_schema-viz/auth/')) {
    return null
  }

  const action = url.pathname.slice('/_schema-viz/auth/'.length)
  try {
    if (action === 'login') return await handleLogin(request)
    if (action === 'callback') return await handleCallback(request)
    if (action === 'logout') return await handleLogout(request)
    if (action === 'session') return await handleSession(request)
    return json({ error: 'Not found' }, { status: 404 })
  } catch (error) {
    if (error instanceof Response) return error
    const message =
      error instanceof Error ? error.message : 'Authentication request failed.'
    console.error('[startAuth]', action, error)
    return json({ error: message }, { status: 500 })
  }
}

async function handleLogin(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const backend = getStartAuthBackend()
  const next = safeNext(request, url.searchParams.get('next'))
  const mode = getAuthMode()

  if (mode === 'session') {
    return redirect(getDjangoSessionLoginUrl(request))
  }

  if (mode === 'dev' && !backend.oidc) {
    const sessionId = randomBytes(24).toString('base64url')
    return redirect(next, [await sealSessionCookie(sessionId)])
  }

  if (!backend.oidc) {
    return json({ error: 'OIDC is not configured.' }, { status: 400 })
  }

  const as = await discoverAuthServer(backend)
  const codeVerifier = oauth.generateRandomCodeVerifier()
  const codeChallenge = await oauth.calculatePKCECodeChallenge(codeVerifier)
  const state = oauth.generateRandomState()

  const tx: TransactionCookie = {
    state,
    codeVerifier,
    next,
    createdAt: Date.now(),
  }

  const authorizeUrl = new URL(as.authorization_endpoint!)
  authorizeUrl.searchParams.set('response_type', 'code')
  authorizeUrl.searchParams.set('client_id', backend.oidc.clientId)
  authorizeUrl.searchParams.set('redirect_uri', callbackUrl(request))
  authorizeUrl.searchParams.set('scope', backend.oidc.scope)
  authorizeUrl.searchParams.set('state', state)
  authorizeUrl.searchParams.set('code_challenge', codeChallenge)
  authorizeUrl.searchParams.set('code_challenge_method', 'S256')

  return redirect(authorizeUrl.toString(), [
    serializeCookie(TX_COOKIE, await seal(tx, TX_MAX_AGE_SECONDS), {
      maxAge: TX_MAX_AGE_SECONDS,
    }),
  ])
}

async function handleCallback(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const error = url.searchParams.get('error')
  if (error) {
    return json(
      { error, errorDescription: url.searchParams.get('error_description') },
      { status: 401 },
    )
  }

  const tx = await unseal<TransactionCookie>(parseCookies(request)[TX_COOKIE])
  if (!tx) {
    return json({ error: 'Invalid OIDC callback state.' }, { status: 400 }, [
      clearCookie(TX_COOKIE),
    ])
  }

  const backend = getStartAuthBackend()
  if (!backend.oidc) {
    return json({ error: 'OIDC is not configured.' }, { status: 400 })
  }

  const as = await discoverAuthServer(backend)
  const client = oauthClient(backend)
  const currentUrl = new URL(request.url)

  let params: URLSearchParams
  try {
    params = oauth.validateAuthResponse(as, client, currentUrl, tx.state)
  } catch {
    return json(
      { error: 'OIDC callback validation failed.' },
      { status: 401 },
      [clearCookie(TX_COOKIE)],
    )
  }

  let tokenResult: oauth.TokenEndpointResponse
  try {
    const tokenResponse = await oauth.authorizationCodeGrantRequest(
      as,
      client,
      clientAuth(backend),
      params,
      callbackUrl(request),
      tx.codeVerifier,
      devOptions(),
    )
    tokenResult = await oauth.processAuthorizationCodeResponse(
      as,
      client,
      tokenResponse,
    )
  } catch {
    return json({ error: 'OIDC token exchange failed.' }, { status: 401 }, [
      clearCookie(TX_COOKIE),
    ])
  }

  const tokens: OidcTokens = {
    access_token: tokenResult.access_token,
    id_token: tokenResult.id_token,
    refresh_token: tokenResult.refresh_token,
    expires_in: tokenResult.expires_in,
    token_type: tokenResult.token_type,
  }

  const user = await loadUser(backend, as, tokens, tokenResult)
  const sessionId = randomBytes(24).toString('base64url')
  const now = Date.now()
  await getTokenStore().write({
    sessionId,
    user,
    refreshToken: tokens.refresh_token ?? '',
    idToken: tokens.id_token,
    accessToken: tokens.access_token,
    accessTokenExpiresAt: tokens.access_token
      ? now + Math.max(60, tokens.expires_in ?? 3600) * 1000
      : undefined,
    version: 1,
    createdAt: now,
    updatedAt: now,
  })

  return redirect(tx.next || '/', [
    clearCookie(TX_COOKIE),
    await sealSessionCookie(sessionId),
  ])
}

async function loadUser(
  backend: StartAuthBackend,
  as: oauth.AuthorizationServer,
  tokens: OidcTokens,
  tokenResponse?: oauth.TokenEndpointResponse,
): Promise<StartAuthUser> {
  let claims: Record<string, unknown> = {}

  if (tokens.id_token && tokenResponse) {
    const idClaims = oauth.getValidatedIdTokenClaims(tokenResponse)
    if (idClaims) {
      claims = { ...idClaims }
    }
  }

  if (tokens.access_token && as.userinfo_endpoint) {
    const client = oauthClient(backend)
    const userinfoResponse = await oauth.userInfoRequest(
      as,
      client,
      tokens.access_token,
      devOptions(),
    )
    const expectedSubject = (claims.sub as string) || oauth.skipSubjectCheck
    const userinfoClaims = await oauth.processUserInfoResponse(
      as,
      client,
      expectedSubject,
      userinfoResponse,
    )
    claims = { ...claims, ...userinfoClaims }
  }

  return extractUser(claims)
}

async function handleLogout(request: Request): Promise<Response> {
  const url = new URL(request.url)
  const backend = getStartAuthBackend()
  const next = safeNext(request, url.searchParams.get('next'))
  const session = await readSessionCookie(request)
  const tokenRecord = session
    ? await getTokenStore().read(session.sessionId)
    : null
  if (session) {
    await getTokenStore().delete(session.sessionId)
  }

  const clearedCookie = clearCookie(SESSION_COOKIE)
  if (backend.oidc && tokenRecord?.idToken) {
    const as = await discoverAuthServer(backend)
    if (as.end_session_endpoint) {
      const logoutUrl = new URL(as.end_session_endpoint)
      logoutUrl.searchParams.set('id_token_hint', tokenRecord.idToken)
      logoutUrl.searchParams.set(
        'post_logout_redirect_uri',
        `${requestOrigin(request)}${next}`,
      )
      return redirect(logoutUrl.toString(), [clearedCookie])
    }
  }

  return redirect(next, [clearedCookie])
}

async function handleSession(request: Request): Promise<Response> {
  const mode = getAuthMode()
  if (mode === 'dev') {
    return json(publicSession(devUser()))
  }
  if (mode === 'session') {
    return json(publicSession(null))
  }

  const session = await readSessionCookie(request)
  const tokenRecord = session
    ? await getTokenStore().read(session.sessionId)
    : null
  if (session && !tokenRecord) {
    return json(publicSession(null), {}, [clearCookie(SESSION_COOKIE)])
  }
  return json(publicSession(tokenRecord?.user ?? null))
}

export async function authenticateBrowserRequest(
  request: Request,
): Promise<StartAuthContext | null> {
  const mode = getAuthMode()
  if (mode === 'dev') {
    return { kind: 'dev', user: devUser() }
  }
  if (mode === 'session') {
    return null
  }

  const session = await readSessionCookie(request)
  if (!session) {
    return null
  }

  const record = await getTokenStore().read(session.sessionId)
  if (!record) {
    const url = new URL(request.url)
    console.warn(
      `[startAuth] Auth failed for ${url.pathname} | session record missing`,
    )
    return null
  }

  const accessToken = await getValidAccessToken(session.sessionId)
  if (!accessToken) {
    const url = new URL(request.url)
    console.warn(
      `[startAuth] Token refresh failed for ${url.pathname} | user=${record.user.sub}`,
    )
    return null
  }

  return {
    kind: 'browser',
    sessionId: session.sessionId,
    user: record.user,
    accessToken,
  }
}

export async function proxySchemaVizRequest(
  request: Request,
): Promise<Response | null> {
  const url = new URL(request.url)
  const operationPath = matchProxyPath(url.pathname)
  if (!operationPath) return null

  const authMode = getAuthMode()
  const context = await authenticateBrowserRequest(request)
  if (!context && authMode === 'oidc') {
    const staleSession = await readSessionCookie(request)
    return json(
      { detail: 'Authentication credentials were not provided.' },
      { status: 401 },
      staleSession ? [clearCookie(SESSION_COOKIE)] : [],
    )
  }

  const backend = getStartAuthBackend()
  const targetUrl = new URL(
    `${backend.backendBaseUrl}${operationPath}${url.search}`,
    request.url,
  )
  const headers = buildProxyHeaders(request.headers)
  if (context?.accessToken) {
    headers.set('authorization', `Bearer ${context.accessToken}`)
    headers.delete('cookie')
  } else if (context) {
    // Dev mode has no DOT bearer token; do not leak browser cookies upstream.
    headers.delete('cookie')
  }

  const init: RequestInit = {
    method: request.method,
    headers,
    redirect: 'manual',
  }
  const bodyBuffer =
    request.method !== 'GET' && request.method !== 'HEAD'
      ? await request.arrayBuffer()
      : null
  if (bodyBuffer) {
    init.body = bodyBuffer
  }

  const response = await fetch(targetUrl, init)
  if (
    response.status === 401 &&
    context?.kind === 'browser' &&
    context.sessionId
  ) {
    await invalidateAccessToken(context.sessionId)
    const refreshedAccessToken = await getValidAccessToken(context.sessionId)
    if (refreshedAccessToken) {
      headers.set('authorization', `Bearer ${refreshedAccessToken}`)
      const retryResponse = await fetch(targetUrl, {
        ...init,
        headers,
        body: bodyBuffer ?? undefined,
      })
      return new Response(retryResponse.body, {
        status: retryResponse.status,
        statusText: retryResponse.statusText,
        headers: filterResponseHeaders(retryResponse.headers),
      })
    }
  }

  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers: filterResponseHeaders(response.headers),
  })
}

function matchProxyPath(pathname: string): string | null {
  if (pathname === '/schema-viz' || pathname.startsWith('/schema-viz/')) {
    return pathname.slice('/schema-viz'.length) || '/'
  }
  return null
}

function buildProxyHeaders(input: Headers): Headers {
  const headers = new Headers()
  input.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (['host', 'connection', 'content-length'].includes(lower)) return
    headers.set(key, value)
  })
  headers.set('accept', input.get('accept') ?? 'application/json')
  return headers
}

function filterResponseHeaders(input: Headers): Headers {
  const headers = new Headers()
  input.forEach((value, key) => {
    const lower = key.toLowerCase()
    if (['connection', 'content-encoding', 'transfer-encoding'].includes(lower))
      return
    headers.set(key, value)
  })
  return headers
}

export function __setStartAuthTestOverrides(overrides: {
  tokenStore?: StartAuthTokenStore | null
  oauth?: OAuthOverrides
}): void {
  tokenStoreOverride = overrides.tokenStore ?? null
  oauthOverrides = overrides.oauth ?? {}
  authServerCache.clear()
  sessionLocks.clear()
  resetDefaultStartAuthTokenStoreForTests()
}

export async function __createStartAuthSessionCookieForTests(
  sessionId: string,
): Promise<string> {
  return sealSessionCookie(sessionId)
}
