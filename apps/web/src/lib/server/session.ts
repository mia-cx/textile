import type { Cookies } from '@sveltejs/kit'

/**
 * The signed-in person, kept in an AES-256-GCM encrypted, HttpOnly cookie under `SESSION_KEY`. There is no database:
 * the cookie is the whole session. Central checked its allowlist when the person signed in, so `access` records its
 * answer, and `token` is the access token central issued, when it let them in.
 */
export interface Session {
  readonly access: boolean
  readonly token?: string
}

export const SESSION_COOKIE = 'textile_session'
const MAX_AGE_SECONDS = 7 * 86_400
const IV_BYTES = 12

const encode = (data: Uint8Array) =>
  btoa(String.fromCharCode(...data))
    .replace(/\+/g, '-')
    .replace(/\//g, '_')
    .replace(/=+$/, '')
const decode = (text: string) =>
  Uint8Array.from(atob(text.replace(/-/g, '+').replace(/_/g, '/')), (c) => c.charCodeAt(0))

const importKey = (secret: string) =>
  crypto.subtle.importKey(
    'raw',
    Uint8Array.from(atob(secret), (c) => c.charCodeAt(0)),
    'AES-GCM',
    false,
    ['encrypt', 'decrypt'],
  )

/**
 * `value` sealed under `key` for `purpose`, until `seconds` from now. The purpose is authenticated, so a value sealed
 * for one cookie never opens as another.
 */
export async function seal(key: string, purpose: string, value: object, seconds: number) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const payload = new TextEncoder().encode(
    JSON.stringify({ ...value, exp: Date.now() + seconds * 1000 }),
  )
  const sealed = await crypto.subtle.encrypt(
    { name: 'AES-GCM', iv, additionalData: new TextEncoder().encode(purpose) },
    await importKey(key),
    payload,
  )
  return `${encode(iv)}.${encode(new Uint8Array(sealed))}`
}

/** What `seal` sealed under `key` for `purpose`, if it did and it hasn't expired. */
export async function unseal<T>(
  key: string | undefined,
  purpose: string,
  text: string | undefined,
) {
  const [iv, sealed] = text?.split('.') ?? []
  if (!key || !iv || !sealed) return undefined
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(iv), additionalData: new TextEncoder().encode(purpose) },
      await importKey(key),
      decode(sealed),
    )
    const { exp, ...value } = JSON.parse(new TextDecoder().decode(opened)) as T & { exp: number }
    return exp > Date.now() ? (value as T) : undefined
  } catch {
    // Not base64url, or sealed under another key or purpose: not a value this site wrote.
    return undefined
  }
}

/**
 * How the sign-in cookies are set. Secure only over https: a browser drops secure cookies over plain http, so a
 * local preview could never sign in.
 */
export const cookieOptions = (url: URL) =>
  ({ path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:' }) as const

/** Keeps `session` for seven days, or until central's token expires, if sooner. */
export async function writeSession(
  cookies: Cookies,
  url: URL,
  key: string,
  session: Session,
  seconds = MAX_AGE_SECONDS,
) {
  const maxAge = Math.min(seconds, MAX_AGE_SECONDS)
  cookies.set(SESSION_COOKIE, await seal(key, SESSION_COOKIE, session, maxAge), {
    ...cookieOptions(url),
    maxAge,
  })
}

export const readSession = (cookies: Cookies, key: string | undefined) =>
  unseal<Session>(key, SESSION_COOKIE, cookies.get(SESSION_COOKIE))

export const endSession = (cookies: Cookies, url: URL) =>
  cookies.delete(SESSION_COOKIE, cookieOptions(url))
