import { describe, expect, it } from 'vitest'
import { WORKFLOW } from '../src/lib/landing.ts'
import { ORIGIN, request } from './server.ts'

const CHROME =
  'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/141.0.0.0 Safari/537.36'
const BROWSER_ACCEPT = 'text/html,application/xhtml+xml,application/xml;q=0.9,*/*;q=0.8'
const MARKDOWN = 'text/markdown; charset=utf-8'

const get = (path: string, headers: Record<string, string>) => request(path, { headers })

describe('Markdown for agents', () => {
  // Proves each kind of reader gets the format meant for it at a page's own URL, and caches keep the two apart.
  it.each([
    ['a browser', '/', { 'user-agent': CHROME, accept: BROWSER_ACCEPT }, 'html'],
    [
      'a request preferring Markdown',
      '/',
      { 'user-agent': CHROME, accept: 'text/markdown' },
      'markdown',
    ],
    [
      'ClaudeBot',
      '/terms',
      {
        'user-agent': 'Mozilla/5.0 (compatible; ClaudeBot/1.0; +claudebot@anthropic.com)',
        accept: BROWSER_ACCEPT,
      },
      'markdown',
    ],
    [
      'ChatGPT-User',
      '/docs/voice/',
      { 'user-agent': 'Mozilla/5.0 (compatible; ChatGPT-User/1.0; +https://openai.com/bot)' },
      'markdown',
    ],
    [
      'PerplexityBot',
      '/privacy',
      { 'user-agent': 'Mozilla/5.0 (compatible; PerplexityBot/1.0)' },
      'markdown',
    ],
    [
      'a client asking for Markdown with a document destination',
      '/terms',
      { 'user-agent': CHROME, accept: 'text/markdown', 'sec-fetch-dest': 'document' },
      'markdown',
    ],
    [
      'Googlebot',
      '/',
      { 'user-agent': 'Mozilla/5.0 (compatible; Googlebot/2.1; +http://www.google.com/bot.html)' },
      'html',
    ],
    [
      'Googlebot asking for Markdown',
      '/docs/voice/',
      { 'user-agent': 'Googlebot/2.1', accept: 'text/markdown' },
      'html',
    ],
    [
      'Bingbot',
      '/terms',
      { 'user-agent': 'Mozilla/5.0 (compatible; bingbot/2.0; +http://www.bing.com/bingbot.htm)' },
      'html',
    ],
  ])('serves %s %s as %s', async (_, path, headers, format) => {
    const response = await get(path, headers)
    expect(response.status).toBe(200)
    expect(response.headers.get('content-type')).toMatch(
      format === 'html' ? /^text\/html/ : /^text\/markdown/,
    )
    expect(response.headers.get('vary')).toContain('Accept, User-Agent')
  })

  it('advertises each HTML page’s twin, in its headers and its head', async () => {
    const response = await get('/terms', { 'user-agent': CHROME })
    expect(response.headers.get('link')).toContain(
      '</terms.md>; rel="alternate"; type="text/markdown"',
    )
    expect(await response.text()).toContain(
      '<link rel="alternate" type="text/markdown" href="/terms.md"',
    )
  })

  it('answers every page at its .md twin, with links that stay in Markdown', async () => {
    const home = await get('/index.md', { 'user-agent': CHROME })
    expect(home.headers.get('content-type')).toBe(MARKDOWN)
    const markdown = await home.text()
    expect(markdown).toMatch(/^# Discord bots for AI agents\n/)
    // The landing page's story, written for reading: each part the page shows, with the workflow it runs.
    for (const part of [
      '## Run discord.js on Textile',
      '## Reply to slash commands',
      '## Post on a schedule',
      '## Post to Discord from a webhook',
      '## Many Discord calls, one tool call',
      '## Connect your agent to voice',
    ])
      expect(markdown).toContain(part)
    expect(markdown).toContain(WORKFLOW)
    expect(markdown).toContain(`(${ORIGIN}/docs/workflows.md)`)
    // Sign-in is an action, not a page.
    expect(markdown).toContain(`(${ORIGIN}/login)`)
    expect(markdown).toContain("> I'm relaying voice in this channel to an AI agent.")
    // The notice's buttons are its opt-out wording.
    expect(markdown).toContain('Opt out of all Textile bots')
  })

  it('sends a docs page typed without its slash to the slash, where its relative assets resolve', async () => {
    const response = await get('/docs/workflows?from=chat', {
      'user-agent': CHROME,
      accept: BROWSER_ACCEPT,
    })
    expect(response.status).toBe(308)
    expect(response.headers.get('location')).toBe('/docs/workflows/?from=chat')
  })

  it('serves the docs HTML 404 page for a missing asset', async () => {
    const response = await get('/docs/missing.txt', { 'user-agent': CHROME })
    expect(response.status).toBe(404)
    expect(response.headers.get('content-type')).toMatch(/^text\/html/)
    expect(await response.text()).toContain('<!doctype html>')
  })

  it('serves a docs page’s twin from the docs build, with its links made absolute', async () => {
    const response = await get('/docs/security.md', { 'user-agent': CHROME })
    expect(response.headers.get('content-type')).toBe(MARKDOWN)
    const markdown = await response.text()
    expect(markdown).toMatch(/^---\ntitle: Security\n/)
    expect(markdown).toContain(`](${ORIGIN}/docs/workflows.md)`)
  })

  it('lists every page in llms.txt, and every twin answers with Markdown whose links all resolve', async () => {
    const response = await get('/llms.txt', {})
    const index = await response.text()
    expect(index).toMatch(/^# Textile\n\n> /)
    const twins = [...index.matchAll(/^- \[.+\]\((\S+\.md)\): \S/gm)].map(
      ([, href]) => new URL(href!).pathname,
    )
    expect(twins).toEqual(
      expect.arrayContaining([
        '/index.md',
        '/terms.md',
        '/privacy.md',
        '/access.md',
        '/docs.md',
        '/docs/connecting.md',
        '/docs/workflows.md',
        '/docs/voice.md',
        '/docs/security.md',
        '/docs/operating.md',
        '/docs/tools.md',
        '/docs/feed.md',
      ]),
    )
    const linked = new Set<string>()
    for (const twin of twins) {
      const page = await get(twin, {})
      expect(page.status, twin).toBe(200)
      expect(page.headers.get('content-type'), twin).toBe(MARKDOWN)
      for (const [, path] of (await page.text()).matchAll(
        /\]\(https:\/\/textile\.cx(\/[^)#\s]*)/g,
      )) {
        linked.add(path!)
      }
    }
    // Nothing linked is missing. Signing in leaves for central, which sign-in.test.ts fakes.
    for (const path of linked) {
      if (path === '/login') continue
      expect((await get(path, {})).status, path).toBeLessThan(400)
    }
  })

  // Proves staging and previews stay out of search results, pages and twins alike, while textile.cx is indexed.
  it.each([
    ['https://staging.example/', 'noindex'],
    ['https://staging.example/index.md', 'noindex'],
    ['https://staging.example/docs/voice/', 'noindex'],
    [`${ORIGIN}/`, null],
    [`${ORIGIN}/index.md`, null],
  ])('asks search engines not to index %s: %s', async (url, robots) => {
    const response = await get(url, { 'user-agent': CHROME })
    expect(response.status).toBe(200)
    expect(response.headers.get('x-robots-tag')).toBe(robots)
  })

  it('puts every page’s Markdown in llms-full.txt', async () => {
    const full = await (await get('/llms-full.txt', {})).text()
    for (const heading of [
      '# Discord bots for AI agents',
      '# Textile terms of service',
      'title: Voice',
      'title: Connect an agent',
    ]) {
      expect(full).toContain(heading)
    }
  })
})
