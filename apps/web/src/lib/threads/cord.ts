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

/** Pixels between samples along a path: fine enough that the braid's twists stay smooth. */
const STEP = 4
/**
 * The share of a section's width its loose strands spread across, at most, and the tightest turn, in px, a strand may
 * make as it swells apart and gathers: the strands spread around the cord, as far as that turn allows.
 */
const SPREAD = 0.92
const MIN_TURN = 180
/** Texels per sample, and samples per row of the texture: rows stay within every GPU's smallest texture limit. */
export const TEXELS = 3
export const ROW = 682
/** Threads in the cord, threads in each strand that peels off, and the most strands that can peel. */
export const CORD_THREADS = 180
export const PEEL_THREADS = 10
export const MAX_PEELS = 6
/** The most sections whose prose dims the strands behind it. */
export const MAX_COPY = 8
/**
 * Pixels of path per unit along a fibre, for its drift, its gradient, and its breath: about the hero's length, so the
 * cord's fibres drift and turn colour as its do.
 */
export const DRIFT_SPAN = 1300
/** How many of a peeling strand's fibres, along its outer edge, carry the lead on where the cord comes apart. */
export const PEEL_LEAD = 3
/**
 * How far apart, in gradient cycles, a loose strand's ribbons run: a little, so each strand stays one colour run as it
 * parts and its fibres vary within it.
 */
export const LOOSE_HUE = 0.15
/** The strand the lead runs in: its lane's, as the hero gathers it. */
const LEAD_STRAND = strandOf(SHAPE.traceLane)

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
 * braid radii either side, each `fat` braid radii wide. Over the last `handoff` px each rope's light hands over to the
 * strand that carries it on to its end.
 */
