import type { Handle } from '@sveltejs/kit'
import { markdownPath, pageOf } from '$lib/markdown-paths'
import { pageToMarkdown } from '$lib/server/convert'
import { docsMarkdown } from '$lib/server/docs'
import { wantsMarkdown } from '$lib/server/negotiate'
import { readSession } from '$lib/server/session'

const MARKDOWN = 'text/markdown; charset=utf-8'
/** What decides between a page's HTML and its Markdown, so caches keep both. */
const VARY = 'Accept, User-Agent'

const isHtml = (response: Response) =>
  response.headers.get('content-type')?.startsWith('text/html') ?? false

/**
 * Every page has a Markdown twin for agents. A page answers with Markdown at its `.md` URL (`hooks.ts` routes it to the
 * page), or at its own URL when the request prefers Markdown or comes from an AI agent (`negotiate.ts`). A docs page's
 * twin is the copy the docs build wrote; any other page renders as usual and its content is converted. HTML pages
 * advertise their twin.
 */
export const handle: Handle = async ({ event, resolve }) => {
  const { url, request, platform } = event
  if (!platform)
    throw new Error('The site runs as a Cloudflare Worker, and its bindings are missing.')
  const env = platform.env
  event.locals.env = env
  event.locals.session = await readSession(event.cookies, env.SESSION_KEY)

  const twin = pageOf(url.pathname)
  const page =
    twin === null && (request.method === 'GET' || request.method === 'HEAD') && !event.isDataRequest

  if (twin === null && !(page && wantsMarkdown(request.headers))) {
    const response = await resolve(event)
    if (page && isHtml(response)) {
      response.headers.append('vary', VARY)
      if (response.ok)
        response.headers.append(
          'link',
          `<${markdownPath(url.pathname)}>; rel="alternate"; type="text/markdown"`,
        )
    }
    return response
  }

  // Docs pages end in a slash; their Markdown, like every page's, is named without it.
  const path = twin ?? (url.pathname.replace(/\/+$/, '') || '/')
  const headers = { 'content-type': MARKDOWN, vary: VARY }

  const docs = await docsMarkdown(env.ASSETS, path, url)
  if (docs !== undefined) return new Response(docs, { headers })

  const response = await resolve(event)
  const location = response.headers.get('location')
  if (location) {
    // A redirect between pages stays in Markdown.
    const target = new URL(location, url)
    if (target.origin === url.origin && twin !== null)
      response.headers.set('location', markdownPath(target.pathname) + target.search)
    return response
  }
  if (!isHtml(response)) return response
  // Docs listings render at their path with a slash and link relatively from there; the site's own pages link absolutely.
  const rendered = new URL(path === '/' ? path : `${path}/`, url)
  const markdown = pageToMarkdown(await response.text(), rendered)
  return new Response(markdown, {
    status: response.status,
    headers: { ...headers, 'cache-control': response.headers.get('cache-control') ?? 'no-cache' },
  })
}
