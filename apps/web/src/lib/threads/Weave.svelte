<script lang="ts">
import { onMount } from 'svelte'
import { type Stop, weave } from './weave'

/**
 * The hero's cord carried on down the page: it leaves the bottom of `[data-weave-start]`, and for each section that
 * names its event in `data-weave-label`, crosses the gap above it and enters the section's `[data-weave]` element on
 * the side that attribute names (`top` at `data-weave-at` along it, or `left`, level with any `[data-weave-y]` inside),
 * with the event's name on a knot where it enters, then comes out of that element's bottom: below the entry, or below
 * its middle from the side. Mark the whole column of panels the cord should pass behind, so it never shows between
 * them. Panels sit above the cord.
 *
 * A strand peels off into each `[data-weave-end]` in a section, to its left edge, or with `data-weave-end="window"`, to
 * the left edge of the Discord window around it: from the right edge of the section's `[data-weave-split]`, or, with no
 * split, from the entry, where the cord comes apart into its strands and ends.
 *
 * It draws as the reader scrolls, its tip a little below the middle of the screen, on a scroll timeline, so no script
 * runs while scrolling; without scroll timelines, or with reduced motion, it is simply drawn. It is drawn only side by
 * side; stacked, each section names its event above its demo instead. Decorative.
 */

/** Wide enough for the side-by-side layouts the cord runs between. */
const WIDE = '(min-width: 64rem)'
/** The cord's radius, as the hero's ends at the window, and how round its corners turn. */
const CORD = 7
const CORNER = 90
/** How far beside a panel the cord runs before it turns into a side entry. */
const LANE = 110
/** Violet, amber, and a lavender silver: the hero's braid tints its silver strand toward violet, and so does the cord. */
const COLOURS = [
  'var(--thread-violet)',
  'var(--thread-amber)',
  'color-mix(in srgb, var(--thread-silver) 55%, var(--thread-violet))',
]

let box: HTMLDivElement
let woven = $state<ReturnType<typeof weave>>({ strokes: [], spine: '', knots: [] })
let size = $state({ width: 0, height: 0 })

onMount(() => {
  const root = box.parentElement
  if (!root) return
  const wide = matchMedia(WIDE)

  const measure = () => {
    const origin = box.getBoundingClientRect()
    size = { width: origin.width, height: origin.height }
    /** An element's box in the weave's pixels. */
    const rect = (element: Element) => {
      const r = element.getBoundingClientRect()
      return new DOMRect(r.x - origin.x, r.y - origin.y, r.width, r.height)
    }
    const middle = (r: DOMRect) => r.top + r.height / 2

    /** What the cord needs from one section, read from its `data-weave*` attributes. */
    const stop = (section: HTMLElement): Stop | undefined => {
      const entry = section.querySelector<HTMLElement>('[data-weave]')
      if (!entry) return undefined
      const panel = rect(entry)
      const level = entry.querySelector('[data-weave-y]')
      const side = entry.dataset.weave === 'left' ? 'left' : 'top'
      const split = section.querySelector('[data-weave-split]')
      const x =
        panel.left + panel.width * (side === 'left' ? 0.5 : Number(entry.dataset.weaveAt ?? 0.5))
      return {
        label: section.dataset.weaveLabel ?? '',
        side,
        enter: side === 'left' ? [panel.left, middle(level ? rect(level) : panel)] : [x, panel.top],
        out: [x, panel.bottom],
        top: Math.min(...[...section.children].map((child) => rect(child).top)),
        split: split ? [rect(split).right, middle(rect(split))] : undefined,
        ends: [...section.querySelectorAll<HTMLElement>('[data-weave-end]')].map((end) => {
          const wall = end.dataset.weaveEnd === 'window' ? (end.closest('figure') ?? end) : end
          return [rect(wall).left, middle(rect(end))]
        }),
      }
    }

    const start = root.querySelector('[data-weave-start]')
    if (!wide.matches || !start) {
      woven = { strokes: [], spine: '', knots: [] }
      return
    }
    const from = rect(start)
    const sections = [...root.querySelectorAll<HTMLElement>('[data-weave-label]')]
    woven = weave(
      [from.left + from.width / 2, from.bottom],
      sections.map(stop).filter((s) => s !== undefined),
      { cord: CORD, corner: CORNER, lane: LANE },
    )
  }

  const resize = new ResizeObserver(measure)
  resize.observe(root)
  wide.addEventListener('change', measure)
  void document.fonts.ready.then(measure)
  return () => {
    resize.disconnect()
    wide.removeEventListener('change', measure)
  }
})
</script>

