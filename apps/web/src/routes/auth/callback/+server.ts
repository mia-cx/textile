import { redirect } from '@sveltejs/kit'
import { FLOW_COOKIE, type Flow, issuerOf, redeem } from '$lib/server/central'
import { cookieOptions, unseal, writeSession } from '$lib/server/session'
import type { RequestHandler } from './$types'

/**
 * Central sends the person back here. A matching state proves this browser started the sign-in, and `iss` that
 * central answered. `access_denied` means central's allowlist doesn't name them, or they cancelled; either way nobody
 * is signed in, so they can try again.
 */
export const GET: RequestHandler = async ({ url, cookies, locals }) => {
  const { issuer, sessionKey } = issuerOf(locals.env)
  const flow = await unseal<Flow>(sessionKey, FLOW_COOKIE, cookies.get(FLOW_COOKIE))
  cookies.delete(FLOW_COOKIE, { ...cookieOptions(url), path: '/auth' })
  const params = url.searchParams
  // A stale or forged callback: back to where signing in starts.
  if (!flow || params.get('state') !== flow.state || params.get('iss') !== issuer)
    redirect(303, '/access')
  if (params.get('error') === 'access_denied') redirect(303, '/access?denied')
  const code = params.get('code')
  if (!code) redirect(303, '/access')
  const { token, seconds } = await redeem(locals.env, issuer, url.origin, flow, code)
  await writeSession(cookies, url, sessionKey, { token }, seconds)
  redirect(303, '/access')
}
