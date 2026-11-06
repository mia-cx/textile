import type { Reroute } from '@sveltejs/kit'
import { pageOf } from '$lib/markdown-paths'

/** `<path>.md` renders the page at `<path>`; `hooks.server.ts` turns it into Markdown. */
export const reroute: Reroute = ({ url }) => pageOf(url.pathname) ?? undefined
