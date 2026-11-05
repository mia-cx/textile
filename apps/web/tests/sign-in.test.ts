import { afterEach, describe, expect, it, vi } from 'vitest'
import { cookiesOf, MEMBER, ORIGIN, request } from './server.ts'

const OUTSIDER = '222222222222222222'

/** Discord's OAuth token and user endpoints, faked. Any other request fails the test. */
function fakeDiscord(userId: string) {
  const calls: Array<string> = []
  vi.stubGlobal('fetch', async (input: Request | URL | string, init?: RequestInit) => {
    const url = new URL(input instanceof Request ? input.url : input)
    calls.push(url.pathname)
    if (url.origin !== 'https://discord.test') throw new Error(`Unexpected request to ${url}`)
    if (url.pathname === '/api/v10/oauth2/token') {
      const body = new URLSearchParams(String(init?.body))
      expect(body.get('code')).toBe('the-code')
      expect(body.get('redirect_uri')).toBe(`${ORIGIN}/auth/callback`)
      return Response.json({ access_token: 'discord-access-token', token_type: 'Bearer' })
    }
    if (url.pathname === '/api/v10/users/@me') {
      expect(new Headers(init?.headers).get('authorization')).toBe('Bearer discord-access-token')
      return Response.json({ id: userId, username: userId === MEMBER ? 'mia' : 'ada' })
    }
    return new Response(null, { status: 404 })
  })
  return calls
}

/** Signs in through /login and Discord's callback, as a browser does; returns the session cookie. */
async function signIn(userId: string) {
  fakeDiscord(userId)
  const start = await request('/login')
  expect(start.status).toBe(303)
  const authorize = new URL(start.headers.get('location')!)
  const callback = await request(
    `/auth/callback?code=the-code&state=${authorize.searchParams.get('state')}`,
    {
      headers: { cookie: cookiesOf(start) },
    },
  )
  expect(callback.status).toBe(303)
  expect(callback.headers.get('location')).toBe('/access')
  return cookiesOf(callback)
}

const accessPage = async (cookie: string) =>
  (await request('/access', { headers: { cookie } })).text()

afterEach(() => vi.unstubAllGlobals())

describe('Sign in with Discord', () => {
  it('sends people to Discord for the identify scope, with a state only their browser holds', async () => {
    const response = await request('/login')
    const authorize = new URL(response.headers.get('location')!)
    expect(authorize.origin + authorize.pathname).toBe('https://discord.test/oauth2/authorize')
    expect(Object.fromEntries(authorize.searchParams)).toMatchObject({
      client_id: '1162037890742759424',
      scope: 'identify',
      response_type: 'code',
      redirect_uri: `${ORIGIN}/auth/callback`,
    })
    const [cookie] = response.headers.getSetCookie()
    expect(cookie).toContain(`textile_oauth=${authorize.searchParams.get('state')}`)
    expect(cookie).toMatch(/HttpOnly/i)
  })

  it('lets someone on the access list in, and points them at the connect docs', async () => {
    const session = await signIn(MEMBER)
    expect(session).toMatch(/textile_session=/)
    const page = await accessPage(session)
    expect(page).toContain('You’re in')
    expect(page).toContain('href="/docs/connecting/"')
  })

  it('tells someone not on the list they don’t have access yet, and where to follow progress', async () => {
    const page = await accessPage(await signIn(OUTSIDER))
    expect(page).toContain('You don’t have access yet')
    expect(page).toContain('Join the Discord server')
    expect(page).not.toContain('You’re in')
  })

  it('keeps the session in an encrypted, HttpOnly cookie that reveals nothing', async () => {
    fakeDiscord(MEMBER)
    const start = await request('/login')
    const state = new URL(start.headers.get('location')!).searchParams.get('state')
    const callback = await request(`/auth/callback?code=the-code&state=${state}`, {
      headers: { cookie: cookiesOf(start) },
    })
    const session = callback.headers
      .getSetCookie()
      .find((cookie) => cookie.startsWith('textile_session='))!
    expect(session).toMatch(/HttpOnly/i)
    expect(session).toMatch(/Secure/i)
    expect(session).toMatch(/SameSite=Lax/i)
    expect(session).not.toContain(MEMBER)
    expect(
      Buffer.from(session.split('=')[1]!.split(';')[0]!, 'base64url').toString('latin1'),
    ).not.toContain('mia')
  })

  it('refuses a callback whose state this browser didn’t start, without asking Discord', async () => {
    const calls = fakeDiscord(MEMBER)
    const start = await request('/login')
    const callback = await request('/auth/callback?code=the-code&state=forged', {
      headers: { cookie: cookiesOf(start) },
    })
    expect(callback.status).toBe(303)
    expect(
      callback.headers
        .getSetCookie()
        .some(
          (cookie) =>
            cookie.startsWith('textile_session=') && !cookie.startsWith('textile_session=;'),
        ),
    ).toBe(false)
    expect(calls).toEqual([])
  })

  it('treats a tampered session cookie as signed out', async () => {
    const value = (await signIn(MEMBER)).match(/textile_session=([^;]+)/)![1]!
    const middle = Math.floor(value.length / 2)
    const flipped = value[middle] === 'A' ? 'B' : 'A'
    const tampered = `textile_session=${value.slice(0, middle)}${flipped}${value.slice(middle + 1)}`
    expect(await accessPage(tampered)).toContain('Sign in to Textile')
  })
})
