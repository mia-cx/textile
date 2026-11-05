<script lang="ts">
import { page } from '$app/state'
</script>

<svelte:head>
  <title>{page.status === 404 ? 'Page not found' : 'Something went wrong'} · Textile</title>
  <meta name="robots" content="noindex" />
</svelte:head>

<section class="mx-auto max-w-2xl px-4 pt-16 sm:px-8 sm:pt-24">
  {#if page.status === 404}
    <h1 class="text-4xl font-extrabold sm:text-5xl">Page not found</h1>
    <p class="mt-5 text-lg">Nothing lives at this address. <a href="/">Go to the home page</a> or <a href="/docs/">read the docs</a>.</p>
  {:else}
    <h1 class="text-4xl font-extrabold sm:text-5xl">Something went wrong</h1>
    <p class="mt-5 text-lg">{page.error?.message}</p>
    <div class="mt-8">
      <a class="button button-primary" href="/login" data-sveltekit-reload>Sign in again</a>
    </div>
  {/if}
</section>
