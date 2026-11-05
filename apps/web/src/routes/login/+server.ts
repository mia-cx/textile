import { redirect } from '@sveltejs/kit'
import { authorizeUrl, STATE_COOKIE, STATE_SECONDS } from '$lib/server/discord'
import { cookieOptions } from '$lib/server/session'
import type { RequestHandler } from './$types'

/** Sends the person to Discord to sign in, unless they already are. The state waits in a short cookie for the callback. */
export const GET: RequestHandler = ({ url, cookies, locals }) => {
  if (locals.session) redirect(303, '/access')
  const state = crypto.randomUUID()
  cookies.set(STATE_COOKIE, state, { ...cookieOptions(url), path: '/auth', maxAge: STATE_SECONDS })
  redirect(303, authorizeUrl(locals.env, url.origin, state))
}
