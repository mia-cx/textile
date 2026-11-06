import { docsPages } from '$lib/server/docs'
import { ORIGIN, PAGES } from '$lib/site'
import type { RequestHandler } from './$types'

/** Indexable pages: the site's public pages, then every docs note. The access page is per person, so it stays out. */
export const GET: RequestHandler = async ({ url, locals }) => {
  const docs = await docsPages(locals.env.ASSETS, url)
  const paths = [
    ...PAGES.filter(({ path }) => path !== '/access').map(({ path }) => path),
    ...docs.map(({ path }) => `${path}/`),
  ]
  const body = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${paths.map((path) => `  <url><loc>${ORIGIN}${path}</loc></url>`).join('\n')}
</urlset>
`
  return new Response(body, { headers: { 'content-type': 'application/xml; charset=utf-8' } })
}
