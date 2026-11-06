<script lang="ts">
import { CRON, STANDUP_POST } from '$lib/landing'
import Message from '../discord/Message.svelte'
import Window from '../discord/Window.svelte'

/**
 * A week under `0 9 * * 1-5`: a thread per day, from midnight to midnight UTC, knotted at 9:00 on the five weekdays the
 * schedule fires. The knots light in turn as the section scrolls into view. The caption says it in words.
 */
const DAYS = ['Mon', 'Tue', 'Wed', 'Thu', 'Fri', 'Sat', 'Sun']
const WEEKDAYS = 5
/** Where 9:00 falls in a day, as a fraction of it. */
const NINE = 9 / 24
</script>

<div class="schedule">
  <figure class="week">
    <figcaption><code>{CRON}</code> fires at 9:00 UTC, Monday to Friday</figcaption>
    <div class="plot" style:--nine={NINE} aria-hidden="true">
      <span class="hour">09:00</span>
      {#each DAYS as day, i}
        <span class="day" class:fires={i < WEEKDAYS} style:--i={i}>
          <span class="thread"><span class="knot"></span></span>
          <span class="name">{day}</span>
        </span>
      {/each}
    </div>
  </figure>
  <Window channel="standup" label="The post each tick makes in Discord">
    <Message author="Weaver" bot time="Today at 9:00 AM">{STANDUP_POST}</Message>
  </Window>
</div>

<style>
  .schedule {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
  }
  .week {
    margin: 0;
    padding: 1.25rem 1.5rem 1.25rem;
    border: 1px solid var(--rule);
    border-radius: var(--radius-l);
    background: var(--surface);
  }
  figcaption {
    color: var(--text);
    font-size: 1rem;
  }
  figcaption code {
    color: var(--ink);
  }
  .plot {
    --threads: 11rem;
    position: relative;
    display: grid;
    grid-template-columns: repeat(7, minmax(0, 1fr));
    margin-top: 1.25rem;
    padding-left: 3.5rem;
  }
  /* The hour every knot sits on, ruled across the week. */
  .hour {
    position: absolute;
    left: 0;
    right: 0;
    top: calc(var(--nine) * var(--threads));
    display: flex;
    align-items: center;
    gap: 0.5rem;
    translate: 0 -50%;
    color: var(--muted);
    font-family: var(--font-code);
    font-size: 0.75rem;
  }
  .hour::after {
    content: '';
    flex: 1;
    border-top: 1px dashed var(--rule-strong);
  }
  .day {
    display: grid;
    justify-items: center;
    gap: 0.625rem;
  }
  .thread {
    position: relative;
    width: 2px;
    height: var(--threads);
    border-radius: 1px;
    background: linear-gradient(180deg, transparent, var(--rule-strong) 12%, var(--rule-strong) 88%, transparent);
  }
  .fires .thread {
    background: linear-gradient(
      180deg,
      transparent,
      color-mix(in srgb, var(--thread-amber) 60%, transparent) 12%,
      color-mix(in srgb, var(--thread-violet) 70%, transparent) 88%,
      transparent
    );
  }
  .knot {
    display: none;
    position: absolute;
    left: 50%;
    top: calc(var(--nine) * 100%);
    width: 0.875rem;
    height: 0.875rem;
    translate: -50% -50%;
    border-radius: 50%;
    background: #fff;
    box-shadow:
      0 0 0 3px color-mix(in srgb, var(--thread-amber) 55%, transparent),
      0 0 18px 4px color-mix(in srgb, var(--thread-amber) 60%, transparent);
  }
  .fires .knot {
    display: block;
  }
  .name {
    color: var(--muted);
    font-family: var(--font-code);
    font-size: 0.875rem;
  }
  .fires .name {
    color: var(--ink);
  }
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .knot {
        animation: knot linear both;
        animation-timeline: --section;
        animation-range: cover calc(16% + var(--i) * 2%) cover calc(22% + var(--i) * 2%);
      }
    }
  }
  @keyframes knot {
    from {
      opacity: 0;
      scale: 0.4;
    }
    to {
      opacity: 1;
      scale: 1;
    }
  }
</style>
