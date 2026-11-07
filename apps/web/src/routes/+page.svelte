<script lang="ts">
import DiscordLogo from '$lib/components/DiscordLogo.svelte'
import Publish from '$lib/components/demos/Publish.svelte'
import Schedule from '$lib/components/demos/Schedule.svelte'
import Script from '$lib/components/demos/Script.svelte'
import Slash from '$lib/components/demos/Slash.svelte'
import Voice from '$lib/components/demos/Voice.svelte'
import Webhook from '$lib/components/demos/Webhook.svelte'
import Message from '$lib/components/discord/Message.svelte'
import Window from '$lib/components/discord/Window.svelte'
import Section from '$lib/components/Section.svelte'
import Seo from '$lib/components/Seo.svelte'
import { CRON, ROUTE, STANDUP_POST, standupReply } from '$lib/landing'
import { GITHUB_URL, ORIGIN, page } from '$lib/site'
import { type Field, type Label, type Point, position, reach } from '$lib/threads/geometry'
import ThreadField from '$lib/threads/ThreadField.svelte'
import Weave from '$lib/threads/Weave.svelte'

/** What the page shows, as schema.org data. No offers or ratings: Textile has neither yet. */
const structuredData = JSON.stringify({
  '@context': 'https://schema.org',
  '@type': 'SoftwareApplication',
  name: 'Textile',
  url: `${ORIGIN}/`,
  description: page('/').description,
  applicationCategory: 'DeveloperApplication',
  operatingSystem: 'Any',
  sameAs: [GITHUB_URL],
})

let heroSection = $state<HTMLElement>()
let heroCopy = $state<HTMLElement>()
let heroWindow = $state<HTMLElement>()
let signIn = $state<HTMLElement>()

/** Below this width the hero stacks, and its threads come down into the top of the Discord window. */
const SIDE_BY_SIDE = 960
const clamp = (value: number, min: number, max: number) => Math.min(max, Math.max(min, value))

/**
 * The hero's event labels, each on a bright thread at the current's outer edge: two above the headline and two below
 * the buttons, out in clear dark, all left of the window. Each pair steps toward the braid along its edge, so the lower
 * pair mirrors the upper: the edge rises as the current narrows, so its label nearer the braid sits higher. (The
 * concept puts cron lower; there, its thread would leave the current.) Within a pair, one thread rides about a tenth of
 * the current further in than the other, so each label has a strand of its own, and none rides past 1.05, where a
 * thread leaves the current to run alone. Above the headline names sit over their knots; below the buttons they hang
 * under them, clear of their own threads rising toward the braid (ThreadField, which also haloes each name so a thread
 * swaying behind it runs under its letters). They are placed as fractions of the hero while the copy scales on its
 * own, so they show only from LABELLED pixels wide (the box, without a scrollbar) and LABELLED_HEIGHT tall, and each
 * only where it keeps clear of the copy (`clearOfCopy`).
 */
const LABELS: ReadonlyArray<Label> = [
  { text: 'messageCreate', at: 0.45, lane: -0.93 },
  { text: 'interactionCreate', at: 0.55, lane: -1.03 },
  { text: 'voiceStateUpdate', at: 0.32, lane: 0.93 },
  { text: `cron ${CRON}`, at: 0.47, lane: 1.05 },
]
const LABELLED = 1280
/** The shortest hero that shows the labels: on shorter screens the copy fills the bands they sit in. */
const LABELLED_HEIGHT = 760
/**
 * A label's text beside its knot, as ThreadField sets it: about 9px a character, 12px right of the knot, and reaching
 * 31px above it, or below it on the current's lower half (0.4rem, then one 24px line of 15px text).
 */
const LABEL_CHAR = 9
const LABEL_SPAN = 31
const LABEL_INSET = 12
/**
 * The least room a label keeps from the copy, and more below it: a label just under the buttons reads as their
 * caption, so one below the copy sits out in open dark or not at all.
 */
const LABEL_ROOM = 16
const LABEL_BELOW = 48

/**
 * Whether `label`, on `field`, keeps LABEL_ROOM from the hero's copy, and LABEL_BELOW under it, measured in the field's
 * pixels, wherever its knot sways. The copy is one block, headline to buttons, so a label never sits between its lines.
 */
