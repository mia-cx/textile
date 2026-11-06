import { existsSync, readFileSync } from 'node:fs'

/**
 * The built site, answering requests as the Worker does: SvelteKit's server from `pnpm build`, with the docs build
 * standing in for the Worker's static assets. Central is whatever `fetch` the test stubs.
 */
const OUTPUT = new URL('../.svelte-kit/output/server/', import.meta.url)
const DOCS = new URL('../../docs/.svartz/vaults/docs/dist/', import.meta.url)
if (!existsSync(new URL('index.js', OUTPUT)) || !existsSync(DOCS)) {
  throw new Error('Build the site first: `pnpm site:build` at the repository root.')
}

export const ORIGIN = 'https://textile.cx'
export const SESSION_KEY = Buffer.alloc(32, 7).toString('base64')
/** Central's origin. In production it is not the site's own, so the tests keep them apart. */
export const CENTRAL = 'https://central.test'

const HTML = 'text/html; charset=utf-8'
const TYPES: Record<string, string> = {
  html: HTML,
  md: 'text/markdown; charset=utf-8',
  txt: 'text/plain',
}

/**
 * Cloudflare's static assets, as the Worker's binding serves the docs build: a folder answers with its `index.html`,
 * with or without its slash (the binding follows its own redirect), and `/404` is `404.html`.
 */
const ASSETS = {
  async fetch(input: Request | URL | string) {
    const url = new URL(input instanceof Request ? input.url : input)
    const relative = `.${url.pathname.slice('/docs'.length)}`
    const file = new URL(relative, DOCS)
    // Read directly: a prior existence or type check can race with a file changing.
    for (const candidate of [
      file,
      new URL('index.html', `${file.href.replace(/\/$/, '')}/`),
      new URL(`${relative}.html`, DOCS),
    ]) {
      try {
        return new Response(readFileSync(candidate), {
          headers: {
            'content-type':
              TYPES[candidate.pathname.split('.').pop() ?? ''] ?? 'application/octet-stream',
          },
        })
      } catch (error) {
        if (!['ENOENT', 'ENOTDIR', 'EISDIR'].includes((error as NodeJS.ErrnoException).code ?? ''))
          throw error
      }
    }
    return new Response('Not found', { status: 404 })
  },
}

const env = {
  ASSETS,
  CENTRAL_URL: CENTRAL,
  SESSION_KEY,
}

const { Server } = await import(new URL('index.js', OUTPUT).href)
const { manifest } = await import(new URL('manifest.js', OUTPUT).href)
const server = new Server(manifest)
await server.init({ env: {}, read: () => null })

/** One request to the site, as a browser, an agent, or a crawler sends it. */
export async function request(path: string, init: RequestInit = {}): Promise<Response> {
  return server.respond(new Request(new URL(path, ORIGIN), init), {
    platform: { env },
    getClientAddress: () => '127.0.0.1',
  })
}

/** The cookies a response sets, as one `Cookie` header. */
export const cookiesOf = (response: Response) =>
  response.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0])
    .join('; ')
