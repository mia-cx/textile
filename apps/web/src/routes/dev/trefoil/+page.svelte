<script lang="ts">
import { onMount } from 'svelte'
import Trefoil from '$lib/threads/Trefoil.svelte'
import { MARK, type Mark } from '$lib/threads/trefoil'

/**
 * Textile's mark, alone on the site's ink, in development only: `pnpm logo` captures it into static/icons. `?size=` sets
 * the square in CSS px, `?still` stops it moving, `?bg=transparent` drops the ink, and any of the mark's settings
 * (`?band=`, `?intensity=`, `?threads=`, … as shares and counts, see `Mark` in trefoil.ts) override its look.
 */
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const size = Number(params.get('size') ?? 1024)
const set = (key: keyof Mark) => Number(params.get(key) ?? MARK[key])
const mark: Mark = {
  band: set('band'),
  intensity: set('intensity'),
  fill: set('fill'),
  open: set('open'),
  phase: set('phase'),
  threads: set('threads'),
  ribbons: set('ribbons'),
  ribbon: set('ribbon'),
  spread: set('spread'),
}
const transparent = params.get('bg') === 'transparent'

let stage: HTMLDivElement

onMount(() => {
  // The site's layout wraps this page in its header, its "Copy page" control, and its ink. A capture needs nothing
  // but the stage: every sibling of the stage and of each of its ancestors is taken out.
  for (
    let node: Element | null = stage;
    node && node !== document.documentElement;
    node = node.parentElement
  )
    for (const sibling of node.parentElement?.children ?? [])
      if (sibling !== node && sibling instanceof HTMLElement) sibling.style.display = 'none'
  if (transparent)
    for (const element of [document.documentElement, document.body])
      element.style.background = 'transparent'
})
</script>

<svelte:head><title>Trefoil study</title><meta name="robots" content="noindex" /></svelte:head>

<div bind:this={stage} class="stage" data-scheme="dark" style:background={transparent ? 'transparent' : 'var(--paper)'}>
  <Trefoil {size} {mark} still={params.has('still')} />
</div>

<style>
  .stage {
    position: fixed;
    inset: 0;
    z-index: 100;
    display: grid;
    place-items: center;
  }
</style>
