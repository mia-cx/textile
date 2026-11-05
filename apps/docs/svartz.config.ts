import { defineConfig } from '@svartz/config'

// Svartz's design tokens drawn from the site's own (apps/web/src/lib/tokens.css, loaded in the root layout), so the docs
// share the landing page's colours, type and radii. Each value already has a light and a dark side there.
const tokens = {
  paper: 'var(--paper)',
  surface: 'var(--surface)',
  sunken: 'var(--sunken)',
  rule: 'var(--rule)',
  'rule-strong': 'var(--rule-strong)',
  muted: 'var(--muted)',
  text: 'var(--text)',
  ink: 'var(--ink)',
  accent: 'var(--accent)',
  'accent-text': 'var(--accent-text)',
  'on-accent': 'var(--on-accent)',
  'font-sans': 'var(--font-text)',
  'font-mono': 'var(--font-code)',
  'radius-s': 'var(--radius-s)',
  'radius-m': 'var(--radius-m)',
  'radius-l': 'var(--radius-l)',
}

export default defineConfig({
  version: '1.0.0',
  vaults: [
    {
      id: 'docs',
      // The repository's own docs: the same Markdown GitHub shows is the site's docs.
      path: '../../docs',
      // Architecture decision records are maintainers' history, not product docs.
      exclude: ['architecture/**'],
      target: { type: 'host' },
      theme: {
        // Guides only, so minimal's navigation and contents list; no reference pages.
        base: '@svartz/theme-minimal',
        tokens,
        logo: { src: '/favicon.svg' },
        nav: { Home: '/' },
        footer: {
          links: {
            Textile: '/',
            'Sign in': '/login',
            Terms: '/terms',
            Privacy: '/privacy',
            'llms.txt': '/llms.txt',
          },
        },
      },
      site: {
        title: 'Textile docs',
        description:
          'Connect an agent to Textile, write workflows, relay voice, and run the platform.',
        url: 'https://textile.cx/docs',
      },
    },
  ],
})
