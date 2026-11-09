import {
  band,
  breath,
  fibre,
  hash,
  hueOf,
  isTraced,
  laneOf,
  type Point,
  ribbonOf,
  ribbonPick,
  type Seam,
  SHAPE,
  strandOf,
  warmthAt,
} from './geometry'
import { PLUCK, ring, SLOT, stamps } from './pluck'

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
  /**
   * The section's words, line by line, tight to their text, and the narrow gaps between its stacked panels: strands
   * passing behind dim there, and only there.
   */
  readonly copy: ReadonlyArray<Box>
  /** Where strands peel off into the demo: a panel's right edge. Without one, the cord itself comes apart at `enter`. */
  readonly split: Point | undefined
  /** Where it enters the demo, to come apart there. */
  readonly enter: Point
  /** The points the peeled strands reach, each level with what it enters. */
  readonly ends: ReadonlyArray<Point>
}

/**
 * About how far a knot's name reaches beside it, in px, as Weave.svelte sets it: 1.25rem from the knot, about 9px a
 * character of its 15px monospace, and room to spare before the page's edge.
 */
const labelReach = (text: string) => 20 + text.length * 9 + 16

/** The side a knot's name sits on: `prefer`, unless the page, `width` wide, has no room for it there. */
const labelSide = (text: string, x: number, prefer: 'left' | 'right', width: number) => {
  if (prefer === 'left' && x < labelReach(text)) return 'right'
  if (prefer === 'right' && x + labelReach(text) > width) return 'left'
  return prefer
}

/**
 * The braid's radius where it meets the hero's window and down the page from it, in px: one braid passing behind the
 * window, so the hero's plait arrives at the cord's own radius, and the close's at its button too.
 */
export const CORD_RADIUS = 10
/** Pixels between samples along a path: fine enough that the braid's twists stay smooth. */
const STEP = 4
/**
 * The share of a section's width its loose strands spread across, at most, and the tightest turn, in px, a strand may
 * make as it swells apart and gathers: the strands spread around the cord, as far as that turn allows.
 */
const SPREAD = 0.92
const MIN_TURN = 180
/** Texels per sample, and samples per row of the texture: rows stay within every GPU's smallest texture limit. */
export const TEXELS = 4
export const ROW = 512
/** Threads in the cord, threads in each strand that peels off, and the most strands that can peel. */
export const CORD_THREADS = 180
export const PEEL_THREADS = 10
export const MAX_PEELS = 6
/** The most lines of words near the screen that dim the strands behind them: a section's prose and a little more. */
export const MAX_COPY = 12
/**
 * Pixels of path per unit along a fibre, for its drift, its gradient, and its breath: about the hero's length, so the
 * cord's fibres drift and turn colour as its do.
 */
export const DRIFT_SPAN = 1300
/** How many of a peeling strand's fibres, along its outer edge, carry the lead on where the cord comes apart. */
export const PEEL_LEAD = 3
/** How far apart, in gradient cycles, a loose strand's ribbons run: a little, so its fibres vary within it. */
export const LOOSE_HUE = 0.15
/**
 * How many violet-to-amber cycles a loose strand of the cord runs per DRIFT_SPAN px: about one every 290px, so a rope
 * shows both colours along any stretch of it. And how far apart in its cycle, at most, the fibres across one rope run:
 * enough that a rope shows both colours side by side as well.
 */
export const ROPE_GRADIENT = 4.5
export const ROPE_HUE = 0.35

/** Where the cord's strands stand where it leaves the window: as the hero's do where it ends, or from scratch. */
export const NO_SEAM: Seam = { twist: 0, hue: 0, drift: 0 }

/**
 * The hero's `seam` carried `hidden` pixels on, behind the window, to where the cord leaves it with braid `radius`: its
 * strands keep turning, changing colour, and drifting at the braid's rates, so each comes out as itself.
 */
export const carry = (seam: Seam, hidden: number, radius: number): Seam => ({
  twist: seam.twist + (hidden / (SHAPE.pitch * radius)) * Math.PI * 2,
  hue: seam.hue + (hidden / DRIFT_SPAN) * SHAPE.braidGradient,
  drift: seam.drift + hidden / DRIFT_SPAN,
})

/**
 * A path's samples in the texture: the first, and how many. Path 0 is the cord, then the strands peeling off it, then,
 * where the cord ends in a demo, its strands' own paths (see `Cord.strands`).
 */
export interface Span {
  readonly first: number
  readonly count: number
}

export interface Cord {
  /** Every path's samples, `TEXELS` RGBA texels each: see `sample`. */
  readonly data: Float32Array
  readonly rows: number
  readonly paths: ReadonlyArray<Span>
  /**
   * Whether the cord's strands run on past its end, each along its own path, the last three in `paths` in strand order:
   * where the cord ends in a demo, its three strands come apart and each carries on to its own end, the same fibres.
   */
  readonly strands: boolean
  /** The cord's samples' heights, rising: the part on screen is a binary search away. */
  readonly heights: Float32Array
  /** How far along the cord's route each of its samples is, rising: where its tip is, in height, is too. */
  readonly routes: Float32Array
  /** How far along the route each section's gap is, where the cord is braided, in the stops' order. */
  readonly gaps: ReadonlyArray<number>
  /** How far the whole route runs, to the end of the last strand peeling off it. */
  readonly length: number
  /** Every section's words, line by line, tight to their text, rising: see `nearCopy`. */
  readonly copy: ReadonlyArray<Box>
  /**
   * Where each section's name sits: on the knot where the cord crosses its gap, on the side it doesn't come in from, at
   * rest; it sways with the cord there by `sways` of `swayAt`.
   */
  readonly knots: ReadonlyArray<{
    text: string
    x: number
    y: number
    sways: number
    side: 'left' | 'right'
  }>
  readonly radius: number
  /** How far any strand strays up or down from its path's samples, at most. */
  readonly reach: number
  /** Where its strands stand where it leaves the window. */
  readonly seam: Seam
  /** How far up and down the page anything of the cord reaches, its braid and its peels included. */
  readonly extent: { readonly top: number; readonly bottom: number }
  /**
   * The cord's loose stretches, the strings a pluck rings (see `pluckCord`): from one gap, where it is braided, to the
   * next, along its route; where it ends in a demo, on to the end of its strands' own paths. The first MAX_STRINGS reach
   * the shaders, and each sample names the one it lies in.
   */
  readonly strings: ReadonlyArray<readonly [from: number, to: number]>
}

