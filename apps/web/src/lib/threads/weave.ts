import { hash, type Point, SHAPE } from './geometry'

/**
 * The cord that leaves the hero's window and carries the page down to each section: a route through waypoints with
 * rounded corners, braided from the same three strands as the hero's cord, and the single strands that peel off it into
 * a demo. Plain geometry in CSS pixels; Weave.svelte measures the page and draws the result as SVG.
 */

/** One point along a route, with its unit normal and its distance along the route. */
interface Sample {
  readonly x: number
  readonly y: number
  readonly nx: number
  readonly ny: number
  readonly s: number
}

/** A stroke to draw: its path data, which thread colour it takes (0 violet, 1 amber, 2 silver), and its opacity. */
export interface Stroke {
  readonly d: string
  readonly colour: number
  readonly opacity: number
}

const TAU = Math.PI * 2
/** Pixels between samples along a route: fine enough that the braid's twists stay smooth. */
const STEP = 3
/** How many fibres each of the braid's three strands is drawn with. */
const FIBRES = 4

const quad = (a: Point, c: Point, b: Point, t: number): Point => {
  const u = 1 - t
  return [
    u * u * a[0] + 2 * u * t * c[0] + t * t * b[0],
    u * u * a[1] + 2 * u * t * c[1] + t * t * b[1],
  ]
}
const toward = (from: Point, to: Point, distance: number): Point => {
  const length = Math.hypot(to[0] - from[0], to[1] - from[1]) || 1
  return [
    from[0] + ((to[0] - from[0]) / length) * distance,
    from[1] + ((to[1] - from[1]) / length) * distance,
  ]
}
const line = (a: Point, b: Point) => {
  const steps = Math.max(1, Math.ceil(Math.hypot(b[0] - a[0], b[1] - a[1]) / STEP))
  return Array.from(
    { length: steps },
    (_, k): Point => [a[0] + ((b[0] - a[0]) * k) / steps, a[1] + ((b[1] - a[1]) * k) / steps],
  )
}

/** Dense points along the polyline through `waypoints`, each corner rounded by up to `radius`. */
function trace(waypoints: ReadonlyArray<Point>, radius: number): Point[] {
  const first = waypoints[0]
  const last = waypoints.at(-1)
  if (!first || !last) return []
  const points: Point[] = []
  let from = first
  for (let i = 1; i < waypoints.length - 1; i++) {
    const before = waypoints[i - 1] as Point
    const corner = waypoints[i] as Point
    const after = waypoints[i + 1] as Point
    const r = Math.min(
      radius,
      Math.hypot(corner[0] - before[0], corner[1] - before[1]) / 2,
      Math.hypot(after[0] - corner[0], after[1] - corner[1]) / 2,
    )
    const enter = toward(corner, before, r)
    const leave = toward(corner, after, r)
    points.push(...line(from, enter))
    const steps = Math.max(2, Math.ceil((r * 1.6) / STEP))
    for (let k = 0; k < steps; k++) points.push(quad(enter, corner, leave, k / steps))
    from = leave
  }
  points.push(...line(from, last), last)
  return points
}

