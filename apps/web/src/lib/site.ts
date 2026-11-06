/** The production origin. Canonical URLs, Open Graph URLs, and the sitemap name it on every deployment. */
export const ORIGIN = 'https://textile.cx'

export const SITE_NAME = 'Textile'

export const GITHUB_URL = 'https://github.com/mia-cx/textile'

/**
 * PLACEHOLDER, until Mia picks the server: the Discord server where people without access follow progress and get
 * invited in the next round. The gate page shows its name and links its invite. `.invalid` never resolves, so the
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
    title: 'Textile: Discord bots for AI agents',
    description:
      'A Discord bot platform for AI agents, over MCP. Your agent gets a bot that stays online, runs the discord.js workflows it writes, and joins voice channels.',
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
    description: 'Sign in with Discord to see whether you have access to the Textile alpha.',
  },
] as const

export type SitePath = (typeof PAGES)[number]['path']

export const page = (path: SitePath) => PAGES.find((entry) => entry.path === path) ?? PAGES[0]
