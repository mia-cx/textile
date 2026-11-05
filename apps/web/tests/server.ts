import { existsSync, readFileSync, statSync } from 'node:fs'

/**
 * The built site, answering requests as the Worker does: SvelteKit's server from `pnpm build`, with the docs build
 * standing in for the Worker's static assets. Discord is whatever `fetch` the test stubs.
 */
const OUTPUT = new URL('../.svelte-kit/output/server/', import.meta.url)
const DOCS = new URL('../../docs/.svartz/vaults/docs/dist/', import.meta.url)
if (!existsSync(new URL('index.js', OUTPUT)) || !existsSync(DOCS)) {
  throw new Error('Build the site first: `pnpm site:build` at the repository root.')
}

export const ORIGIN = 'https://textile.cx'
export const SESSION_KEY = Buffer.alloc(32, 7).toString('base64')
export const MEMBER = '111111111111111111'

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
    const stat = statSync(file, { throwIfNoEntry: false })
    if (stat?.isDirectory()) {
      return new Response(readFileSync(new URL('index.html', `${file.href}/`)), {
        headers: { 'content-type': HTML },
      })
    }
    const html = new URL(`${relative}.html`, DOCS)
    if (!stat && existsSync(html))
      return new Response(readFileSync(html), { headers: { 'content-type': HTML } })
    if (!stat) return new Response('Not found', { status: 404 })
    return new Response(readFileSync(file), {
      headers: {
        'content-type': TYPES[file.pathname.split('.').pop()!] ?? 'application/octet-stream',
      },
    })
  },
}

const env = {
  ASSETS,
  DISCORD_CLIENT_ID: '1162037890742759424',
  DISCORD_URL: 'https://discord.test',
  DISCORD_CLIENT_SECRET: 'client-secret',
  SESSION_KEY,
  ACCESS_LIST: `${MEMBER}, 333333333333333333`,
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