/** Normals and distances along `points`, from their neighbours. */
function sample(points: ReadonlyArray<Point>): Sample[] {
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

const path = (points: ReadonlyArray<Point>) =>
  points.map(([x, y], i) => `${i === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`).join('')

/** Where in its strand fibre `f` runs, -1 to 1, spread evenly with a little jitter, as the hero's fibres are. */
const lane = (f: number) => ((f + 0.5) / FIBRES) * 2 - 1 + (hash(f + 8.3) - 0.5) * 0.2

/** The route through `waypoints` itself, its corners rounded by up to `radius`: the line the braid's glow follows. */
const route = (waypoints: ReadonlyArray<Point>, radius: number) => path(trace(waypoints, radius))

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
 * How loosely the cord's fibres lie in their strands, in braid radii: looser than the hero's tight cord, so the cord
 * reads as soft fibre on the dark rather than a chain.
 */
const LOOSE = 0.75

/**
 * The braid along the route through `waypoints`: three strands of `FIBRES` fibres each, twisting around the route at
 * the hero cord's pitch for a braid of radius `cord`, so it reads as the same cord carried on down the page.
 */
function braid(waypoints: ReadonlyArray<Point>, cord: number, radius: number): Stroke[] {
  const samples = sample(trace(waypoints, radius))
  const pitch = SHAPE.pitch * cord
  return Array.from({ length: 3 * FIBRES }, (_, i) => {
    const strand = i % 3
    const fibre = Math.floor(i / 3)
    const drift = hash(i + 4.7) * TAU
    const points = samples.map(({ x, y, nx, ny, s }): Point => {
      const twist = (s / pitch) * TAU + (strand * TAU) / 3
      const offset =
        cord * (Math.sin(twist) + (lane(fibre) + SHAPE.drift * Math.sin(s / 90 + drift)) * LOOSE)
      return [x + nx * offset, y + ny * offset]
    })
    return { d: path(points), colour: strand, opacity: 0.2 + 0.4 * hash(i + 2.2) }
  })
}

/**
 * The line a strand follows when it peels off the cord at `from` into `to`: a smooth curve that leaves heading `lead`
 * (a unit vector: rightward from a panel's edge, downward where the cord comes apart) and arrives level.
 */
function strandLine(from: Point, to: Point, lead: Point): Point[] {
  const reach = Math.abs(to[0] - from[0]) * 0.55
  const out: Point = [from[0] + lead[0] * reach, from[1] + lead[1] * reach]
  return cubic(from, out, [to[0] - reach, to[1]], to)
}

/** A strand along `line`, as a few loose fibres in strand `strand`'s colour. */
function peel(line: ReadonlyArray<Point>, strand: number, cord: number): Stroke[] {
  const samples = sample(line)
  const total = samples.at(-1)?.s ?? 1
  return Array.from({ length: FIBRES }, (_, f) => {
    const drift = hash(strand * 7 + f + 4.7) * TAU
    const points = samples.map(({ x, y, nx, ny, s }): Point => {
      // Fibres splay apart mid-way and gather again at each end.
      const loose = Math.sin((s / total) * Math.PI)
      const offset = cord * 0.6 * (lane(f) + SHAPE.drift * Math.sin(s / 70 + drift)) * (0.4 + loose)
      return [x + nx * offset, y + ny * offset]
    })
    return { d: path(points), colour: strand, opacity: 0.5 + 0.5 * hash(strand * 7 + f + 2.2) }
  })
}

/** One section the cord enters, as the page measures it, in the weave's pixels. */
export interface Stop {
  /** The event that runs the section, named on a knot where the cord enters. */
  readonly label: string
  /** The panel edge the cord enters by, and the point on it. */
  readonly side: 'top' | 'left'
  readonly enter: Point
  /**
   * Where the cord comes out of the bottom of the panel it entered: below its entry from the top, or below the panel's
   * middle from the side, clear of any note under the panel's left end.
   */
  readonly out: Point
  /**
   * The top of the section's first content and the bottom of its last: the cord crosses the gap above the section, and
   * after `out` runs straight down past the bottom before it turns, so it never passes behind a taller panel beside it.
   */
  readonly top: number
  readonly bottom: number
  /** Where strands peel off: a panel's right edge, or, with none, the entry, where the cord comes apart and ends. */
  readonly split: Point | undefined
  /**
   * The points the strands reach, each level with what it enters. From a split, only the ends to its right get one: a
   * demo stacked into one column puts its end below the split, where the cord itself already runs behind both panels.
   */
  readonly ends: ReadonlyArray<Point>
}

/** How the cord is drawn: its braid's radius, how round its corners turn, and how far beside a panel it comes down. */
export interface Weaving {
  readonly cord: number
  readonly corner: number
  readonly lane: number
}

/**
 * The cord from `start` down through each stop in turn: across the gap above each section in one S-curve, level at
 * the gap's middle so it never crosses the section's text, then into its panel; with the strands that peel off it and
 * the knots where it enters. Behind a panel it is not drawn, so it shows nowhere between stacked panels; it comes out
 * again at the panel's `out`. It stops at the first stop where it comes apart.
 *
 * Besides the strokes, it returns `spine`, the cord's route, which its glow follows, and `lines`, that route with every
 * strand's line, which, stroked wider than the cord's glow, covers everything drawn.
 */
export function weave(start: Point, stops: ReadonlyArray<Stop>, { cord, corner, lane }: Weaving) {
  const runs: Point[][] = []
  let run: Point[] = [start]
  const strands: Array<{ line: Point[]; strand: number }> = []
  const knots: Array<{ text: string; x: number; y: number; side: Stop['side'] }> = []
  for (const stop of stops) {
    const { enter, side } = stop
    const exit = run.at(-1) ?? start
    const gap = (exit[1] + stop.top) / 2
    const beside = side === 'left' ? enter[0] - lane : enter[0]
    run.push(...cubic(exit, [exit[0], gap], [beside, gap], [beside, stop.top]))
    if (side === 'left') run.push([beside, enter[1]])
    run.push(enter)
    runs.push(run)
    knots.push({ text: stop.label, x: enter[0], y: enter[1], side })

    const { split } = stop
    if (!split) {
      for (const [k, end] of stop.ends.entries())
        strands.push({ line: strandLine(enter, end, [0, 1]), strand: k % 3 })
      if (stop.ends.length > 0) break
    } else {
      const beside = stop.ends.filter(([x]) => x > split[0])
      for (const [k, end] of beside.entries())
        strands.push({ line: strandLine(split, end, [1, 0]), strand: k % 3 })
    }
    run = [stop.out, [stop.out[0], Math.max(stop.out[1], stop.bottom)]]
  }
  const spine = runs.map((points) => route(points, corner)).join('')
  return {
    strokes: [
      ...runs.flatMap((points) => braid(points, cord, corner)),
      ...strands.flatMap(({ line, strand }) => peel(line, strand, cord)),
    ],
    spine,
    lines: spine + strands.map(({ line }) => path(line)).join(''),
    knots,
  }
}
