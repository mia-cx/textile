import { redirect } from '@sveltejs/kit'
import { endSession } from '$lib/server/session'
import type { RequestHandler } from './$types'

/** Signs out: a form POST, so SvelteKit's origin check stops other sites from signing people out. */
export const POST: RequestHandler = ({ url, cookies }) => {
  endSession(cookies, url)
  redirect(303, '/')
}
