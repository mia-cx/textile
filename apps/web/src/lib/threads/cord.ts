import { band, fibre, hash, type Point, SHAPE } from './geometry'

/**
 * The cord that leaves the hero's window and carries the reader down the page: a braid that gathers in the gap above
 * each section, comes apart behind the section into loose ribbons of fibre, as the hero's funnel does run in reverse,
 * and gathers again in the gap below on its way to the next. Strands peel off it into demos, and it ends where a
 * section's strands all peel off.
 *
 * Plain geometry in the page's CSS pixels: `weave` lays the cord out once per resize as samples along its paths, which
 * the GPU reads from a float texture (see `cordWgsl` in shaders.ts); `place` runs the same math on the CPU for the 2D
 * fallback.
 */

export interface Box {
  readonly left: number
  readonly top: number
  readonly right: number
  readonly bottom: number
}

/** One section the cord passes, as the page measures it, in the weave's pixels. */
export interface Stop {
  /** The event that runs the section, named on a knot where the cord gathers above it. */
  readonly label: string
  /** Where the cord gathers into a braid in the gap above the section, before it comes apart behind it. */
  readonly pinch: Point
  /** The section's content: its strands spread across it, behind the panels. */
  readonly box: Box
  /** The section's prose, which strands passing behind dim under. */
  readonly copy: Box
  /** Where strands peel off into the demo: a panel's right edge. Without one, the cord itself comes apart at `enter`. */
  readonly split: Point | undefined
  /** Where it enters the demo, to come apart there. */
  readonly enter: Point
  /** The points the peeled strands reach, each level with what it enters. */
  readonly ends: ReadonlyArray<Point>
}

/** Pixels between samples along a path: fine enough that the braid's twists stay smooth. */
const STEP = 4
/**
 * How much of a section's height the cord takes to come apart below its gap, and to gather again above the next, and
 * the most it takes: long, so strands sweep in and out as gently as the hero's funnel narrows.
 */
const RISE = 0.5
const MAX_RISE = 800
/** The share of a section's width its loose strands spread across. */
const SPREAD = 0.92
/** Texels per sample, and samples per row of the texture: rows stay within every GPU's smallest texture limit. */
export const TEXELS = 3
export const ROW = 682
/** Threads in the cord, threads in each strand that peels off, and the most strands that can peel. */
export const CORD_THREADS = 180
export const PEEL_THREADS = 10
export const MAX_PEELS = 6
/** The most sections whose prose dims the strands behind it. */
export const MAX_COPY = 8
/** Pixels of path per unit of drift along a fibre: about the hero's length, so the cord's fibres drift as its do. */
export const DRIFT_SPAN = 1300

/** A path's samples in the texture: the first, and how many. Path 0 is the cord; the rest are strands peeling off. */
export interface Span {
  readonly first: number
  readonly count: number
}

export interface Cord {
  /** Every path's samples, `TEXELS` RGBA texels each: see `sample`. */
  readonly data: Float32Array
  readonly rows: number
  readonly paths: ReadonlyArray<Span>
  /** The cord's samples' heights, rising: the part on screen is a binary search away. */
  readonly heights: Float32Array
  readonly copy: ReadonlyArray<Box>
  /** Where each section's name sits: on the knot where the cord gathers, on the side it doesn't come in from. */
  readonly knots: ReadonlyArray<{ text: string; x: number; y: number; side: 'left' | 'right' }>
  readonly radius: number
}

/**
 * One sample: where the spine is and its unit normal; how far along the path it is (`s`), how far the strands have come
 * apart there (`open`, 0 braided to 1 loose), the half-width they spread across (`width`) and its centre's offset from
 * the spine (`centre`), along `axis`; and how bright the strands are there (`light`).
 */
