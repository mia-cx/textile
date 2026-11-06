import { redirect } from '@sveltejs/kit'
import { pageOf } from '$lib/markdown-paths'
import { DOCS_BASE } from '$lib/server/docs'
import type { RequestHandler } from './$types'

/** Svartz writes each docs page at `<path>/index.html`; this route adds the slash itself, below. */
export const trailingSlash = 'ignore'

/** A path with a file extension: an asset, not a page. */
const FILE = /\.[a-z0-9]+$/i

/**
 * The docs site: apps/docs builds it and the web build copies it into the Worker's assets under /docs. Its files come
 * through this route rather than straight from the assets (`run_worker_first` in wrangler.jsonc), so the hook can
 * answer agents with Markdown. An unknown path gets the docs' own 404 page.
 */
export const GET: RequestHandler = async ({ url, locals }) => {
  const assets = locals.env.ASSETS
  // A page's relative links and assets need the slash. `ASSETS.fetch` follows the assets' own redirect to it, so the
  // browser would never see one: a page without its slash would load and then miss its styles and scripts.
  if (!url.pathname.endsWith('/') && !FILE.test(url.pathname))
    redirect(308, `${url.pathname}/${url.search}`)
  // A `.md` request lands here only for a page without a note (a listing such as /docs/feed); the hook converts its HTML.
  const page = pageOf(url.pathname)
  const asset = await assets.fetch(new URL(page === null ? url.pathname : `${page}/`, url))
  if (asset.status !== 404) return new Response(asset.body, asset)
  // The assets serve `404.html` at `/404`, like every HTML file without its extension.
  const notFound = await assets.fetch(new URL(`${DOCS_BASE}/404`, url))
  return new Response(notFound.body, { status: 404, headers: notFound.headers })
}
