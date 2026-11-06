<script lang="ts">
import type { Snippet } from 'svelte'

/**
 * One part of the landing page's story: the heading and a few sentences, and the product doing that thing. `children`
 * is the prose; `demo` is the product. `event` names what runs it: side by side, the page's cord (Weave) carries it to
 * the demo; stacked, it sits above the demo on a short thread.
 *
 * `layout` places the two on a wide screen, so neighbouring parts never share a shape; stacked, every part reads the
 * same, heading first:
 * - `wide`: the prose at the left, the demo across the full width below it;
 * - `centred`: the prose centred over a centred demo;
 * - `prose-right`: the demo at the left, the prose beside it at the right;
 * - `prose-left`: the prose at the left, the demo across the rest, a little lower;
 * - `wide-right`: the prose at the right, the demo across the full width below it;
 * - `span`: the heading and the prose side by side, indented for the cord to pass, the demo across the full width.
 */
let {
  id,
  title,
  event,
  layout,
  children,
  demo,
}: {
  id: string
  title: string
  event: string
  layout: 'wide' | 'centred' | 'prose-right' | 'prose-left' | 'wide-right' | 'span'
  children: Snippet
  demo: Snippet
} = $props()
</script>

<section class="section" data-layout={layout} aria-labelledby={id} data-weave-label={event}>
  <div class="prose">
    <h2 {id}>{title}</h2>
    {@render children()}
  </div>
  <div class="demo" data-weave-demo>
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
  .prose,
  .demo {
    position: relative;
    z-index: 1;
    min-width: 0;
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
  /* Stacked, the event that runs this part, as a labelled thread end above the product. */
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
      --column-gap: clamp(1.5rem, 2.5vw, 3.5rem);
      grid-template-columns: repeat(12, minmax(0, 1fr));
      column-gap: var(--column-gap);
      row-gap: clamp(3rem, 5vw, 5rem);
      align-items: start;
    }
    /* Side by side, the page's cord names the event where it enters the demo. */
    .event {
      display: none;
    }
    [data-layout='wide'] .prose {
      grid-column: 1 / span 5;
    }
    [data-layout='wide'] .demo,
    [data-layout='wide-right'] .demo,
    [data-layout='span'] .demo {
      grid-column: 1 / -1;
    }
    [data-layout='centred'] .prose {
      grid-column: 3 / span 8;
      justify-self: center;
      max-width: 40rem;
      text-align: center;
    }
    [data-layout='centred'] .demo {
      grid-column: 3 / span 8;
      justify-self: center;
      width: min(100%, 46rem);
    }
    /* Two columns in, for the cord to come down beside the demo and the event's name to sit under its turn. */
    [data-layout='prose-right'] .demo {
      grid-column: 3 / span 6;
      grid-row: 1;
    }
    [data-layout='prose-right'] .prose {
      grid-column: 9 / -1;
      grid-row: 1;
      align-self: center;
    }
    [data-layout='prose-left'] .prose {
      grid-column: 1 / span 4;
    }
    [data-layout='prose-left'] .demo {
      grid-column: 5 / -1;
      padding-top: 6rem;
    }
    [data-layout='wide-right'] .prose {
      grid-column: 7 / -1;
    }
    /* The heading and its prose side by side, both clear of the first two columns, where the cord comes down; the
       demo below lines up with the heading through `--indent`. */
    [data-layout='span'] {
      --indent: calc((100% + var(--column-gap)) / 6);
    }
    [data-layout='span'] .prose {
      grid-column: 1 / -1;
      display: grid;
      grid-template-columns: subgrid;
      max-width: none;
    }
    [data-layout='span'] h2 {
      grid-column: 3 / span 5;
      grid-row: 1 / span 3;
    }
    [data-layout='span'] .prose > :global(p) {
      grid-column: 8 / -1;
      max-width: 38rem;
    }
    [data-layout='span'] .prose > :global(p:first-of-type) {
      margin-top: 0;
    }
  }
</style>
