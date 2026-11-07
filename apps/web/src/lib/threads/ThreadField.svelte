<script lang="ts">
import { onMount } from 'svelte'
import { type Field, position } from './geometry'
import { type Palette, type Renderer, type RGB, still, webgl2, webgpu } from './renderer'

/**
 * A live field of luminous threads that braid into `target`, drawn with WebGPU, else WebGL2, else one still canvas 2D
 * frame. `layout` places the field for the box's size and the target's box within it, and runs again on every resize.
 * Decorative: the page around it says what it shows.
 *
 * It renders only while on screen and the tab is visible. With reduced motion it draws one still frame.
 */
let {
  layout,
  target,
  class: className = '',
}: {
  layout: (box: { width: number; height: number }, target: DOMRect | undefined) => Field
  target?: HTMLElement | undefined
  class?: string
} = $props()

let box: HTMLDivElement
let canvas: HTMLCanvasElement
let marks = $state<ReadonlyArray<{ text: string; x: number; y: number; below: boolean }>>([])
let kind = $state<Renderer['kind']>()

/** Device pixels per CSS pixel, at most: finer than this costs fill rate without looking finer. */
const MAX_DPR = 2
/** The moment reduced motion and the 2D fallback show: the current looks settled there. */
const STILL_TIME = 12
/** The longest step between frames, in seconds, so a stalled tab doesn't jump the current forward. */
const MAX_STEP = 0.1
/** How many lost GPU devices the field replaces before it stops asking for WebGPU. */
const MAX_GPU_RECOVERIES = 1

/** `#rrggbb`, as the thread tokens are written. */
const hex = (value: string): RGB => {
  const channel = (at: number) => Number.parseInt(value.trim().slice(at, at + 2), 16) / 255
  return [channel(1), channel(3), channel(5)]
}
/** `rgb(r, g, b)`, as computed styles report colours. */
const rgb = (value: string): RGB => {
  const [r = 0, g = 0, b = 0] = (value.match(/[\d.]+/g) ?? []).map(Number)
  return [r / 255, g / 255, b / 255]
}

