/**
 * The thread field's shape, shared by every renderer: the WGSL and GLSL shaders run the same math per vertex, and this
 * module runs it on the CPU to place the event labels and to draw the 2D fallback.
 *
 * Threads stream from `start` along a quadratic curve through `control` to `end`, inside a funnel whose nearly straight
 * edges close in steadily from where they enter, `spread` pixels either side, until they meet the braid. Across `braid`
 * (fractions of the way along), threads keep leaving the funnel to join a three-strand braid inside it, the innermost
 * first and the outermost last. The braid narrows to a cord of radius `cord` and twists tighter as it goes,
 * so it ends at `end` at its thinnest.
 */

export type Point = readonly [x: number, y: number]

/** A labelled thread: it passes exactly through its label at `at` along the curve, `lane` across the funnel (-1 to 1). */
export interface Label {
  readonly text: string
  readonly at: number
  readonly lane: number
}

export interface Field {
  /** CSS pixels, relative to the canvas. */
  readonly start: Point
  readonly control: Point
  readonly end: Point
  /** Half the funnel's width where the threads enter, beyond the braid's. */
  readonly spread: number
  /** The braid's radius at `end`, its thinnest. */
  readonly cord: number
  /**
   * Where the braid forms, as fractions of the way along (0 to 1): the first threads start to leave the current at
   * `from`, and the last have joined the braid by `to`.
   */
  readonly braid: readonly [from: number, to: number]
  readonly count: number
  /** Overall brightness, 0 to 1. */
  readonly intensity: number
  /** The first threads carry these labels, in order. At most four. */
  readonly labels: ReadonlyArray<Label>
}

export const MAX_LABELS = 4
/** Points along each thread, spaced by `along`. Enough for smooth curves at 2000px wide. */
export const SEGMENTS = 200
/** How much closer the points along a thread crowd toward the end, where the braid twists tightest. */
export const CROWD = 1.8
/**
 * Where a point a `fraction` of the way through a thread's points sits along it (0 to 1): points crowd toward the end,
 * so the braid's tightest twists stay smooth. Mirrors `along` in the shaders.
 */
export const along = (fraction: number) => 1 - (1 - fraction) ** CROWD

const TAU = Math.PI * 2