/**
 * One sample: where the spine is; how far along the path it is (`s`), how far the strands have come apart there
 * (`open`, 0 braided to 1 loose), and the half-width they spread across (`width`), along `axis`, which the plait swings
 * across too, so a strand keeps its side as it parts; how bright the strands are there (`light`); and how much of the
 * cord's slow sway moves it (`sways`, 0 to 1). Packed with the twist and hue its strands have reached there and whether
 * its path carries the lead, `TEXELS` texels to a sample:
 *   0  x, y, twist (radians, strand 0 at time 0), sways
 *   1  s, open, width, hue (gradient cycles)
 *   2  axis x, axis y, light, carries the lead (0 or 1)
 *   3  how far along the cord's route it is (px from the window, a peel carrying on from where it leaves), whether it is
 *      on a strand's own path (0 or 1: there the path is the strand's centre, not the cord's), how much its strands
 *      swing (`swings`: 1, settling to 0 at a strand's own end), and the loose stretch it lies in, a pluck's string
 *      (its index in `Cord.strings`, -1 where the cord is braided or on a peel)
 */
interface Sample {
  readonly x: number
  readonly y: number
  readonly s: number
  readonly open: number
  readonly width: number
  readonly axis: Point
  readonly light: number
  readonly sways: number
  readonly swings?: number
}

/**
 * How the cord comes apart as `open` runs from 0 to 1, in three overlapping stages, so it never pinches: the plait
 * loosens (`loosen`: its swing widens and its pitch lengthens), its three strands drift apart as loose ropes that still
 * twist around each other a little (`apart`), and only then does each rope fray into its fibres and spread (`fray`).
 * Gathering runs the same stages back. Mirrors `stages` in the shaders.
 */
export const stages = (open: number) => ({
  loosen: easeIn(0, UNBRAID.loosen, open),
  apart: easeIn(UNBRAID.apart[0], UNBRAID.apart[1], open),
  fray: easeIn(UNBRAID.fray, 1, open),
})
/**
 * Where each stage of coming apart runs, in `open`; how much wider the plait swings and how much longer its pitch is,
 * fully loosened; how far a loose rope swings around its neighbours, and how fat it is, in loosened braid radii.
 */
export const UNBRAID = {
  loosen: 0.35,
  apart: [0.15, 0.6],
  fray: 0.45,
  widen: 1.5,
  stretch: 2,
  rope: 0.5,
  fat: 0.7,
} as const
const easeIn = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

/**
 * The cord's slow sway across the page at height `y` and time `t`, in px, before its weight: a rope drifting, two long
 * slow waves, never a jitter. Mirrors `swayAt` in the shaders.
 */
export const swayAt = (y: number, t: number) =>
  SWAY.reach *
  (Math.sin((TAU * t) / SWAY.periods[0] + y * SWAY.waves[0]) * 0.6 +
    Math.sin((TAU * t) / SWAY.periods[1] + y * SWAY.waves[1] + 2) * 0.4)
