<script lang="ts">
import { onMount } from 'svelte'
import { FADE, ROW, TEXELS } from '$lib/threads/cord'
import { SHAPE } from '$lib/threads/geometry'
import { webgl2Painter, webgpuPainter } from '$lib/threads/gpu'
import { EXPOSURE, hex } from '$lib/threads/renderer'
import { CORD_VEC4S, cordVertexGlsl, cordWgsl } from '$lib/threads/shaders'

/**
 * Textile's mark, live, in development only: `pnpm logo` captures it into static/icons. The site's own cord, drawn by
 * its own shaders, as a trefoil. The knot is the
 * braid: its strand is the cord's fibres laid loose side by side in one band, and its three crossings are the braid's.
 * Where it crosses itself, the stretch underneath dims, so the one on top reads in front. `?size=` sets the square in
 * CSS px, `?band=` the band's half-width, `?open=` how loose (0 plaited to 1 loose), `?still` stops it moving.
 */
const TAU = Math.PI * 2
const params = new URLSearchParams(typeof location === 'undefined' ? '' : location.search)
const SIZE = Number(params.get('size') ?? 1024)
/** The braid's radius, in px, and how much of the square the knot spans. */
const RADIUS = Number(params.get('radius') ?? SIZE * 0.018)
/** The band's half-width, in px, and how loose its fibres lie: fully, as one band of side-by-side fibres. */
const BAND = Number(params.get('band') ?? SIZE * 0.08)
/**
 * Fibres in the band, and the bundles they gather in: more of both than the page's cord, and the bundles narrower and
 * more even (less `ribbonSpread`), so a thick band reads densely spun rather than as a few ribbons with dark between.
 */
const THREADS = Number(params.get('threads') ?? 520)
const RIBBONS = Number(params.get('ribbons') ?? 22)
const RIBBON = Number(params.get('ribbon') ?? 0.1)
const RIBBON_SPREAD = Number(params.get('spread') ?? 0.4)
const OPEN = Number(params.get('open') ?? 1)
const FILL = Number(params.get('fill') ?? 0.74)
/**
 * What the knot sits on: the site's ink, or nothing (`?bg=transparent`), for a PNG with an alpha channel. The canvas
 * is light laid over the page either way, so a transparent capture composites onto any ground.
 */
const GROUND = params.get('bg') === 'transparent' ? 'transparent' : '#07060c'
/** Pixels between samples along the cord: as the page's cord samples it. */
const STEP = 4
/** How bright the cord is: low enough that its colours hold, rather than burning to pastel in the tone map. */
const INTENSITY = Number(params.get('intensity') ?? 0.5)
/**
 * The colour follows the knot itself, once around, as the drawn mark's does: violet over the top-left lobe, amber at
 * the lower left, magenta through the right. `PHASE` turns where violet sits. Every fibre at a point shares its colour.
 */
const PHASE = Number(params.get('phase') ?? 0.6)
/** The moment the still frame shows, and the moving one starts from: the colours sit as above then, and flow on after. */
const STILL_TIME = 12
/** The site's cord gives each strand a third of a colour cycle of its own and each loose fibre a spread; here, none. */
const OWN_HUE = 'th.strand / 3.0 + (LOOSE_HUE * (pick - 0.5) + ROPE_HUE * th.fibre.x) * here.loose'
/** The shader constants this study sets its own way: the thread count and how the threads bundle. */
const OVERRIDES = { CORD_THREADS: THREADS, RIBBONS, RIBBON, RIBBON_SPREAD }
const forStudy = (shader: string) => {
  if (!shader.includes(OWN_HUE))
    throw new Error('The cord shader no longer colours fibres as this study expects.')
  return Object.entries(OVERRIDES).reduce(
    (code, [name, value]) => {
      const constant = new RegExp(`\\b${name} = [\\d.]+;`)
      if (!constant.test(code)) throw new Error(`The cord shader no longer declares ${name}.`)
      return code.replace(constant, `${name} = ${value.toFixed(4)};`)
    },
    shader.replace(OWN_HUE, '0.0'),
  )
}
/** A sample on the knot: its place, its height (which strand is on top), and its parameter along the knot. */
type Sample = readonly [x: number, y: number, z: number, t: number]
/**
 * Under a crossing the strand beneath goes dark: nearly black (`dim`) across the band on top and `hide` past its
 * edges, then back to full light over `ease` px, so the band on top reads in front of it, as if casting a shadow.
 */
