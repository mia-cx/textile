import { createHash } from 'node:crypto'
import { Redacted } from 'effect'
import { expect } from 'vitest'
import { createExecutor, type ExecutorOptions, type RelayConfig } from '../src/relay.ts'

export const config: RelayConfig = {
  allowedHosts: ['relay.test'],
  allowedOrigins: ['https://relay.test'],
  login: {
    publicBaseUrl: 'https://relay.test',
    clientId: '123456789012345678',
    clientSecret: Redacted.make('test-client-secret'),
    encryptionKey: Redacted.make(Buffer.alloc(32, 7).toString('base64')),
  },
}

export const BOT_ID = '345678901234567890'

/** The community server sign-in adds people to, with its bot and Waitlist role. */
export const community = {
  guildId: '456789012345678901',
  botToken: Redacted.make('private-community-bot-token'),
  waitlistRoleId: '567890123456789012',
}

/** A bot token in Discord's shape: its first segment is the bot's ID in base64. */
export const botToken = (botId = BOT_ID, secret = 'private-bot-secret') =>
  `${Buffer.from(botId).toString('base64url')}.${secret}`

/** Run requests in this process, with Discord REST replaced by `restLayer`. */
export const executor = (
  restLayer?: ExecutorOptions['restLayer'],
  options: Omit<ExecutorOptions, 'rest' | 'restLayer'> = {},
) =>
  createExecutor({
    rest: { timeoutMs: 1000, retries: 0, maxRateLimitWaitMs: 1000 },
    ...(restLayer === undefined ? {} : { restLayer }),
    ...options,
  })

/**
 * Fake only Discord's external OAuth endpoints and the community server's member endpoints; the
 * issuer, crypto, browser checks and MCP are real. Refreshes rotate like Discord's: a refresh token
 * works once and revokes its access token.
 */
export const discordOAuth = () => {
  const state = {
    revoked: false,
    applicationId: config.login.clientId,
    userId: '234567890123456789',
    status: 200,
    /** The scopes Discord grants, as its token response lists them. */
    scope: 'identify',
    /** What the community server's member endpoints answer with when not 200. */
    guildStatus: 200,
    /** Answers the member endpoints give, in order, before answering as above. */
    guildReplies: [] as Array<Response>,
  }
  /** The community server's members, by user ID, with their roles. */
  const members = new Map<string, Set<string>>()
  const calls: Array<{ path: string; init: RequestInit | undefined }> = []
  /** Live refresh token → the access token it revokes when spent. */
  const grants = new Map<string, string>()
  const live = new Set<string>()
  let issued = 0
  const memberPath = new RegExp(
    `/guilds/${community.guildId}/members/(\\d+)(?:/roles/${community.waitlistRoleId})?$`,
  )
  /** Discord's add-member and add-role endpoints, as the community bot meets them. */
  const addMember = (userId: string, path: string, init: RequestInit) => {
    const bot = `Bot ${Redacted.value(community.botToken)}`
    if (new Headers(init.headers).get('authorization') !== bot)
      return Response.json({ message: '401: Unauthorized', code: 0 }, { status: 401 })
    const scripted = state.guildReplies.shift()
    if (scripted !== undefined) return scripted
    if (state.guildStatus !== 200)
      return Response.json(
        { message: 'Missing Permissions', code: 50013 },
        { status: state.guildStatus },
      )
    const roles = members.get(userId)
    if (path.includes('/roles/')) {
      if (roles === undefined) return Response.json({ message: 'Unknown Member' }, { status: 404 })
      roles.add(community.waitlistRoleId)
      return new Response(null, { status: 204 })
    }
    // Discord ignores `roles` for someone already in the server.
    if (roles !== undefined) return new Response(null, { status: 204 })
    const body: { access_token: string; roles: Array<string> } = JSON.parse(String(init.body))
    if (!live.has(body.access_token))
      return Response.json({ message: 'Invalid OAuth2 access token' }, { status: 403 })
    members.set(userId, new Set(body.roles))
    return Response.json({ user: { id: userId }, roles: body.roles }, { status: 201 })
  }
  const network: typeof fetch = async (input, init) => {
    const path = new URL(String(input)).pathname
    // Like fetch, an aborted request never reaches Discord.
    init?.signal?.throwIfAborted()
    calls.push({ path, init })
    if (state.revoked) return Response.json({ error: 'invalid_token' }, { status: 401 })
    if (state.status !== 200) return Response.json({}, { status: state.status })
    if (path.endsWith('/oauth2/token')) {
      const body = new URLSearchParams(String(init?.body))
      if (body.get('grant_type') === 'refresh_token') {
        const spent = grants.get(body.get('refresh_token') ?? '')
        if (spent === undefined) return Response.json({ error: 'invalid_grant' }, { status: 400 })
        grants.delete(body.get('refresh_token') ?? '')
        live.delete(spent)
      }
      issued += 1
      const access = `private-discord-user-access-${issued}`
      const refresh = `private-discord-user-refresh-${issued}`
      grants.set(refresh, access)
      live.add(access)
      return Response.json({
        access_token: access,
        refresh_token: refresh,
        token_type: 'Bearer',
        scope: state.scope,
        expires_in: 604800,
      })
    }
    const member = memberPath.exec(path)?.[1]
    if (member !== undefined && init?.method === 'PUT') return addMember(member, path, init)
    if (path.endsWith('/oauth2/@me')) {
      const bearer = new Headers(init?.headers).get('authorization')?.replace(/^Bearer /, '')
      if (!live.has(bearer ?? '')) return Response.json({ message: '401' }, { status: 401 })
      return Response.json({
        application: { id: state.applicationId },
        user: { id: state.userId },
        scopes: ['identify'],
        expires: new Date(Date.now() + 604800_000).toISOString(),
      })
    }
    throw new Error(`Unexpected Discord request: ${path}`)
  }
  return { state, calls, members, fetch: network }
}

