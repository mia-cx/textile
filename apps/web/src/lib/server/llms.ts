import { markdownPath } from '$lib/markdown-paths'
import { PAGES } from '$lib/site'
import { type DocsPage, docsPages } from './docs'

const SUMMARY =
  'Textile hosts Discord bots for AI agents. Its MCP server provides Discord API calls, discord.js workflows, one-off scripts, and voice. Workflows run on supported Gateway events, slash commands, UTC cron schedules, and HTTP requests. Enabled workflows keep the bot online without agent calls. Agents supply their own models. Access is invite-only.'

const entry = ({ path, title, description }: DocsPage, origin: string) =>
  `- [${title}](${origin}${markdownPath(path)}): ${description}`

/** `/llms.txt`, in the llmstxt.org format: every page's Markdown twin, the site's own pages first, then the docs. */
export async function llmsTxt(assets: Env['ASSETS'], url: URL) {
  const docs = await docsPages(assets, url)
  return `# Textile

> ${SUMMARY}

Every page is also Markdown at its URL plus \`.md\` (\`/index.md\` for the home page), or at the page's own URL with
\`Accept: text/markdown\`. [llms-full.txt](${url.origin}/llms-full.txt) holds every page below in one file.

## Site

${PAGES.map((page) => entry(page, url.origin)).join('\n')}

## Docs

${docs.map((page) => entry(page, url.origin)).join('\n')}
`
}

/**
 * `/llms-full.txt`: every page's Markdown twin, one after another, fetched as an agent would. Pages render without the
 * visitor's cookies, so the access page reads as it does to anyone signed out.
 */
export async function llmsFullTxt(assets: Env['ASSETS'], url: URL, fetch: typeof globalThis.fetch) {
  const pages = [...PAGES, ...(await docsPages(assets, url))]
  const twins = await Promise.all(
    pages.map(async ({ path }) =>
      (await fetch(markdownPath(path), { credentials: 'omit' })).text(),
    ),
  )
  return `${twins.map((markdown) => markdown.trim()).join('\n\n---\n\n')}\n`
}
