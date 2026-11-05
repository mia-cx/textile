import { redirect } from '@sveltejs/kit'
import { pageOf } from '$lib/markdown-paths'
import { DOCS_BASE } from '$lib/server/docs'
import type { RequestHandler } from './$types'

/** Svartz writes each docs page at `<path>/index.html`, and the assets redirect to the slash; keep URLs as they come. */
export const trailingSlash = 'ignore'

/**
 * The docs site: apps/docs builds it and the web build copies it into the Worker's assets under /docs. Its files come
 * through this route rather than straight from the assets (`run_worker_first` in wrangler.jsonc), so the hook can
 * answer agents with Markdown. An unknown path gets the docs' own 404 page.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const assets = locals.env.ASSETS
  // The home page's relative links need the slash.
  if (url.pathname === DOCS_BASE) redirect(308, `${DOCS_BASE}/`)
  // A `.md` request lands here only for a page without a note (a listing such as /docs/feed); the hook converts its HTML.
  const page = pageOf(url.pathname)
  const asset = await assets.fetch(new URL(page === null ? url.pathname : `${page}/`, url))
  if (asset.status !== 404) return new Response(asset.body, asset)
  // The assets serve `404.html` at `/404`, like every HTML file without its extension.
  const notFound = await assets.fetch(new URL(`${DOCS_BASE}/404`, url))
  return new Response(notFound.body, { status: 404, headers: notFound.headers })
}
