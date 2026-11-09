<script lang="ts">
import { onMount } from 'svelte'
import { ROW, TEXELS } from './cord'
import { webgl2Painter, webgpuPainter } from './gpu'
import { hex } from './renderer'
import { MARK, type Mark, markCord, markScene, markUniforms, STILL_TIME } from './trefoil'

/**
 * Textile's mark, live: the cord's own fibres tied as a trefoil (see trefoil.ts), drawn by its shaders as light over
 * whatever is behind it, `size` CSS px square. Decorative: whatever it sits beside names it.
 *
 * It starts its GPU work only once it shows, draws only while it shows and the tab is visible, and with reduced motion,
 * or `still`, draws one frame. Without a GPU it draws nothing.
 */
let {
  size,
  mark = MARK,
  bleed = 1,
  still = false,
  class: className = '',
}: {
  size: number
  mark?: Mark
  /** The canvas's size as a multiple of the mark's, for its glow to spread out past it; place it centred on it. */
  bleed?: number
  still?: boolean
  class?: string
} = $props()

let canvas: HTMLCanvasElement

onMount(() => {
  const motion = matchMedia('(prefers-reduced-motion: no-preference)')
  const moves = () => !still && motion.matches
  let painter: Awaited<ReturnType<typeof webgpuPainter>> | ReturnType<typeof webgl2Painter>
  let starting = false
  let visible = false
  let frame = 0
  let stopped = false
  const start = performance.now()
  const dpr = Math.min(devicePixelRatio, 2)
  const cord = markCord(size, mark, bleed)
  const style = getComputedStyle(canvas)
  const colours = [
    hex(style.getPropertyValue('--thread-violet')),
    hex(style.getPropertyValue('--thread-amber')),
  ] as const

  const draw = (now: number) => {
    frame = 0
    if (!painter || stopped) return
    const time = STILL_TIME + (moves() ? (now - start) / 1000 : 0)
    painter.paint(markUniforms(cord, mark, colours, dpr, time), cord.count * 2, mark.threads)
    if (moves() && visible && !document.hidden) frame = requestAnimationFrame(draw)
  }
  const wake = () => {
    if (frame === 0 && painter && visible && !document.hidden) frame = requestAnimationFrame(draw)
  }
  /** The GPU, once the mark first shows. */
  const begin = async () => {
    if (starting) return
    starting = true
    canvas.width = Math.round(cord.canvas * dpr)
    canvas.height = Math.round(cord.canvas * dpr)
    const scene = markScene(mark)
    painter =
      (await webgpuPainter(canvas, scene).catch(() => undefined)) ?? webgl2Painter(canvas, scene)
    if (stopped) return painter?.destroy()
    painter?.upload(cord.data, ROW * TEXELS, cord.rows)
    wake()
  }

  const seen = new IntersectionObserver(([entry]) => {
    visible = entry?.isIntersecting ?? false
    if (visible) void begin()
    wake()
  })
  seen.observe(canvas)
  document.addEventListener('visibilitychange', wake)
  motion.addEventListener('change', wake)
  return () => {
    stopped = true
    cancelAnimationFrame(frame)
    seen.disconnect()
    document.removeEventListener('visibilitychange', wake)
    motion.removeEventListener('change', wake)
    painter?.destroy()
  }
})
</script>

<canvas
  bind:this={canvas}
  class={className}
  style:width="{size * bleed}px"
  style:height="{size * bleed}px"
  aria-hidden="true"
></canvas>
