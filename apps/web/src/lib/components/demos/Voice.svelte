<script lang="ts">
import { type Snippet, tick } from 'svelte'
import type { Attachment } from 'svelte/attachments'
import { VOICE_NOTICE } from '$lib/landing'
import Message from '../discord/Message.svelte'
import Window from '../discord/Window.svelte'

/**
 * A voice channel's speakers, each heard as their own thread to the agent's socket, beside the notice the bot posts
 * first (packages/bot-host/src/consent.ts). Its buttons answer as they do in Discord, with a reply only the clicker
 * sees, and opting out takes your thread away, as relay does. Only on this page: nothing changes in Discord.
 *
 * `children` is the page's words about the notice: before it, stacked; beside it, side by side.
 */
let { children }: { children?: Snippet } = $props()

type Scope = 'here' | 'all'

/**
 * How each speaker sounds, in the stream's units (400 across): how long a phrase is, the share of phrases they speak,
 * how long a syllable is, the wavelength of their voice, and a seed of their own.
 */
const SPEAKERS = [
  { name: 'Ana', you: false, phrase: 210, talks: 0.65, syllable: 14, pitch: 1.9, seed: 1 },
  { name: 'Kofi', you: false, phrase: 260, talks: 0.6, syllable: 19, pitch: 2.6, seed: 2 },
  { name: 'you', you: true, phrase: 180, talks: 0.55, syllable: 12, pitch: 2.2, seed: 3 },
] as const
type Voice = (typeof SPEAKERS)[number]

/** The stream's width and middle, its loudest swing either side, and how many points draw it. */
const STREAM = { width: 400, middle: 20, swing: 18, points: 1000 } as const
/** How fast each voice flows along its stream toward the socket, in units a second. */
const FLOW = 90
/** Of each phrase, the share spoken (the rest a pause) and the share it takes to swell in and die away. */
const SPOKEN = 0.72
const ATTACK = 0.06
/** The share of syllables left silent: the gaps between words. */
const GAPS = 0.2
/** How far apart in their audio the voices start, in units. */
const AUDIO_APART = 997
/** The moment drawn when motion is reduced, in seconds: one with every speaker mid-phrase. */
const STILL_AT = 2.9