interface Sample {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
  readonly s: number
  readonly open: number
  readonly width: number
  readonly centre: number
  readonly axis: Point
  readonly light: number
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/** Points from `a` down to `b`, leaving and arriving straight down, easing across between. */
function drop(a: Point, b: Point): Point[] {
  const steps = Math.max(1, Math.ceil((b[1] - a[1]) / STEP))
  return Array.from({ length: steps }, (_, k): Point => {
    const t = k / steps
    return [a[0] + (b[0] - a[0]) * smoothstep(0, 1, t), a[1] + (b[1] - a[1]) * t]
  })
}

/** Dense points along the cubic from `a` to `d` through controls `b` and `c`. */
function cubic(a: Point, b: Point, c: Point, d: Point): Point[] {
  const steps = Math.max(8, Math.ceil(Math.hypot(d[0] - a[0], d[1] - a[1]) / STEP))
  return Array.from({ length: steps + 1 }, (_, k): Point => {
    const t = k / steps
    const u = 1 - t
    const at = (axis: 0 | 1) =>
      u ** 3 * a[axis] + 3 * u * u * t * b[axis] + 3 * u * t * t * c[axis] + t ** 3 * d[axis]
    return [at(0), at(1)]
  })
}

/**
 * The line a strand follows when it peels off at `from` into `to`: a smooth curve that leaves heading `lead` (a unit
 * vector: rightward from a panel's edge, downward where the cord comes apart) and arrives level.
 */
function strandLine(from: Point, to: Point, lead: Point): Point[] {
  const reach = Math.abs(to[0] - from[0]) * 0.55
  return cubic(
    from,
    [from[0] + lead[0] * reach, from[1] + lead[1] * reach],
    [to[0] - reach, to[1]],
    to,
  )
}

/** Normals and distances along `points`, from their neighbours. */
function frame(points: ReadonlyArray<Point>) {
  let s = 0
  return points.map(([x, y], i) => {
    const previous = points[Math.max(0, i - 1)] as Point
    const next = points[Math.min(points.length - 1, i + 1)] as Point
    const tx = next[0] - previous[0]
    const ty = next[1] - previous[1]
    const length = Math.hypot(tx, ty) || 1
    if (i > 0) s += Math.hypot(x - previous[0], y - previous[1])
    return { x, y, nx: -ty / length, ny: tx / length, s }
  })
}

/**
 * The cord from `start` down through each stop in turn, with `radius` its braid's radius: braided down to the first
 * gap, then behind each section coming apart across it and gathering again in the next gap, until a stop whose strands
 * all peel off, where it ends. Strands peel off at each `split` into the ends to its right.
 */
export function weave(start: Point, stops: ReadonlyArray<Stop>, radius: number): Cord {
  const spine: Point[] = []
  /** For each spine point, the section it comes apart behind, between the gaps `from` and `to`. */
  const spans: Array<{ box: Box; from: number; to: number; closes: boolean } | undefined> = []
  const strands: Array<{ line: Point[]; strand: number }> = []
  const knots: Array<Cord['knots'][number]> = []
  let at = start
  let behind: { box: Box; from: number; to: number; closes: boolean } | undefined
  for (const [k, stop] of stops.entries()) {
    const points = drop(at, stop.pinch)
    spine.push(...points)
    spans.push(...points.map(() => behind))
    knots.push({
      text: stop.label,
      x: stop.pinch[0],
      y: stop.pinch[1],
      side: at[0] > stop.pinch[0] + 1 ? 'left' : 'right',
    })
    at = stop.pinch

    const { split } = stop
    if (split) {
      const beside = stop.ends.filter(([x]) => x > split[0])
      for (const [n, end] of beside.entries())
        strands.push({ line: strandLine(split, end, [1, 0]), strand: n % 3 })
    } else if (stop.ends.length > 0) {
      // The cord runs braided into the demo and comes apart there into the strands that reach each end.
      const into = drop(at, stop.enter)
      spine.push(...into, stop.enter)
      spans.push(...into.map(() => undefined), undefined)
      for (const [n, end] of stop.ends.entries())
        strands.push({ line: strandLine(stop.enter, end, [0, 1]), strand: n % 3 })
      behind = undefined
      break
    }
    const next = stops[k + 1]
    behind = {
      box: stop.box,
      from: stop.pinch[1],
      to: next ? next.pinch[1] : stop.box.bottom,
      closes: !!next,
    }
    if (!next) {
      // The last section's strands come apart behind it and fade out at its foot.
      const points = drop(at, [at[0], stop.box.bottom])
      spine.push(...points, [at[0], stop.box.bottom])
      spans.push(...points.map(() => behind), behind)
    }
  }

  const cord: Sample[] = frame(spine).map((p, i) => {
    const span = spans[i]
    if (!span) return { ...p, open: 0, width: 0, centre: 0, axis: [1, 0], light: 1 }
    const rise = Math.min(MAX_RISE, (span.to - span.from) * RISE)
    const gather = smoothstep(0, rise, span.to - p.y)
    const open = smoothstep(0, rise, p.y - span.from) * (span.closes ? gather : 1)
    const middle = (span.box.left + span.box.right) / 2
    return {
      ...p,
      open,
      width: ((span.box.right - span.box.left) / 2) * SPREAD,
      centre: middle - p.x,
      axis: [1, 0],
      light: span.closes ? 1 : gather,
    }
  })
  const peels: Sample[][] = strands.slice(0, MAX_PEELS).map(({ line }) => {
    const points = frame(line)
    const total = points.at(-1)?.s ?? 1
    return points.map((p) => ({
      ...p,
      open: 1,
      // Fibres splay apart mid-way and gather again at each end.
      width: radius * 0.6 * (0.4 + Math.sin((p.s / total) * Math.PI)),
      centre: 0,
      axis: [p.nx, p.ny],
      light: smoothstep(0, 24, p.s),
    }))
  })

  const all = [cord, ...peels]
  const total = all.reduce((sum, path) => sum + path.length, 0)
  const rows = Math.max(1, Math.ceil(total / ROW))
  const data = new Float32Array(rows * ROW * TEXELS * 4)
  const paths: Span[] = []
  let first = 0
  for (const path of all) {
    for (const [k, p] of path.entries()) {
      data.set(
        [p.x, p.y, p.nx, p.ny, p.s, p.open, p.width, p.centre, ...p.axis, p.light, 0],
        (first + k) * TEXELS * 4,
      )
    }
    paths.push({ first, count: path.length })
    first += path.length
  }
  return {
    data,
    rows,
    paths,
    heights: Float32Array.from(cord, (p) => p.y),
    copy: stops.slice(0, MAX_COPY).map((stop) => stop.copy),
    knots,
    radius,
  }
}

/** The cord's samples from `top` to `bottom`, and a little beyond, so its braid and sway reach the edges. */
export function visible(cord: Cord, top: number, bottom: number): Span {
  const below = (y: number) => {
    let lo = 0
    let hi = cord.heights.length
    while (lo < hi) {
      const mid = (lo + hi) >> 1
      if ((cord.heights[mid] ?? 0) < y) lo = mid + 1
      else hi = mid
    }
    return lo
  }
  const margin = cord.radius * 4 + STEP
  const first = Math.max(0, below(top - margin) - 1)
  const last = Math.min(cord.heights.length, below(bottom + margin) + 1)
  return { first, count: Math.max(0, last - first) }
}

const TAU = Math.PI * 2

/**
 * What makes thread `i` of path `path` itself: as the hero's threads, cord threads travel in ribbons across the
 * spread and keep their place across their ribbon as their place across their band; a peeled strand's threads spread
 * evenly across it. Mirrors `cordThread` in the shaders.
 */
export const cordThread = (i: number) => {
  if (i >= CORD_THREADS) {
    const j = (i - CORD_THREADS) % PEEL_THREADS
    const peel = Math.floor((i - CORD_THREADS) / PEEL_THREADS)
    const across = ((j + 0.5) / PEEL_THREADS) * 2 - 1
    return {
      path: 1 + peel,
      lane: across,
      strand: peel % 3,
      leave: 0,
      phase: 0,
      ribbon: peel,
      ...fibre(i, across),
    }
  }
  const ribbon = Math.floor(hash(i + 1.3) * SHAPE.ribbons)
  const centre = ((ribbon + 0.5) / SHAPE.ribbons) * 2 - 1 + (hash(ribbon + 11) - 0.5) * 0.15
  const across = (hash(i + 0.5) - 0.5) * 2
  const order = Math.min(
    1,
    SHAPE.inward * Math.abs(centre) +
      (1 - SHAPE.inward) * hash(ribbon + 7.1) +
      SHAPE.stagger * hash(i + 7.1),
  )
  return {
    path: 0,
    lane: centre + (across * SHAPE.ribbon) / 2,
    strand: Math.min(2, Math.max(0, Math.floor((centre + 1) * 1.5))),
    // Outer ribbons come apart first and gather last, as the hero's join it last.
    leave: (1 - LOOSEN) * (1 - order),
    phase: hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SHAPE.scatter,
    ribbon,
    ...fibre(i, across),
  }
}

/** How much of the way from braided to loose each thread takes to come apart. */
export const LOOSEN = 0.8

/**
 * Thread `i` at its path's sample `k` at time `t`: where it is, and how loose it is there (0 braided, 1 loose). Reads
 * the sample from `cord.data`. Mirrors `place` in `cordWgsl`.
 */
export function place(cord: Cord, i: number, k: number, t: number) {
  const o = k * TEXELS * 4
  const d = cord.data
  const [x = 0, y = 0, nx = 0, ny = 0, s = 0, open = 0, width = 0, centre = 0, ax = 0, ay = 0] =
    d.subarray(o, o + 10)
  const th = cordThread(i)
  const loose = smoothstep(th.leave, th.leave + LOOSEN, open)
  const twist = (s / (SHAPE.pitch * cord.radius)) * TAU - t * SHAPE.spin + (th.strand * TAU) / 3
  const braided = cord.radius * Math.sin(band(twist, th.jitter, th.edge, s / DRIFT_SPAN, th.drift))
  const sway =
    th.path === 0
      ? width *
        SHAPE.wave *
        (Math.sin(s * 0.004 + t * 0.35 + th.phase) * 0.6 +
          Math.sin(s * 0.008 - t * 0.23 + th.phase * 1.7) * 0.4)
      : 0
  const spread = centre + th.lane * width + sway
  const point: Point = [
    x + nx * braided * (1 - loose) + ax * spread * loose,
    y + ny * braided * (1 - loose) + ay * spread * loose,
  ]
  return { point, loose, twist, s }
}
