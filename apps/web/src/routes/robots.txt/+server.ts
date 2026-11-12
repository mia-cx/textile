import { ORIGIN } from '$lib/site'
import type { RequestHandler } from './$types'

/**
 * Everything public may be crawled, by search engines and AI agents alike. Sign-in routes are actions, not pages. Only
 * textile.cx is indexed: a preview names no sitemap and asks crawlers to stay out.
 */
export const GET: RequestHandler = ({ url }) => {
  const body =
    url.origin === ORIGIN
      ? `User-agent: *\nDisallow: /login\nDisallow: /auth/\nDisallow: /access\n\nSitemap: ${ORIGIN}/sitemap.xml\n`
      : 'User-agent: *\nDisallow: /\n'
  return new Response(body, { headers: { 'content-type': 'text/plain; charset=utf-8' } })
}