/** How far the cord sways at most, in px; over how many seconds; and in how many radians per px down the page. */
export const SWAY = { reach: 22, periods: [11, 17], waves: [0.0021, 0.0013] } as const

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * The share of the way to the next gap (or a section's foot) the cord takes to reach a section's centre after its gap,
 * at most LAG_MAX px: it crosses the gap still on its way there, as a rope would, rather than turning on the gap.
 */
const LAG = 0.3
const LAG_MAX = 320
/**
 * How far the cord wanders off its course on its own, in px, in two slow waves (px per cycle), and over how many px it
 * eases into the wander from where it leaves the window and out of it where it ends.
 */
const WANDER = 40
const WANDER_WAVES = [1100, 1900] as const
const WANDER_EASE = 400
/** How far above a knot, in px, the cord's course is read to tell which side it comes in from. */
const KNOT_LOOK = 80
/**
 * How the cord ends in a demo: from its gap to where it enters, it comes apart as it does behind a section, as far as
 * `open` (its plait loosened and its strands parted as ropes, still fibrous, only starting to fray), its ropes `spread`
 * braid radii either side. Then each rope runs on, the same fibres, as its strand's own path to its end (see `strands`
 * in `Cord`), on under it to the end's point (Weave.svelte sets it behind the element, never at its edge), its swing
 * settling over its last `settle` px so it runs in level. The cord ends `turn` of its way across to its first end above
 * that end.
 */
const ENDING = { open: 0.6, spread: 7, turn: 0.5, settle: 80 } as const

/**
 * A strand peeling off at a panel's edge: its fibres leave `fat` braid radii wide and its light comes up over its first
 * `rise` px.
 */
const PEEL = { fat: 1.3, rise: 60 } as const

/**
 * The cord's course across the page, x as a function of y: a smooth curve through `anchors` (rising in y), each crossed
 * on a tangent its neighbours set, so it bends more and less as a hanging rope does, never on a fixed diagonal, plus
 * a slow wander that eases in after the first anchor and out before the last, where the cord must meet the window and
 * the demo it ends in. Returns the course and how much the cord sways at each height (0 at its ends).
 */
function course(anchors: ReadonlyArray<Point>) {
  const ys = anchors.map(([, y]) => y)
  const top = ys[0] ?? 0
  const bottom = ys.at(-1) ?? 0
  const tangent = (k: number) => {
    const previous = anchors[k - 1]
    const next = anchors[k + 1]
    if (!previous || !next) return 0
    return (next[0] - previous[0]) / (next[1] - previous[1])
  }
  /** How far into the cord's free stretch `y` is, 0 at its ends to 1 a WANDER_EASE away. */
  const free = (y: number) =>
    Math.min(easeIn(top, top + WANDER_EASE, y), 1 - easeIn(bottom - WANDER_EASE, bottom, y))
  const x = (y: number) => {
    // The segment whose anchors span y; at or past the last anchor, the last segment.
    const above = ys.findIndex((at) => at > y)
    const k = Math.max(0, above < 0 ? anchors.length - 2 : above - 1)
    const [x0, y0] = anchors[k] ?? [0, 0]
    const [x1, y1] = anchors[k + 1] ?? [x0, y0 + 1]
    const h = y1 - y0 || 1
    const t = Math.min(1, Math.max(0, (y - y0) / h))
    // A cubic Hermite segment: through both anchors, on their tangents.
    const h00 = 2 * t ** 3 - 3 * t ** 2 + 1
    const h10 = t ** 3 - 2 * t ** 2 + t
    const h01 = -2 * t ** 3 + 3 * t ** 2
    const h11 = t ** 3 - t ** 2
    const wander =
      WANDER *
      (Math.sin((TAU * y) / WANDER_WAVES[0] + 1.3) * 0.6 +
        Math.sin((TAU * y) / WANDER_WAVES[1] + 4.1) * 0.4)
    return h00 * x0 + h10 * h * tangent(k) + h01 * x1 + h11 * h * tangent(k + 1) + wander * free(y)
  }
  return { x, sways: free }
}

/**
 * How far the strands have come apart `t` of the way from a gap to the next (0 to 1): a smooth swell, nothing in the
 * gaps and all of it midway, with no slope and no corner anywhere, so they fan out and gather like a current. Behind
 * the last section, which no gap closes, they swell to its foot.
 */
const swell = (t: number, closes: boolean) => Math.sin((Math.PI * t) / (closes ? 1 : 2)) ** 2

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

/**
 * Distances along `points` and the axis across them, from their neighbours: the unit normal on the right of a path
 * running down the page, so strands spread and swing across it the same way all along.
 */
function frame(points: ReadonlyArray<Point>) {
  let s = 0
  return points.map(([x, y], i) => {
    const previous = points[Math.max(0, i - 1)] ?? [x, y]
    const next = points[Math.min(points.length - 1, i + 1)] ?? [x, y]
    const tx = next[0] - previous[0]
    const ty = next[1] - previous[1]
    const length = Math.hypot(tx, ty) || 1
    if (i > 0) s += Math.hypot(x - previous[0], y - previous[1])
    const axis: Point = [ty / length, -tx / length]
    return { x, y, s, axis }
  })
}

/**
 * Where the cord ends at `last` in a demo, its three strands' own paths on to `ends`: each from its rope's centre where
 * the cord ends, on its heading, arriving level. The rope on the right reaches the topmost end, so no two cross.
 */
function strandPaths(last: Sample, ends: ReadonlyArray<Point>): Sample[][] {
  const sorted = [...ends].sort((a, b) => a[1] - b[1])
  return [0, 1, 2].map((strand) => {
    const to = sorted[Math.min(2 - strand, sorted.length - 1)] ?? [last.x, last.y]
    // Where its rope's centre is at the cord's end: `home` of the way out along the axis, as `place` sets it.
    const home = (((strand - 1) * 2) / 3) * last.width * last.open * stages(last.open).apart
    const from: Point = [last.x + last.axis[0] * home, last.y + last.axis[1] * home]
    const heading: Point = [-last.axis[1], last.axis[0]]
    const down = Math.abs(to[1] - from[1]) * 0.6
    const across = Math.abs(to[0] - from[0]) * 0.6
    const line = cubic(
      from,
      [from[0] + heading[0] * down, from[1] + heading[1] * down],
      [to[0] - across, to[1]],
      to,
    )
    // The first point is where the cord ends: the strand carries on from the next.
    return frame(line)
      .slice(1)
      .map((p) => ({
        ...p,
        s: last.s + p.s,
        open: last.open,
        width: last.width,
        light: 1,
        sways: 0,
      }))
  })
}

/**
 * A stretch the cord comes apart over, behind a section's `box`, from height `from` to `to`, braided again at its foot
 * if it `closes`.
 */
interface Stretch {
  readonly box: Box
  readonly from: number
  readonly to: number
  readonly closes: boolean
}

/** How far the cord has come apart at height `y` in `stretch`, how wide it spreads, and how bright. */
function spreadIn(stretch: Stretch, y: number): Pick<Sample, 'open' | 'width' | 'light'> {
  const { from, to, closes, box } = stretch
  const t = Math.min(1, Math.max(0, (y - from) / (to - from)))
  const open = swell(t, closes)
  // The swell turns a strand at most 2π² × width / height² per px, so a short section spreads its strands less.
  const height = (to - from) * (closes ? 1 : 2)
  return {
    open,
    width: Math.min(
      ((box.right - box.left) / 2) * SPREAD,
      height ** 2 / (2 * Math.PI ** 2 * MIN_TURN),
    ),
    // Behind the last section the strands fade out toward its foot.
    light: closes ? 1 : 1 - open,
  }
}

/** Where the cord ends in a demo: from its gap (`from`) down to where it enters, and the ends its strands reach. */
interface Ending {
  readonly from: number
  readonly enter: Point
  readonly ends: ReadonlyArray<Point>
}

/**
 * How the cord ends in `stop`'s demo: it runs on into it, straight to where it enters over all the height it has, so it
 * never sweeps across flat, coming apart on the way into the strands that reach each end (see `ENDING`). It ends high
 * enough above the first end for the strand to it to turn there gently.
 */
function endingIn(stop: Stop): Ending {
  const [x, y] = stop.enter
  const [ex, ey] = stop.ends.reduce((top, end) => (end[1] < top[1] ? end : top))
  const enter: Point = [
    x,
    Math.max(stop.pinch[1] + STEP, Math.min(y, ey - Math.abs(ex - x) * ENDING.turn)),
  ]
  return { from: stop.pinch[1], enter, ends: stop.ends }
}

/**
 * How the cord passes `stop`'s section, before `next`'s (none for the last): the anchors its course passes, and the
 * stretch it comes apart over, from this section's gap to the next, behind all of the section, words and panels alike.
 * It reaches the section's line a little after its gap, on its way down.
 */
function through(stop: Stop, next: Stop | undefined) {
  const { pinch, box } = stop
  const to = next ? next.pinch[1] : box.bottom
  const anchors: Point[] = [[pinch[0], pinch[1] + Math.min((to - pinch[1]) * LAG, LAG_MAX)]]
  const span: Stretch = { box, from: pinch[1], to, closes: !!next }
  // The last section's strands come apart behind it and fade out at its foot.
  if (!next) anchors.push([pinch[0], box.bottom])
  return { anchors, span }
}

/**
 * The cord from `start` down through each stop in turn, with `radius` its braid's radius: braided down to the first
 * gap, then behind each section coming apart across it and gathering again in the next gap, until a stop whose strands
 * all peel off, where it ends. Strands peel off at each `split` into the ends to its right. `width` is the page's: each
 * knot's name sits on the side the cord doesn't come in from, unless the page has no room for it there. Its strands
 * start out as `seam` says, carrying on the hero's.
 */
export function weave(
  start: Point,
  stops: ReadonlyArray<Stop>,
  radius: number,
  width: number,
  seam: Seam = NO_SEAM,
): Cord {
  /** The points the cord's course passes: where it leaves the window, then near each section's centre, then its end. */
  const anchors: Point[] = [start]
  /** The sections the cord comes apart behind, each between the gaps `from` and `to`. */
  const spans: Stretch[] = []
  /** Strands peeling off, and whether each carries the lead on: the lead's strand, where the cord comes apart. */
  const strands: Array<{ line: Point[]; leads: boolean }> = []
  const gaps: Array<{ text: string; y: number }> = []
  let ending: Ending | undefined
  for (const [k, stop] of stops.entries()) {
    gaps.push({ text: stop.label, y: stop.pinch[1] })
    const { split } = stop
    if (split) {
      const beside = stop.ends.filter(([x]) => x > split[0])
      for (const end of beside) strands.push({ line: strandLine(split, end, [1, 0]), leads: false })
    } else if (stop.ends.length > 0) {
      ending = endingIn(stop)
      anchors.push(ending.enter)
      break
    }
    const passing = through(stop, stops[k + 1])
    anchors.push(...passing.anchors)
    spans.push(passing.span)
  }

  const path = course(anchors)
  const bottom = anchors.at(-1)?.[1] ?? start[1]
  const steps = Math.max(1, Math.ceil((bottom - start[1]) / STEP))
  const spine = Array.from({ length: steps + 1 }, (_, k): Point => {
    const y = start[1] + ((bottom - start[1]) * k) / steps
    return [path.x(y), y]
  })
  // Each section's name sits on its knot, where the cord crosses its gap, on the side the cord doesn't come in from.
  const knots = gaps.map(({ text, y }) => {
    const x = path.x(y)
    const from = path.x(y - KNOT_LOOK)
    return {
      text,
      x,
      y,
      sways: path.sways(y),
      side: labelSide(text, x, from > x + 1 ? 'left' : 'right', width),
    }
  })

  const ropes = radius * ENDING.spread
  const cord: Sample[] = frame(spine).map((p) => {
    const span = spans.find(({ from, to }) => p.y >= from && p.y < to)
    const base = { ...p, sways: path.sways(p.y) }
    if (ending && p.y >= ending.from) {
      // On its way into the demo the cord comes apart as far as ENDING.open, its ropes `ropes` either side.
      return {
        ...base,
        open: ENDING.open * easeIn(ending.from, ending.enter[1], p.y),
        width: ropes,
        light: 1,
      }
    }
    return { ...base, ...(span ? spreadIn(span, p.y) : { open: 0, width: 0, light: 1 }) }
  })
  const last = cord.at(-1)
  // Where the cord ends in a demo, each of its strands runs on as its own path to its end.
  const own = ending && last ? strandPaths(last, ending.ends) : []
  const peeling = strands.slice(0, MAX_PEELS - own.length)
  const peels: Sample[][] = peeling.map(({ line }) => {
    const points = frame(line)
    const total = points.at(-1)?.s ?? 1
    return points.map((p) => {
      const k = p.s / total
      return {
        ...p,
        open: 1,
        // Fibres leave as wide as the rope they carry on, splay apart mid-way, and gather again at the end.
        width: radius * (PEEL.fat * (1 - k) ** 2 + 0.6 * (0.4 + Math.sin(k * Math.PI))),
        light: smoothstep(0, PEEL.rise, p.s),
        // Peels start where the cord holds still: at a panel's edge, or near the cord's end.
        sways: 0,
      }
    })
  })

  // How far each path's strands have turned at each sample: one turn per `pitch` braid radii, lengthening as the plait
  // loosens. Added up here, as the hue is below, so a changing pitch never sweeps the twist.
  const twists = (path: ReadonlyArray<Sample>, from: number) => {
    let twist = from
    return path.map((p, k) => {
      const previous = path[k - 1]
      if (previous)
        twist +=
          ((p.s - previous.s) /
            (SHAPE.pitch * radius * (1 + UNBRAID.stretch * stages(p.open).loosen))) *
          TAU
      return twist
    })
  }

  // The hue each path's strands have reached at each sample, in gradient cycles: they turn faster where braided. Added
  // up here, so the shaders read it, rather than multiply a changing rate by the distance, which would sweep the colour
  // wherever the rate changes. A peel starts at the cord's hue where it leaves it.
  const hues = (path: ReadonlyArray<Sample>, from: number) => {
    let hue = from
    return path.map((p, k) => {
      const previous = path[k - 1]
      if (previous)
        hue +=
          ((p.s - previous.s) / DRIFT_SPAN) *
          (ROPE_GRADIENT + (SHAPE.braidGradient - ROPE_GRADIENT) * (1 - p.open))
      return hue
    })
  }
  const cordHues = hues(cord, 0)
  /** The cord's sample at height `y`: where a peel leaves it, or a gap crosses it. */
  const at = (y: number) =>
    Math.max(
      0,
      cord.findIndex((p) => p.y >= y),
    )
  const cordTwists = twists(cord, 0)
  /** A strand's own path's twists or hues, added up on from the cord's last sample. */
  const onFrom = (path: Sample[], add: typeof hues, values: number[]) =>
    last ? add([last, ...path], values.at(-1) ?? 0).slice(1) : []
  // The cord and its strands' own paths are strung for plucking; the strands peeling off it hold still.
  const all = [
    {
      path: cord,
      hue: cordHues,
      twist: cordTwists,
      route: 0,
      leads: true,
      own: false,
      strung: true,
    },
    ...peels.map((path, n) => {
      const from = at(path[0]?.y ?? 0)
      return {
        path,
        hue: hues(path, cordHues[from] ?? 0),
        twist: twists(path, 0),
        route: cord[from]?.s ?? 0,
        leads: peeling[n]?.leads ?? false,
        own: false,
        strung: false,
      }
    }),
    // Each strand's own path carries the cord's twist, colour, and route on from where the cord ends.
    ...own.map((path) => ({
      path,
      hue: onFrom(path, hues, cordHues),
      twist: onFrom(path, twists, cordTwists),
      route: 0,
      leads: true,
      own: true,
      strung: true,
    })),
  ]
  const strings = stringsOf(cord, own)
  const total = all.reduce((sum, { path }) => sum + path.length, 0)
  const rows = Math.max(1, Math.ceil(total / ROW))
  const data = new Float32Array(rows * ROW * TEXELS * 4)
  const paths: Span[] = []
  let first = 0
  for (const { path, hue, twist, route, leads, own: owned, strung } of all) {
    const end = path.at(-1)?.s ?? 0
    for (const [k, p] of path.entries()) {
      data.set(
        [
          p.x,
          p.y,
          twist[k] ?? 0,
          p.sways,
          p.s,
          p.open,
          p.width,
          hue[k] ?? 0,
          ...p.axis,
          p.light,
          leads ? 1 : 0,
          route + p.s,
          owned ? 1 : 0,
          // On a strand's own path, its swing settles toward its end.
          owned ? 1 - smoothstep(end - ENDING.settle, end, p.s) : (p.swings ?? 1),
          strung ? stringAt(strings, p.s) : -1,
        ],
        (first + k) * TEXELS * 4,
      )
    }
    paths.push({ first, count: path.length })
    first += path.length
  }
  // How far a strand strays up or down from its path's samples, at most: its braid and glow, and where the course bends,
  // its spread across the tilted axis.
  const reach =
    margin(radius) +
    all.reduce(
      (most, { path }) => path.reduce((m, p) => Math.max(m, p.width * Math.abs(p.axis[1])), most),
      0,
    )
  return {
    data,
    rows,
    paths,
    strands: own.length > 0,
    heights: Float32Array.from(cord, (p) => p.y),
    routes: Float32Array.from(cord, (p) => p.s),
    gaps: gaps.map(({ y }) => cord[at(y)]?.s ?? 0),
    length: Math.max(...all.map(({ path, route }) => route + (path.at(-1)?.s ?? 0))),
    copy: stops.flatMap((stop) => stop.copy).sort((a, b) => a.top - b.top),
    knots,
    radius,
    reach,
    seam,
    extent: {
      top: Math.min(...all.map(({ path }) => Math.min(...path.map((p) => p.y)))) - reach,
      bottom: Math.max(...all.map(({ path }) => Math.max(...path.map((p) => p.y)))) + reach,
    },
    strings,
  }
}

/**
 * The cord's loose stretches along its route, from its samples: each run whose strands have drifted apart is a string,
 * anchored where they meet in the plait either side; one that runs into a demo goes on to the end of its strands' `own`
 * paths.
 */
function stringsOf(cord: ReadonlyArray<Sample>, own: ReadonlyArray<ReadonlyArray<Sample>>) {
  const parted = (p: Sample | undefined) => p !== undefined && stages(p.open).apart > 0
  const strings: Array<[number, number]> = []
  for (const [k, p] of cord.entries()) {
    if (!parted(p)) continue
    const previous = cord[k - 1]
    if (!parted(previous)) strings.push([previous?.s ?? p.s, p.s])
    const string = strings.at(-1)
    if (string) string[1] = cord[k + 1]?.s ?? p.s
  }
  const runsOn = strings.at(-1)
  if (runsOn && own.length > 0 && parted(cord.at(-1)))
    runsOn[1] = Math.max(runsOn[1], ...own.map((path) => path.at(-1)?.s ?? 0))
  return strings
}

/** Floats per pluck in the cord's ring, as the shaders read it: see `pluckCord`. */
export const CORD_SLOT = 16
/** The most loose stretches the shaders know: a page's sections, and the stretch it ends on. */
export const MAX_STRINGS = 8

/**
 * Where a point lies against one of the cord's paths, as `footOn` writes it: whether it lies `beside` the path at all,
 * the sample whose axis it lies on (`k`), how far along that axis from the sample at rest (`offset`), how far along the
 * route the sample is (`s`), and the axis.
 */
interface CordFoot {
  beside: boolean
  k: number
  offset: number
  s: number
  ax: number
  ay: number
}
const blank = (): CordFoot => ({ beside: false, k: 0, offset: 0, s: 0, ax: 0, ay: 0 })
/** Scratch for `pluckCord`: each end of the pointer's path against the cord and each strand's own path. */
const feet = [
  [blank(), blank(), blank(), blank()],
  [blank(), blank(), blank(), blank()],
] as const

/**
 * How far `x`, `y` lies along the course of the cord's data from sample `n` as it has swayed at time `t`: along its
 * tangent, (-axis.y, axis.x).
 */
const alongFrom = (d: Float32Array, n: number, x: number, y: number, t: number) => {
  const o = n * TEXELS * 4
  const sy = d[o + 1] ?? 0
  const swayed = (d[o] ?? 0) + swayAt(sy, t) * (d[o + 3] ?? 0)
  return -(x - swayed) * (d[o + 9] ?? 0) + (y - sy) * (d[o + 8] ?? 0)
}
/** How far apart, along the route, the samples of the run from `first` to `last` are around sample `n`. */
const spacingAt = (d: Float32Array, first: number, last: number, n: number) => {
  const before = Math.max(n - 1, first)
  const after = Math.min(n + 1, last)
  const s = (m: number) => d[m * TEXELS * 4 + 4] ?? 0
  return Math.max((s(after) - s(before)) / Math.max(after - before, 1), 1e-3)
}

/**
 * The sample on `path` whose axis passes through `x`, `y` (the weave's pixels) at time `t`, where a strand there lies,
 * written into `foot`: the foot of the perpendicular from it to the path's course as it sways then, found by stepping
 * along the path from sample `guess`, and how far along that axis the point lies from the sample at rest, as the
 * shaders measure a strand's (their `beside`). Not beside it where the point lies past either end of the path.
 */
function footOn(
  cord: Cord,
  path: Span,
  guess: number,
  x: number,
  y: number,
  t: number,
  foot: CordFoot,
) {
  const d = cord.data
  const last = path.first + path.count - 1
  let k = Math.min(Math.max(guess, path.first), last)
  for (let step = 0; step < 4; step++) {
    const move = Math.round(alongFrom(d, k, x, y, t) / spacingAt(d, path.first, last, k))
    if (move === 0) break
    k = Math.min(last, Math.max(path.first, k + move))
  }
  const o = k * TEXELS * 4
  foot.beside =
    path.count > 0 && Math.abs(alongFrom(d, k, x, y, t)) <= spacingAt(d, path.first, last, k)
  foot.k = k
  foot.ax = d[o + 8] ?? 0
  foot.ay = d[o + 9] ?? 0
  foot.offset = (x - (d[o] ?? 0)) * foot.ax + (y - (d[o + 1] ?? 0)) * foot.ay
  foot.s = d[o + 4] ?? 0
}

/** The sample of `path` nearest `x`, `y`. */
function nearestOn(cord: Cord, { first, count }: Span, x: number, y: number) {
  const d = cord.data
  let best = first
  let distance = Number.POSITIVE_INFINITY
  for (let n = first; n < first + count; n++) {
    const o = n * TEXELS * 4
    const here = ((d[o] ?? 0) - x) ** 2 + ((d[o + 1] ?? 0) - y) ** 2
    if (here < distance) {
      best = n
      distance = here
    }
  }
  return best
}

/**
 * Where `x`, `y` lies at time `t` against the cord (into `into[0]`) and, where it ends in a demo, against each strand's
 * own path (into `into[1]` on), as `footOn` finds it. Returns how many paths there are.
 */
function feetAt(cord: Cord, x: number, y: number, t: number, into: ReadonlyArray<CordFoot>) {
  const cordPath = cord.paths[0]
  if (!cordPath) return 0
  // The cord's sample at the point's height; on a strand's own path, its nearest sample.
  let below = 0
  let above = cord.heights.length - 1
  while (below < above) {
    const mid = (below + above) >> 1
    if ((cord.heights[mid] ?? 0) < y) below = mid + 1
    else above = mid
  }
  const cordFoot = into[0]
  if (cordFoot) footOn(cord, cordPath, below, x, y, t, cordFoot)
  const owned = cord.strands ? 3 : 0
  for (let j = 0; j < owned; j++) {
    const path = cord.paths[cord.paths.length - owned + j]
    const foot = into[1 + j]
    if (path && foot) footOn(cord, path, nearestOn(cord, path, x, y), x, y, t, foot)
  }
  return 1 + owned
}

/**
 * Which paths, of the `paths` in `feet`, the ends of the pointer's path lie on for strand `strand`'s threads: both on the
 * cord, both on the strand's own path, or one on each, which its threads walk in turn; of those, the pair nearest the
 * strands, as `p * paths + q` for the start on path `p` and the end on `q`. -1 where no such pair has both ends beside
 * it. Each strand gets its own pair, so a sweep across the strands fanning out into a demo crosses each on its own path.
 */
function pairOf(paths: number, strand: number) {
  const [as, bs] = feet
  const own = 1 + strand
  let best = -1
  let nearest = Number.POSITIVE_INFINITY
  for (let p = 0; p < paths; p++) {
    for (let q = 0; q < paths; q++) {
      const a = as[p]
      const b = bs[q]
      if (!a?.beside || !b?.beside || (p !== 0 && p !== own) || (q !== 0 && q !== own)) continue
      const near = Math.abs(a.offset) + Math.abs(b.offset)
      if (near >= nearest) continue
      nearest = near
      best = p * paths + q
    }
  }
  return best
}

/** The index of the loose stretch in `strings` that `s` along the route lies in, or -1 where the cord is braided. */
function stringAt(strings: Cord['strings'], s: number) {
  for (let n = 0; n < strings.length; n++) {
    const [from, to] = strings[n] ?? [0, 0]
    if (s > from && s < to) return n
  }
  return -1
}

/**
 * Turns the pointer's `ring` (see pluck.ts) into the cord's, `CORD_SLOT` floats a pluck, for the shaders: the pointer's
 * path (dx, dy, in px), its start, and its span; then, for each of the three strands, where the ends of its path lie for
 * that strand's threads (k0, o0, k1, o1: the sample whose axis each lies on, on the cord or the strand's own path, and
 * how far along it), or k0 = -1 where they lie beside no path that strand walks. The shaders take its strength from its
 * speed, as `cut` in pluck.ts does, and each strand's pull from how far the path runs across that strand's own axes at
 * its two samples, so where the strands fan out each is pulled the way the pointer crossed it. They find the stretch it
 * rings from the samples (see `Sample`). `origin` is the weave's top-left on the page. An empty slot, or one beside none
 * of the strands, has no span. Only slots written since `done` says (their `stamps`) are turned, and `done` is brought
 * up to date; clear it when the cord changes. Allocates nothing.
 */
export function pluckCord(cord: Cord, origin: Point, out: Float32Array, done: Uint32Array) {
  const [as, bs] = feet
  for (let k = 0; k < PLUCK.ring; k++) {
    if (done[k] === stamps[k]) continue
    done[k] = stamps[k] ?? 0
    const o = k * CORD_SLOT
    const r = k * SLOT
    out[o + 3] = 0
    if ((ring[r + 4] ?? 0) === 0) continue
    const x0 = (ring[r] ?? 0) - origin[0]
    const y0 = (ring[r + 1] ?? 0) - origin[1]
    const x1 = (ring[r + 2] ?? 0) - origin[0]
    const y1 = (ring[r + 3] ?? 0) - origin[1]
    const start = ring[r + 5] ?? 0
    const paths = feetAt(cord, x0, y0, start, as)
    feetAt(cord, x1, y1, start, bs)
    let beside = false
    for (let strand = 0; strand < 3; strand++) {
      const pair = pairOf(paths, strand)
      const a = as[Math.floor(pair / paths)]
      const b = bs[pair % paths]
      const p = o + 4 + strand * 4
      out[p] = -1
      if (pair < 0 || !a || !b) continue
      out[p] = a.k
      out[p + 1] = a.offset
      out[p + 2] = b.k
      out[p + 3] = b.offset
      beside = true
    }
    if (!beside) continue
    out[o] = x1 - x0
    out[o + 1] = y1 - y0
    out[o + 2] = start
    out[o + 3] = ring[r + 6] ?? 0
  }
}

/** How far a strand strays up or down from its path's samples in the braid: the braid's radius, and its glow. */
const margin = (radius: number) => radius * 4 + STEP

/** How far along its route the cord fades out above its tip, in px. Mirrors FADE in the shaders. */
export const FADE = 224

/**
 * How far down the page the cord shows when its tip is `tip` along its route: the height of the cord where its tip is,
 * past which nothing of it is lit. Infinite once the tip is past the cord's own end, where peels carry the route on.
 */
export function tipY(cord: Cord, tip: number) {
  const k = cord.routes.findIndex((s) => s >= tip)
  return k < 0 ? Number.POSITIVE_INFINITY : (cord.heights[k] ?? 0) + cord.reach
}

/**
 * Where the cord's tip is along its route as the page scrolls to `scroll`: a smooth curve of plateaus. At the top, 0,
 * the cord ending at the window. Each section `k` has a plateau, reached as its heading crosses `at` of the screen
 * (`plateaus[k].scroll`): its whole stretch is drawn, through the rebraid below it, the tip resting a fade past the next
 * gap, where the cord is one plait. Between plateaus the tip holds until HOLD of the way to the next, then eases there,
 * slow out and slow in; the first runs from the top at once. Scrolling back retraces it exactly.
 */
export function reveal(plateaus: ReadonlyArray<{ scroll: number; tip: number }>, scroll: number) {
  let from = { scroll: 0, tip: 0 }
  for (const [k, to] of plateaus.entries()) {
    if (scroll < to.scroll) {
      const hold = k === 0 ? 0 : HOLD
      const start = from.scroll + (to.scroll - from.scroll) * hold
      return from.tip + (to.tip - from.tip) * easeIn(start, to.scroll, scroll)
    }
    from = to
  }
  return from.tip
}
/** How much of the way from one section's plateau to the next the tip holds still before it moves on. */
const HOLD = 0.45

/**
 * The cord's samples from `top` to `bottom`, and as far beyond as any strand strays from its sample (`reach`), so its
 * braid and spread reach the edges.
 */
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
  const first = Math.max(0, below(top - cord.reach) - 1)
  const last = Math.min(cord.heights.length, below(bottom + cord.reach) + 1)
  return { first, count: Math.max(0, last - first) }
}

