# textile.cx's site (apps/web) in self-hosted workerd: the Worker bundle `wrangler deploy --env production` would
# upload, its static assets, and apps/web/workerd/site.capnp. Bindings come from the environment; see apps/web/README.md.
FROM node:24.22.1-bookworm-slim AS build

RUN corepack enable

ENV CI=true
ENV WRANGLER_SEND_METRICS=false

WORKDIR /src

COPY pnpm-workspace.yaml pnpm-lock.yaml package.json ./
COPY patches ./patches
COPY apps/web ./apps/web
COPY apps/docs ./apps/docs
COPY docs ./docs

# Only the site and the docs it serves; the server's native builds stay out.
RUN pnpm install --frozen-lockfile --filter @discord-mcp/web... --filter @discord-mcp/docs...
RUN pnpm site:build

# The bundle production uploads (--dry-run writes it and stops, publishing nothing), the assets beside it, and the
# workerd that wrangler itself runs, which supports the compatibility date wrangler.jsonc names.
WORKDIR /src/apps/web
RUN pnpm exec wrangler deploy --dry-run --env production --outdir /out/worker \
  && cp -R .svelte-kit/cloudflare /out/assets \
  && rm /out/assets/_worker.js \
  && cp workerd/site.capnp workerd/assets.js /out/ \
  && cp "$(node --input-type=module -e "import { createRequire } from 'node:module'; \
    const w = await import(createRequire(createRequire(import.meta.url).resolve('wrangler/package.json')).resolve('workerd')); \
    console.log(w.default.default)")" /out/workerd

# glibc, the CA bundle workerd needs for outbound TLS, and an unprivileged user; nothing else, not even a shell.
FROM gcr.io/distroless/base-debian12:nonroot

COPY --from=build /out /srv/site

USER nonroot:nonroot
WORKDIR /srv/site
EXPOSE 8080

ENTRYPOINT ["/srv/site/workerd", "serve", "site.capnp"]
