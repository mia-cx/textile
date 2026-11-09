import { FADE, ROW, TEXELS } from './cord'
import { SHAPE } from './geometry'
import type { Scene } from './gpu'
import { EXPOSURE, type RGB } from './renderer'
import { CORD_VEC4S, cordVertexGlsl, cordWgsl } from './shaders'

/**
 * Textile's mark: the site's own cord, drawn by its own shaders, tied as a trefoil. The knot is the braid: its strand
 * is the cord's fibres laid loose side by side in one band, and its three crossings are the braid's. The colour follows
 * the knot, violet over the top-left lobe turning amber at the lower left, every fibre at a point sharing it, and the
 * strand under each crossing goes dark, so the one on top reads in front.
 *
 * Every length is a share of the square the mark is drawn in, so it looks the same at any size; `Mark` overrides any of
 * them (the icon renders use a thicker, brighter band below 64px).
 */
export interface Mark {
  /** The band's half-width, as a share of the square. */
  readonly band: number
  /** How bright the cord is: low enough that its colours hold, rather than burning to pastel in the tone map. */
  readonly intensity: number
  /** How much of the square the knot's centre line spans. */
  readonly fill: number
  /** How loose the fibres lie: 1, as one band of side-by-side fibres; 0, plaited. */
  readonly open: number
  /** Where violet sits along the knot, in radians. */
  readonly phase: number
  /**
   * Fibres in the band, and the bundles they gather in: more of both than the page's cord, and the bundles narrower
   * and more even, so a thick band reads densely spun rather than as a few ribbons with dark between.
   */
  readonly threads: number
  readonly ribbons: number
  readonly ribbon: number
  readonly spread: number
}

export const MARK: Mark = {
  band: 0.08,
  intensity: 0.5,
  fill: 0.74,
  open: 1,
  phase: 0.6,
  threads: 520,
  ribbons: 22,
  ribbon: 0.1,
  spread: 0.4,
}
/** The mark as the small icons and the header draw it: a thicker band, brighter, so it holds up in a few pixels. */
export const SMALL_MARK: Mark = { ...MARK, band: 0.109, intensity: 0.8 }

const TAU = Math.PI * 2
/** The moment the still frame shows, and the moving one starts from: the colours sit as described then, and flow on. */
export const STILL_TIME = 12
/** The plait's radius, as a share of the square: how tight the cord's twist runs, which a loose band barely shows. */
const RADIUS = 0.018
/** Samples along the knot per square: as fine as the page's cord samples it at 1024 (4px apart). */
const SAMPLES_PER_SIZE = 1 / 256
/**
 * Under a crossing the strand beneath goes dark: nearly black (`dim`) across the band on top and `hide` band-widths
 * past its edges, then back to full light over `ease` band-widths, as if the band on top cast a shadow.
 */
const UNDER = { dim: 0.97, hide: 1.5, ease: 2.2 }
/** How many band-widths the loop's end runs past its start, cross-fading into it, so no fibre ends where it closes. */
const OVERLAP = 2

/** The site's cord gives each strand a third of a colour cycle of its own and each loose fibre a spread; here, none. */
const OWN_HUE = 'th.strand / 3.0 + (LOOSE_HUE * (pick - 0.5) + ROPE_HUE * th.fibre.x) * here.loose'

/** The cord's shaders, with every fibre sharing its point's colour and the mark's fibres and bundles. */
export function markScene(mark: Mark): Scene {
  const overrides = {
    CORD_THREADS: mark.threads,
    RIBBONS: mark.ribbons,
    RIBBON: mark.ribbon,
    RIBBON_SPREAD: mark.spread,
  }
  const adapt = (shader: string) => {
    if (!shader.includes(OWN_HUE))
      throw new Error('The cord shader no longer colours fibres as the mark expects.')
    return Object.entries(overrides).reduce(
      (code, [name, value]) => {
        const constant = new RegExp(`\\b${name} = [\\d.]+;`)
        if (!constant.test(code)) throw new Error(`The cord shader no longer declares ${name}.`)
        return code.replace(constant, `${name} = ${value.toFixed(4)};`)
      },
      shader.replace(OWN_HUE, '0.0'),
    )
  }
  return {
    wgsl: adapt(cordWgsl),
    glsl: adapt(cordVertexGlsl),
    vec4s: CORD_VEC4S,
    over: true,
    data: true,
  }
}

/** A sample on the knot: its place, its height (which strand is on top), and its parameter along the knot. */
type Sample = readonly [x: number, y: number, z: number, t: number]

const knot = (t: number) =>
  [
    Math.sin(t) + 2 * Math.sin(2 * t),
    -(Math.cos(t) - 2 * Math.cos(2 * t)),
    -Math.sin(3 * t),
  ] as const

