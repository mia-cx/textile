<script lang="ts">
import Seo from '$lib/components/Seo.svelte'
import { COMMUNITY } from '$lib/site'
import type { PageProps } from './$types'

let { data }: PageProps = $props()
</script>

<Seo path="/access" noindex />

<section class="mx-auto max-w-2xl px-4 pt-16 sm:px-8 sm:pt-24">
  {#if !data.signedIn}
    <h1 class="text-4xl font-extrabold sm:text-5xl">Sign in to Textile</h1>
    <p class="mt-5 text-lg">Sign in with Discord to see whether you have access to the alpha.</p>
    <div class="mt-8">
      <a class="button button-primary" href="/login" data-sveltekit-reload>Sign in with Discord</a>
    </div>
  {:else if data.access}
    <h1 class="text-4xl font-extrabold sm:text-5xl">You’re in</h1>
    <p class="mt-5 text-lg">You have access to the Textile alpha. Connect your agent to start.</p>
    <div class="mt-8">
      <a class="button button-primary" href="/docs/connecting/">Connect an agent</a>
    </div>
  {:else}
    <h1 class="text-4xl font-extrabold sm:text-5xl">You don’t have access yet</h1>
    <p class="mt-5 text-lg">
      Access to Textile opens in rounds, by invitation. Join {COMMUNITY.name} to follow progress and get
      invited in the next round.
    </p>
    <div class="mt-8">
      <a class="button button-primary" href={COMMUNITY.invite}>Join the Discord server</a>
    </div>
  {/if}

  {#if data.signedIn}
    <form method="POST" action="/logout" class="mt-12 border-t border-rule pt-4">
      <button class="sign-out" type="submit">Sign out</button>
    </form>
  {/if}
</section>

<style>
  .sign-out {
    min-height: 2.75rem;
    color: var(--accent-text);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  .sign-out:hover {
    text-decoration-thickness: 2px;
  }
</style>
