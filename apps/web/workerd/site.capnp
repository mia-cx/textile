# The site in self-hosted workerd: the same Worker bundle `wrangler deploy` uploads, with Cloudflare's static assets
# stood in by `assets.js`. docker/web.Dockerfile lays the files out beside this config: `worker/` (the bundle) and
# `assets/` (the build's assets directory). The bindings come from the environment, as wrangler's vars and secrets do
# on Cloudflare; an unset variable leaves its binding undefined.
using Workerd = import "/workerd/workerd.capnp";

const config :Workerd.Config = (
  services = [
    (name = "front", worker = .front),
    (name = "site", worker = .site),
    (name = "disk", disk = (path = "assets")),
    (name = "no-cache", worker = .noCache),
  ],
  sockets = [
    # Behind the ingress, which terminates TLS: X-Forwarded-Proto gives the Worker its https:// URLs, so the origin,
    # the OAuth redirect, and Secure cookies come out as on Cloudflare.
    (name = "http", address = "*:8080", http = (forwardedProtoHeader = "X-Forwarded-Proto"), service = "front"),
  ],
);

const front :Workerd.Worker = (
  modules = [(name = "assets.js", esModule = embed "assets.js")],
  compatibilityDate = "2026-10-01",
  bindings = [
    (name = "DISK", service = "disk"),
    (name = "SITE", service = "site"),
  ],
);

const site :Workerd.Worker = (
  modules = [(name = "_worker.js", esModule = embed "worker/_worker.js")],
  # wrangler.jsonc's `compatibility_date`.
  compatibilityDate = "2026-10-01",
  bindings = [
    (name = "ASSETS", service = (name = "front", entrypoint = "Assets")),
    (name = "DISCORD_CLIENT_ID", fromEnvironment = "DISCORD_CLIENT_ID"),
    (name = "DISCORD_URL", fromEnvironment = "DISCORD_URL"),
    (name = "DISCORD_CLIENT_SECRET", fromEnvironment = "DISCORD_CLIENT_SECRET"),
    (name = "SESSION_KEY", fromEnvironment = "SESSION_KEY"),
    (name = "ACCESS_LIST", fromEnvironment = "ACCESS_LIST"),
  ],
  cacheApiOutbound = "no-cache",
);

# The Cache API's backend. The SvelteKit adapter caches responses in `caches.default`, which workerd refuses without
# one; this one keeps nothing, so every lookup misses, as on a cold Cloudflare edge.
const noCache :Workerd.Worker = (
  modules = [(name = "no-cache.js", esModule = "export default { fetch: (request) => request.method === 'GET' ? new Response(null, { status: 504, headers: { 'cf-cache-status': 'MISS' } }) : new Response(null, { status: 204 }) }")],
  compatibilityDate = "2026-10-01",
);
