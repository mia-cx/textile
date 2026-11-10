<script lang="ts">
import '../app.css'
import { page } from '$app/state'
import PageMarkdown from '$lib/components/PageMarkdown.svelte'
import { GITHUB_URL } from '$lib/site'
import Trefoil from '$lib/threads/Trefoil.svelte'
import { SMALL_MARK } from '$lib/threads/trefoil'

let { data, children } = $props()

/** The header's live mark, in CSS px: about the wordmark's cap height and a half. */
const MARK_SIZE = 34
/** How far the header mark's glow spreads, as a multiple of its size: far enough to fade out on its own. */
const MARK_BLEED = 5
/** Brighter than the icons' small mark: it sits over the hero's threads, whose light it has to stand out from. */
const HEADER_MARK = { ...SMALL_MARK, intensity: SMALL_MARK.intensity * 2 }

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
  <a href="/" class="wordmark" aria-label="Textile home"><span class="mark" style:--mark-size="{MARK_SIZE}px"><Trefoil size={MARK_SIZE} mark={HEADER_MARK} bleed={MARK_BLEED} /></span>textile</a>
  <nav aria-label="Site" class="flex items-center gap-x-1 sm:gap-x-3">
    <a class="nav-link" href="/docs/">Docs</a>
    <a class="nav-link github" href={GITHUB_URL}>GitHub</a>
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
  <a href="/" class="wordmark" aria-label="Textile home"><img class="mark" src="/icons/light-64.png" alt="" width="32" height="32" />textile</a>
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
  /* As wide as the hero it sits over; everything below the hero sits in the narrower container. */
  .site-header {
    position: relative;
    z-index: 3;
    display: flex;
    align-items: center;
    justify-content: space-between;
    gap: 1rem;
    height: var(--header-height);
    padding-inline: var(--hero-inset);
  }
  /* `--inset` is the side padding that holds a full-width block's content to the container: the gutter, or wider
     where the screen is wider than the container. Its percentage resolves against the block it pads. The hero and
     header use a wider container, so the hero spans the screen without running edge to edge. */
  :global(:root) {
    --header-height: 5.5rem;
    --gutter: clamp(1.25rem, 4vw, 4.5rem);
    --container: 96rem;
    --inset: max(var(--gutter), (100% - var(--container)) / 2);
    --hero-inset: max(var(--gutter), (100% - 108rem) / 2);
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
  /* The trefoil beside the name, in dark mode only, as it is light: in the header drawn live by the cord's shaders,
     as light over the hero's threads; in the footer, `pnpm logo`'s still light-64. Hidden, the live one never starts
     its GPU work. */
  .mark {
    display: none;
    margin-right: 0.3em;
  }
  /* The footer's still mark, a rendered icon, at the footer wordmark's smaller size. */
  img.mark {
    width: 1.1em;
    height: 1.1em;
  }
  /* The live mark holds its place beside the name; its canvas, several times wider, is centred on it and laid behind
     the name, so its glow spreads out past the knot and under the letters, and fades out long before its edge. */
  span.mark {
    position: relative;
    z-index: -1;
    width: var(--mark-size);
    height: var(--mark-size);
  }
  .mark :global(canvas) {
    position: absolute;
    top: 50%;
    left: 50%;
    translate: -50% -50%;
    pointer-events: none;
    /* The bloom's faintest veil reaches the canvas's edge; it tapers away from just outside the knot (a fifth of the
       canvas) to nothing there, so the glow fades out without a square. */
    mask-image: radial-gradient(closest-side, #000 22%, rgb(0 0 0 / 0.35) 55%, transparent);
  }
  :global(:root.dark) .mark,
  :global(:root:has([data-scheme='dark'])) .mark {
    display: block;
  }
  @media (prefers-color-scheme: dark) {
    :global(:root:not(.light)) .mark {
      display: block;
    }
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
    white-space: nowrap;
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
  /* Narrow phones fit the mark, the name, Docs and Sign in within the gutters; GitHub stays in the footer. */
  @media (max-width: 24rem) {
    .nav-link.github {
      display: none;
    }
  }
  .site-footer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem 2.5rem;
    margin-top: 8rem;
    padding: 2rem var(--inset) 2.5rem;
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
