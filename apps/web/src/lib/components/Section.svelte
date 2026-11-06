<script lang="ts">
import type { Snippet } from 'svelte'
import Strands from '$lib/threads/Strands.svelte'

/**
 * One part of the landing page's story: the heading and a few sentences beside the product doing that thing, with the
 * event that drives it named above the product and braided into it. `children` is the prose; `demo` is the product.
 */
let {
  id,
  title,
  event,
  children,
  demo,
}: { id: string; title: string; event: string; children: Snippet; demo: Snippet } = $props()
</script>

<section class="section" aria-labelledby={id}>
  <div class="prose">
    <h2 {id}>{title}</h2>
    {@render children()}
  </div>
  <div class="demo">
    <Strands />
    <p class="event" aria-hidden="true">{event}</p>
    {@render demo()}
  </div>
</section>

<style>
  .section {
    display: grid;
    gap: 2.5rem;
    padding: clamp(5rem, 9vw, 10rem) var(--gutter) 0;
    view-timeline-name: --section;
  }
  .prose {
    max-width: 36rem;
    font-size: clamp(1.125rem, 1rem + 0.3vw, 1.3125rem);
  }
  .prose :global(p) {
    margin-top: 1.25rem;
  }
  h2 {
    font-size: clamp(2.375rem, 1.3rem + 2.8vw, 4.5rem);
  }
  .demo {
    position: relative;
    min-width: 0;
  }
  .demo :global(.strands) {
    display: none;
  }
  /* The event that runs this part, as a labelled thread end above the product. */
  .event {
    display: flex;
    align-items: center;
    gap: 0.75rem;
    margin-bottom: 1rem;
    color: var(--ink);
    font-family: var(--font-code);
    font-size: 0.9375rem;
  }
  /* A thread ending in a bright knot, as the hero's event names sit on theirs. */
  .event::before {
    content: '';
    width: 3.25rem;
    height: 7px;
    background:
      radial-gradient(circle at calc(100% - 3.5px) 50%, #fff 2.5px, transparent 3.5px),
      linear-gradient(90deg, transparent, var(--thread-violet), var(--thread-amber)) center / 100% 1px no-repeat;
    filter: drop-shadow(0 0 4px color-mix(in srgb, var(--thread-violet) 80%, transparent));
  }
  @media (min-width: 64rem) {
    .section {
      grid-template-columns: minmax(0, 4fr) minmax(0, 8fr);
      gap: clamp(3rem, 7vw, 9rem);
      align-items: start;
    }
    .prose {
      position: sticky;
      top: 3rem;
      padding-top: 2.5rem;
    }
    /* The threads run across the page above the heading and braid into the event's knot. */
    .demo :global(.strands) {
      display: block;
      right: calc(100% - 3.25rem + 3.5px);
      top: 0.75rem;
    }
  }
</style>
