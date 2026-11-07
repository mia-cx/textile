import { error } from '@sveltejs/kit'

// Sign-in goes through central, the relay's OAuth issuer, exactly as `scripts/login.mjs` does: dynamic client
// registration, the authorization code flow with S256 PKCE, and central's `mcp` scope and resource. Central signs the
// person in with Discord and checks its allowlist, so the site needs neither a Discord application nor an access list.

/** Holds the sign-in's state, PKCE verifier, and client registration between leaving for central and coming back. */
export const FLOW_COOKIE = 'textile_oauth'
export const FLOW_SECONDS = 600

/** What the flow cookie holds, sealed under `SESSION_KEY`. */
export interface Flow {
  readonly state: string
  readonly verifier: string
  readonly clientId: string
}

/** Central sends the person back here: `https://textile.cx/auth/callback`, or the same path on another origin. */
export const callbackUrl = (origin: string) => `${origin}/auth/callback`

/** Central's origin and the key that seals the sign-in cookies. Sign-in is off until both are set. */
export function signInConfig(env: Env) {
  if (!env.CENTRAL_URL || !env.SESSION_KEY) error(503, 'Sign-in is not available on this site yet.')
  return { issuer: new URL(env.CENTRAL_URL).origin, sessionKey: env.SESSION_KEY }
}

/**
 * A request to central. Self-hosted, the `CENTRAL` binding reaches it inside the cluster under its public URL; on
 * Cloudflare, the request goes out to that URL.
 */
const toCentral = (env: Env, url: string, init: RequestInit) =>
  (env.CENTRAL ? env.CENTRAL.fetch(url, init) : fetch(url, init)).catch(() =>
    error(502, UNAVAILABLE),
  )

const UNAVAILABLE = 'Sign-in is unavailable right now. Try again in a minute.'

const base64url = (bytes: Uint8Array) =>
  btoa(String.fromCharCode(...bytes))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')

/** A new sign-in: a client registration for this origin's callback, a state, and a PKCE verifier. */
export async function startFlow(env: Env, issuer: string, origin: string): Promise<Flow> {
  const registration = await toCentral(env, `${issuer}/register`, {
    method: 'POST',
    headers: { 'content-type': 'application/json' },
    body: JSON.stringify({
      client_name: 'Textile',
      redirect_uris: [callbackUrl(origin)],
      token_endpoint_auth_method: 'none',
      grant_types: ['authorization_code'],
      response_types: ['code'],
    }),
  })
  if (!registration.ok) error(502, UNAVAILABLE)
  const { client_id } = (await registration.json()) as { client_id: string }
  return {
    state: crypto.randomUUID(),
    verifier: base64url(crypto.getRandomValues(new Uint8Array(32))),
    clientId: client_id,
  }
}

/** Central's authorization page for `flow`. */
export async function authorizeUrl(issuer: string, origin: string, flow: Flow) {
  const digest = await crypto.subtle.digest('SHA-256', new TextEncoder().encode(flow.verifier))
  const query = new URLSearchParams({
    response_type: 'code',
    client_id: flow.clientId,
    redirect_uri: callbackUrl(origin),
    code_challenge: base64url(new Uint8Array(digest)),
    code_challenge_method: 'S256',
    scope: 'mcp',
    resource: `${issuer}/mcp`,
    state: flow.state,
  })
  return `${issuer}/authorize?${query}`
}

/** Trades the callback's code for central's access token, and how many seconds it lasts. */
export async function redeem(env: Env, issuer: string, origin: string, flow: Flow, code: string) {
  const response = await toCentral(env, `${issuer}/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(origin),
      client_id: flow.clientId,
      code_verifier: flow.verifier,
      resource: `${issuer}/mcp`,
    }),
  })
  if (!response.ok) error(400, 'Sign-in failed. Try signing in again.')
  const { access_token, expires_in } = (await response.json()) as {
    access_token: string
    expires_in: number
  }
  return { token: access_token, seconds: expires_in }
}
