import type { Cookies } from '@sveltejs/kit'

/**
 * The signed-in person, kept in an AES-256-GCM encrypted, HttpOnly cookie under `SESSION_KEY`. There is no database:
 * the cookie is the whole session. Access is checked against `ACCESS_LIST` on every request, not stored here, so
 * changing the list takes effect without anyone signing in again.
 */
export interface Session {
  readonly id: string
  readonly username: string
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
 * How the sign-in cookies are set. Secure only over https: a browser drops secure cookies over plain http, so a
 * local preview could never sign in.
 */
export const cookieOptions = (url: URL) =>
  ({ path: '/', httpOnly: true, sameSite: 'lax', secure: url.protocol === 'https:' }) as const

export async function writeSession(cookies: Cookies, url: URL, key: string, session: Session) {
  const iv = crypto.getRandomValues(new Uint8Array(IV_BYTES))
  const payload = new TextEncoder().encode(
    JSON.stringify({
      id: session.id,
      username: session.username,
      exp: Date.now() + MAX_AGE_SECONDS * 1000,
    }),
  )
  const sealed = new Uint8Array(
    await crypto.subtle.encrypt({ name: 'AES-GCM', iv }, await importKey(key), payload),
  )
  cookies.set(SESSION_COOKIE, `${encode(iv)}.${encode(sealed)}`, {
    ...cookieOptions(url),
    maxAge: MAX_AGE_SECONDS,
  })
}

/** The person the cookie names, if this site sealed it under `key` and it hasn't expired. */
export async function readSession(
  cookies: Cookies,
  key: string | undefined,
): Promise<Session | undefined> {
  const [iv, sealed] = cookies.get(SESSION_COOKIE)?.split('.') ?? []
  if (!key || !iv || !sealed) return undefined
  try {
    const opened = await crypto.subtle.decrypt(
      { name: 'AES-GCM', iv: decode(iv) },
      await importKey(key),
      decode(sealed),
    )
    const { id, username, exp } = JSON.parse(new TextDecoder().decode(opened)) as Session & {
      exp: number
    }
    return exp > Date.now() ? { id, username } : undefined
  } catch {
    // Not base64url, or sealed under another key: not a session this site wrote.
    return undefined
  }
}

export const endSession = (cookies: Cookies, url: URL) =>
  cookies.delete(SESSION_COOKIE, cookieOptions(url))

/** Whether the Discord user may use the alpha: `ACCESS_LIST` names them. Unset or empty lets nobody in. */
export const hasAccess = (accessList: string | undefined, userId: string) =>
  (accessList ?? '').split(/[\s,]+/).includes(userId)
