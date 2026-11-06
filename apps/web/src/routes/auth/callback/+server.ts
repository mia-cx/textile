import { error, redirect } from '@sveltejs/kit'
import { STATE_COOKIE, signedInUser } from '$lib/server/discord'
import { cookieOptions, writeSession } from '$lib/server/session'
import type { RequestHandler } from './$types'

/** Discord sends the person back here. A matching state proves this browser started the sign-in. */
export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  const env = locals.env
  const state = cookies.get(STATE_COOKIE)
  cookies.delete(STATE_COOKIE, { ...cookieOptions(url), path: '/auth' })
  const code = url.searchParams.get('code')
  // Declined on Discord's page, or a stale or forged callback: back to where signing in starts.
  if (!code || !state || url.searchParams.get('state') !== state) redirect(303, '/access')
  if (!env.SESSION_KEY) error(503, 'Sign-in isn’t set up here yet.')
  await writeSession(cookies, url, env.SESSION_KEY, await signedInUser(env, url.origin, code))
  redirect(303, '/access')
}
