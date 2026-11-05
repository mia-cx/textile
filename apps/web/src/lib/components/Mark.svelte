<script lang="ts">
/** Textile's mark: three weft rows and three warp columns in plain weave, as in the favicon. */
let { class: className = '' }: { class?: string } = $props()
const BANDS = [4, 12.35, 20.7]
const WIDTH = 7.3
</script>

<svg class={className} viewBox="0 0 32 32" aria-hidden="true" focusable="false">
  {#each BANDS as y}<rect x="3" {y} width="26" height={WIDTH} fill="var(--weft)" />{/each}
  {#each BANDS as x}<rect {x} y="3" width={WIDTH} height="26" fill="var(--accent)" />{/each}
  {#each BANDS as y, row}
    {#each BANDS as x, column}
      {#if (row + column) % 2 === 0}<rect {x} {y} width={WIDTH} height={WIDTH} fill="var(--weft)" />{/if}
    {/each}
  {/each}
</svg>