/**
 * The words the strands between `top` and `bottom` (and a fade beyond) might pass behind: at most MAX_COPY of them,
 * the nearest the middle first, for the shaders to dim the strands under.
 */
export function nearCopy(cord: Cord, top: number, bottom: number) {
  const reach = cord.reach + COPY_REACH
  const middle = (top + bottom) / 2
  return cord.copy
    .filter((box) => box.bottom > top - reach && box.top < bottom + reach)
    .sort(
      (a, b) =>
        Math.abs((a.top + a.bottom) / 2 - middle) - Math.abs((b.top + b.bottom) / 2 - middle),
    )
    .slice(0, MAX_COPY)
}
/** How far past its words a strand still dims, in px: COPY_FADE in the shaders. */
export const COPY_REACH = 120
/** How much of a strand's light shows right behind words. Mirrors COPY_LIGHT in the shaders. */
export const COPY_LIGHT = 0.01

/**
 * How much light shows at `p` behind the cord's words and the gaps between its stacked panels: COPY_LIGHT right behind
 * them, fading back in over COPY_REACH px around them. Mirrors `behindCopy` in the shaders, over every box at once.
 */
export function behindCopy(cord: Cord, [x, y]: Point) {
  let light = 1
  for (const box of cord.copy) {
    if (box.top > y + COPY_REACH) break
    const outside = Math.max(box.left - x, x - box.right, box.top - y, y - box.bottom)
    light = Math.min(light, COPY_LIGHT + (1 - COPY_LIGHT) * smoothstep(0, COPY_REACH, outside))
  }
  return light
}