const ENDING = { open: 0.6, spread: 7, fat: 1.3, handoff: 60 } as const

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
    return previous && next ? (next[0] - previous[0]) / (next[1] - previous[1]) : 0
  }
  /** How far into the cord's free stretch `y` is, 0 at its ends to 1 a WANDER_EASE in. */
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
  const spans: Array<{ box: Box; from: number; to: number; closes: boolean }> = []
  /** Strands peeling off, and whether each carries the lead on: the lead's strand, where the cord comes apart. */
  const strands: Array<{ line: Point[]; leads: boolean }> = []
  const gaps: Array<{ text: string; y: number }> = []
  /** Where the cord ends in a demo, if it does: from its gap down to where it enters, and the ends its strands reach. */
  let ending: { from: number; enter: Point; ends: ReadonlyArray<Point> } | undefined
  // It reaches each section's centre a little after its gap, on its way down.
  const after = (pinch: Point, to: number): Point => [
    pinch[0],
    pinch[1] + Math.min((to - pinch[1]) * LAG, LAG_MAX),
  ]
  for (const [k, stop] of stops.entries()) {
    gaps.push({ text: stop.label, y: stop.pinch[1] })
    const { split } = stop
    if (split) {
      const beside = stop.ends.filter(([x]) => x > split[0])
      for (const end of beside) strands.push({ line: strandLine(split, end, [1, 0]), leads: false })
    } else if (stop.ends.length > 0) {
      // The cord runs on into the demo, straight to where it enters over all the height it has, so it never sweeps
      // across flat, coming apart on the way into the strands that reach each end (see `ENDING`).
      anchors.push(stop.enter)
      ending = { from: stop.pinch[1], enter: stop.enter, ends: stop.ends }
      break
    }
    const next = stops[k + 1]
    const to = next ? next.pinch[1] : stop.box.bottom
    anchors.push(after(stop.pinch, to))
    spans.push({ box: stop.box, from: stop.pinch[1], to, closes: !!next })
    // The last section's strands come apart behind it and fade out at its foot.
    if (!next) anchors.push([stop.pinch[0], stop.box.bottom])
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
      // On its way into the demo the cord comes apart as far as ENDING.open, its ropes `ropes` either side, and hands
      // its light over to the peeling strands over the last ENDING.handoff px.
      const to = ending.enter[1]
      return {
        ...base,
        open: ENDING.open * easeIn(ending.from, to, p.y),
        width: ropes,
        light: 1 - smoothstep(to - ENDING.handoff, to, p.y),
      }
    }
    if (!span) return { ...base, open: 0, width: 0, light: 1 }
    const t = Math.min(1, Math.max(0, (p.y - span.from) / (span.to - span.from)))
    const open = swell(t, span.closes)
    // The swell turns a strand at most 2π² × width / height² per px, so a short section spreads its strands less.
    const height = (span.to - span.from) * (span.closes ? 1 : 2)
    return {
      ...base,
      open,
      width: Math.min(
        ((span.box.right - span.box.left) / 2) * SPREAD,
        height ** 2 / (2 * Math.PI ** 2 * MIN_TURN),
      ),
      // Behind the last section the strands fade out toward its foot.
      light: span.closes ? 1 : 1 - open,
    }
  })
  if (ending) {
    // Each rope carries on as the strand that peels off to its end: from where the rope runs ENDING.handoff px above
    // where the cord enters, on down and over to its end. The rope on the right reaches the topmost end, so no two
    // strands cross. A peel's strand is its place among all the peels, a third of a turn apart (see `cordThread`).
    const { enter, ends } = ending
    const from = enter[1] - ENDING.handoff
    const across = ropes * ENDING.open * easeIn(ending.from, enter[1], from)
    for (const end of [...ends].sort((a, b) => b[1] - a[1])) {
      const home = (((strands.length % 3) - 1) * 2) / 3
      strands.push({
        line: strandLine([path.x(from) + home * across, from], end, [0, 1]),
        leads: strands.length % 3 === LEAD_STRAND,
      })
    }
  }
  const peeling = strands.slice(0, MAX_PEELS)
  const peels: Sample[][] = peeling.map(({ line }) => {
    const points = frame(line)
    const total = points.at(-1)?.s ?? 1
    return points.map((p) => {
      const k = p.s / total
      return {
        ...p,
        open: 1,
        // Fibres leave as wide as the rope they carry on, splay apart mid-way, and gather again at the end.
        width: radius * (ENDING.fat * (1 - k) ** 2 + 0.6 * (0.4 + Math.sin(k * Math.PI))),
        light: smoothstep(0, ENDING.handoff, p.s),
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
          (SHAPE.gradient + (SHAPE.braidGradient - SHAPE.gradient) * (1 - p.open))
      return hue
    })
  }
  const cordHues = hues(cord, 0)
  const hueAt = (y: number) =>
    cordHues[
      Math.max(
        0,
        cord.findIndex((p) => p.y >= y),
      )
    ] ?? 0
  const all = [
    { path: cord, hue: cordHues, twist: twists(cord, 0), leads: true },
    ...peels.map((path, n) => ({
      path,
      hue: hues(path, hueAt(path[0]?.y ?? 0)),
      twist: twists(path, 0),
      leads: peeling[n]?.leads ?? false,
    })),
  ]
  const total = all.reduce((sum, { path }) => sum + path.length, 0)
  const rows = Math.max(1, Math.ceil(total / ROW))
  const data = new Float32Array(rows * ROW * TEXELS * 4)
  const paths: Span[] = []
  let first = 0
  for (const { path, hue, twist, leads } of all) {
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
    heights: Float32Array.from(cord, (p) => p.y),
    copy: stops.slice(0, MAX_COPY).map((stop) => stop.copy),
    knots,
    radius,
    reach,
    seam,
    extent: {
      top: Math.min(...all.map(({ path }) => Math.min(...path.map((p) => p.y)))) - reach,
      bottom: Math.max(...all.map(({ path }) => Math.max(...path.map((p) => p.y)))) + reach,
    },
  }
}

/** How far a strand strays up or down from its path's samples in the braid: the braid's radius, and its glow. */
const margin = (radius: number) => radius * 4 + STEP

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
  const sway =
    th.path === 0
      ? width *
        SHAPE.wave *
        (Math.sin(s * 0.004 + t * 0.35 + th.phase) * 0.6 +
          Math.sin(s * 0.008 - t * 0.23 + th.phase * 1.7) * 0.4)
      : 0
  const rope =
    (width * (home + (th.lane - home) * fray) + sway * fray) * loose +
    UNBRAID.rope * wide * Math.sin(twist) * (1 - fray) +
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
  const own = th.strand / 3 + LOOSE_HUE * (pick - 0.5) * loose
  return {
    warmth: warmthAt(hueOf(0, 0, own, t, breathing) + hue + cord.seam.hue),
    leads: th.lead && leads,
  }
}
