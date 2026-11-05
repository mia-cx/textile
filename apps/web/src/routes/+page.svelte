<script lang="ts">
import Code from '$lib/components/Code.svelte'
import Loom from '$lib/components/Loom.svelte'
import Seo from '$lib/components/Seo.svelte'
import Tabs from '$lib/components/Tabs.svelte'
import VoiceNotice from '$lib/components/VoiceNotice.svelte'
import WeaveBand from '$lib/components/WeaveBand.svelte'
import { SCRIPT, TOOL_GROUPS, WORKFLOWS } from '$lib/landing'
import { GITHUB_URL, ORIGIN, page } from '$lib/site'

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
</script>

<Seo path="/" />
<svelte:head>
  {@html `<script type="application/ld+json">${structuredData.replace(/</g, '\\u003c')}</script>`}
</svelte:head>

<div class="mx-auto max-w-6xl px-4 sm:px-8">
  <section class="hero">
    <div class="hero-text">
      <h1 class="text-[2.75rem] leading-[1.02] font-extrabold sm:text-6xl lg:text-7xl">Discord bots for AI agents</h1>
      <p class="mt-6 max-w-[34rem] text-lg sm:text-xl">
        Textile gives your agent a Discord bot over MCP. The bot stays online, runs the discord.js workflows your agent
        writes, and joins voice channels. Textile hosts no models: your agent brings its own.
      </p>
      <div class="mt-8 flex flex-wrap gap-3">
        <a class="button button-primary" href="/login" data-sveltekit-reload>Sign in with Discord</a>
        <a class="button button-secondary" href="/docs/">Read the docs</a>
      </div>
      <p class="mt-4 text-muted">Closed alpha. Access opens in rounds.</p>
    </div>
    <div class="hero-loom">
      <Loom />
    </div>
  </section>

  <WeaveBand />

  <section class="split" aria-labelledby="mcp">
    <div>
      <h2 id="mcp" class="section-title">Everything over one MCP connection</h2>
      <p class="mt-5">
        Sign in with Discord once, then send your bot’s token with each request. Every call acts as that bot, and
        Discord checks its permissions as it would for any bot.
      </p>
      <p class="mt-4"><a href="/docs/connecting/">Connect an agent</a></p>
    </div>
    <div class="tools">
      {#each TOOL_GROUPS as group}
        <h3 class="tools-group">{group.name}</h3>
        <dl>
          {#each group.tools as [name, purpose]}
            <div class="tool">
              <dt class="font-mono">{name}</dt>
              <dd>{purpose}</dd>
            </div>
          {/each}
        </dl>
      {/each}
    </div>
  </section>

  <WeaveBand />

  <section aria-labelledby="workflows">
    <div class="max-w-[40rem]">
      <h2 id="workflows" class="section-title">Workflows run while your agent is away</h2>
      <p class="mt-5">
        Your agent publishes plain discord.js. Textile bundles it with pinned npm packages, keeps the bot online, and
        runs each event in a fresh sandbox.
      </p>
    </div>
    <div class="mt-8 max-w-[52rem]">
      <Tabs id="workflow" tabs={WORKFLOWS} />
    </div>
    <p class="mt-6"><a href="/docs/workflows/">Read about workflows</a></p>
  </section>

  <WeaveBand />

  <section class="split" aria-labelledby="scripts">
    <div>
      <h2 id="scripts" class="section-title">Many Discord calls, one tool call</h2>
      <p class="mt-5">
        <code class="prose-code">discord_script_run</code> runs discord.js once, now, under the same grants as workflows,
        so a batch of Discord calls costs your agent one tool call.
      </p>
    </div>
    <Code source={SCRIPT} label="Script" />
  </section>

  <WeaveBand />

  <section class="split" aria-labelledby="voice">
    <div>
      <h2 id="voice" class="section-title">Voice, speaker by speaker</h2>
      <p class="mt-5">
        Join a voice channel and open one WebSocket. Each person’s audio arrives as its own stream, tagged with their
        Discord ID, in Opus or PCM16. Send audio back and the bot speaks.
      </p>
      <p class="mt-4">
        Before the bot hears anyone, it posts a notice. Anyone in the channel can opt out of this bot, or of every
        Textile bot.
      </p>
      <p class="mt-4"><a href="/docs/voice/">Read about voice</a></p>
    </div>
    <VoiceNotice />
  </section>

  <WeaveBand />

  <section aria-labelledby="security">
    <h2 id="security" class="section-title max-w-[40rem]">Agent code never holds your bot’s token</h2>
    <dl class="facts">
      <div>
        <dt>Grants</dt>
        <dd>
          Each workflow and script names the Discord operations and hosts it may use. Destructive operations are named
          one by one.
        </dd>
      </div>
      <div>
        <dt>A broker in between</dt>
        <dd>Every request agent code makes reaches Textile’s broker, which checks the grant and adds the real token.</dd>
      </div>
      <div>
        <dt>Public hosts only</dt>
        <dd>Outbound requests can’t reach private, loopback, or cloud metadata addresses.</dd>
      </div>
      <div>
        <dt>Encrypted at rest</dt>
        <dd>Stored bot tokens are encrypted. Voice is relayed, never stored.</dd>
      </div>
    </dl>
    <p class="mt-8"><a href="/docs/security/">Read about security</a></p>
  </section>

  <WeaveBand />

  <section class="max-w-[40rem]" aria-labelledby="access">
    <h2 id="access" class="section-title">Get access</h2>
    <p class="mt-5">
      Textile opens in rounds, starting with a closed alpha. Sign in with Discord to check your access, and to find
      where to follow progress until you’re in. Paid plans and a free tier, billed through Discord, come after the alpha.
    </p>
    <div class="mt-8">
      <a class="button button-primary" href="/login" data-sveltekit-reload>Sign in with Discord</a>
    </div>
  </section>
</div>

<style>
  .hero {
    display: grid;
    gap: 2.5rem;
    align-items: center;
    padding-top: 2.5rem;
  }
  .hero-loom {
    max-width: min(30rem, 80%);
    width: 100%;
    justify-self: center;
  }
  @media (min-width: 60rem) {
    .hero {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      gap: 3rem;
      padding-top: 4rem;
    }
    .hero-loom {
      justify-self: end;
    }
  }
  .section-title {
    font-size: clamp(1.875rem, 1.2rem + 2.4vw, 2.75rem);
    font-weight: 800;
  }
  .split {
    display: grid;
    gap: 2rem;
    align-items: start;
  }
  @media (min-width: 56rem) {
    .split {
      grid-template-columns: minmax(0, 0.85fr) minmax(0, 1.15fr);
      gap: 4rem;
    }
    /* The heading stays beside a long list as it scrolls past. */
    .split > :first-child {
      position: sticky;
      top: 2rem;
    }
  }
  .tools {
    padding: 0.5rem 1.25rem 1.25rem;
    border: 1px solid var(--rule);
    border-radius: var(--radius-l);
    background: var(--surface);
  }
  .tools-group {
    margin-top: 1rem;
    margin-bottom: 0.25rem;
    color: var(--muted);
    font-size: 0.875rem;
    font-weight: 700;
    font-variation-settings: var(--axes-text);
  }
  .tool {
    display: grid;
    gap: 0 1rem;
    padding-block: 0.375rem;
    border-bottom: 1px solid var(--rule);
  }
  .tool:last-child {
    border-bottom: none;
  }
  @media (min-width: 40rem) {
    .tool {
      grid-template-columns: 15.5rem minmax(0, 1fr);
    }
  }
  .tool dt {
    color: var(--ink);
    font-variation-settings: var(--axes-code);
    font-size: 0.875rem;
    overflow-wrap: anywhere;
  }
  .tool dd {
    color: var(--muted);
    font-size: 0.9375rem;
  }
  .facts {
    display: grid;
    gap: 1.75rem 3rem;
    margin-top: 2rem;
  }
  @media (min-width: 48rem) {
    .facts {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .facts dt {
    color: var(--ink);
    font-size: 1.125rem;
    font-weight: 750;
    font-variation-settings: var(--axes-display);
  }
  .facts dd {
    margin-top: 0.25rem;
  }
</style>