const UNDER = { dim: 0.97, hide: BAND * 1.5, ease: BAND * 2.2 }
/** How far the loop's end runs on past its start, cross-fading into it, so no fibre ends where the loop closes. */
const OVERLAP = BAND * 2

const knot = (t: number) =>
  [
    Math.sin(t) + 2 * Math.sin(2 * t),
    -(Math.cos(t) - 2 * Math.cos(2 * t)),
    -Math.sin(3 * t),
  ] as const

/** The trefoil as the cord's samples: every STEP px along it, fitted to the square. */
function trefoil() {
  const dense = Array.from({ length: 6000 }, (_, k): Sample => {
    const t = (k / 6000) * TAU
    return [...knot(t), t]
  })
  const xs = dense.map(([x]) => x)
  const ys = dense.map(([, y]) => y)
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const scale = (SIZE * FILL) / span
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const toSquare = ([x, y, z, t]: Sample): Sample => [
    SIZE / 2 + (x - cx) * scale,
    SIZE / 2 + (y - cy) * scale,
    z,
    t,
  ]
  // Resample to STEP px apart.
  const points: Sample[] = [toSquare(dense[0] ?? [0, 0, 0, 0])]
  let carried = 0
  for (let k = 1; k <= dense.length; k++) {
    const a = toSquare(dense[k - 1] ?? [0, 0, 0, 0])
    const next = dense[k % dense.length] ?? [0, 0, 0, 0]
    // Past the last dense point the knot wraps to its start, a whole turn on.
    const b = toSquare(k === dense.length ? [next[0], next[1], next[2], TAU] : next)
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    let at = STEP - carried
    while (at <= length) {
      const f = at / length
      points.push([
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
        a[3] + (b[3] - a[3]) * f,
      ])
      at += STEP
    }
    carried = length - (at - STEP)
  }
  return points
}

/** Where the cord crosses itself: the sample index of the strand underneath at each crossing. */
function unders(points: ReadonlyArray<Sample>) {
  const n = points.length
  const found: number[] = []
  for (let i = 0; i < n; i++)
    for (let j = i + 20; j < n; j++) {
      if (n - (j - i) < 20) continue
      const [a, b, c, e] = [points[i], points[(i + 1) % n], points[j], points[(j + 1) % n]]
      if (!a || !b || !c || !e) continue
      const den = (b[0] - a[0]) * (e[1] - c[1]) - (b[1] - a[1]) * (e[0] - c[0])
      if (Math.abs(den) < 1e-9) continue
      const u = ((c[0] - a[0]) * (e[1] - c[1]) - (c[1] - a[1]) * (e[0] - c[0])) / den
      const w = ((c[0] - a[0]) * (b[1] - a[1]) - (c[1] - a[1]) * (b[0] - a[0])) / den
      if (u >= 0 && u < 1 && w >= 0 && w < 1) found.push(a[2] < c[2] ? i : j)
    }
  return found
}