<div bind:this={box} class="weave" aria-hidden="true">
  <div class="reveal threads">
    <svg viewBox="0 0 {size.width} {size.height}" focusable="false">
      <path class="halo" d={woven.spine} />
      {#each woven.strokes as stroke}
        <path class="glow" d={stroke.d} stroke={COLOURS[stroke.colour]} />
      {/each}
      <!-- Light adds where fibres cross, as the hero's threads do, so the braid burns brightest at its crossings. -->
      <g class="cores">
        {#each woven.strokes as stroke}
          <path d={stroke.d} stroke={COLOURS[stroke.colour]} stroke-opacity={stroke.opacity} />
        {/each}
      </g>
    </svg>
  </div>
  <div class="reveal marks">
    <div class="hold">
      {#each woven.knots as knot}
        <span class="mark" data-side={knot.side} style:translate="{knot.x}px {knot.y}px"><span class="label">{knot.text}</span></span>
      {/each}
    </div>
  </div>
</div>

<style>
  /* Fills the page it is in, and names the scroll timeline the cord draws on. No z-index of its own, so the cord can sit
     behind the page's panels and its knots in front of them. */
  .weave {
    position: absolute;
    inset: 0;
    pointer-events: none;
    view-timeline: --weave block;
  }
  .reveal {
    position: absolute;
    inset: 0;
    overflow: clip;
  }
  .threads {
    z-index: 0;
  }
  .marks {
    z-index: 2;
  }
  svg,
  .hold {
    position: absolute;
    inset: 0;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    fill: none;
  }
  /* A soft violet light around the whole cord, a glow around each fibre, and the fibres themselves. */
  .halo {
    stroke: var(--thread-violet);
    stroke-width: 30;
    stroke-opacity: 0.05;
    stroke-linecap: round;
  }
  .glow {
    stroke-width: 6;
    stroke-opacity: 0.05;
  }
  .cores path {
    stroke-width: 1;
    mix-blend-mode: plus-lighter;
  }

  /* A knot on the cord where it enters a panel, and the event's name beside it, as the hero labels its threads. */
  .mark {
    position: absolute;
    top: 0;
    left: 0;
    width: 0;
    height: 0;
  }
  .mark::before {
    content: '';
    position: absolute;
    left: -3.5px;
    top: -3.5px;
    width: 7px;
    height: 7px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 12px 3px color-mix(in srgb, var(--thread-violet) 85%, transparent);
  }
  .label {
    position: absolute;
    bottom: 0.75rem;
    color: var(--ink);
    font-family: var(--font-code);
    font-size: 0.9375rem;
    letter-spacing: 0.01em;
    white-space: nowrap;
    text-shadow: 0 0 12px var(--paper), 0 0 4px var(--paper);
  }
  [data-side='top'] .label {
    left: 0.875rem;
  }
  /* Below the thread, since the cord comes down beside the panel and turns in above it. */
  [data-side='left'] .label {
    right: 0.875rem;
    top: 0.625rem;
    bottom: auto;
  }

  /* The cord draws down the page with the reader: the clip box slides down over it while what it holds slides back up
     by as much, so only transforms change, on the compositor. Its tip runs 75% of the way down the screen. */
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .reveal,
      .reveal > * {
        animation: linear both;
        animation-timeline: --weave;
        animation-range: cover 25vh cover calc(100% - 75vh);
      }
      .reveal {
        animation-name: clip;
      }
      .reveal > * {
        animation-name: hold;
      }
      /* The cord fades out toward its tip, as the hero's threads fade at their ends, rather than stopping at an edge. */
      .threads {
        mask-image: linear-gradient(#000 calc(100% - 14rem), transparent);
      }
    }
  }
  @keyframes clip {
    from {
      transform: translateY(-100%);
    }
    to {
      transform: none;
    }
  }
  @keyframes hold {
    from {
      transform: translateY(100%);
    }
    to {
      transform: none;
    }
  }
</style>
