import type { LayoutServerLoad } from './$types'

/** Whether someone is signed in, so the header offers their access page instead of signing in. */
export const load: LayoutServerLoad = ({ locals }) => ({ signedIn: locals.session !== undefined })
