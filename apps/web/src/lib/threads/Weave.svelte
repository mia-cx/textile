<script lang="ts">
import { onMount, untrack } from 'svelte'
import { advance, STILL_TIME } from './clock'
import {
  type Box,
  type Cord,
  carry,
  FADE,
  NO_SEAM,
  reveal,
  type Stop,
  swayAt,
  tipY,
  weave,
} from './cord'
import { type CordRenderer, cordStill, cordWebgl2, cordWebgpu } from './cordRenderer'
import type { Seam } from './geometry'
import { hex, type Palette } from './renderer'

/**
 * The hero's cord carried on down the page: it leaves the bottom of `[data-weave-start]` braided, and for each section
 * that names its event in `data-weave-label`, gathers in the gap above it, with the event's name on a knot there, then
 * comes apart behind the section into loose ribbons of fibre across its width, dimmed behind its `[data-weave-copy]`, and gathers again
 * in the gap below. The gap's knot sits over the section's `[data-weave]` element: above `data-weave-at` along its top,
 * or, with `data-weave="left"`, just left of it. Panels sit above the cord.
 *
 * A strand peels off into each `[data-weave-end]` in a section, to its left edge, or with `data-weave-end="window"`, to
 * the left edge of the Discord window around it: from the right edge of the section's `[data-weave-split]`, or, with no
 * split, from where the cord enters the `[data-weave]` element, where it comes apart into its strands and ends.
 *
 * The cord is drawn on the GPU, as the hero's threads are, on a canvas one screen tall (and a margin) that keeps to the
 * part on screen. It draws down the page in steps as the reader scrolls (see `reveal` in cord.ts): as each section's
 * heading reaches HEADING of the way down the screen, the cord is drawn through the whole section, and holds there
 * until the reader scrolls on; its tip fades out along its own route, and each knot shows as the tip reaches it. With
 * reduced motion it is simply drawn, and holds still.
 * Without a GPU it is drawn in canvas 2D. It is drawn only side by side; stacked, each section names its event above
 * its demo instead. Decorative.
 *
 * `seam` is where the hero's strands stand where they meet the window's left edge: the cord carries each on, as itself,
 * from there behind the window to its bottom, and down the page.
 */
let { seam }: { seam?: Seam | undefined } = $props()

/** Wide enough for the side-by-side layouts the cord runs between. */
const WIDE = '(min-width: 64rem)'
/** The cord's braid radius: a little thinner than the hero's where it meets the window, as it carries on down the page. */
const CORD = 10
/** How far left of a panel the cord gathers when it enters from the side. */
const LANE = 110
/** The canvas reaches this share of a screen above and below the screen, so a fast scroll doesn't outrun it. */
const MARGIN = 0.15
/** How far down the screen a section's heading is when the cord is drawn through the whole section. */
const HEADING = 0.6
/** Device pixels per CSS pixel, at most, as the hero's. */
const MAX_DPR = 2
/**
 * How far along its route the cord's tip is when it is simply drawn: far past any page, and finite, because the shaders
 * fade the cord in the span above its tip.
 */
const NO_TIP = 1e7
/** How many lost GPU devices the cord replaces before it stops asking for WebGPU. */
const MAX_GPU_RECOVERIES = 1

let box: HTMLDivElement
let canvas: HTMLCanvasElement
let knots = $state<Cord['knots']>([])
/** The knots' elements, which sway with the cord: each frame moves them, without a render. */
const marks: HTMLElement[] = $state([])
let kind = $state<CordRenderer['kind']>()
/** Lays the cord out again, once mounted: as the hero measures its seam anew, the cord carries it on. */
let remeasure: (() => void) | undefined
$effect(() => {
  void seam
  untrack(() => remeasure?.())
})

