<script lang="ts">
import { page } from '$app/state'

/** Sign-in failures that another attempt can fix: central refused the code (400) or couldn't be reached (502). */
const RETRYABLE = new Set([400, 502])
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Unable to load this page'} · Textile</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="page">
  {#if page.status === 404}
    <h1 class="page-title">Page not found</h1>
    <p class="page-lede">This page doesn't exist. <a href="/">Go to the home page</a> or <a href="/docs/">read the docs</a>.</p>
  {:else}
    <h1 class="page-title">Unable to load this page</h1>
    <p class="page-lede">{page.error?.message}</p>
    <div class="mt-10">
      {#if RETRYABLE.has(page.status)}
        <a class="button button-primary" href="/login" data-sveltekit-reload>Sign in again</a>
      {:else}
        <a class="button button-primary" href="/">Go to the home page</a>
      {/if}
    </div>
  {/if}
</section>