const hash = (n: number, seed: number) => {
  const x = Math.sin(n * 12.9898 + seed * 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * How loud `voice` is at `u` along its audio (0 to 1): phrases, some spoken and some not, each a run of syllables of
 * uneven loudness, with gaps between words, swelling in and dying away at its ends.
 */
function loudness(voice: Voice, u: number) {
  const along = u / voice.phrase
  const phrase = Math.floor(along)
  if (hash(phrase, voice.seed) > voice.talks) return 0
  const f = along - phrase
  const speaking = Math.min(1, f / ATTACK, (SPOKEN - f) / ATTACK)
  if (speaking <= 0) return 0
  // Syllables run a little faster and slower, as speech does.
  const q = u / voice.syllable + 0.35 * Math.sin(u / 23 + voice.seed)
  const syllable = Math.floor(q)
  const peak = hash(syllable, voice.seed + 7)
  if (peak < GAPS) return 0
  return speaking * (0.35 + 0.65 * peak) * Math.sin(Math.PI * (q - syllable)) ** 0.7
}

/** The voice itself at `u`: a few tones, close and dense, under its loudness. */
function tone(voice: Voice, u: number) {
  const k = (2 * Math.PI) / voice.pitch
  return (
    0.55 * Math.sin(k * u) +
    0.3 * Math.sin(k * 1.59 * u + 1.3) +
    0.15 * Math.sin(k * 0.37 * u + 0.7)
  )
}

/** The stream's path for `voice` at `t` seconds: its audio flowing from the speaker, on the left, to the socket. */
function wave(voice: Voice, t: number) {
  const step = STREAM.width / STREAM.points
  let d = ''
  for (let n = 0; n <= STREAM.points; n++) {
    const x = n * step
    // Each voice is at its own place in its audio, so no two pause together.
    const u = x - FLOW * t + voice.seed * AUDIO_APART
    const y = STREAM.middle + STREAM.swing * loudness(voice, u) * tone(voice, u)
    d += `${n ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(2)}`
  }
  return d
}

let waves = $state(SPEAKERS.map((voice) => wave(voice, STILL_AT)))

/** The streams flow while they are on screen and motion is welcome; otherwise they hold one moment still. */
const flowing: Attachment<HTMLElement> = (figure) => {
  const motion = matchMedia('(prefers-reduced-motion: no-preference)')
  let frame = 0
  let seen = false
  const start = performance.now() / 1000 - STILL_AT
  const draw = () => {
    waves = SPEAKERS.map((voice) => wave(voice, performance.now() / 1000 - start))
    frame = requestAnimationFrame(draw)
  }
  const update = () => {
    cancelAnimationFrame(frame)
    frame = 0
    if (seen && motion.matches) frame = requestAnimationFrame(draw)
    else if (!motion.matches) waves = SPEAKERS.map((voice) => wave(voice, STILL_AT))
  }
  const watch = new IntersectionObserver(([entry]) => {
    seen = entry?.isIntersecting ?? false
    update()
  })
  watch.observe(figure)
  motion.addEventListener('change', update)
  return () => {
    cancelAnimationFrame(frame)
    watch.disconnect()
    motion.removeEventListener('change', update)
  }
}

/** The latest click, which the reply answers. */
let choice = $state<{ scope: Scope; undone: boolean }>()
/** Each scope's opt-out, kept apart as Textile stores them: either one keeps your voice from being relayed. */
let opted = $state<Record<Scope, boolean>>({ here: false, all: false })
let answer = $state<HTMLParagraphElement>()
const optedOut = $derived(opted.here || opted.all)

function optOut(scope: Scope) {
  choice = { scope, undone: false }
  opted[scope] = true
}

/** Every reply the notice can give: opting out of either scope, and undoing it. */
const REPLIES = [
  { scope: 'here', undone: false },
  { scope: 'here', undone: true },
  { scope: 'all', undone: false },
  { scope: 'all', undone: true },
] as const

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
  opted[choice.scope] = false
  await tick()
  answer?.focus()
}
</script>

<!-- Side by side, the page's cord comes apart here: its three strands become the three speakers' streams. -->
<div class="frame">
  <div class="voice">
    <figure class="speakers" aria-label="Who the agent hears" data-weave="top" data-weave-at="0.06" {@attach flowing}>
      <ul>
        {#each SPEAKERS as speaker, i}
          <li class="speaker" class:silent={speaker.you && optedOut}>
            <span class="avatar" aria-hidden="true" data-weave-end>{speaker.name.slice(0, 1).toUpperCase()}</span>
            <span class="name">{speaker.name}</span>
            <svg class="stream" viewBox="0 0 400 40" preserveAspectRatio="none" aria-hidden="true" focusable="false">
              <!-- Each stream runs violet to amber, or back, as the strands that reach the speakers do. -->
              <defs>
                <linearGradient id="voice-{i}" gradientUnits="userSpaceOnUse" x1="0" x2={STREAM.width} y1="0" y2="0">
                  <stop offset="0" class={i % 2 ? 'amber' : 'violet'} />
                  <stop offset="0.33" class={i % 2 ? 'warm' : 'cool'} />
                  <stop offset="0.67" class={i % 2 ? 'cool' : 'warm'} />
                  <stop offset="1" class={i % 2 ? 'violet' : 'amber'} />
                </linearGradient>
              </defs>
              <path class="voice-wave" d={waves[i]} stroke="url(#voice-{i})" />
            </svg>
            <span class="state">{speaker.you && optedOut ? 'not relayed' : 'relayed'}</span>
          </li>
        {/each}
      </ul>
      <figcaption><code>/voice</code> socket, one stream per speaker</figcaption>
    </figure>

    {#if children}
      <div class="aside">{@render children()}</div>
    {/if}
    <div class="notice">
      <Window channel="lounge" label="Voice opt-out notice">
        <Message author="Weaver" bot time="Today at 8:30 PM">
          <p>{VOICE_NOTICE.notice}</p>
          <div class="actions">
            <button type="button" class="discord-button" onclick={() => optOut('here')}>
              {VOICE_NOTICE.optOutHere}
            </button>
            <button type="button" class="discord-button" onclick={() => optOut('all')}>
              {VOICE_NOTICE.optOutAll}
            </button>
          </div>
        </Message>
        <!-- Every reply sits unseen in the reply's cell, so the cell is as tall as the tallest at any width and answering
             never moves the page. -->
        <div class="reply">
          {#each REPLIES as { scope, undone }}
            <div class="sizer" aria-hidden="true" inert>
              <Message author="Weaver" bot time="Today at 8:31 PM">
                <div class="ephemeral">
                  <p>{reply(scope, undone)}</p>
                  {#if !undone}<button type="button" class="discord-button">Undo</button>{/if}
                  <p class="only-you">Only you can see this</p>
                </div>
              </Message>
            </div>
          {/each}
          <div aria-live="polite">
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
        </div>
      </Window>
      <p class="note">These buttons only change the demo.</p>
    </div>
  </div>
</div>

<style>
  .frame {
    container-type: inline-size;
  }
  .voice {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
  }
  .aside {
    font-size: clamp(1.125rem, 1rem + 0.3vw, 1.3125rem);
  }
  .aside :global(p + p) {
    margin-top: 1.25rem;
  }
  /* Across a wide page, on the page's twelve columns (`--column-gap` between them): the speakers run the full width on
     the open page, their streams long threads to the socket, indented two columns, where the heading starts, so the
     cord's strands can reach each one. Below them, the notice takes the heading's columns, three to seven, and the words
     about it take the prose's, eight on. */
  @container (min-width: 60rem) {
    .frame .voice {
      --column: calc((100cqi + var(--column-gap, 0px)) / 12);
      --indent: calc(2 * var(--column));
      grid-template-columns: calc(7 * var(--column) - var(--column-gap, 0px)) minmax(0, 1fr);
      gap: 3rem var(--column-gap, 0px);
    }
    .frame .speakers {
      grid-column: 1 / -1;
      padding: 1.5rem 0 0 var(--indent);
      border: 0;
      background: none;
    }
    .frame ul {
      gap: 1.5rem;
    }
    .notice {
      grid-row: 2;
      grid-column: 1;
      width: min(100% - var(--indent), 40rem);
      margin-left: var(--indent);
    }
    .aside {
      grid-row: 2;
      grid-column: 2;
      max-width: 38rem;
      padding-top: 1.5rem;
    }
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
  .violet {
    stop-color: var(--thread-violet);
  }
  .amber {
    stop-color: var(--thread-amber);
  }
  /* Between the two, mixed in OKLCH, which keeps their chroma, through magenta and pink as the threads run: a plain
     OKLab mix would grey the middle. */
  .cool {
    stop-color: color-mix(in oklch, var(--thread-violet) 67%, var(--thread-amber));
  }
  .warm {
    stop-color: color-mix(in oklch, var(--thread-violet) 33%, var(--thread-amber));
  }
  .voice-wave {
    stroke-width: 1.25;
    stroke-linejoin: round;
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
    display: grid;
  }
  .reply > * {
    grid-area: 1 / 1;
  }
  .sizer {
    visibility: hidden;
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

</style>
