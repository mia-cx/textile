<script lang="ts">
import '../app.css'
import { page } from '$app/state'
import PageMarkdown from '$lib/components/PageMarkdown.svelte'
import { GITHUB_URL } from '$lib/site'

let { data, children } = $props()

/** Pages that are dark in every colour mode (they mark themselves `data-scheme="dark"`), so the browser's chrome is too. */
const ALWAYS_DARK = new Set(['/', '/access'])
/** `--paper` in each mode, for the browser's chrome. */
const PAPER = { light: '#f8f7fb', dark: '#07060c' }
</script>

<svelte:head>
  {#if ALWAYS_DARK.has(page.url.pathname)}
    <meta name="theme-color" content={PAPER.dark} />
  {:else}
    <meta name="theme-color" content={PAPER.light} media="(prefers-color-scheme: light)" />
    <meta name="theme-color" content={PAPER.dark} media="(prefers-color-scheme: dark)" />
  {/if}
</svelte:head>

<a href="#content" class="skip">Skip to content</a>

<header class="site-header">
  <a href="/" class="wordmark" aria-label="Textile home">textile</a>
  <nav aria-label="Site" class="flex items-center gap-x-1 sm:gap-x-3">
    <a class="nav-link" href="/docs/">Docs</a>
    <a class="nav-link" href={GITHUB_URL}>GitHub</a>
    {#if data.signedIn}
      <a class="nav-pill" href="/access">Access</a>
    {:else}
      <a class="nav-pill" href="/login" data-sveltekit-reload>Sign in</a>
    {/if}
  </nav>
</header>

<main id="content" tabindex="-1">
  {@render children()}
</main>

<footer class="site-footer">
  <a href="/" class="wordmark" aria-label="Textile home">textile</a>
  <nav aria-label="Footer" class="flex flex-wrap gap-x-6">
    <a class="footer-link" href="/docs/">Docs</a>
    <a class="footer-link" href={GITHUB_URL}>GitHub</a>
    <a class="footer-link" href="/llms.txt">llms.txt</a>
    <a class="footer-link" href="/terms">Terms</a>
    <a class="footer-link" href="/privacy">Privacy</a>
  </nav>
  <PageMarkdown />
</footer>

<style>
  .skip {
    position: absolute;
    left: 1rem;
    top: -4rem;
    z-index: 10;
    padding: 0.5rem 1rem;
    border-radius: var(--radius-m);
    background: var(--accent);
    color: var(--on-accent);
  }
  .skip:focus {
    top: 1rem;
  }
  main:focus {
    outline: none;
  }
  /* Full width, like the page under it: the header sits over the landing page's thread field. */
  .site-header {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    height: var(--header-height);
    padding-inline: var(--gutter);
  }
  :global(:root) {
    --header-height: 5.5rem;
    --gutter: clamp(1.25rem, 4vw, 4.5rem);
  }
  .wordmark {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--ink);
    font-size: 2rem;
    font-weight: 600;
    letter-spacing: -0.045em;
    text-decoration: none;
  }
  .nav-link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    padding-inline: 0.75rem;
    color: var(--ink);
    font-size: 1.0625rem;
    text-decoration: none;
  }
  .nav-link:hover {
    text-decoration: underline;
  }
  .nav-pill {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    margin-left: 0.5rem;
    padding-inline: 1.25rem;
    border: 1px solid color-mix(in srgb, var(--ink) 40%, transparent);
    border-radius: var(--radius-pill);
    color: var(--ink);
    font-size: 1.0625rem;
    text-decoration: none;
    transition:
      border-color var(--duration-quick) var(--ease-out),
      background-color var(--duration-quick) var(--ease-out);
  }
  .nav-pill:hover {
    border-color: var(--ink);
    background: color-mix(in srgb, var(--ink) 6%, transparent);
  }
  @media (max-width: 30rem) {
    .wordmark {
      font-size: 1.625rem;
    }
    .nav-link {
      padding-inline: 0.5rem;
      font-size: 1rem;
    }
    .nav-pill {
      margin-left: 0.25rem;
      padding-inline: 1rem;
      font-size: 1rem;
    }
  }
  .site-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 2.5rem;
    margin-top: 8rem;
    padding: 2rem var(--gutter) 2.5rem;
    border-top: 1px solid var(--rule);
    font-size: 1rem;
  }
  .site-footer .wordmark {
    font-size: 1.5rem;
    margin-right: auto;
  }
  .footer-link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--text);
    text-decoration: none;
  }
  .footer-link:hover {
    color: var(--ink);
    text-decoration: underline;
  }
</style>