const TAU = Math.PI * 2

/**
 * What makes thread `i` of path `path` itself: as the hero's threads, cord threads travel in ribbons across the
 * spread and keep their place across their ribbon as their place across their band, so thread `i` here is thread `i`
 * of the hero, the same fibre in the same strand; a peeled strand's threads spread evenly across it. `lead` is whether
 * it is one of the lead's fibres, where its path carries the lead. Mirrors `cordThread` in the shaders.
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
      phase: 0,
      ribbon: peel,
      lead: j >= PEEL_THREADS - PEEL_LEAD,
      ...fibre(i, across),
    }
  }
  const { ribbon, across } = ribbonOf(i)
  const { centre, half } = laneOf(i, ribbon)
  return {
    path: 0,
    lane: centre + across * half,
    strand: strandOf(centre),
    phase: hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SHAPE.scatter,
    ribbon,
    lead: isTraced(i),
    ...fibre(i, across),
  }
}

/**
 * Thread `i` at its path's sample `k` at time `t`: where it is, and how loose it is there (0 braided, 1 loose). Reads
 * the sample from `cord.data`; `th` is the thread, as `cordThread` makes it, for callers placing many of its points.
 * Mirrors `place` in `cordWgsl`.
 */
export function place(cord: Cord, i: number, k: number, t: number, th = cordThread(i)) {
  const o = k * TEXELS * 4
  const d = cord.data
  const [x = 0, y = 0, turned = 0, sways = 0, s = 0, loose = 0, width = 0, , ax = 0, ay = 0] =
    d.subarray(o, o + 10)
  const { loosen, apart, fray } = stages(loose)
  const twist = turned + cord.seam.twist - t * SHAPE.spin + (th.strand * TAU) / 3
  // The plait, swinging wider as it loosens.
  const wide = cord.radius * (1 + UNBRAID.widen * loosen)
  const plait =
    wide * band(twist, th.strand, th.jitter, th.edge, s / DRIFT_SPAN + cord.seam.drift, th.drift, 1)
  // Its strand as a loose rope: on its own third of the spread, still swinging around the others a little, its fibres
  // close together until they fray out to their own lanes within that third. The ropes part as far as `loose` spreads
  // them, which the weave keeps to a gentle turn (see MIN_TURN), so no rope leaves the plait at a corner.
  const home = ((th.strand - 1) * 2) / 3
  // On a strand's own path, the path is the rope's centre, and the rope's swing settles toward its end.
  const centre = (d[o + 13] ?? 0) > 0.5 ? 0 : home
  const swings = d[o + 14] ?? 1
  const sway =
    th.path === 0
      ? width *
        SHAPE.wave *
        (Math.sin(s * 0.004 + t * 0.35 + th.phase) * 0.6 +
          Math.sin(s * 0.008 - t * 0.23 + th.phase * 1.7) * 0.4)
      : 0
  const rope =
    (width * (centre + (th.lane - home) * fray) + sway * fray * swings) * loose +
    UNBRAID.rope * wide * Math.sin(twist) * (1 - fray) * swings +
    th.jitter * SHAPE.fray * wide * UNBRAID.fat * (1 - fray)
  const offset = plait + (rope - plait) * apart
  const drift = swayAt(y, t) * sways
  const point: Point = [x + drift + ax * offset, y + ay * offset]
  return { point, loose, apart, twist, s }
}

/**
 * How warm thread `i` is at its path's sample `k` at time `t`, 0 violet to 1 amber, and whether its path carries the
 * lead there. Mirrors the colour in `cordWgsl`, without the braid's depth shading, which the 2D fallback leaves out as
 * the hero's does (see `warmth` in geometry.ts).
 */
export function cordWarmth(cord: Cord, i: number, k: number, t: number, th = cordThread(i)) {
  const o = k * TEXELS * 4
  const s = cord.data[o + 4] ?? 0
  const loose = cord.data[o + 5] ?? 0
  const hue = cord.data[o + 7] ?? 0
  const leads = (cord.data[o + 11] ?? 0) > 0
  const pick = th.lead || hash(i + 9.7) < SHAPE.coherence ? ribbonPick(th.ribbon) : hash(i + 4.4)
  const breathing = breath(th.strand, s / DRIFT_SPAN + cord.seam.drift, t)
  const own = th.strand / 3 + (LOOSE_HUE * (pick - 0.5) + ROPE_HUE * th.jitter) * loose
  return {
    warmth: warmthAt(hueOf(0, 0, own, t, breathing) + hue + cord.seam.hue),
    leads: th.lead && leads,
  }
}
