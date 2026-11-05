import adapter from '@sveltejs/adapter-static'

// The Svartz CLI sets SVARTZ_OUT_DIR; the fallback keeps `svelte-kit sync` working on its own.
const outDir = process.env.SVARTZ_OUT_DIR ?? 'build'
// apps/web serves the docs at /docs. Svartz reads the base from here: a `host` target has no basePath.
const BASE = '/docs'

/** @type {import('@sveltejs/kit').Config} */
export default {
  kit: {
    adapter: adapter({ pages: outDir, assets: outDir, fallback: '404.html', strict: true }),
    paths: { base: BASE },
    prerender: {
      // The header and footer link the web app's own pages, outside /docs; apps/web serves those.
      handleHttpError: ({ path, message }) => {
        if (path.startsWith(`${BASE}/`)) throw new Error(message)
      },
    },
  },
}