/** The field's shape, which the shaders read too (shaders.ts writes them into WGSL and GLSL). */
export const SHAPE = {
  /**
   * Braid radii per full twist: the braid keeps one helix angle, so it twists tighter as it narrows. Long, so each
   * crossing has room to read.
   */
  pitch: 11,
  /** How many cord radii the braid widens by from `end` back to `start`: it narrows linearly to `cord`. */
  swell: 9,
  /**
   * How the funnel narrows: its width beyond the braid's outline goes as (1 - u / to)^taper, nearly straight edges that
   * close in steadily from the left edge and meet the braid's outline, tangent to it, where the braid is whole (`to`
   * in the field's `braid`).
   */
  taper: 1.3,
  /** How far the current sways, as a fraction of the funnel's width. */
  wave: 0.14,
  /**
   * The braid is a three-strand plait: each strand swings from side to side across it, `swing` braid radii from its
   * spine at most, passing over one neighbour and under the other, its depth `sin(2 twist)`. Each strand is a flat band of
   * fibres, `fray` braid radii either side of its centre where it passes in front, and `flat` of that where it passes
   * behind: a band swells as it swings out over its neighbours, so the braid's outline bulges at every crossing.
   */
  swing: 1.2,
  fray: 0.75,
  flat: 0.5,
  /**
   * The share of a band's fibres that run along its two edges, in `edgeLanes` close lanes `edgeStep` apart (in the
   * band's -1 to 1): crisp, bright lines, each fibre still visible, around the dimmer fibres inside. Those spread over
   * the middle `inner` of the band in `fibres` bundles.
   */
  edges: 0.36,
  edgeLanes: 3,
  edgeStep: 0.14,
  /** How far an edge fibre strays inward from its lane: a little, so each lane reads as a few fibres, not one stroke. */
  edgeSpread: 0.05,
  inner: 0.8,
  fibres: 24,
  /** How far an inner fibre strays from its bundle, in the band's units: little, so each bundle reads as one fine fibre. */
  spill: 0.04,
  /** How bright a band's edge fibres and its inner fibres are in the braid, against their brightness in the funnel. */
  edgeLight: 1.5,
  innerLight: 0.75,
  /**
   * How far an inner fibre drifts across its band, in the same units as its place in it (-1 to 1), and how fast, in
   * radians per unit along the thread: about one and a half slow waves over the braid, so fibres cross inside each
   * band. Edge fibres hold their line.
   */
  drift: 0.12,
  weave: 24,
  /**
   * How many ribbons the threads travel in, and how wide each is, as a fraction of the whole funnel: narrower than the
   * gaps between them, so the current reads as separate strands of fibre on the dark.
   */
  ribbons: 11,
  ribbon: 0.18,
  /**
   * Where the ribbons' colours start in their golden-ratio steps: from the top, violet, orchid, violet, amber, violet,
   * violet, amber, violet, amber, orchid, violet. Amber runs high, low, and through the middle, among violet, and the
   * outermost ribbons stay violet, darkest where they pass the page's header.
   */
  hue: 0,
  /**
   * How much of the field's `braid` a thread takes to join it: long, so each ribbon eases from its lane into the plait
   * over a good share of that stretch, rather than turning in at once.
   */
  join: 0.7,
  /**
   * How strictly ribbons join in order from the inner lanes out: 1 by lane alone, 0 at random. Between, the braid fills
   * out as soon as it forms, while the outermost ribbons still join last. And how far apart, in the same units, a
   * ribbon's own threads join: a little, so it peels in as one bundle.
   */
  inward: 0.5,
  stagger: 0.06,
  /**
   * How far out of step with its ribbon a thread sways, in radians: enough that a ribbon's fibres fan apart and drift
   * at slightly different angles, as the concept's loose streams do.
   */
  scatter: 1.4,
  /** The share of the current's sway a labelled thread keeps at its knot: the knot rides it, but stays near home. */
  pinned: 0.35,
  /**
   * A labelled thread's sway phase, in radians per label: set, not hashed, because the label's knot rides the thread on
   * the CPU while the GPU draws it, and the two compute the hash with different float precision.
   */
  labelPhase: 2.4,
  /**
   * How far each thread wanders off its lane on a slow curve of its own, as a share of the funnel's width, and how many
   * such curves it can run along its length, at most: each fibre bends a little differently, so streams thin out,
   * split, and cross softly. It narrows with the funnel, so where the ribbons meet they cross at shallow angles.
   */
  wander: 0.06,
  bends: 9,
  /** The share of threads that stray from their ribbon onto a lane of their own and wander between the streams. */
  stray: 0.1,
  /** How much of its warmth a strand keeps right at the back of the braid. */
  cool: 0.35,
  /** How fast the braid turns, in radians per second: its crossings travel toward `end`. */
  spin: 0.9,
  /** How bright a labelled thread is, against 1 for the brightest of the rest: its fibre stands out on the dark. */
  labelled: 2,
  /** The dimmest thread's brightness, against 1 for the brightest: low, so the dark shows between bright fibres. */
  dim: 0.1,
  /** The share of threads that take their ribbon's colour phase, not their own: high, so colours run in streams. */
  coherence: 0.9,
  /**
   * How many violet-to-amber cycles each thread runs along its length, and the share of that rate it keeps in the
   * braid: low, so each band holds one colour across the braid, violet beside amber.
   */
  gradient: 1.4,
  braidGradient: 0.3,
  /** How fast the gradient flows toward the window, in cycles per second. */
  flow: 0.06,
  /**
   * How each cycle splits between violet and amber: below 0 keeps more of it violet. And how soft the turn between
   * them is: low, so a thread is violet or amber for most of its length and passes the pinkish mix between them
   * quickly, as the concept's strands do.
   */
  warm: -0.12,
  turn: 0.45,
} as const

/** The same hash the shaders use: a thread's index to a stable pseudo-random number in [0, 1). */
export const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

/**
 * Eases from 0 at `a` to 1 at `b` with no slope and no curvature at either end, so a thread easing from its lane into
 * the braid turns without a kink. Mirrors `ease` in the shaders.
 */
export const ease = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * t * (t * (t * 6 - 15) + 10)
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * What makes one thread itself. Threads travel in ribbons (`SHAPE.ribbons` of them) that share a lane, a sway, and
 * mostly a colour, so the funnel reads as a current. Each ribbon joins the braid whole, at about `joins` (inner ribbons
 * early, outer ones late, labelled threads only after their label), as one bundle into the strand on its side: the
 * upper ribbons make one band, the middle ones another, the lower ones the third. A thread keeps its place across its
 * ribbon (`across`, -1 to 1) as its place across its band, so the ribbons converge in order.
 */
