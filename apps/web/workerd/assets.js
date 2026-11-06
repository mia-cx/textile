import { WorkerEntrypoint } from 'cloudflare:workers'

// Cloudflare's static assets, for the site run in self-hosted workerd (`site.capnp`). The default export is the front
// door, routing as Cloudflare does; `Assets` is the Worker's ASSETS binding. Both read the build's assets directory
// through the `DISK` service.

/** Paths that reach the Worker before the assets: `assets.run_worker_first` in wrangler.jsonc. */
const workerFirst = (pathname) => pathname === '/docs' || pathname.startsWith('/docs/')

/** Files in the assets directory that configure Cloudflare rather than being served, as wrangler skips them. */
const CONFIG_FILES = new Set(['/_headers', '/_redirects', '/_routes.json', '/_worker.js'])
const NOT_FOUND = () => new Response('Not Found', { status: 404 })

const TYPES = {
  css: 'text/css; charset=utf-8',
  html: 'text/html; charset=utf-8',
  ico: 'image/x-icon',
  jpg: 'image/jpeg',
  js: 'text/javascript; charset=utf-8',
  json: 'application/json; charset=utf-8',
  map: 'application/json; charset=utf-8',
  md: 'text/markdown; charset=utf-8',
  png: 'image/png',
  svg: 'image/svg+xml',
  txt: 'text/plain; charset=utf-8',
  webmanifest: 'application/manifest+json',
  webp: 'image/webp',
  woff2: 'font/woff2',
  xml: 'application/xml; charset=utf-8',
}

/**
 * The `_headers` file's rules: a path pattern, where `*` matches anything, then indented `Name: value` lines to set
 * and `! Name` lines to drop headers an earlier rule set.
 */
const parseHeaders = (text) => {
  const rules = []
  for (const line of text.split('\n')) {
    if (!line.trim() || line.trimStart().startsWith('#')) continue
    if (!/^\s/.test(line)) {
      const pattern = line
        .trim()
        .replace(/[.+?^${}()|[\]\\]/g, '\\$&')
        .replaceAll('*', '.*')
      rules.push({ pattern: new RegExp(`^${pattern}$`), set: [], drop: [] })
      continue
    }
    const rule = rules.at(-1)
    const entry = line.trim()
    if (entry.startsWith('!')) rule?.drop.push(entry.slice(1).trim())
    else {
      const colon = entry.indexOf(':')
      rule?.set.push([entry.slice(0, colon).trim(), entry.slice(colon + 1).trim()])
    }
  }
  return rules
}

let headerRules

/** Characters a decoded path may hold that a URL would read as an escape, a query, or a fragment. */
const URL_SYNTAX = /[%?#]/g
/** A URL on `base`'s origin whose pathname is `path`, never an authority, even when `path` starts with `//`. */
const toUrl = (path, base) =>
  new URL(`${base.origin}${path.replace(URL_SYNTAX, encodeURIComponent)}`)

/**
 * The file path a request names: percent-decoded once, with `.` and `..` segments resolved and repeated slashes
 * collapsed, so `/%64ocs/` is `/docs/` and `/a%2f..%2f%2fx` is `/x`. Routing and lookups both use it, so an encoding
 * can't route a request one way and serve it another. Undefined when the encoding is malformed.
 */
const pathOf = (url) => {
  try {
    const resolved = decodeURIComponent(toUrl(decodeURIComponent(url.pathname), url).pathname)
    return resolved.replace(/\/{2,}/g, '/')
  } catch {
    return undefined
  }
}

const readFile = async (disk, url, path) => {
  const response = await disk.fetch(toUrl(path, url))
  // The disk service sends every file as application/octet-stream, and a directory's listing as JSON.
  const directory = response.headers.get('content-type') === 'application/json'
  return response.ok && !directory ? response : undefined
}

/**
 * The file a path names, under Cloudflare's default `auto-trailing-slash` HTML handling as the Worker's binding sees
 * it: `/a/` serves `a/index.html`, `/a` serves `a.html` or else `a/index.html` (the binding follows the redirect to
 * `/a/` itself), and `/404` is `404.html`. Anything else is a 404, which the front door hands to the Worker.
 */
async function serveAsset(disk, request) {
  if (request.method !== 'GET' && request.method !== 'HEAD')
    return new Response(null, { status: 405, headers: { allow: 'GET, HEAD' } })
  const url = new URL(request.url)
  const path = pathOf(url)
  if (path === undefined || CONFIG_FILES.has(path)) return NOT_FOUND()
  const candidates = path.endsWith('/')
    ? [`${path}index.html`]
    : [path, `${path}.html`, `${path}/index.html`]
  let file
  let found
  for (file of candidates) {
    found = await readFile(disk, url, file)
    if (found) break
  }
  if (!found) return NOT_FOUND()

  headerRules ??= parseHeaders((await (await readFile(disk, url, '/_headers'))?.text()) ?? '')
  const headers = new Headers({
    'content-type': TYPES[file.split('.').pop()] ?? 'application/octet-stream',
  })
  for (const { pattern, set, drop } of headerRules) {
    if (!pattern.test(path)) continue
    for (const name of drop) headers.delete(name)
    for (const [name, value] of set) headers.append(name, value)
  }
  return new Response(request.method === 'HEAD' ? null : found.body, { headers })
}

/** The Worker's ASSETS binding. */
export class Assets extends WorkerEntrypoint {
  fetch(request) {
    return serveAsset(this.env.DISK, request)
  }
}

/** Every request: a static asset when one matches, as Cloudflare serves them, and otherwise the Worker. */
export default {
  async fetch(request, env) {
    const path = pathOf(new URL(request.url))
    if (path === undefined || workerFirst(path)) return env.SITE.fetch(request)
    const asset = await serveAsset(env.DISK, request)
    return asset.status === 404 || asset.status === 405 ? env.SITE.fetch(request) : asset
  },
}
