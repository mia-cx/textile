import { error } from '@sveltejs/kit'
import { dev } from '$app/environment'
import type { PageLoad } from './$types'

/** The mark's study page exists only in development, where `pnpm logo` renders the icons from it. */
export const load: PageLoad = () => {
  if (!dev) error(404, 'Not found')
}