onMount(() => {
  const root = box.parentElement
  if (!root) return
  const wide = matchMedia(WIDE)
  const motion = matchMedia('(prefers-reduced-motion: no-preference)')
  let renderer: CordRenderer | undefined
  let cord: Cord | undefined
  let palette: Palette | undefined
  /** The weave's top on the page, so scrolling needs no layout to find what shows. */
  let offset = 0
  /** Where the cord's tip rests for each section, and at what scroll: see `reveal`. */
  let plateaus: Array<{ scroll: number; tip: number }> = []
  let visible = false
  let frame = 0
  let time = STILL_TIME
  let destroyed = false
  /** Whether the renderer holds the current cord: a new layout waits to upload until the cord next draws. */
  let loaded = false
  /** Whether the canvas still holds a frame of the cord. */
  let painted = false

  /** The part of the cord the screen shows now, with the canvas's margin, and how far along its route it is drawn. */
  const view = () => {
    const top = scrollY - offset - innerHeight * MARGIN
    const tip = motion.matches ? reveal(plateaus, scrollY) : NO_TIP
    return { left: 0, top, tip }
  }
  const draw = () => {
    if (!renderer || !cord || !palette) return
    if (!loaded) renderer.load(cord)
    loaded = true
    const seen = view()
    canvas.style.translate = `0 ${seen.top}px`
    renderer.draw(palette, time, seen)
    // Each knot rides the cord's sway where it crosses its gap, by the same math the shaders run, and shows as the tip
    // reaches it.
    for (const [i, knot] of cord.knots.entries()) {
      const mark = marks[i]
      if (!mark) continue
      mark.style.translate = `${knot.x + swayAt(knot.y, time) * knot.sways}px ${knot.y}px`
      const reached = Math.min(1, Math.max(0, (seen.tip - (cord.gaps[i] ?? 0)) / (FADE / 2)))
      mark.style.opacity = String(reached)
    }
    painted = true
  }
  /**
   * Clears the last frame, once, when the cord stops showing in a visible tab, as when the reader scrolls back above
   * where it starts: the frame would otherwise stay on the canvas, frozen where the cord no longer is.
   */
  const rest = () => {
    if (!painted || !renderer || !visible || document.hidden) return
    renderer.clear()
    painted = false
  }
  /** Whether any of the cord is drawn on the canvas where it is now: above the tip, within the screen and its margin. */
  const shows = (laid: Cord) => {
    const { top, tip } = view()
    const bottom = Math.min(top + innerHeight * (1 + 2 * MARGIN), tipY(laid, tip))
    return top < laid.extent.bottom && bottom > laid.extent.top
  }
  /** The cord draws only while the tab shows it, side by side, with some of it on screen. */
  const live = () =>
    visible && !document.hidden && wide.matches && cord !== undefined && shows(cord)
  const animates = () => motion.matches && renderer !== undefined && renderer.kind !== '2d'
  const tick = (now: number) => {
    frame = 0
    if (!live()) return rest()
    // The hero's clock, so the cord's strands stay in step with the hero's they carry on.
    if (animates()) time = advance(now)
    draw()
    if (animates()) frame = requestAnimationFrame(tick)
  }
  /** Draws on the next frame, and keeps drawing while the cord moves; still, it draws again only as the page scrolls. */
  const wake = () => {
    if (frame !== 0) return
    if (!live()) return rest()
    frame = requestAnimationFrame(tick)
  }

  const measure = () => {
    if (!wide.matches) {
      cord = undefined
      knots = []
      return
    }
    const origin = box.getBoundingClientRect()
    offset = origin.top + scrollY
    const dpr = Math.min(devicePixelRatio, MAX_DPR)
    const height = Math.ceil(innerHeight * (1 + 2 * MARGIN))
    canvas.style.height = `${height}px`
    canvas.width = Math.round(origin.width * dpr)
    canvas.height = Math.round(height * dpr)
    const style = getComputedStyle(box)
    palette = {
      threads: [
        hex(style.getPropertyValue('--thread-violet')),
        hex(style.getPropertyValue('--thread-amber')),
      ],
      background: [0, 0, 0],
    }

    /** An element's box in the weave's pixels. */
    const rect = (element: Element): Box => {
      const r = element.getBoundingClientRect()
      return {
        left: r.left - origin.left,
        top: r.top - origin.top,
        right: r.right - origin.left,
        bottom: r.bottom - origin.top,
      }
    }
    const middle = (r: Box) => (r.top + r.bottom) / 2
    const start = root.querySelector('[data-weave-start]')
    if (!start) return
    const from = rect(start)
    let above = from.bottom
    const stops: Stop[] = []
    /** Each section's heading, on the page. */
    const headings: number[] = []
    for (const section of root.querySelectorAll<HTMLElement>('[data-weave-label]')) {
      const entry = section.querySelector<HTMLElement>('[data-weave]')
      const copy = section.querySelector('[data-weave-copy]')
      if (!entry || !copy) continue
      // Strands spread across the section's whole width, inside its gutters, behind its panels and prose.
      const parts = [...section.children].map(rect)
      const whole = rect(section)
      const gutter = getComputedStyle(section)
      const content: Box = {
        left: whole.left + Number.parseFloat(gutter.paddingLeft),
        top: Math.min(...parts.map((r) => r.top)),
        right: whole.right - Number.parseFloat(gutter.paddingRight),
        bottom: Math.max(...parts.map((r) => r.bottom)),
      }
      const panel = rect(entry)
      const level = entry.querySelector('[data-weave-y]')
      const side = entry.dataset.weave === 'left'
      const x = side
        ? panel.left - LANE
        : panel.left + (panel.right - panel.left) * Number(entry.dataset.weaveAt ?? 0.5)
      const split = section.querySelector('[data-weave-split]')
      stops.push({
        label: section.dataset.weaveLabel ?? '',
        pinch: [x, (above + content.top) / 2],
        box: content,
        copy: rect(copy),
        split: split ? [rect(split).right, middle(rect(split))] : undefined,
        enter: side ? [panel.left, middle(level ? rect(level) : panel)] : [x, panel.top],
        ends: [...section.querySelectorAll<HTMLElement>('[data-weave-end]')].map((end) => {
          const wall = end.dataset.weaveEnd === 'window' ? (end.closest('figure') ?? end) : end
          return [rect(wall).left, middle(rect(end))]
        }),
      })
      above = content.bottom
      headings.push(rect(section.querySelector('h2') ?? copy).top + offset)
    }
    // Behind the window, the hero's strands run from its left edge's middle to its bottom's middle.
    const hidden = (from.right - from.left) / 2 + (from.bottom - from.top) / 2
    cord = weave(
      [(from.left + from.right) / 2, from.bottom],
      stops,
      CORD,
      origin.width,
      seam ? carry(seam, hidden, CORD) : NO_SEAM,
    )
    knots = cord.knots
    // Each section's plateau: the cord drawn a fade past the next gap, where it is one plait again, or to the end of its
    // route for the last section; reached as the section's heading crosses HEADING of the way down the screen.
    const { gaps, length } = cord
    plateaus = headings.map((heading, k) => ({
      scroll: Math.max(1, heading - innerHeight * HEADING),
      tip: (gaps[k + 1] ?? length) + FADE,
    }))
    loaded = false
    wake()
  }

  /** A canvas keeps its first context, so starting over, or past a failed renderer, needs a fresh one. */
  const replaceCanvas = () => {
    const fresh = canvas.cloneNode() as HTMLCanvasElement
    canvas.replaceWith(fresh)
    canvas = fresh
  }

  /** WebGPU, then WebGL2, then canvas 2D, as the hero's field starts; a lost device starts the cord over once. */
  let losses = 0
  const start = async () => {
    renderer = undefined
    const attempts =
      losses > MAX_GPU_RECOVERIES ? [cordWebgl2, cordStill] : [cordWebgpu, cordWebgl2, cordStill]
    for (const attempt of attempts) {
      try {
        renderer = await attempt(canvas)
      } catch (error) {
        // biome-ignore lint/suspicious/noConsole: the cord still draws with the next renderer; the console is where the failure gets reported.
        console.warn('The cord fell back to a simpler renderer.', error)
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
  }

  remeasure = measure
  const resize = new ResizeObserver(measure)
  resize.observe(root)
  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    wake()
  })
  seen.observe(box)
  const onScroll = () => wake()
  const onMotion = () => {
    if (!motion.matches) time = STILL_TIME
    wake()
  }
  addEventListener('scroll', onScroll, { passive: true })
  document.addEventListener('visibilitychange', onScroll)
  motion.addEventListener('change', onMotion)
  wide.addEventListener('change', measure)
  // The canvas is a screen tall, and the page's size can hold while the window's height changes.
  addEventListener('resize', measure)
  void document.fonts.ready.then(measure)
  void start()

  return () => {
    destroyed = true
    remeasure = undefined
    cancelAnimationFrame(frame)
    resize.disconnect()
    seen.disconnect()
    removeEventListener('scroll', onScroll)
    document.removeEventListener('visibilitychange', onScroll)
    motion.removeEventListener('change', onMotion)
    wide.removeEventListener('change', measure)
    removeEventListener('resize', measure)
    renderer?.destroy()
  }
})
</script>