/** The cord's data texture, packed as `weave` packs the page's: see `Sample` in cord.ts. */
function pack(loop: ReadonlyArray<Sample>) {
  // Start the loop under a crossing, where it is dimmest and the strand on top covers it: the fibres' wander follows
  // the route, so where the route closes they can't quite meet, and there nobody sees it.
  const start = unders(loop)[0] ?? 0
  const points = [...loop.slice(start), ...loop.slice(0, start)]
  const n = points.length
  const length = n * STEP
  // A whole number of twists and of colour cycles around the loop, so both carry on unbroken where it closes.
  const twists = Math.round(length / (SHAPE.pitch * RADIUS))
  /**
   * The hue (in gradient cycles) the shader turns into the drawn mark's colour at knot parameter `t`: the mark's warmth
   * is 0.5 - 0.5 cos(t + PHASE), the shader's 0.5 + 0.5 sin(2π hue), and the shader's flow has moved it on by the
   * still frame's time, which this takes back.
   */
  const hueAt = (t: number) => (t + PHASE - Math.PI / 2) / TAU + STILL_TIME * SHAPE.flow
  const under = unders(points)
  // The loop's end runs on past its start by OVERLAP, fading out there as the start fades in: the two lie on the same
  // course, their light summing to whole, so the fibres hand over instead of meeting at a cut. It all happens under a
  // crossing, where the strand is dark anyway.
  const extra = Math.round(OVERLAP / STEP)
  const closed = [...points, ...points.slice(0, extra + 1)]
  const handover = (k: number) => {
    if (k < extra) return Math.sin((Math.PI / 2) * (k / extra)) ** 2
    if (k >= n) return Math.cos((Math.PI / 2) * ((k - n) / extra)) ** 2
    return 1
  }
  /** How dark the strand is at sample `k`: black under a band on top, easing back to full light. */
  const shade = (k: number) => {
    const d = Math.min(
      ...under.map((u) => Math.min(Math.abs((k % n) - u), n - Math.abs((k % n) - u)) * STEP),
    )
    const t = Math.min(1, Math.max(0, (d - UNDER.hide) / UNDER.ease))
    return 1 - UNDER.dim * (1 - t * t * (3 - 2 * t))
  }
  const rows = Math.ceil(closed.length / ROW)
  const data = new Float32Array(rows * ROW * TEXELS * 4)
  for (const [k, [x, y, , knotT]] of closed.entries()) {
    const prev = points[(k - 1 + n) % n] ?? points[k]
    const next = points[(k + 1) % n] ?? points[k]
    if (!prev || !next) continue
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const l = Math.hypot(tx, ty) || 1
    const s = k * STEP
    data.set(
      [
        x,
        y,
        (k / n) * twists * TAU,
        0,
        s,
        OPEN,
        BAND,
        // Past the loop's end, its overlap carries on a whole turn later.
        hueAt(knotT + (k >= n ? TAU : 0)),
        -ty / l,
        tx / l,
        shade(k) * handover(k),
        0,
        s,
        0,
        1,
        0,
      ],
      k * TEXELS * 4,
    )
  }
  return { data, rows, count: closed.length, length }
}

let canvas: HTMLCanvasElement

onMount(() => {
  // The site's layout wraps this page in its header, its "Copy page" control, and its ink. A capture needs nothing
  // but the stage: every sibling of the stage and of each of its ancestors is taken out, and the page drops its ink.
  for (
    let node: Element | null = canvas.parentElement;
    node && node !== document.documentElement;
    node = node.parentElement
  )
    for (const sibling of node.parentElement?.children ?? [])
      if (sibling !== node && sibling instanceof HTMLElement) sibling.style.display = 'none'
  if (GROUND === 'transparent')
    for (const element of [document.documentElement, document.body])
      element.style.background = 'transparent'
  const dpr = Math.min(devicePixelRatio, 2)
  canvas.width = SIZE * dpr
  canvas.height = SIZE * dpr
  const cord = pack(trefoil())
  const style = getComputedStyle(document.documentElement)
  const violet = hex(style.getPropertyValue('--thread-violet'))
  const amber = hex(style.getPropertyValue('--thread-amber'))
  const uniforms = new Float32Array(CORD_VEC4S * 4)
  let frame = 0
  let stop = false
  const scene = {
    wgsl: forStudy(cordWgsl),
    glsl: forStudy(cordVertexGlsl),
    vec4s: CORD_VEC4S,
    over: true,
    data: true,
  }
  void (async () => {
    const painter =
      (await webgpuPainter(canvas, scene).catch(() => undefined)) ?? webgl2Painter(canvas, scene)
    if (!painter || stop) return
    painter.upload(cord.data, ROW * TEXELS, cord.rows)
    const start = performance.now()
    const draw = (now: number) => {
      const time = STILL_TIME + (params.has('still') ? 0 : (now - start) / 1000)
      uniforms.fill(0)
      uniforms.set([SIZE, SIZE, dpr, time], 0)
      uniforms.set([0, 0, cord.length + FADE + 1, INTENSITY], 4)
      uniforms.set([RADIUS, THREADS, 0, 0], 12)
      uniforms.set([cord.count, 0, 0, cord.count], 16)
      uniforms.set(violet, 32)
      uniforms.set(amber, 36)
      uniforms.set([0.027, 0.024, 0.047, EXPOSURE], 40)
      painter.paint(uniforms, cord.count * 2, THREADS)
      if (!stop && !params.has('still')) frame = requestAnimationFrame(draw)
    }
    frame = requestAnimationFrame(draw)
  })()
  return () => {
    stop = true
    cancelAnimationFrame(frame)
  }
})
</script>

<svelte:head><title>Trefoil study</title><meta name="robots" content="noindex" /></svelte:head>

<div class="stage" style:background={GROUND}>
  <canvas bind:this={canvas} style:width="{SIZE}px" style:height="{SIZE}px"></canvas>
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