onMount(() => {
  let renderer: Renderer | undefined
  let field: Field | undefined
  let palette: Palette | undefined
  let visible = false
  let frame = 0
  let time = STILL_TIME
  let last = 0
  let destroyed = false
  /** The canvas no longer shows the current frame: it was resized, or the still frame changed. */
  let dirty = false
  const motion = matchMedia('(prefers-reduced-motion: no-preference)')

  const draw = () => {
    if (!renderer || !field || !palette) return
    renderer.draw(field, palette, time)
    dirty = false
  }
  const animates = () => motion.matches && renderer !== undefined && renderer.kind !== '2d'
  const tick = (now: number) => {
    frame = 0
    if (!visible || document.hidden || !animates()) return
    time += Math.min((now - last) / 1000, MAX_STEP)
    last = now
    draw()
    frame = requestAnimationFrame(tick)
  }
  const wake = () => {
    if (frame !== 0 || !visible || document.hidden || !animates()) return
    last = performance.now()
    frame = requestAnimationFrame(tick)
  }
  /** Brings the canvas up to date, but only while someone can see it; off screen or hidden, it waits. */
  const refresh = () => {
    if (!visible || document.hidden) return
    if (dirty) draw()
    wake()
  }

  const measure = () => {
    const rect = box.getBoundingClientRect()
    if (rect.width === 0 || rect.height === 0) return
    const dpr = Math.min(devicePixelRatio, MAX_DPR)
    canvas.width = Math.round(rect.width * dpr)
    canvas.height = Math.round(rect.height * dpr)
    const style = getComputedStyle(box)
    palette = {
      threads: [
        hex(style.getPropertyValue('--thread-violet')),
        hex(style.getPropertyValue('--thread-amber')),
      ],
      background: rgb(style.backgroundColor),
    }
    const to = target?.getBoundingClientRect()
    const placed = layout(
      { width: rect.width, height: rect.height },
      to && new DOMRect(to.x - rect.x, to.y - rect.y, to.width, to.height),
    )
    field = placed
    marks = placed.labels.map((label, i) => {
      const [x, y] = position(placed, i, label.at, 0)
      return { text: label.text, x, y, below: label.lane > 0 }
    })
    // Resizing clears the canvas: draw now if it shows, rather than leave a blank frame.
    dirty = true
    refresh()
  }

  /** A canvas keeps its first context, so starting over, or past a failed renderer, needs a fresh one. */
  const replaceCanvas = () => {
    const fresh = canvas.cloneNode() as HTMLCanvasElement
    canvas.replaceWith(fresh)
    canvas = fresh
  }

  /**
   * WebGPU, then WebGL2, then canvas 2D. A lost GPU device starts the field over on a new device, once; a device lost
   * again (a new one can arrive already lost) means WebGPU isn't dependable here, so the field falls back.
   */
  let losses = 0
  const start = async () => {
    renderer = undefined
    const attempts = losses > MAX_GPU_RECOVERIES ? [webgl2, still] : [webgpu, webgl2, still]
    for (const attempt of attempts) {
      try {
        renderer = await attempt(canvas)
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: the field still draws with the next renderer; the console is where the failure gets reported.
        console.warn('The thread field fell back to a simpler renderer.', error)
        replaceCanvas()
      }
      if (renderer) break
    }
    if (destroyed) return renderer?.destroy()
    kind = renderer?.kind
    renderer?.lost?.then(() => {
      if (destroyed) return
      losses += 1
      cancelAnimationFrame(frame)
      frame = 0
      replaceCanvas()
      void start()
    })
    measure()
    refresh()
  }

  const resize = new ResizeObserver(measure)
  resize.observe(box)
  if (target) resize.observe(target)
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    refresh()
  })
  seen.observe(box)
  const onVisibility = () => refresh()
  /** Motion back on resumes the current; motion off settles it into the still frame. */
  const onMotion = () => {
    if (!motion.matches) {
      time = STILL_TIME
      dirty = true
    }
    refresh()
  }
  document.addEventListener('visibilitychange', onVisibility)
  motion.addEventListener('change', onMotion)
  void start()

  return () => {
    destroyed = true
    cancelAnimationFrame(frame)
    resize.disconnect()
    seen.disconnect()
    document.removeEventListener('visibilitychange', onVisibility)
    motion.removeEventListener('change', onMotion)
    renderer?.destroy()
  }
})
</script>

<div bind:this={box} class="field {className}" data-renderer={kind} aria-hidden="true">
  <canvas bind:this={canvas}></canvas>
  {#each marks as mark}
    <span class="mark" class:below={mark.below} style:translate="{mark.x}px {mark.y}px"><span class="label">{mark.text}</span></span>
  {/each}
</div>

<style>
  .field {
    position: absolute;
    inset: 0;
    overflow: hidden;
    background: var(--paper);
    pointer-events: none;
  }
  canvas {
    display: block;
    width: 100%;
    height: 100%;
  }
  /* A dot on the thread, and the event's name beside it. */
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
    left: -3px;
    top: -3px;
    width: 6px;
    height: 6px;
    border-radius: 50%;
    background: #fff;
    box-shadow: 0 0 10px 2px color-mix(in srgb, var(--thread-violet) 80%, transparent);
  }
  .label {
    position: absolute;
    left: 0.75rem;
    bottom: 0.4rem;
    color: var(--ink);
    font-family: var(--font-code);
    font-size: 0.9375rem;
    letter-spacing: 0.01em;
    white-space: nowrap;
    /* A tight halo of the page's paper around each glyph, as a map labels over its roads: threads sway, so now and then
       one passes behind a name, and there it runs under the letters instead of striking them through. */
    text-shadow:
      0 0 1px var(--paper),
      0 0 2px var(--paper),
      0 0 3px var(--paper),
      0 0 12px var(--paper);
  }
  /* On the current's lower half the threads rise toward the braid through the space above a knot, so the name hangs
     below it instead, out under the current. */
  .below .label {
    top: 0.4rem;
    bottom: auto;
  }
</style>