export const thread = (field: Field, i: number) => {
  const label = field.labels[i]
  const ribbon = Math.floor(hash(i + 1.3) * SHAPE.ribbons)
  const centre = ((ribbon + 0.5) / SHAPE.ribbons) * 2 - 1 + (hash(ribbon + 11) - 0.5) * 0.15
  // A labelled thread rides its ribbon's outer edge, at its label's lane.
  const across = label ? Math.sign(label.lane) : (hash(i + 0.5) - 0.5) * 2
  const stray = !label && hash(i + 12.7) < SHAPE.stray
  const lane = label
    ? label.lane
    : stray
      ? hash(i + 13.1) * 2 - 1
      : centre + (across * SHAPE.ribbon) / 2
  const side = label || stray ? lane : centre
  const order = Math.min(
    1,
    SHAPE.inward * Math.abs(side) +
      (1 - SHAPE.inward) * hash(ribbon + 7.1) +
      SHAPE.stagger * hash(i + 7.1),
  )
  const [from, to] = field.braid
  const join = SHAPE.join * (to - from)
  const joins = from + join + (to - from - join) * order
  return {
    lane,
    pin: label ? label.at : -1,
    /** Where the thread has joined the braid, having left its lane `join` before. */
    joins: label ? Math.max(joins, Math.min(to, label.at + join * 1.5)) : joins,
    join,
    strand: strandOf(side),
    phase: label ? i * SHAPE.labelPhase : hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SHAPE.scatter,
    // A labelled thread doesn't wander: its knot rides it, placed on the CPU.
    wander: {
      bends: 3 + (SHAPE.bends - 3) * hash(i + 5.5),
      phase: hash(i + 6.7) * TAU,
      reach: label ? 0 : SHAPE.wander,
    },
    ...fibre(i, across),
    ribbon,
  }
}

/** The braid strand a ribbon centred at `side` (-1 to 1 across the funnel) joins: 0 above, 1 in the middle, 2 below. */
const strandOf = (side: number) => Math.min(2, Math.max(0, Math.floor((side + 1) * 1.5)))

/**
 * Where thread `i` runs in its band, -1 to 1, from its place `across` its ribbon: on one of the band's edges, in one
 * of a few close lanes, or inside, near one of a few fibre bundles. And where in its slow drift across the band it
 * starts. Mirrors `fibre` in the shaders.
 */
export const fibre = (i: number, across: number) => {
  const reach = Math.abs(across)
  const edge = reach > 1 - SHAPE.edges
  const inside = (across / (1 - SHAPE.edges) + 1) / 2
  const bundle =
    (Math.min(Math.floor(inside * SHAPE.fibres), SHAPE.fibres - 1) + 0.5) / SHAPE.fibres
  return {
    edge,
    jitter: edge
      ? Math.sign(across) *
        (1 -
          SHAPE.edgeStep *
            Math.min(
              Math.floor(((1 - reach) / SHAPE.edges) * SHAPE.edgeLanes),
              SHAPE.edgeLanes - 1,
            ) -
          hash(i + 9.1) * SHAPE.edgeSpread)
      : SHAPE.inner * (bundle * 2 - 1 + (hash(i + 8.3) - 0.5) * SHAPE.spill),
    drift: hash(i + 4.7) * TAU,
  }
}

/**
 * How far a labelled thread's knot strays from where it sits at rest, at most, in pixels: it keeps `pinned` of the
 * current's sway there, so it rides its thread without wandering into the copy.
 */
export const reach = (field: Field, at: number) =>
  funnelWidth(field, at) * SHAPE.wave * SHAPE.pinned

/**
 * The funnel's half-width `u` along it: the braid's radius, narrowing toward `cord`, and the current's beyond it.
 * Where the braid forms, the braid's part widens to its outline, so the current meets the plait without a waist.
 * Mirrors `width` in `place` in the shaders.
 */
const funnelWidth = ({ spread, cord, braid: [from, to] }: Field, u: number) =>
  cord * (1 + SHAPE.swell * (1 - u)) * (1 + (SHAPE.swing + SHAPE.fray - 1) * ease(from, to, u)) +
  spread * Math.max(1 - u / to, 0) ** SHAPE.taper

/**
 * How far from the braid's spine a fibre at `jitter` across its band lies, in braid radii, where its strand has turned
 * `twist`: its strand's swing across the plait, and its place across the band, which is widest where the strand
 * passes in front and thinnest behind. Mirrors `band` in the shaders.
 */
export const band = (twist: number, jitter: number, edge: boolean, along: number, drift: number) =>
  SHAPE.swing * Math.sin(twist) +
  (jitter + (edge ? 0 : SHAPE.drift * Math.sin(along * SHAPE.weave + drift))) *
    SHAPE.fray *
    (SHAPE.flat + ((1 - SHAPE.flat) * (1 + Math.sin(2 * twist))) / 2)

