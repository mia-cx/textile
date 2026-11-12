<script lang="ts">
import type { Snippet } from 'svelte'
import { page } from '$app/state'
import Seo from './Seo.svelte'

/**
 * A Textile policy, ported unchanged from mia.cx/textile, which keeps publishing it. Its canonical URL is here, on
 * textile.cx. The wording is Mia's.
 */
let { path, title, children }: { path: '/terms' | '/privacy'; title: string; children: Snippet } =
  $props()
</script>

<Seo {path} />

<article class="mx-auto max-w-[44rem] px-4 pt-14 sm:px-8 sm:pt-20">
  <h1 class="text-4xl font-extrabold sm:text-5xl">Textile {title.toLowerCase()}</h1>
  <p class="mt-5 text-muted">Effective <time datetime="2026-10-19">19 October 2026</time></p>
  <nav aria-label="Textile policies" class="mt-2 flex flex-wrap gap-x-6">
    <a class="policy" href="/terms" aria-current={page.url.pathname === '/terms' ? 'page' : undefined}>Terms of service</a>
    <a class="policy" href="/privacy" aria-current={page.url.pathname === '/privacy' ? 'page' : undefined}>Privacy policy</a>
  </nav>
  <div class="legal mt-6">
    {@render children()}
  </div>
</article>

<style>
  .policy {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
  }
  .policy[aria-current='page'] {
    color: var(--ink);
    text-decoration: none;
    font-weight: 600;
  }
  .legal :global(h2) {
    margin-top: 2.5rem;
    font-size: 1.5rem;
    font-weight: 750;
  }
  .legal :global(p) {
    margin-top: 1rem;
  }
  .legal :global(code) {
    padding: 0.05em 0.3em;
    border-radius: var(--radius-s);
    background: var(--sunken);
    color: var(--ink);
    font-size: 0.9em;
  }
  .legal {
    overflow-wrap: anywhere;
  }
</style>
