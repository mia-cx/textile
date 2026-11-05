<script lang="ts">
import { tick } from 'svelte'

/**
 * The notice a bot posts in a voice channel's chat before it relays anyone's voice, with its real copy and buttons
 * (packages/bot-host/src/consent.ts). The buttons answer as they do in Discord, with a reply only the clicker sees,
 * but only here.
 */
type Choice = 'bot' | 'all'
const OPT_OUT: Record<Choice, string> = {
  bot: 'I won’t relay your voice in this server.',
  all: 'No Textile bot will relay your voice.',
}
const UNDO: Record<Choice, string> = {
  bot: 'I can relay your voice in this server again.',
  all: 'Textile bots can relay your voice again.',
}
let reply = $state<{ choice: Choice; undone: boolean } | undefined>()
let answer = $state<HTMLParagraphElement>()

/** Undo removes its own button, so focus moves to the answer it leaves behind rather than falling to the page. */
async function undo() {
  if (!reply) return
  reply = { ...reply, undone: true }
  await tick()
  answer?.focus()
}
</script>

<div>
<figure class="m-0">
  <div class="message">
    <div class="avatar" aria-hidden="true"></div>
    <div class="min-w-0">
      <p class="author" data-markdown="skip">Your bot <span class="badge">App</span></p>
      <blockquote>I’m relaying voice in this channel to an AI agent.</blockquote>
      <!-- The Markdown twin keeps these labels: they are the notice's real wording. -->
      <ul class="actions">
        <li>
          <button type="button" class="discord-button" data-markdown="keep" onclick={() => (reply = { choice: 'bot', undone: false })}>
            Opt out here
          </button>
        </li>
        <li>
          <button type="button" class="discord-button" data-markdown="keep" onclick={() => (reply = { choice: 'all', undone: false })}>
            Opt out of all Textile bots
          </button>
        </li>
      </ul>
    </div>
  </div>
  <figcaption data-markdown="skip">A preview of the notice. Its buttons answer here, but change nothing in Discord.</figcaption>
</figure>
  <!-- The reply's space is kept, so answering never moves the page. -->
  <div class="reply-slot" aria-live="polite">
    {#if reply}
      <div class="message reply">
        <div class="avatar" aria-hidden="true"></div>
        <div class="min-w-0">
          <p class="only-you">Only you can see this</p>
          <p bind:this={answer} tabindex="-1">{reply.undone ? UNDO[reply.choice] : OPT_OUT[reply.choice]}</p>
          {#if !reply.undone}
            <button type="button" class="discord-button mt-2" onclick={undo}>
              Undo
            </button>
          {/if}
        </div>
      </div>
    {/if}
  </div>
</div>

<style>
  .message {
    display: flex;
    gap: 0.875rem;
    padding: 1rem 1.125rem;
    border: 1px solid var(--rule);
    border-radius: var(--radius-l);
    background: var(--surface);
  }
  .avatar {
    flex: none;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background:
      repeating-linear-gradient(90deg, var(--warp) 0 4px, transparent 4px 8px),
      var(--weft);
  }
  .author {
    color: var(--ink);
    font-weight: 700;
  }
  .badge {
    margin-left: 0.25rem;
    padding: 0.05rem 0.3rem;
    border-radius: var(--radius-s);
    background: var(--accent);
    color: var(--on-accent);
    font-size: 0.6875rem;
    font-weight: 700;
    vertical-align: 0.15em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 0.5rem;
    margin-top: 0.625rem;
  }
  .discord-button {
    min-height: 2.75rem;
    padding: 0.375rem 1rem;
    border-radius: var(--radius-m);
    background: var(--sunken);
    color: var(--ink);
    font-weight: 600;
    cursor: pointer;
    transition: background-color 150ms ease-out;
  }
  .discord-button:hover {
    background: var(--rule);
  }
  figcaption {
    margin-top: 0.625rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }
  .reply-slot {
    min-height: 9rem;
    margin-top: 1rem;
  }
  .reply {
    border-style: dashed;
  }
  .only-you {
    color: var(--muted);
    font-size: 0.8125rem;
  }
</style>