type Relay = { fetch: (request: Request) => Promise<Response> }
/** `origin` is the relay's configured public origin. */
export const beginLogin = async (relay: Relay, origin = config.login.publicBaseUrl) => {
  const redirect = 'http://127.0.0.1:45678/callback'
  const registered = await relay.fetch(
    new Request(`${origin}/register`, {
      method: 'POST',
      headers: { 'content-type': 'application/json' },
      body: JSON.stringify({
        client_name: 'Test MCP client',
        redirect_uris: [redirect],
        grant_types: ['authorization_code', 'refresh_token'],
      }),
    }),
  )
  expect(registered.status).toBe(201)
  const clientId: string = (await registered.json()).client_id
  const verifier = 'v'.repeat(43)
  const authorize = new URL(`${origin}/authorize`)
  authorize.search = new URLSearchParams({
    client_id: clientId,
    redirect_uri: redirect,
    response_type: 'code',
    code_challenge_method: 'S256',
    scope: 'mcp',
    resource: `${origin}/mcp`,
    code_challenge: createHash('sha256').update(verifier).digest('base64url'),
    state: 'client-state',
  }).toString()
  const consent = await relay.fetch(new Request(authorize))
  expect(consent.status).toBe(200)
  const cookie = consent.headers.get('set-cookie')?.split(';')[0] ?? ''
  const html = await consent.text()
  const flow = /name="flow" value="([^"]+)"/.exec(html)?.[1] ?? ''
  return { origin, clientId, verifier, redirect, cookie, flow, authorize, html }
}

export const finishLogin = async (
  relay: Relay,
  started: Awaited<ReturnType<typeof beginLogin>>,
) => {
  const { origin } = started
  const consent = await relay.fetch(
    new Request(`${origin}/authorize`, {
      method: 'POST',
      headers: { cookie: started.cookie, origin },
      body: new URLSearchParams({ flow: started.flow, decision: 'allow' }),
    }),
  )
  expect(consent.status).toBe(302)
  const discordUrl = new URL(consent.headers.get('location') ?? '')
  const callback = new URL(`${origin}/auth/discord/callback`)
  callback.search = new URLSearchParams({
    state: discordUrl.searchParams.get('state') ?? '',
    code: 'discord-single-use-code',
    iss: 'https://discord.com',
  }).toString()
  const completed = await relay.fetch(
    new Request(callback, { headers: { cookie: started.cookie } }),
  )
  expect(completed.status).toBe(302)
  const destination = new URL(completed.headers.get('location') ?? '')
  expect(destination.searchParams.get('state')).toBe('client-state')
  expect(destination.searchParams.get('iss')).toBe(origin)
  const params = {
    grant_type: 'authorization_code',
    code: destination.searchParams.get('code') ?? '',
    code_verifier: started.verifier,
    client_id: started.clientId,
    redirect_uri: started.redirect,
    resource: `${origin}/mcp`,
  }
  return { params, discordUrl, callback, destination }
}

export const redeem = (
  relay: Relay,
  params: Record<string, string>,
  origin = config.login.publicBaseUrl,
) =>
  relay.fetch(
    new Request(`${origin}/token`, {
      method: 'POST',
      body: new URLSearchParams(params),
    }),
  )

export const login = async (relay: Relay, origin = config.login.publicBaseUrl) => {
  const started = await beginLogin(relay, origin)
  const finished = await finishLogin(relay, started)
  const response = await redeem(relay, finished.params, origin)
  expect(response.status).toBe(200)
  const tokens: { access_token: string; refresh_token: string } = await response.json()
  return { ...started, ...finished, tokens }
}
