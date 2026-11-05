// See https://svelte.dev/docs/kit/types#app.d.ts
import type { Session } from '$lib/server/session'

declare global {
  namespace App {
    interface Locals {
      /** Who the session cookie names, if anyone (see `$lib/server/session.ts`). */
      session?: Session
      /** The Worker's bindings, which `hooks.server.ts` takes from the platform once for every route. */
      env: Env
    }
    interface Platform {
      env: Env
    }
  }

  /** The Worker's bindings: wrangler.jsonc's vars and assets, and its secrets. */
  interface Env {
    /** The static assets: the app's client files and the docs build under /docs. */
    ASSETS: { fetch(request: Request | URL | string): Promise<Response> }
    DISCORD_CLIENT_ID: string
    /** Discord's origin; tests point it at a stand-in. */
    DISCORD_URL: string
    DISCORD_CLIENT_SECRET?: string
    /** Base64 of 32 random bytes: the AES-256-GCM key for session cookies. */
    SESSION_KEY?: string
    /** Comma-separated Discord user IDs who have access to the alpha. */
    ACCESS_LIST?: string
  }
}
