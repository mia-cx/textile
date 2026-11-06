<script lang="ts">
import { along, type Field, position, tint } from './geometry'

/**
 * A few threads that braid into one point: the hero's field, small enough for SVG. The parent positions the band so
 * the cord ends where it should, with `right` and `top`. They draw in as their section scrolls into view, on its
 * `--section` view timeline; without scroll timelines, or with reduced motion, they are simply drawn. Decorative.
 */

/** viewBox units; the SVG stretches to its box, and strokes keep their width. */
const WIDTH = 1000
const HEIGHT = 240
const POINTS = 90
/** Where the cord ends, down the band: the fan opens above it, into the space over the section's heading. */
const END = 0.75
const field: Field = {
  start: [-60, HEIGHT * 0.38],
  control: [560, HEIGHT * 0.6],
  end: [WIDTH, HEIGHT * END],
  spread: HEIGHT * 0.36,
  cord: 7,
  braid: 0.74,
  count: 30,
  intensity: 1,
  labels: [],
}
const COLOURS = ['var(--thread-violet)', 'var(--thread-amber)', 'var(--thread-silver)']
const paths = Array.from({ length: field.count }, (_, i) => {
  const points = Array.from({ length: POINTS + 1 }, (_, s) =>
    position(field, i, along(s / POINTS), 0),
  )
  const d = points
    .map(([x, y], s) => `${s === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join('')
  const { colour, brightness } = tint(field, i)
  return { d, colour: COLOURS[colour], opacity: 0.3 + 0.7 * brightness }
})
</script>

<div class="strands" style:--end={END} aria-hidden="true">
  <svg viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="none" focusable="false">
    {#each paths as path, i}
      <path class="glow" d={path.d} stroke={path.colour} style:--i={i} pathLength="1" />
      <path class="core" d={path.d} stroke={path.colour} stroke-opacity={path.opacity} style:--i={i} pathLength="1" />
    {/each}
  </svg>
</div>

<style>
  /* Its parent places it: a band reaching back across the page from the point the cord ends, which `top` and `right`
     name. The far end fades out. */
  .strands {
    position: absolute;
    width: 62vw;
    height: 8rem;
    translate: 0 calc(var(--end) * -100%);
    pointer-events: none;
    mask-image: linear-gradient(to right, transparent, #000 35%);
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
    overflow: visible;
  }
  path {
    fill: none;
    vector-effect: non-scaling-stroke;
  }
  .glow {
    stroke-width: 5;
    stroke-opacity: 0.08;
  }
  .core {
    stroke-width: 1.1;
  }

  /* Each thread draws in from the left as the section rises into view, a little after the one before it. */
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      path {
        stroke-dasharray: 1;
        animation: draw linear both;
        animation-timeline: --section;
        animation-range: cover calc(4% + var(--i) * 0.3%) cover calc(24% + var(--i) * 0.3%);
      }
    }
  }
  @keyframes draw {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
</style>