/** About how long the spine is, in pixels: between its chord and its control polygon. Mirrors the shaders. */
const spineLength = ({ start: p0, control: p1, end: p2 }: Field) =>
  (2 * Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) +
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) /
  3

/**
 * How far strand `strand` of the braid has turned `u` along it at time `t`. The twist integrates one turn per `pitch`
 * radii along a spine whose radius narrows linearly: a logarithm. Mirrors `twist` in `place` in the shaders.
 */
const twistOf = (field: Field, strand: number, u: number, t: number) =>
  (spineLength(field) / (SHAPE.pitch * field.cord * SHAPE.swell)) *
    TAU *
    Math.log((1 + SHAPE.swell) / (1 + SHAPE.swell * (1 - u))) -
  t * SHAPE.spin +
  (strand * TAU) / 3

/** A thread's position at `u` (0 at the start, 1 at the end) and time `t` in seconds. Mirrors `place` in the shaders. */
export function position(field: Field, i: number, u: number, t: number): Point {
  const { start: p0, control: p1, end: p2, cord } = field
  const { lane, pin, joins, join, strand, phase, wander, jitter, drift, edge } = thread(field, i)
  const a = 1 - u
  const x = a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0]
  const y = a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1]
  const tx = 2 * a * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0])
  const ty = 2 * a * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1])
  const length = Math.hypot(tx, ty) || 1
  const nx = -ty / length
  const ny = tx / length

  // The braid's radius narrows linearly to `cord`; the funnel narrows onto the braid.
  const radius = cord * (1 + SHAPE.swell * a)
  const width = funnelWidth(field, u)
  const held = pin < 0 ? 1 : 1 - (1 - SHAPE.pinned) * Math.exp(-(((u - pin) / 0.09) ** 2))
  const sway =
    Math.sin(u * 4.5 + t * 0.35 + phase) * 0.6 + Math.sin(u * 9 - t * 0.23 + phase * 1.7) * 0.4
  const bend = wander.reach * Math.sin(u * wander.bends + t * 0.12 + wander.phase)
  const current = width * (lane + SHAPE.wave * held * sway + bend)

  const braided = radius * band(twistOf(field, strand, u, t), jitter, edge, u, drift)
  const offset = current + (braided - current) * ease(joins - join, joins, u)
  return [x + nx * offset, y + ny * offset]
}

/**
 * A ribbon's gradient phase: steps of the golden ratio, so neighbouring ribbons differ. Mirrors `pick` in the shaders.
 */
const ribbonPick = (ribbon: number) => {
  const x = ribbon * 0.618034 + SHAPE.hue
  return x - Math.floor(x)
}

/**
 * How warm thread `i` is at `u` along it and time `t`: 0 violet, 1 amber. Every thread runs violet to amber and back,
 * the gradient flowing toward the end; in the funnel most share their ribbon's phase, in the braid their strand's.
 * Mirrors `warmth` and its use in the shaders; `braided` is how far into the braid `u` is, 0 to 1. The shaders then
 * shade the braid by depth, leaning a gold strand violet behind its neighbours (`cool`), lighting the bands in front,
 * and sparking glints; the 2D renderers stroke in pieces too long to follow the braid's depth, so they leave all of that
 * out rather than band the braid into seams.
 */
export const warmth = (field: Field, i: number, u: number, t: number, braided: number) => {
  const { ribbon, strand } = thread(field, i)
  const pick = hash(i + 9.7) < SHAPE.coherence ? ribbonPick(ribbon) : hash(i + 4.4)
  const rate = SHAPE.gradient * (1 + (SHAPE.braidGradient - 1) * braided)
  const phase = u * rate - t * SHAPE.flow + pick + (strand / 3 - pick) * braided
  return smoothstep(-SHAPE.turn, SHAPE.turn, Math.sin(TAU * phase) + SHAPE.warm)
}

/**
 * A thread's brightness, as the shaders pick it, `braided` (0 to 1) of the way into the braid: there a band's edge
 * fibres burn brighter and its inner ones dimmer.
 */
export const brightness = (field: Field, i: number, braided = 0) => {
  const own =
    i < field.labels.length ? SHAPE.labelled : SHAPE.dim + (1 - SHAPE.dim) * hash(i + 2.2) ** 3
  // Inside a band the fibres glow more evenly than in the funnel: the cube root of their own brightness.
  const inBand = thread(field, i).edge ? SHAPE.edgeLight : SHAPE.innerLight * Math.cbrt(own)
  return own + (inBand - own) * braided
}
