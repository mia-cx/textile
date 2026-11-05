import { error } from '@sveltejs/kit'

// Sign in with Discord: OAuth2's authorization code flow with the `identify` scope, run in the Worker with Textile's
// application. The site needs only the person's Discord ID and username.

/** Holds the OAuth state between leaving for Discord and coming back. */
export const STATE_COOKIE = 'textile_oauth'
export const STATE_SECONDS = 600

/** Discord sends the person back here: `https://textile.cx/auth/callback`, or the same path on a preview origin. */
export const callbackUrl = (origin: string) => `${origin}/auth/callback`

export function authorizeUrl(env: Env, origin: string, state: string) {
  const query = new URLSearchParams({
    client_id: env.DISCORD_CLIENT_ID,
    response_type: 'code',
    scope: 'identify',
    redirect_uri: callbackUrl(origin),
    state,
  })
  return `${env.DISCORD_URL}/oauth2/authorize?${query}`
}

/** Trades the callback's code for the Discord user who signed in. */
export async function signedInUser(env: Env, origin: string, code: string) {
  if (!env.DISCORD_CLIENT_SECRET) error(503, 'Sign-in isn’t set up here yet.')
  const token = await fetch(`${env.DISCORD_URL}/api/v10/oauth2/token`, {
    method: 'POST',
    headers: { 'content-type': 'application/x-www-form-urlencoded' },
    body: new URLSearchParams({
      grant_type: 'authorization_code',
      code,
      redirect_uri: callbackUrl(origin),
      client_id: env.DISCORD_CLIENT_ID,
      client_secret: env.DISCORD_CLIENT_SECRET,
    }),
  })
  if (!token.ok) error(400, 'Discord didn’t accept the sign-in. Try signing in again.')
  const { access_token } = (await token.json()) as { access_token: string }
  const me = await fetch(`${env.DISCORD_URL}/api/v10/users/@me`, {
    headers: { authorization: `Bearer ${access_token}` },
  })
  if (!me.ok) error(502, 'Discord didn’t say who signed in. Try signing in again.')
  const { id, username } = (await me.json()) as { id: string; username: string }
  return { id, username }
}