<div bind:this={box} class="weave" data-renderer={kind} aria-hidden="true">
  <div class="threads"><canvas bind:this={canvas}></canvas></div>
  <div class="marks">
    {#each knots as knot, i}
      <span bind:this={marks[i]} class="mark" data-side={knot.side} style:translate="{knot.x}px {knot.y}px"><span class="label">{knot.text}</span></span>
    {/each}
  </div>
</div>

<style>
  /* Fills the page it is in. No z-index of its own, so the cord can sit behind the page's panels and its knots in front
     of them. */
  .weave {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .marks,
  .threads {
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
  /* One screen tall, and a margin; moved down the page to where the screen is each frame it draws. */
  canvas {
    position: absolute;
    top: 0;
    left: 0;
    width: 100%;
  }
  @media not (min-width: 64rem) {
    .weave {
      display: none;
    }
  }

  /* A knot on the cord where it gathers above a section, and the event's name beside it, as the hero labels its
     threads. */
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
  /* Above the knot, clear of the braid, on the side the cord doesn't come in from. */
  .label {
    position: absolute;
    left: 1.25rem;
    bottom: 0.75rem;
    color: var(--ink);
    font-family: var(--font-code);
    font-size: 0.9375rem;
    letter-spacing: 0.01em;
    white-space: nowrap;
    text-shadow: 0 0 12px var(--paper), 0 0 4px var(--paper);
  }
  [data-side='left'] .label {
    right: 1.25rem;
    left: auto;
  }

</style>