function clearOfCopy(field: Field, label: Label) {
  if (!heroSection || !heroCopy) return false
  const origin = heroSection.getBoundingClientRect()
  const copy = heroCopy.getBoundingClientRect()
  // The knot is where the label's thread passes its `at`, whatever thread carries it.
  const [x, y] = position({ ...field, labels: [label] }, 0, label.at, 0)
  const room = LABEL_ROOM + reach(field, label.at)
  const below = LABEL_BELOW + reach(field, label.at)
  const [top, bottom] = label.lane > 0 ? [y, y + LABEL_SPAN] : [y - LABEL_SPAN, y]
  return (
    x + LABEL_INSET + label.text.length * LABEL_CHAR + room < copy.left - origin.left ||
    x - room > copy.right - origin.left ||
    bottom + room < copy.top - origin.top ||
    top - below > copy.bottom - origin.top
  )
}
/** How far short of the window's edge the cord ends, in CSS pixels. */
const TIP_GAP = 4

/** The hero: hundreds of threads streaming in from the left, braiding into the Discord window's left edge. */
function hero(
  { width, height }: { width: number; height: number },
  target: DOMRect | undefined,
): Field {
  if (width >= SIDE_BY_SIDE) {
    // The cord ends just short of the window, so its hot point shows; the window's edge glows where it meets it.
    const end: Point = target
      ? [target.x - TIP_GAP, target.y + target.height * 0.5]
      : [width * 0.66, height * 0.5]
    const field: Field = {
      start: [-width * 0.06, height * 0.5],
      control: [end[0] * 0.5, height * 0.5],
      end,
      spread: height * 0.54,
      cord: clamp(width * 0.006, 7, 13),
      // Past the headline: the braid gathers in the open space between the copy and the window.
      braid: 0.64,
      count: width > 1600 ? 560 : 440,
      intensity: 0.75,
      labels: [],
    }
    const labelled = width >= LABELLED && height >= LABELLED_HEIGHT
    return { ...field, labels: labelled ? LABELS.filter((label) => clearOfCopy(field, label)) : [] }
  }
  const end: Point = target
    ? [target.x + target.width * 0.5, target.y + 2]
    : [width * 0.5, height * 0.6]
  return {
    start: [-width * 0.3, height * 0.08],
    control: [end[0], end[1] - height * 0.32],
    end,
    spread: height * 0.2,
    cord: 6,
    braid: 0.6,
    count: 280,
    intensity: 0.7,
    labels: [],
  }
}

/** The close: threads braiding into the sign-in button. Only side by side; stacked, the close shows no field. */
function close(
  { width, height }: { width: number; height: number },
  target: DOMRect | undefined,
): Field {
  const end: Point = target
    ? [target.x + 2, target.y + target.height / 2]
    : [width * 0.6, height * 0.6]
  return {
    start: [-width * 0.08, height * 0.5],
    control: [end[0] * 0.55, end[1]],
    end,
    spread: height * 0.5,
    cord: 9,
    braid: 0.62,
    count: 520,
    intensity: 0.85,
    labels: [],
  }
}
</script>

<Seo path="/" />
<svelte:head>
  {@html `<script type="application/ld+json">${structuredData.replace(/</g, '\\u003c')}</script>`}
</svelte:head>

