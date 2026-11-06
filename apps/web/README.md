# @discord-mcp/web

`textile.cx`: the landing page, the docs, sign-in with Discord, and the terms and privacy policy, as one SvelteKit app on
Cloudflare Workers. [DESIGN.md](./DESIGN.md) covers the look.

## Run it

From the repository root, after `pnpm install`:

```sh
pnpm site:build                         # the docs (apps/docs), then this Worker with the docs under /docs
cp apps/web/.dev.vars.example apps/web/.dev.vars   # then fill it in
pnpm --filter @discord-mcp/web preview  # wrangler dev on the build, at http://localhost:8787
pnpm site:check                         # build, svelte-check both apps, and this app's tests
```

`pnpm --filter @discord-mcp/web dev` runs Vite with hot reload for the site's own pages, using `.dev.vars` and the docs
from the last `pnpm site:build`.

## Markdown for agents

Every page has a Markdown twin, at its URL plus `.md` (`/index.md` for `/`). A page's own URL answers with the twin too
when the request sends `Accept: text/markdown` or comes from an AI agent or command-line client
(`src/lib/server/negotiate.ts`); search crawlers always get HTML. HTML responses send `Vary: Accept, User-Agent` and
link their twin in a `Link` header and a `<link rel="alternate">`. Docs twins are the copies Svartz writes beside each
docs page; the site's own pages are rendered and converted (`src/lib/server/convert.ts`). `/llms.txt` lists every twin
and `/llms-full.txt` holds them all.

## Sign-in and access

`/login` sends people to Discord with Textile's application (`identify` scope). Discord returns to `/auth/callback`,
which keeps the person's Discord ID and username in an AES-GCM encrypted, HttpOnly cookie for seven days; there is no
database. `/access` checks that ID against `ACCESS_LIST` on every visit: listed people are told they're in and pointed
at the connect docs, everyone else that they don't have access yet and where to follow progress (`COMMUNITY` in
`src/lib/site.ts`).

Add each origin's callback to the Discord application's OAuth2 redirects: `https://textile.cx/auth/callback`,
staging's, and `http://localhost:8787/auth/callback` for `preview`.

| Setting | Kind | Purpose |
| --- | --- | --- |
| `DISCORD_CLIENT_ID` | var | Textile's Discord application. |
| `DISCORD_URL` | var | Discord's origin; tests fake it. |
| `DISCORD_CLIENT_SECRET` | secret | The application's OAuth2 client secret. |
| `SESSION_KEY` | secret | `openssl rand -base64 32`. Rotating it signs everyone out. |
| `ACCESS_LIST` | secret | Comma-separated Discord user IDs with access. Unset or empty lets nobody in. |

On Cloudflare, set secrets with `pnpm --filter @discord-mcp/web exec wrangler secret put <NAME> --env production`. In
the container, every setting is an environment variable of the same name.

Only `https://textile.cx` is indexed. On any other origin, every page and Markdown twin sends `X-Robots-Tag: noindex`
and `robots.txt` disallows everything.

## Deploy

Nothing in `wrangler.jsonc` publishes the site: `workers.dev` and preview URLs are off, and no environment has a
route. `textile.cx` is `env.production`, which gets its route when the site goes live.

Staging runs the same build in self-hosted workerd: `docker/web.Dockerfile` bundles the Worker with
`wrangler deploy --dry-run --env production` and serves it with `workerd/site.capnp` on port 8080, as a non-root user
that needs no writable filesystem. `workerd/assets.js` stands in for Cloudflare's static assets: it routes requests the
way Cloudflare does, serves `.html` and `index.html` files by their page paths, and applies `_headers`. Behind a proxy
that terminates TLS, the proxy's `X-Forwarded-Proto` makes the site's own URLs `https://`. CI publishes the image as
`ghcr.io/mia-cx/textile/web`.
