import { redirect } from '@sveltejs/kit'
import { authorizeUrl, FLOW_COOKIE, FLOW_SECONDS, issuerOf, startFlow } from '$lib/server/central'
import { cookieOptions, seal } from '$lib/server/session'
import type { RequestHandler } from './$types'

/** Sends the person to central to sign in, unless they already are. The flow waits in a short sealed cookie. */
export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  if (locals.session) redirect(303, '/access')
  const { issuer, sessionKey } = issuerOf(locals.env)
  const flow = await startFlow(locals.env, issuer, url.origin)
  cookies.set(FLOW_COOKIE, await seal(sessionKey, FLOW_COOKIE, flow, FLOW_SECONDS), {
    ...cookieOptions(url),
    path: '/auth',
    maxAge: FLOW_SECONDS,
  })
  redirect(303, await authorizeUrl(issuer, url.origin, flow))
}
