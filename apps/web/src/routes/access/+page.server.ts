import { hasAccess } from '$lib/server/session'
import type { PageServerLoad } from './$types'

/** Who is signed in, and whether the access list names them. Per person, so never cached. */
export const load: PageServerLoad = ({ locals, setHeaders }) => {
  setHeaders({ 'cache-control': 'private, no-store' })
  const session = locals.session
  return {
    username: session?.username,
    access: session ? hasAccess(locals.env.ACCESS_LIST, session.id) : false,
  }
}
