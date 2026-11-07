<script lang="ts">
import { standupReply } from '$lib/landing'
import Message from '../discord/Message.svelte'
import { today } from '../discord/time'
import Window from '../discord/Window.svelte'

/**
 * Run /standup and the bot answers as the workflow would: the reply its code builds, with your last answer, which it
 * keeps in KV. Only on this page: nothing reaches Discord. The two newest replies show, so the window never changes
 * size.
 */
const SHOWN = 2
let shipped = $state('')
let replies = $state([
  { id: 1, shipped: 'the pricing page', last: undefined as string | undefined },
  { id: 2, shipped: 'dark mode for the docs', last: 'the pricing page' },
])

function onsubmit(event: SubmitEvent) {
  event.preventDefault()
  const text = shipped.trim()
  if (text === '') return
  const previous = replies.at(-1)
  const id = (previous?.id ?? 0) + 1
  replies = [...replies, { id, shipped: text, last: previous?.shipped }].slice(-SHOWN)
  shipped = ''
}
</script>

<!-- The page's cord enters the window's left edge, level with the composer, where the interaction starts. -->
<div data-weave="left">
  <Window channel="standup" label="Your bot answering /standup in Discord" class="slash-window" live>
    {#each replies as reply (reply.id)}
      <Message author="Weaver" bot time={today(9 * 60 + 10 + reply.id)} used={{ by: 'you', command: '/standup' }}>
        {standupReply(reply.shipped, reply.last)}
      </Message>
    {/each}
    {#snippet footer()}
      <form class="composer" {onsubmit} data-weave-y>
        <label class="command" for="shipped">
          <span class="name">/standup</span>
          <span class="option">shipped</span>
        </label>
        <input id="shipped" bind:value={shipped} maxlength="80" autocomplete="off" placeholder="what you shipped" />
        <button type="submit" class="send">Send</button>
      </form>
    {/snippet}
  </Window>
</div>
<p class="note">Try it here. This demo sends nothing to Discord.</p>

<style>
  :global(.slash-window .messages) {
    min-height: 15rem;
  }
  .composer {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: 0.5rem;
    padding: 0.375rem 0.375rem 0.375rem 0.875rem;
    border-radius: 0.75rem;
    background: rgb(255 255 255 / 0.06);
  }
  .command {
    display: flex;
    flex: none;
    align-items: center;
    gap: 0.5rem;
    color: #f2f3f5;
    font-weight: 600;
  }
  .option {
    padding: 0.125rem 0.5rem;
    border-radius: 0.375rem;
    background: rgb(255 255 255 / 0.1);
    color: #dbdee1;
    font-weight: 500;
    font-size: 0.9375rem;
  }
  .option::after {
    content: ':';
  }
  /* Never narrower than room for a few words: on a phone, the input and Send wrap below the command instead. */
  input {
    flex: 1 1 9rem;
    min-width: 0;
    min-height: 2.75rem;
    padding-inline: 0.25rem;
    background: transparent;
    color: #f2f3f5;
    font: inherit;
  }
  input::placeholder {
    color: #949ba4;
  }
  input:focus-visible {
    outline: none;
  }
  .composer:focus-within {
    box-shadow: 0 0 0 2px var(--focus);
  }
  .send {
    flex: none;
    min-height: 2.75rem;
    padding-inline: 1.125rem;
    border-radius: 0.5rem;
    background: var(--accent);
    color: var(--on-accent);
    font-weight: 550;
    cursor: pointer;
    transition: background-color var(--duration-quick) var(--ease-out);
  }
  .send:hover {
    background: color-mix(in srgb, var(--accent) 85%, white);
  }
  .note {
    margin-top: 0.75rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }
</style>
