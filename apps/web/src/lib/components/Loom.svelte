<script lang="ts">
import { overs, verticals } from '$lib/weave'

/**
 * The hero: cloth being woven. The warp, labelled with the triggers a bot listens for, is Discord; the weft is the
 * code an agent writes, passing over and under it row by row until the cloth is a running bot. Decorative: the text
 * beside it says the same thing.
 */
const TRIGGERS = ['messageCreate', 'interactionCreate', 'guildMemberAdd', 'schedule', 'fetch']
const THREADS_PER_TRIGGER = 3
const PITCH = 24
const LEFT = 46
const TOP = 168
const ROWS = 13
const ROW_PITCH = 28
const WIDTH = LEFT * 2 + PITCH * (TRIGGERS.length * THREADS_PER_TRIGGER - 1)
const HEIGHT = TOP + ROW_PITCH * ROWS + 8

const warps = Array.from(
  { length: TRIGGERS.length * THREADS_PER_TRIGGER },
  (_, i) => LEFT + i * PITCH,
)
const rows = Array.from({ length: ROWS }, (_, i) => TOP + 14 + i * ROW_PITCH)
const labels = TRIGGERS.map((name, i) => ({
  name,
  x: LEFT + (i * THREADS_PER_TRIGGER + 1) * PITCH,
}))
</script>

<svg class="loom" viewBox="0 0 {WIDTH} {HEIGHT}" aria-hidden="true" focusable="false">
  {#each labels as { name, x }}
    <text class="label" x={x + 4} y={TOP - 18} transform="rotate(-90 {x + 4} {TOP - 18})">{name}</text>
  {/each}
  <path class="warp" d={verticals(warps, TOP - 8, HEIGHT)} />
  <!-- Rows weave from the bottom up, as cloth grows toward the reed; the shuttle turns at each edge. -->
  {#each rows as y, row}
    {@const order = ROWS - 1 - row}
    {@const over = overs(warps, row)}
    <g class="row" style="--order: {order}">
      <line
        class="weft"
        class:alt={row % 3 === 1}
        x1={order % 2 ? WIDTH - 14 : 14}
        y1={y}
        x2={order % 2 ? 14 : WIDTH - 14}
        y2={y}
        pathLength="1"
      />
      <g class="over">
        <path class="gap" d={verticals(over, y - 10, y + 10)} />
        <path class="warp" d={verticals(over, y - 11, y + 11)} />
      </g>
    </g>
  {/each}
</svg>

<style>
  .loom {
    width: 100%;
    height: auto;
    overflow: visible;
  }
  .label {
    fill: var(--muted);
    font-family: var(--font-code);
    font-variation-settings: var(--axes-code);
    font-size: 12px;
  }
  .warp {
    stroke: var(--warp);
    stroke-width: 9;
  }
  .gap {
    stroke: var(--paper);
    stroke-width: 13;
  }
  .weft {
    stroke: var(--weft);
    stroke-width: 15;
  }
  .weft.alt {
    stroke: var(--weft-alt);
  }

  /* Each row's weft runs across, then the warp it passes under shows on top. 13 rows take about 2.4 seconds. */
  @media (prefers-reduced-motion: no-preference) {
    .weft {
      stroke-dasharray: 1;
      animation: pass 420ms var(--ease, cubic-bezier(0.22, 1, 0.36, 1)) both;
      animation-delay: calc(var(--order) * 160ms + 200ms);
    }
    .over {
      animation: show 1ms linear both;
      animation-delay: calc(var(--order) * 160ms + 420ms);
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
