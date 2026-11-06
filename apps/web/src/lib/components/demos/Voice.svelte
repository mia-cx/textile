<script lang="ts">
import { tick } from 'svelte'
import { VOICE_NOTICE } from '$lib/landing'
import Message from '../discord/Message.svelte'
import Window from '../discord/Window.svelte'

/**
 * A voice channel's speakers, each heard as their own thread to the agent's socket, beside the notice the bot posts
 * first (packages/bot-host/src/consent.ts). Its buttons answer as they do in Discord, with a reply only the clicker
 * sees, and opting out takes your thread away, as relay does. Only on this page: nothing changes in Discord.
 */
type Scope = 'here' | 'all'
const SPEAKERS = [
  { name: 'Ana', you: false },
  { name: 'Kofi', you: false },
  { name: 'you', you: true },
] as const

let choice = $state<{ scope: Scope; undone: boolean }>()
let answer = $state<HTMLParagraphElement>()
const optedOut = $derived(choice !== undefined && !choice.undone)

const reply = (scope: Scope, undone: boolean) =>
  scope === 'here'
    ? undone
      ? VOICE_NOTICE.undoneHere
      : VOICE_NOTICE.optedOutHere
    : undone
      ? VOICE_NOTICE.undoneAll
      : VOICE_NOTICE.optedOutAll

/** Undo removes its own button, so focus moves to the reply it leaves rather than falling to the page. */
async function undo() {
  if (!choice) return
  choice = { ...choice, undone: true }
  await tick()
  answer?.focus()
}
</script>

<div class="voice">
  <figure class="speakers" aria-label="Who the agent hears">
    <ul>
      {#each SPEAKERS as speaker, i}
        <li class="speaker" class:silent={speaker.you && optedOut} style:--i={i}>
          <span class="avatar" aria-hidden="true">{speaker.name.slice(0, 1).toUpperCase()}</span>
          <span class="name">{speaker.name}</span>
          <svg class="stream" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
            <path class="line" d="M0 20 C 120 20, 260 20, 400 20" />
            <path class="voice-wave" d="M0 20 C 20 6, 40 34, 60 20 S 100 6, 120 20 S 160 34, 180 20 S 220 4, 240 20 S 280 36, 300 20 S 340 8, 360 20 S 390 30, 400 20" pathLength="1" />
          </svg>
          <span class="state">{speaker.you && optedOut ? 'not relayed' : 'relayed'}</span>
        </li>
      {/each}
    </ul>
    <figcaption><code>/voice</code> socket, one stream per speaker</figcaption>
  </figure>

  <div>
    <Window channel="lounge" label="The notice in the voice channel’s chat">
      <Message author="Weaver" bot time="Today at 8:30 PM">
        <p>{VOICE_NOTICE.notice}</p>
        <div class="actions">
          <button type="button" class="discord-button" onclick={() => (choice = { scope: 'here', undone: false })}>
            {VOICE_NOTICE.optOutHere}
          </button>
          <button type="button" class="discord-button" onclick={() => (choice = { scope: 'all', undone: false })}>
            {VOICE_NOTICE.optOutAll}
          </button>
        </div>
      </Message>
      <!-- The reply's space is kept, so answering never moves the page. -->
      <div class="reply" aria-live="polite">
        {#if choice}
          <Message author="Weaver" bot time="Today at 8:31 PM">
            <div class="ephemeral">
              <p bind:this={answer} tabindex="-1">{reply(choice.scope, choice.undone)}</p>
              {#if !choice.undone}
                <button type="button" class="discord-button" onclick={undo}>Undo</button>
              {/if}
              <p class="only-you">Only you can see this</p>
            </div>
          </Message>
        {/if}
      </div>
    </Window>
    <p class="note">A simulation: its buttons change nothing in Discord.</p>
  </div>
</div>

<style>
  .voice {
    display: grid;
    gap: 1.25rem;
  }
  .speakers {
    margin: 0;
    padding: 1.25rem 1.5rem;
    border: 1px solid var(--rule);
    border-radius: var(--radius-l);
    background: var(--surface);
  }
  ul {
    display: grid;
    gap: 0.75rem;
  }
  .speaker {
    display: grid;
    grid-template-columns: 2.5rem 3.5rem minmax(0, 1fr) 6.5rem;
    align-items: center;
    gap: 0.75rem;
    transition: opacity var(--duration-slow) var(--ease-smooth-out);
  }
  .avatar {
    display: grid;
    place-items: center;
    width: 2.5rem;
    height: 2.5rem;
    border-radius: 50%;
    background: #4e5058;
    color: #fff;
    font-weight: 600;
  }
  .name {
    color: var(--ink);
    font-weight: 550;
  }
  .stream {
    width: 100%;
    height: 2.5rem;
    overflow: visible;
  }
  .stream path {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .line {
    stroke: color-mix(in srgb, var(--thread-silver) 30%, transparent);
    stroke-width: 1;
  }
  .voice-wave {
    stroke: var(--thread-violet);
    stroke-width: 1.5;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--thread-violet) 70%, transparent));
  }
  .speaker:nth-child(2) .voice-wave {
    stroke: var(--thread-amber);
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--thread-amber) 70%, transparent));
  }
  .speaker:nth-child(3) .voice-wave {
    stroke: var(--thread-silver);
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--thread-silver) 60%, transparent));
  }
  .state {
    color: var(--muted);
    font-family: var(--font-code);
    font-size: 0.8125rem;
    text-align: right;
  }
  .silent {
    opacity: 0.4;
  }
  .silent .voice-wave {
    visibility: hidden;
  }
  figcaption {
    margin-top: 1rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }
  figcaption code {
    color: var(--ink);
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
    border-radius: 0.5rem;
    background: #4e5058;
    color: #fff;
    font-weight: 500;
    cursor: pointer;
    transition: background-color var(--duration-quick) var(--ease-out);
  }
  .discord-button:hover {
    background: #6d6f78;
  }
  .reply {
    min-height: 8.5rem;
  }
  .ephemeral {
    display: grid;
    justify-items: start;
    gap: 0.375rem;
  }
  .only-you {
    color: #949ba4;
    font-size: 0.8125rem;
  }
  .note {
    margin-top: 0.75rem;
    color: var(--muted);
    font-size: 0.9375rem;
  }

  /* Each speaker's voice flows toward the socket while they talk, in turns. */
  @media (prefers-reduced-motion: no-preference) {
    .voice-wave {
      stroke-dasharray: 0.18 0.06;
      animation: flow 2.4s linear infinite;
      animation-delay: calc(var(--i) * -0.8s);
    }
  }
  @keyframes flow {
    to {
      stroke-dashoffset: -0.48;
    }
  }
</style>
