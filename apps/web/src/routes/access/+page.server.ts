import type { PageServerLoad } from './$types'

/**
 * Whether central let this person in, or just turned them away (`?denied`, from the sign-in callback). Per person, so
 * never cached.
 */
export const load: PageServerLoad = ({ locals, url, setHeaders }) => {
  setHeaders({ 'cache-control': 'private, no-store' })
  return { signedIn: locals.session !== undefined, denied: url.searchParams.has('denied') }
}
