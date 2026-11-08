<script lang="ts">
import type { Snippet } from 'svelte'

/**
 * A Discord channel as the bot's server sees it: the server rail, the channel's name, and its messages. Real DOM, so it
 * reads, scales, and translates; the rail is decoration. `footer` holds a composer where the demo takes input, and
 * `live` announces new messages to screen readers, for a demo whose messages answer what the visitor did.
 */
let {
  channel,
  label,
  children,
  footer,
  live = false,
  class: className = '',
  window = $bindable(),
}: {
  channel: string
  label: string
  children: Snippet
  footer?: Snippet
  live?: boolean
  class?: string
  window?: HTMLElement
} = $props()
</script>

<figure bind:this={window} class="window {className}" aria-label={label} data-weave-panel>
  <div class="rail" aria-hidden="true">
    <span class="server"></span>
    <span class="server current"></span>
    <span class="server add"></span>
  </div>
  <div class="channel">
    <p class="channel-name"><span class="hash" aria-hidden="true">#</span>{channel}</p>
    <div class="messages" aria-live={live ? 'polite' : undefined}>
      {@render children()}
    </div>
    {#if footer}
      <div class="footer">{@render footer()}</div>
    {/if}
  </div>
</figure>

<style>
  .window {
    display: grid;
    grid-template-columns: 4.25rem minmax(0, 1fr);
    margin: 0;
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.12);
    border-radius: 1.125rem;
    /* Nearly opaque instead of a frosted backdrop: a blur over the live threads behind re-renders every frame, and
       through this much paint it barely showed. */
    background: rgb(20 18 30 / 0.96);
    box-shadow:
      0 0 0 1px rgb(0 0 0 / 0.6),
      0 30px 80px -20px rgb(0 0 0 / 0.8),
      0 0 60px -10px color-mix(in srgb, var(--thread-violet) 35%, transparent);
    color: #dbdee1;
    font-size: 1rem;
    line-height: 1.4;
  }
  .rail {
    display: flex;
    flex-direction: column;
    align-items: center;
    gap: 0.625rem;
    padding-block: 0.875rem;
    background: rgb(10 9 16 / 0.7);
  }
  .server {
    position: relative;
    width: 2.75rem;
    height: 2.75rem;
    border-radius: 50%;
    background: rgb(255 255 255 / 0.08);
  }
  .server.current {
    border-radius: 0.875rem;
    background:
      radial-gradient(circle at 35% 35%, rgb(255 255 255 / 0.25), transparent 55%),
      var(--accent);
  }
  .server.current::before {
    content: '';
    position: absolute;
    left: -0.75rem;
    top: 0.5rem;
    bottom: 0.5rem;
    width: 0.25rem;
    border-radius: 0 4px 4px 0;
    background: #fff;
  }
  .server.add::before,
  .server.add::after {
    content: '';
    position: absolute;
    inset: 50% auto auto 50%;
    width: 1rem;
    height: 2px;
    translate: -50% -50%;
    background: rgb(255 255 255 / 0.6);
  }
  .server.add::after {
    rotate: 90deg;
  }
  .channel {
    display: flex;
    flex-direction: column;
    min-width: 0;
  }
  .channel-name {
    display: flex;
    align-items: center;
    gap: 0.5rem;
    padding: 0.875rem 1.25rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.07);
    color: #f2f3f5;
    font-weight: 600;
  }
  .hash {
    color: #80848e;
    font-size: 1.375rem;
    font-weight: 400;
    line-height: 1;
  }
  .messages {
    display: flex;
    flex: 1;
    flex-direction: column;
    justify-content: flex-end;
    gap: 1.125rem;
    padding: 1.125rem 1.25rem 1.25rem;
  }
  .footer {
    padding: 0 1rem 1rem;
  }
  /* On a phone the messages need the room more than the server rail does. */
  @media (max-width: 30rem) {
    .window {
      grid-template-columns: minmax(0, 1fr);
    }
    .rail {
      display: none;
    }
  }
</style>
