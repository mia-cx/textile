<script lang="ts">
import DiscordLogo from '$lib/components/DiscordLogo.svelte'
import Seo from '$lib/components/Seo.svelte'
import { COMMUNITY } from '$lib/site'
import type { PageProps } from './$types'

let { data }: PageProps = $props()
</script>

<Seo path="/access" noindex />

<!-- The step after the landing page's sign-in, so it keeps the landing page's dark. -->
<section class="page" data-scheme="dark">
  {#if data.signedIn}
    <h1 class="page-title">You’re in</h1>
    <p class="page-lede">You have access to the Textile alpha. Connect your agent to start.</p>
    <div class="mt-10">
      <a class="button button-primary" href="/docs/connecting/">Connect an agent</a>
    </div>
    <form method="POST" action="/logout" class="mt-16 border-t border-rule pt-4">
      <button class="text-action" type="submit">Sign out</button>
    </form>
  {:else if data.denied}
    <h1 class="page-title">You don’t have access yet</h1>
    <p class="page-lede">
      Access to Textile opens in rounds, by invitation. Join {COMMUNITY.name} to follow progress and get
      invited in the next round.
    </p>
    <div class="mt-10">
      <a class="button button-primary" href={COMMUNITY.invite}>Join the Discord server</a>
    </div>
    <p class="mt-16 border-t border-rule pt-4">
      <a class="text-action" href="/login" data-sveltekit-reload>Sign in again</a>
    </p>
  {:else}
    <h1 class="page-title">Sign in to Textile</h1>
    <p class="page-lede">Sign in with Discord to see whether you have access to the alpha.</p>
    <div class="mt-10">
      <a class="button button-primary" href="/login" data-sveltekit-reload><DiscordLogo />Sign in with Discord</a>
    </div>
  {/if}
</section>

<style>
  .text-action {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--accent-text);
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
    cursor: pointer;
  }
  .text-action:hover {
    text-decoration-thickness: 2px;
  }
</style>
