<script lang="ts">
import { onMount } from 'svelte'
import { CORD_RADIUS } from '$lib/threads/cord'
import type { Field } from '$lib/threads/geometry'
import ThreadField from '$lib/threads/ThreadField.svelte'

/**
 * Textile's social banner, in development only: `pnpm logo` captures it into static/icons/banner.png. The hero's threads stream in
 * from the left and braid, and the braid dives off the banner's bottom edge, as the page's cord runs on down the page,
 * so its end never shows; the headline and subline stand on the right. `?w=` and `?h=` set its size in CSS px.
 */
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const width = Number(params.get('w') ?? 1500)
const height = Number(params.get('h') ?? 500)

let stage: HTMLDivElement
let copy = $state<HTMLElement>()

/** The threads, braided by `WHOLE` of the way along, then running on whole past the bottom edge. */
const WHOLE = 0.66
function banner(box: { width: number; height: number }): Field {
  const origin = stage?.getBoundingClientRect()
  const text = copy
    ? [...copy.children].map((element) => {
        const r = element.getBoundingClientRect()
        const [x, y] = [origin?.left ?? 0, origin?.top ?? 0]
        return [r.left - x, r.top - y, r.right - x, r.bottom - y] as const
      })
    : []
  return {
    start: [-box.width * 0.06, box.height * 0.45],
    control: [box.width * 0.42, box.height * 0.45],
    end: [box.width * 0.5, box.height * 1.4],
    spread: box.height * 0.62,
    cord: CORD_RADIUS,
    count: 520,
    intensity: 0.75,
    braid: [0.15, 0.4, WHOLE],
    labels: [],
    text,
  }
}

onMount(() => {
  // As the trefoil study does: nothing but the stage on the page.
  for (
    let node: Element | null = stage;
    node && node !== document.documentElement;
    node = node.parentElement
  )
    for (const sibling of node.parentElement?.children ?? [])
      if (sibling !== node && sibling instanceof HTMLElement) sibling.style.display = 'none'
})
</script>

<svelte:head><title>Banner study</title><meta name="robots" content="noindex" /></svelte:head>

<div
  bind:this={stage}
  class="stage"
  data-scheme="dark"
  style:width="{width}px"
  style:height="{height}px"
  style:--banner-height="{height}px"
>
  <ThreadField layout={banner} />
  <div bind:this={copy} class="copy">
    <p class="headline">Discord bots for AI agents</p>
    <p class="lede">Host your Discord bot and manage it over MCP, with no server to run.</p>
  </div>
</div>

<style>
  .stage {
    position: fixed;
    inset: 0 auto auto 0;
    z-index: 100;
    display: grid;
    align-items: center;
    overflow: hidden;
    background: var(--paper);
    color: var(--ink);
  }
  .stage :global(.field) {
    position: absolute;
    inset: 0;
  }
  .copy {
    position: relative;
    z-index: 1;
    justify-self: end;
    width: 44%;
    margin-right: 6%;
  }
  .headline {
    max-width: 6em;
    font-size: calc(var(--banner-height) * 0.2);
    font-weight: 600;
    line-height: 0.98;
    letter-spacing: -0.045em;
  }
  .lede {
    margin-top: 0.9em;
    max-width: 24em;
    font-size: calc(var(--banner-height) * 0.05);
    line-height: 1.35;
    letter-spacing: -0.01em;
  }
</style>