<div class="landing" data-scheme="dark">
  <section bind:this={heroSection} class="hero" aria-labelledby="title">
    <ThreadField layout={hero} target={heroWindow} />
    <div bind:this={heroCopy} class="hero-copy">
      <h1 id="title">Discord bots for AI agents</h1>
      <p class="lede">Host your Discord bot and manage it over MCP, with no server to run.</p>
      <div class="actions">
        <a class="button button-primary" href="/login" data-sveltekit-reload><DiscordLogo />Sign in with Discord</a>
        <a class="button button-secondary" href="/docs/">Read the docs</a>
      </div>
    </div>
    <!-- The window clips its contents, so the rim flare where the cord arrives lives on this frame around it. -->
    <div class="hero-window" data-weave-start>
      <Window bind:window={heroWindow} channel="standup" label="Your bot at work in Discord" class="hero-card">
        <Message author="Weaver" bot time="Today at 9:00 AM">{STANDUP_POST}</Message>
        <Message author="Weaver" bot time="Today at 9:12 AM" used={{ by: 'you', command: '/standup' }}>
          {standupReply('the onboarding flow', 'dark mode for the docs')}
        </Message>
      </Window>
    </div>
  </section>

  <Section id="publish" title="Bot hosting" event="tools/call" layout="wide">
    <p>
      Your bot can keep answering commands after you close your agent. Publish and enable a discord.js workflow
      through MCP.
    </p>
    <p>
      The example below runs a weekday standup. It posts a reminder and saves what each person shipped.
    </p>
    <p><a class="next-link" href="/docs/workflows/">Read about workflows</a></p>
    {#snippet demo()}<Publish />{/snippet}
  </Section>

  <Section id="slash" title="Slash commands" event="interactionCreate" layout="centred">
    <p>
      Register your slash commands and handle them in a workflow. Try /standup below to save an update and see your previous one.
    </p>
    {#snippet demo()}<Slash />{/snippet}
  </Section>

  <Section id="schedules" title="Scheduled messages" event="cron {CRON}" layout="prose-right">
    <p>
      Set a cron schedule for reminders or regular updates. This one posts in #standup at 9:00 UTC on weekdays.
    </p>
    {#snippet demo()}<Schedule />{/snippet}
  </Section>

  <Section
    id="webhooks"
    title="Webhook updates"
    event="POST {ROUTE.replace(/\/\d+\//, '/…/')}"
    layout="prose-left"
  >
    <p>
      Post a deploy update to Discord from your CI job. The route is public, so your handler must check the sender.
    </p>
    {#snippet demo()}<Webhook />{/snippet}
  </Section>

  <Section id="scripts" title="One-off scripts" event="discord_script_run" layout="wide-right">
    <p>
      Use <code class="prose-code">discord_script_run</code> to send several messages in one MCP call.
      This discord.js script posts three embeds.
    </p>
    {#snippet demo()}<Script />{/snippet}
  </Section>

  <Section id="voice" title="Voice chat" event="discord_voice_join" layout="span">
    <p>
      Connect your speech model to Discord over a WebSocket. Receive each speaker's audio separately in Opus or PCM16.
    </p>
    {#snippet demo()}
      <Voice>
        <p>
          Anyone in the channel can opt out. Textile doesn't store audio. Receiving is best-effort because Discord
          doesn't support bots receiving voice.
        </p>
        <p><a class="next-link" href="/docs/voice/">Read about voice</a></p>
      </Voice>
    {/snippet}
  </Section>

  <section class="close" aria-labelledby="access">
    <ThreadField layout={close} target={signIn} />
    <div class="close-copy">
      <h2 id="access">Try Textile</h2>
      <p class="lede">
        Textile is in closed alpha. Sign in with Discord to check your access.
      </p>
      <div class="actions">
        <a bind:this={signIn} class="button button-primary" href="/login" data-sveltekit-reload>
          <DiscordLogo />Sign in with Discord
        </a>
        <a class="button button-secondary" href="/docs/tools/">See every MCP tool</a>
      </div>
    </div>
  </section>

  <Weave />
</div>

<style>
  /* The box the page's cord (Weave) spans. */
  .landing {
    position: relative;
    overflow-x: clip;
  }
  .hero {
    position: relative;
    display: grid;
    align-items: center;
    gap: 3rem;
    min-height: clamp(42rem, 100svh, 75rem);
    margin-top: calc(-1 * var(--header-height));
    padding: calc(var(--header-height) + 2rem) var(--gutter) 4rem;
  }
  /* Each field fades out at its open edges instead of stopping at its box. */
  .hero :global(.field) {
    mask-image: linear-gradient(#000 88%, transparent);
  }
  .close :global(.field) {
    mask-image: linear-gradient(transparent, #000 16%, #000 84%, transparent);
  }
  /* Stacked, the close has no room beside its copy for threads, so it has none; the hero carries them on a phone. */
  @media (max-width: 59.99rem) {
    .close :global(.field) {
      display: none;
    }
  }
  .hero-copy,
  .hero-window {
    position: relative;
    z-index: 1;
  }
  /* No black drop shadow: it would dim the cord's end, which should be at its brightest where it meets the window. */
  .hero-window :global(.hero-card) {
    box-shadow:
      0 0 0 1px rgb(255 255 255 / 0.04),
      0 0 60px -10px color-mix(in srgb, var(--thread-violet) 35%, transparent);
  }
  /* The copy's box hugs its text, so the shade behind it covers the text and no more. */
  .hero-copy {
    justify-self: start;
  }
  /* The threads pass behind the copy dimmed, so the headline reads first, and the subline and buttons read cleanly
     where the current is brightest; each line of the subline also carries its own soft shade. */
  .hero-copy::before {
    content: '';
    position: absolute;
    inset: -22% -6% -18% -45%;
    z-index: -1;
    background: radial-gradient(
      closest-side,
      color-mix(in srgb, var(--paper) 82%, transparent),
      color-mix(in srgb, var(--paper) 70%, transparent) 60%,
      color-mix(in srgb, var(--paper) 40%, transparent) 82%,
      transparent
    );
    pointer-events: none;
  }
  .hero .lede {
    position: relative;
    text-shadow:
      0 0 1.5rem var(--paper),
      0 0 0.5rem var(--paper);
  }
  /* The copy's shade fades out toward its edges, where the subline's last words sit, so the subline carries a band of
     its own, even to just past its end and fading above and below, so no thread shows through its words. */
  .hero .lede::before {
    content: '';
    position: absolute;
    inset: -0.5em -2.5em -0.5em -1em;
    z-index: -1;
    background: linear-gradient(
      90deg,
      transparent,
      color-mix(in srgb, var(--paper) 78%, transparent) 1em,
      color-mix(in srgb, var(--paper) 78%, transparent) calc(100% - 2.5em),
      transparent
    );
    mask-image: linear-gradient(transparent, #000 35%, #000 65%, transparent);
    pointer-events: none;
  }
  /* Never one line: "Discord bots" fits in 6em and "Discord bots for" doesn't, so on the widest screens the headline
     stays a block beside the braid instead of one line it runs through. Columns narrower than 6em wrap it further. */
  h1 {
    max-width: 6em;
    font-size: clamp(3.25rem, 1.2rem + 5.6vw, 8.75rem);
    font-weight: 600;
    line-height: 0.98;
    letter-spacing: -0.045em;
  }
  .lede {
    margin-top: 1.5rem;
    max-width: 38ch;
    color: var(--ink);
    font-size: clamp(1.25rem, 0.95rem + 0.85vw, 1.875rem);
    line-height: 1.35;
    letter-spacing: -0.01em;
  }
  .actions {
    display: flex;
    flex-wrap: wrap;
    gap: 1rem;
    margin-top: 2.5rem;
  }
  .hero-window {
    width: min(100%, 36rem);
    justify-self: center;
  }
  /* The cord's light catches the window's rim where it arrives: the top's middle when stacked, the left edge's middle
     side by side, as `hero` ends it. A narrow flare along the rim, not a disc over the window's contents. */
  .hero-window::after {
    content: '';
    position: absolute;
    top: 0;
    left: 50%;
    width: 14rem;
    height: 1.5rem;
    translate: -50% -50%;
    background: radial-gradient(
      closest-side,
      white,
      color-mix(in srgb, var(--thread-violet) 70%, white) 18%,
      color-mix(in srgb, var(--thread-violet) 50%, transparent) 50%,
      transparent
    );
    mix-blend-mode: screen;
    pointer-events: none;
  }
  @media (min-width: 60rem) {
    .hero {
      grid-template-columns: minmax(0, 1fr) clamp(26rem, 31vw, 40rem);
      gap: clamp(3rem, 8vw, 12rem);
    }
    .hero-window {
      width: 100%;
      justify-self: end;
    }
    .hero-window::after {
      top: 50%;
      left: 0;
      width: 1.5rem;
      height: 14rem;
    }
  }
  .close {
    position: relative;
    display: grid;
    align-items: center;
    min-height: clamp(34rem, 80svh, 56rem);
    margin-top: clamp(6rem, 10vw, 12rem);
    padding: 4rem var(--gutter);
  }
  .close-copy {
    position: relative;
    z-index: 1;
    max-width: 44rem;
  }
  .close h2 {
    font-size: clamp(2.5rem, 1.3rem + 3.6vw, 5.5rem);
  }
  @media (min-width: 60rem) {
    .close-copy {
      justify-self: end;
    }
  }
</style>
