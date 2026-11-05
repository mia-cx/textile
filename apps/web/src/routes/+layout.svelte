<script lang="ts">
import '../app.css'
import Mark from '$lib/components/Mark.svelte'
import PageMarkdown from '$lib/components/PageMarkdown.svelte'
import { GITHUB_URL } from '$lib/site'

let { data, children } = $props()
</script>

<a href="#content" class="skip">Skip to content</a>

<header class="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3 sm:px-8">
  <a href="/" class="flex min-h-11 items-center gap-2.5 text-ink no-underline" aria-label="Textile home">
    <Mark class="size-8" />
    <span class="wordmark">textile</span>
  </a>
  <nav aria-label="Site" class="flex items-center gap-x-5 text-[0.9375rem] sm:gap-x-7">
    <a class="nav-link" href="/docs/">Docs</a>
    <a class="nav-link" href={GITHUB_URL}>GitHub</a>
    {#if data.signedIn}
      <a class="nav-link" href="/access">Your access</a>
    {:else}
      <a class="nav-link" href="/login" data-sveltekit-reload>Sign in</a>
    {/if}
  </nav>
</header>

<main id="content" tabindex="-1">
  {@render children()}
</main>

<footer class="mx-auto mt-24 max-w-6xl border-t border-rule px-4 pt-6 pb-10 text-[0.9375rem] sm:px-8">
  <div class="flex flex-wrap items-center justify-between gap-x-10 gap-y-2">
    <nav aria-label="Footer" class="flex flex-wrap gap-x-5">
      <a class="nav-link" href="/docs/">Docs</a>
      <a class="nav-link" href={GITHUB_URL}>GitHub</a>
      <a class="nav-link" href="/llms.txt">llms.txt</a>
      <a class="nav-link" href="/terms">Terms</a>
      <a class="nav-link" href="/privacy">Privacy</a>
    </nav>
    <PageMarkdown />
  </div>
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
  .wordmark {
    font-size: 1.5rem;
    font-weight: 800;
    letter-spacing: -0.02em;
    font-variation-settings: var(--axes-display);
  }
  .nav-link {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--text);
    text-decoration: none;
  }
  .nav-link:hover {
    color: var(--accent-text);
    text-decoration: underline;
  }
</style>
