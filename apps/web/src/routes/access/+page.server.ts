import type { PageServerLoad } from './$types'

/**
 * Whether central let this person in, or turned them away: `?waitlist` after adding them to the community server's
 * waitlist, `?denied` otherwise. Both come from the sign-in callback. Per person, so never cached.
 */
export const load: PageServerLoad = ({ locals, url, setHeaders }) => {
  setHeaders({ 'cache-control': 'private, no-store' })
  return {
    signedIn: locals.session !== undefined,
    waitlist: url.searchParams.has('waitlist'),
    denied: url.searchParams.has('denied'),
  }
}
