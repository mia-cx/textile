import { createHash } from 'node:crypto'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { CENTRAL, cookiesOf, ORIGIN, request } from './server.ts'

const CLIENT_ID = 'registered-client'
const ACCESS_TOKEN = 'central-access-token'

/**
 * Central's registration and token endpoints, faked as `scripts/login.mjs` meets them. The token endpoint accepts
 * only the code it issued, with the verifier behind the challenge `/authorize` received. Any other request fails.
 */
function fakeCentral() {
  const calls: Array<string> = []
  let challenge: string | undefined
  vi.stubGlobal('fetch', async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    calls.push(url.pathname)
    if (url.origin !== CENTRAL) throw new Error(`Unexpected request to ${url}`)
    if (url.pathname === '/register') {
      expect(JSON.parse(String(init?.body))).toMatchObject({
        redirect_uris: [`${ORIGIN}/auth/callback`],
        token_endpoint_auth_method: 'none',
      })
      return Response.json({ client_id: CLIENT_ID }, { status: 201 })
    }
    if (url.pathname === '/token') {
      const body = new URLSearchParams(String(init?.body))
      const verifier = body.get('code_verifier') ?? ''
      const bound =
        body.get('grant_type') === 'authorization_code' &&
        body.get('code') === 'the-code' &&
        body.get('client_id') === CLIENT_ID &&
        body.get('redirect_uri') === `${ORIGIN}/auth/callback` &&
        body.get('resource') === `${CENTRAL}/mcp` &&
        createHash('sha256').update(verifier).digest('base64url') === challenge
      if (!bound) return Response.json({ error: 'invalid_grant' }, { status: 400 })
      return Response.json({
        access_token: ACCESS_TOKEN,
        refresh_token: 'central-refresh-token',
        token_type: 'Bearer',
        expires_in: 3600,
        scope: 'mcp',
      })
    }
    return new Response(null, { status: 404 })
  })
  return {
    calls,
    /** What central's `/authorize` would remember from the browser's visit. */
    authorized: (location: URL) => {
      challenge = location.searchParams.get('code_challenge') ?? undefined
    },
  }
}

/** Starts signing in at /login, as a browser does; returns where it was sent and the flow cookie. */
async function start(central: ReturnType<typeof fakeCentral>) {
  const response = await request('/login')
  expect(response.status).toBe(303)
  const authorize = new URL(response.headers.get('location') ?? '')
  central.authorized(authorize)
  return { authorize, cookie: cookiesOf(response) }
}

/** Central's redirect back to the site, with the given answer. */
const callback = (cookie: string, params: Record<string, string>) =>
  request(`/auth/callback?${new URLSearchParams(params)}`, { headers: { cookie } })

const accessPage = async (cookie: string) =>
  (await request('/access', { headers: { cookie } })).text()

afterEach(() => vi.unstubAllGlobals())

describe('Sign in through central', () => {
  it('sends people to central with a registered client, S256 PKCE, and the mcp scope and resource', async () => {
    const { authorize, cookie } = await start(fakeCentral())
    expect(authorize.origin + authorize.pathname).toBe(`${CENTRAL}/authorize`)
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      response_type: 'code',
      client_id: CLIENT_ID,
      redirect_uri: `${ORIGIN}/auth/callback`,
      code_challenge_method: 'S256',
      scope: 'mcp',
      resource: `${CENTRAL}/mcp`,
    })
    expect(authorize.searchParams.get('code_challenge')).toMatch(/^[A-Za-z0-9_-]{43}$/)
    // The state and verifier wait sealed, so the cookie names neither.
    expect(cookie).toMatch(/^textile_oauth=/)
    expect(cookie).not.toContain(authorize.searchParams.get('state'))
  })

  it('lets in whoever central lets in, keeping its token in a sealed cookie', async () => {
    const central = fakeCentral()
    const { authorize, cookie } = await start(central)
    const response = await callback(cookie, {
      code: 'the-code',
      state: authorize.searchParams.get('state') ?? '',
      iss: CENTRAL,
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/access')
    const session = response.headers.getSetCookie().find((c) => c.startsWith('textile_session='))
    expect(session).toMatch(/HttpOnly/i)
    expect(session).toMatch(/Secure/i)
    expect(session).toMatch(/SameSite=Lax/i)
    expect(session).toMatch(/Max-Age=3600/i)
    expect(
      Buffer.from(session?.split(/[=;]/)[1] ?? '', 'base64url').toString('latin1'),
    ).not.toContain(ACCESS_TOKEN)
    const page = await accessPage(cookiesOf(response))
    expect(page).toContain('You’re in')
    expect(page).toContain('href="/docs/connecting/"')
    expect(page).toContain('Sign out')
    expect(central.calls).toEqual(['/register', '/token'])
  })

  it('tells someone central turned away that they don’t have access yet, and where to follow progress', async () => {
    const central = fakeCentral()
    const { authorize, cookie } = await start(central)
    const response = await callback(cookie, {
      error: 'access_denied',
      state: authorize.searchParams.get('state') ?? '',
      iss: CENTRAL,
    })
    const page = await accessPage(cookiesOf(response))
    expect(page).toContain('You don’t have access yet')
    expect(page).toContain('Join the Discord server')
    expect(page).not.toContain('You’re in')
    expect(central.calls).toEqual(['/register'])
  })

  // Proves a callback this browser didn't start, or that central didn't send, signs nobody in and redeems nothing.
  it.each([
    ['a state this browser didn’t start', { state: 'forged', iss: CENTRAL }],
    ['another issuer', { iss: 'https://evil.test' }],
  ])('refuses a callback with %s', async (_, params) => {
    const central = fakeCentral()
    const { authorize, cookie } = await start(central)
    const response = await callback(cookie, {
      code: 'the-code',
      state: authorize.searchParams.get('state') ?? '',
      ...params,
    })
    expect(response.status).toBe(303)
    expect(response.headers.get('location')).toBe('/access')
    expect(await accessPage(cookiesOf(response))).toContain('Sign in to Textile')
    expect(central.calls).toEqual(['/register'])
  })

  it('treats a tampered session cookie as signed out', async () => {
    const central = fakeCentral()
    const { authorize, cookie } = await start(central)
    const response = await callback(cookie, {
      code: 'the-code',
      state: authorize.searchParams.get('state') ?? '',
      iss: CENTRAL,
    })
    const value = cookiesOf(response).match(/textile_session=([^;]+)/)?.[1] ?? ''
    const middle = Math.floor(value.length / 2)
    const flipped = value[middle] === 'A' ? 'B' : 'A'
    const tampered = `textile_session=${value.slice(0, middle)}${flipped}${value.slice(middle + 1)}`
    expect(await accessPage(tampered)).toContain('Sign in to Textile')
  })
})
