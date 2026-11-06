import type { PageServerLoad } from './$types'

/** Whether someone is signed in, and whether central let them in. Per person, so never cached. */
export const load: PageServerLoad = ({ locals, setHeaders }) => {
  setHeaders({ 'cache-control': 'private, no-store' })
  return { signedIn: locals.session !== undefined, access: locals.session?.access ?? false }
}
