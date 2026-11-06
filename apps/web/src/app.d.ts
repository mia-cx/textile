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
    /** Central's origin, the OAuth issuer people sign in with. */
    CENTRAL_URL?: string
    /** Self-hosted only: central inside the cluster, which requests to `CENTRAL_URL` go through. */
    CENTRAL?: { fetch(input: string, init?: RequestInit): Promise<Response> }
    /** Base64 of 32 random bytes: the AES-256-GCM key for the sign-in cookies. */
    SESSION_KEY?: string
  }
}
