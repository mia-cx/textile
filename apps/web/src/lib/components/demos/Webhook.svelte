<script lang="ts">
import { ROUTE, SECRET } from '$lib/landing'
import Message from '../discord/Message.svelte'
import { today } from '../discord/time'
import Window from '../discord/Window.svelte'

/**
 * Call the workflow's route as an outside service would, with its secret or without, and see what the handler does
 * with each: post and answer `ok`, or refuse with `401`. Only on this page: nothing is sent.
 */
const TEXT = 'Deployed v2.4.1'
const BODY = `{ "text": "${TEXT}" }`
const SHOWN = 2
let response = $state<{ status: 200 | 401; body: string }>()
/** What the route has posted: an earlier deploy, then one per accepted request. */
let posts = $state([{ id: 0, text: 'Deployed v2.4.0', time: 'Yesterday at 6:02 PM' }])

function send(withSecret: boolean) {
  if (!withSecret) {
    response = { status: 401, body: 'unauthorized' }
    return
  }
  const id = (posts.at(-1)?.id ?? 0) + 1
  posts = [...posts, { id, text: TEXT, time: today(16 * 60 + 20 + id) }].slice(-SHOWN)
  response = { status: 200, body: 'ok' }
}
</script>

<!-- The page's cord arrives at the request, and a strand carries it on to the window the workflow posts in. -->
<div class="frame">
  <div class="webhook">
    <div class="request" data-weave="top" data-weave-at="0.5" data-weave-split>
      <!-- The route is wider than a phone, so the request scrolls sideways; keyboard users focus it to scroll. -->
      <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
      <pre class="http" tabindex="0" role="region" aria-label="The webhook request"><span class="method">POST</span> {ROUTE}
<span class="header">Authorization:</span> Bearer {SECRET}
<span class="header">Content-Type:</span> application/json

{BODY}</pre>
      <div class="actions">
        <button type="button" class="button button-primary" onclick={() => send(true)}>Send request</button>
        <button type="button" class="button button-secondary" onclick={() => send(false)}>Send without the secret</button>
      </div>
      <p class="response" aria-live="polite">
        {#if response}
          <span class="status" class:refused={response.status === 401}>{response.status}</span>
          <code>{response.body}</code>
        {/if}
      </p>
    </div>
    <div data-weave-end>
      <Window channel="deploys" label="Where the workflow posts in Discord" class="webhook-window">
        {#each posts as post (post.id)}
          <Message author="Weaver" bot time={post.time}>{post.text}</Message>
        {/each}
      </Window>
    </div>
  </div>
</div>
<p class="note">A simulation: nothing is sent.</p>

<style>
  .frame {
    container-type: inline-size;
  }
  .webhook {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
  }
  /* Side by side, with room between for the strand that carries the request to the window. */
  @container (min-width: 50rem) {
    .webhook {
      grid-template-columns: minmax(0, 1.2fr) minmax(0, 1fr);
      column-gap: clamp(4rem, 8cqi, 7rem);
      align-items: center;
    }
  }
  .request {
    padding: 1.25rem;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: var(--radius-l);
    background: var(--code-bg);
    color: var(--code-text);
  }
  .http {
    overflow-x: auto;
    font-size: 0.875rem;
    line-height: 1.7;
    white-space: pre;
  }
  .method {
    color: var(--code-keyword);
  }
  .header {
    color: var(--code-key);
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.75rem;
    margin-top: 1.25rem;
  }
  .actions .button {
    min-height: 2.75rem;
    padding: 0.5rem 1.25rem;
    font-size: 1rem;
  }
  .actions .button-secondary {
    border-color: rgb(255 255 255 / 0.3);
    color: var(--code-text);
  }
  /* Room for the answer is kept, so it never moves the page. */
  .response {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    min-height: 2.75rem;
    margin-top: 0.75rem;
    font-family: var(--font-code);
    font-size: 0.9375rem;
  }
  .status {
    padding: 0.125rem 0.625rem;
    border-radius: var(--radius-pill);
    background: color-mix(in srgb, var(--thread-violet) 25%, transparent);
    color: var(--ink);
  }
  .status.refused {
    background: color-mix(in srgb, var(--thread-amber) 25%, transparent);
  }
  :global(.webhook-window .messages) {
    min-height: 10.5rem;
  }
  .note {
    margin-top: 0.75rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }
</style>
