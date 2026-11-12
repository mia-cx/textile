import { shouldServeMarkdown } from '@mdream/js/negotiate'

/**
 * User agents that get a page's Markdown whatever they Accept: AI crawlers and fetchers, which often ask for HTML, and
 * command-line HTTP clients, which agents drive and whose readers are terminals. Matched case-insensitively anywhere in
 * the `User-Agent`. Browsers match none of them.
 */
export const MARKDOWN_USER_AGENTS = [
  'ClaudeBot',
  'Claude-User',
  'Claude-SearchBot',
  'anthropic-ai',
  'GPTBot',
  'ChatGPT-User',
  'OAI-SearchBot',
  'PerplexityBot',
  'Perplexity-User',
  'CCBot',
  'Meta-ExternalAgent',
  'cohere-ai',
  'curl',
  'Wget',
  'HTTPie',
  'python-requests',
  'Go-http-client',
  'node-fetch',
  'undici',
] as const

/** Search engine crawlers, which index the HTML page whatever else they send. */
export const SEARCH_CRAWLERS = [
  'Googlebot',
  'Bingbot',
  'DuckDuckBot',
  'Applebot',
  'YandexBot',
  'Baiduspider',
] as const

const anyOf = (names: ReadonlyArray<string>) =>
  new RegExp(names.map((name) => name.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('|'), 'i')

const agent = anyOf(MARKDOWN_USER_AGENTS)
const crawler = anyOf(SEARCH_CRAWLERS)

/** Whether a request for a page gets its Markdown twin: it prefers Markdown, or an agent sent it, and no search crawler did. */
export function wantsMarkdown(headers: Headers) {
  const userAgent = headers.get('user-agent') ?? ''
  if (crawler.test(userAgent)) return false
  // Accept alone decides, not `Sec-Fetch-Dest`: an explicit request for Markdown wins, and a browser navigating asks for
  // HTML in its Accept anyway. The choice then rests only on the headers `Vary` names.
  return shouldServeMarkdown(headers.get('accept') ?? undefined) || agent.test(userAgent)
}
