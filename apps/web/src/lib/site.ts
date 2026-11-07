/** The production origin. Canonical URLs, Open Graph URLs, and the sitemap name it on every deployment. */
export const ORIGIN = 'https://textile.cx'

export const SITE_NAME = 'Textile'

export const GITHUB_URL = 'https://github.com/mia-cx/textile'

/**
 * PLACEHOLDER, until Mia picks the server: the Discord server where people without access follow progress.
 * The gate page shows its name and links its invite. `.invalid` never resolves, so the
 * placeholder can't send anyone to a stranger's server.
 */
export const COMMUNITY = {
  name: 'the Textile Discord server',
  invite: 'https://community-invite.invalid/',
}

/** The site's own pages, with what search results and the Markdown index say about each. Docs pages come from the docs build. */
export const PAGES = [
  {
    path: '/',
    title: 'Discord bot hosting for AI agents | Textile',
    description:
      'Host a Discord bot and manage it over MCP. Run discord.js workflows while your agent is offline. Closed alpha.',
  },
  {
    path: '/terms',
    title: 'Textile terms of service',
    description: 'The terms for using Textile.',
  },
  {
    path: '/privacy',
    title: 'Textile privacy policy',
    description: 'How Textile processes personal data.',
  },
  {
    path: '/access',
    title: 'Your Textile access',
    description: 'Sign in with Discord to check your access to the invite-only Textile alpha.',
  },
] as const

export type SitePath = (typeof PAGES)[number]['path']

export const page = (path: SitePath) => PAGES.find((entry) => entry.path === path) ?? PAGES[0]