/** The trefoil as samples `step` px apart, fitted to a square `size` px across. */
function trefoil(size: number, fill: number, step: number) {
  const dense = Array.from({ length: 6000 }, (_, k): Sample => {
    const t = (k / 6000) * TAU
    return [...knot(t), t]
  })
  const xs = dense.map(([x]) => x)
  const ys = dense.map(([, y]) => y)
  const span = Math.max(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys))
  const scale = (size * fill) / span
  const cx = (Math.max(...xs) + Math.min(...xs)) / 2
  const cy = (Math.max(...ys) + Math.min(...ys)) / 2
  const toSquare = ([x, y, z, t]: Sample): Sample => [
    size / 2 + (x - cx) * scale,
    size / 2 + (y - cy) * scale,
    z,
    t,
  ]
  const points: Sample[] = [toSquare(dense[0] ?? [0, 0, 0, 0])]
  let carried = 0
  for (let k = 1; k <= dense.length; k++) {
    const a = toSquare(dense[k - 1] ?? [0, 0, 0, 0])
    const next = dense[k % dense.length] ?? [0, 0, 0, 0]
    // Past the last dense point the knot wraps to its start, a whole turn on.
    const b = toSquare(k === dense.length ? [next[0], next[1], next[2], TAU] : next)
    const length = Math.hypot(b[0] - a[0], b[1] - a[1])
    let at = step - carried
    while (at <= length) {
      const f = at / length
      points.push([
        a[0] + (b[0] - a[0]) * f,
        a[1] + (b[1] - a[1]) * f,
        a[2] + (b[2] - a[2]) * f,
        a[3] + (b[3] - a[3]) * f,
      ])
      at += step
    }
    carried = length - (at - step)
  }
  return points
}

/** Where the knot crosses itself: the sample index of the strand underneath at each crossing. */
export function unders(points: ReadonlyArray<Sample>) {
  const n = points.length
  const apart = Math.ceil(n / 30)
  const found: number[] = []
  for (let i = 0; i < n; i++)
    for (let j = i + apart; j < n; j++) {
      if (n - (j - i) < apart) continue
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

/** The mark drawn in a square `size` CSS px across: its data texture, packed as `weave` packs the page's cord. */
export interface MarkCord {
  readonly size: number
  readonly radius: number
  readonly data: Float32Array
  readonly rows: number
  readonly count: number
  readonly length: number
}

export function markCord(size: number, mark: Mark): MarkCord {
  const step = Math.max(0.25, size * SAMPLES_PER_SIZE)
  const band = size * mark.band
  const radius = size * RADIUS
  const loop = trefoil(size, mark.fill, step)
  // Start the loop under a crossing, where it is dimmest and the strand on top covers it: the fibres' wander follows
  // the route, so where the route closes they can't quite meet, and there nobody sees it.
  const start = unders(loop)[0] ?? 0
  const points = [...loop.slice(start), ...loop.slice(0, start)]
  const n = points.length
  const length = n * step
  // A whole number of twists around the loop, so they carry on unbroken where it closes.
  const twists = Math.round(length / (SHAPE.pitch * radius))
  // The hue the shader turns into the mark's colour at knot parameter `t`: warmth 0.5 - 0.5 cos(t + phase) as
  // 0.5 + 0.5 sin(2π hue), less the shader's flow by the still frame's time.
  const hueAt = (t: number) => (t + mark.phase - Math.PI / 2) / TAU + STILL_TIME * SHAPE.flow
  const under = unders(points)
  // The loop's end runs on past its start, fading out as the start fades in, on the same course, so the fibres hand
  // over instead of meeting at a cut, all under a crossing, where the strand is dark anyway.
  const extra = Math.round((OVERLAP * band) / step)
  const closed = [...points, ...points.slice(0, extra + 1)]
  const handover = (k: number) => {
    if (k < extra) return Math.sin((Math.PI / 2) * (k / extra)) ** 2
    if (k >= n) return Math.cos((Math.PI / 2) * ((k - n) / extra)) ** 2
    return 1
  }
  const shade = (k: number) => {
    const d = Math.min(
      ...under.map((u) => Math.min(Math.abs((k % n) - u), n - Math.abs((k % n) - u)) * step),
    )
    const t = Math.min(1, Math.max(0, (d - UNDER.hide * band) / (UNDER.ease * band)))
    return 1 - UNDER.dim * (1 - t * t * (3 - 2 * t))
  }
  const rows = Math.ceil(closed.length / ROW)
  const data = new Float32Array(rows * ROW * TEXELS * 4)
  for (const [k, [x, y, , t]] of closed.entries()) {
    const prev = points[(k - 1 + n) % n]
    const next = points[(k + 1) % n]
    if (!prev || !next) continue
    const tx = next[0] - prev[0]
    const ty = next[1] - prev[1]
    const l = Math.hypot(tx, ty) || 1
    const s = k * step
    // See `Sample` in cord.ts for each texel's fields.
    data.set(
      [
        x,
        y,
        (k / n) * twists * TAU,
        0,
        s,
        mark.open,
        band,
        hueAt(t + (k >= n ? TAU : 0)),
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
  return { size, radius, data, rows, count: closed.length, length }
}

/**
 * The square the mark's intensity is set for, in CSS px. Its fibres are a fixed width in pixels, so in a smaller square
 * the same fibres pack a narrower band, their light adding up the denser they lie: the intensity scales with the
 * square, so the band's light per pixel stays as it is at this size.
 */
const REFERENCE = 1024

/** The uniforms for one frame of `cord` at `time`, in `violet` and `amber`, at `dpr` device pixels per CSS px. */
export function markUniforms(
  cord: MarkCord,
  mark: Mark,
  colours: readonly [RGB, RGB],
  dpr: number,
  time: number,
) {
  const uniforms = new Float32Array(CORD_VEC4S * 4)
  uniforms.set([cord.size, cord.size, dpr, time], 0)
  const intensity = mark.intensity * Math.min(1, cord.size / REFERENCE)
  uniforms.set([0, 0, cord.length + FADE + 1, intensity], 4)
  uniforms.set([cord.radius, mark.threads, 0, 0], 12)
  uniforms.set([cord.count, 0, 0, cord.count], 16)
  uniforms.set(colours[0], 32)
  uniforms.set(colours[1], 36)
  uniforms.set([0.027, 0.024, 0.047, EXPOSURE], 40)
  return uniforms
}
