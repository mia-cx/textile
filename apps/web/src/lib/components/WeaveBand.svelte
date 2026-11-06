<script lang="ts">
import { overs, verticals } from '$lib/weave'

/**
 * A strip of plain weave between sections. As it scrolls into view, its three weft rows pass across in turn, so the
 * page weaves as it is read. Without scroll timelines, or with reduced motion, it is simply woven.
 */
const WARPS = 64
const PITCH = 20
const ROWS = [12, 34, 56]
const HEIGHT = 68
const WIDTH = WARPS * PITCH
const warps = Array.from({ length: WARPS }, (_, i) => PITCH / 2 + i * PITCH)
</script>

<div class="band" aria-hidden="true">
  <svg viewBox="0 0 {WIDTH} {HEIGHT}" preserveAspectRatio="xMidYMid slice" focusable="false">
    <path class="warp" d={verticals(warps, 0, HEIGHT)} />
    {#each ROWS as y, row}
      {@const over = overs(warps, row)}
      <g style="--row: {row}">
        <line class="weft" class:alt={row === 1} x1={row % 2 ? WIDTH : 0} y1={y} x2={row % 2 ? 0 : WIDTH} y2={y} pathLength="1" />
        <g class="over">
          <path class="gap" d={verticals(over, y - 8, y + 8)} />
          <path class="warp" d={verticals(over, y - 9, y + 9)} />
        </g>
      </g>
    {/each}
  </svg>
</div>

<style>
  .band {
    height: 2.75rem;
    margin-block: 5rem;
    overflow: hidden;
    view-timeline-name: --band;
  }
  svg {
    display: block;
    width: 100%;
    height: 100%;
  }
  .warp {
    stroke: var(--warp);
    stroke-width: 7;
  }
  .gap {
    stroke: var(--paper);
    stroke-width: 10;
  }
  .weft {
    stroke: var(--weft);
    stroke-width: 12;
  }
  .weft.alt {
    stroke: var(--weft-alt);
  }

  /* Scroll position drives the weave: each row passes across while the band rises from the bottom of the viewport
     toward its middle. Native scrolling stays untouched; nothing runs in script. */
  @supports (animation-timeline: view()) {
    @media (prefers-reduced-motion: no-preference) {
      .weft {
        stroke-dasharray: 1;
        animation: pass linear both;
        animation-timeline: --band;
        animation-range: entry calc(var(--row) * 18%) cover calc(30% + var(--row) * 9%);
      }
      .over {
        animation: show linear both;
        animation-timeline: --band;
        animation-range: cover calc(30% + var(--row) * 9%) cover calc(31% + var(--row) * 9%);
      }
    }
  }
  @keyframes pass {
    from {
      stroke-dashoffset: 1;
    }
    to {
      stroke-dashoffset: 0;
    }
  }
  @keyframes show {
    from {
      opacity: 0;
    }
    to {
      opacity: 1;
    }
  }
</style>
