/**
 * The thread field's shape, shared by every renderer: the WGSL and GLSL shaders run the same math per vertex, and this
 * module runs it on the CPU to place the event labels and to draw the 2D fallback.
 *
 * Threads stream from `start` along a quadratic curve through `control` to `end`, in loose bundles inside a funnel whose
 * nearly straight edges close in steadily from where they enter, `spread` pixels either side. Across `braid` (fractions
 * of the way along) the bundles gather into three strands side by side, and the strands wind into a three-strand plait
 * that narrows to a cord of radius `cord` and twists tighter as it goes, so it ends at `end` at its thinnest.
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
   * Where the braid forms, as fractions of the way along (0 to 1): the first bundles start to gather into their strands
   * at `gathers`, the strands start to wind into a plait at `forms`, and the plait is whole and the last threads have
   * joined it by `whole`.
   */
  readonly braid: readonly [gathers: number, forms: number, whole: number]
  readonly count: number
  /** Overall brightness, 0 to 1. */
  readonly intensity: number
  /** The first threads carry these labels, in order. At most four. */
  readonly labels: ReadonlyArray<Label>
  /**
   * Boxes of text over the field, as left, top, right, bottom in its pixels: threads passing behind them dim, smoothly
   * and only there, so the text reads over the field's light. At most MAX_TEXT.
   */
  readonly text?: ReadonlyArray<readonly [left: number, top: number, right: number, bottom: number]>
}

/** The most text boxes a field dims behind: the hero's wordmark, headline, subline, buttons, and four labels. */
export const MAX_TEXT = 8
/**
 * How much of a thread's light shows behind text, and how its dimming fades out: from TEXT_FADE[0] px inside a text
 * box's edge to TEXT_FADE[1] px outside it, so neither the threads nor their glare cross the letters.
 */
export const TEXT_LIGHT = 0.15
export const TEXT_FADE = [-8, 48] as const

/** How much of a thread's light shows at `x`, `y` on `field`: less behind its text. Mirrors `behindText` in the shaders. */
export const behindText = (field: Field, x: number, y: number) =>
  (field.text ?? []).slice(0, MAX_TEXT).reduce((light, [left, top, right, bottom]) => {
    const outside = Math.max(left - x, x - right, top - y, y - bottom)
    const t = Math.min(1, Math.max(0, (outside - TEXT_FADE[0]) / (TEXT_FADE[1] - TEXT_FADE[0])))
    return Math.min(light, TEXT_LIGHT + (1 - TEXT_LIGHT) * t * t * (3 - 2 * t))
  }, 1)

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
   * How the funnel narrows: its width beyond the braid's outline goes as (1 - u / whole)^taper, nearly straight edges
   * that close in steadily from the left edge and meet the braid's outline, tangent to it, where the braid is whole.
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
   * Before they wind, the three strands run side by side, `splay` braid radii apart: the bundles gather into them, and
   * the plait grows out of them as their swing grows, so it has no visible start. Where the bundles start to gather the
   * strands are loose ropes, `ropeLoose` times wider and further apart than the plait's bands, many fibres with dark
   * between them; they narrow all the way to where the plait is whole.
   */
  splay: 1.6,
  ropeLoose: 1,
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
   * How many bundles the threads travel in, how wide each is on average, as a fraction of the whole funnel, and how
   * much their widths vary about that: narrow bundles and wide ones, with dark between them.
   */
  ribbons: 11,
  ribbon: 0.11,
  ribbonSpread: 1.1,
  /**
   * Where the ribbons' colours start in their golden-ratio steps: from the top, violet, orchid, violet, amber, violet,
   * violet, amber, violet, amber, orchid, violet. Amber runs high, low, and through the middle, among violet.
   */
  hue: 0,
  /**
   * How the plait forms, each change on a long ramp of its own (see `forming`): the ropes start to curl around each
   * other `curl` of the gathering stretch (from `gathers` to `forms`) before `forms`, with a swing that grows gently all
   * the way to `whole`; they narrow from `gathers` to `whole`; and the band's look (dense fibres, lit edges, bulges and
   * shade at the crossings) fades in from `forms` to `whole`.
   */
  curl: 0.4,
  /**
   * When a bundle starts to gather, as a share of the gathering stretch, and how long its threads take to join their
   * rope, in the same units: long, so each bundle drifts in over hundreds of pixels.
   */
  leave: 0.5,
  joinLength: 0.8,
  /** How far past its label, at least, a labelled thread starts to gather, so its knot rides it in the current. */
  clear: 0.04,
  /**
   * How strictly ribbons gather in order from the inner lanes out: 1 by lane alone, 0 at random. And how far apart, in
   * the same units, a ribbon's own threads gather: a little, so it comes in as one loose bundle.
   */
  inward: 0.5,
  stagger: 0.12,
  /**
   * How far out of step with its ribbon a thread sways, in radians: a little, so a bundle stays a bundle while its
   * fibres drift at slightly different angles.
   */
  scatter: 0.5,
  /** The share of the current's sway a labelled thread keeps at its knot: the knot rides it, but stays near home. */
  pinned: 0.35,
  /**
   * A labelled thread's sway phase, in radians per label: set, not hashed, because the label's knot rides the thread on
   * the CPU while the GPU draws it, and the two compute the hash with different float precision.
   */
  labelPhase: 2.4,
  /**
   * How far a thread frays off its bundle on a slow curve of its own, at most, as a share of the funnel's width, and
   * how many such curves it can run along its length, at most. Each thread's reach is that times a random number to the
   * power `fraying`: most fibres hug their bundle and a few fray far from it, so bundles fray at their edges.
   */
  wander: 0.07,
  bends: 9,
  fraying: 3,
  /** The share of threads that stray from their bundle onto a lane of their own and wander between the bundles. */
  stray: 0.06,
  /** How much of its warmth a strand keeps right at the back of the braid: most, so an amber band stays amber. */
  cool: 0.6,
  /**
   * Over the last `point` px, about its last twist, the braid draws in to `pointWidth` of its width: its strands converge
   * gradually, each fibre still visible, to a hot point where it meets what it lights, the hero's window or the close's
   * button. Never a needle.
   */
  point: 110,
  pointWidth: 0.35,
  /** How fast the braid turns, in radians per second: its crossings travel toward `end`. */
  spin: 0.9,
  /** How bright a labelled thread is, against 1 for the brightest of the rest: its fibre stands out on the dark. */
  labelled: 2,
  /**
   * A thread's own brightness, against 1 for the brightest: `dim` + (1 − `dim`) × a random number to the power `skew`,
   * so most fibres are moderate and a few bright, and none so dim it reads as background. Loose, a fibre glows `glow`
   * times that: the braid stays the hottest light, but a loose strand reads as the same light fanned out, not a dimmed
   * copy of it.
   */
  dim: 0.22,
  skew: 2,
  glow: 1.7,
  /** The share of threads that take their ribbon's colour phase, not their own: high, so colours run in bundles. */
  coherence: 0.9,
  /**
   * How many violet-to-amber cycles a thread runs per unit along it (its whole length in the hero, 1300px of the cord)
   * in the loose current, and in the plait: a cycle spans hundreds of pixels on a loose strand, and about half the
   * hero's plait, so each band turns from violet through pink to amber and back as it winds, its neighbours a third of a
   * cycle apart, and every band shows amber somewhere along the plait at every moment.
   */
  gradient: 1.6,
  braidGradient: 11,
  /** How fast the gradient flows toward the window, in cycles per second. */
  flow: 0.06,
  /**
   * The strands breathe: a slow swell of light and warmth, `breath` cycles per second, that travels toward the window
   * in `breathWaves` waves per unit along, a third of a cycle apart between strands. `breathLight` is how much brighter
   * a thread is at its crest, and `breathWarmth` how far its colour leans (in gradient cycles).
   */
  breath: 0.17,
  breathWaves: 1.2,
  breathLight: 0.22,
  breathWarmth: 0.035,
  /**
   * The lead: a few fibres that burn `traced` times brighter than the brightest of the rest, all the way along, so the
   * eye can follow one strand from the current through the braid and down the page. They are threads `traceFirst` on,
   * `traceCount` of them, on a lane of their own, `traceLane` across the current and `traceHalf` wide: high, inside the
   * labelled threads, above the hero's headline, before they gather into the top strand. They take the colour and sway
   * of ribbon `traceRibbon`, on the far side of the current, so they move unlike the bundles beside them and cross them
   * as a strand of their own. In the braid they ride their strand's edge, `trace` across its band and inward in steps of
   * `traceStep`.
   */
  traceFirst: 4,
  traceCount: 4,
  traceRibbon: 7,
  traceLane: -0.8,
  traceHalf: 0.02,
  trace: 0.98,
  traceStep: 0.04,
  traced: 4,
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

/**
 * How much `ease(a, b, …)` has gathered from `a` up to `x`: its integral, so a rate that eases from one value to another
 * accumulates smoothly, with no sweep where it changes. Mirrors `eased` in the shaders.
 */
export const eased = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return (b - a) * t * t * t * t * (t * (t - 3) + 2.5) + Math.max(x - b, 0)
}

/** Whether thread `i` is one of the lead's fibres. Mirrors `traced` in the shaders. */
export const isTraced = (i: number) =>
  i >= SHAPE.traceFirst && i < SHAPE.traceFirst + SHAPE.traceCount

/**
 * Thread `i`'s ribbon and its place across it (-1 to 1): a lead fibre's are set, the rest hashed. Mirrors `ribbonOf`
 * and the start of `threadOf` in the shaders.
 */
export const ribbonOf = (i: number) =>
  isTraced(i)
    ? {
        ribbon: SHAPE.traceRibbon,
        across: SHAPE.trace - (i - SHAPE.traceFirst) * SHAPE.traceStep,
      }
    : { ribbon: Math.floor(hash(i + 1.3) * SHAPE.ribbons), across: (hash(i + 0.5) - 0.5) * 2 }

/** Where ribbon `ribbon`'s centre runs across the funnel (-1 to 1), and its half-width. Mirrors the shaders. */
export const ribbonLane = (ribbon: number) => ({
  centre: ((ribbon + 0.5) / SHAPE.ribbons) * 2 - 1 + (hash(ribbon + 11) - 0.5) * 0.15,
  half: (SHAPE.ribbon * (1 + SHAPE.ribbonSpread * (hash(ribbon + 2.9) - 0.5))) / 2,
})

/** Where thread `i`'s bundle runs across the funnel, and its half-width: the lead's lane, or its ribbon's. */
export const laneOf = (i: number, ribbon: number) =>
  isTraced(i) ? { centre: SHAPE.traceLane, half: SHAPE.traceHalf } : ribbonLane(ribbon)

/**
 * What makes one thread itself. Threads travel in loose bundles (`SHAPE.ribbons` of them) that share a lane, a sway,
 * and mostly a colour; each fibre frays from its bundle a little, a few a lot, and some stray between bundles. Each
 * bundle gathers, starting at `leaves` (inner ribbons early, outer ones late, labelled threads only after their label),
 * into the strand on its side, and is wholly in it by `joins`: the upper ribbons make one strand, the middle ones
 * another, the lower ones the third. A thread keeps its place across its ribbon (`across`, -1 to 1) as its place
 * across its band, so the ribbons converge in order.
 */
export const thread = (field: Field, i: number) => {
  const label = field.labels[i]
  const { ribbon, across: hashed } = ribbonOf(i)
  const { centre, half } = laneOf(i, ribbon)
  // A labelled thread rides its ribbon's outer edge, at its label's lane.
  const across = label ? Math.sign(label.lane) : hashed
  const stray = !label && !isTraced(i) && hash(i + 12.7) < SHAPE.stray
  const lane = label ? label.lane : stray ? hash(i + 13.1) * 2 - 1 : centre + across * half
  const side = label || stray ? lane : centre
  const order = Math.min(
    1,
    SHAPE.inward * Math.abs(side) +
      (1 - SHAPE.inward) * hash(ribbon + 7.1) +
      SHAPE.stagger * hash(i + 7.1),
  )
  const [gathers, forms, whole] = field.braid
  const leaves = gathers + (forms - gathers) * SHAPE.leave * order
  const after = label ? Math.max(leaves, label.at + SHAPE.clear) : leaves
  return {
    lane,
    pin: label ? label.at : -1,
    /** Where the thread starts to leave its lane for its strand's rope, and where it is wholly in it. */
    leaves: after,
    joins: Math.max(Math.min(after + (forms - gathers) * SHAPE.joinLength, whole), after + 0.001),
    strand: strandOf(side),
    phase: label ? i * SHAPE.labelPhase : hash(ribbon + 3.3) * TAU + hash(i + 3.3) * SHAPE.scatter,
    // A labelled thread and the lead don't fray: a knot rides the one, and the eye follows the other.
    wander: {
      bends: 3 + (SHAPE.bends - 3) * hash(i + 5.5),
      phase: hash(i + 6.7) * TAU,
      reach: label || isTraced(i) ? 0 : SHAPE.wander * (stray ? 1 : hash(i + 5.9) ** SHAPE.fraying),
    },
    ...fibre(i, across),
    ribbon,
  }
}

/** The braid strand a ribbon centred at `side` (-1 to 1 across the funnel) joins: 0 above, 1 in the middle, 2 below. */
export const strandOf = (side: number) => Math.min(2, Math.max(0, Math.floor((side + 1) * 1.5)))

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

/** Where the ropes start to curl around each other: `curl` of the gathering stretch before `forms`. */
const curls = ({ braid: [gathers, forms] }: Field) => forms - SHAPE.curl * (forms - gathers)

/**
 * How far the plait has formed `u` along `field`, each on its own long ramp, 0 to 1: `curl`, how far the ropes swing
 * around each other; `tight`, how close they have drawn in from loose ropes to the plait's bands; and `look`, how far
 * the band's look (its light, lit edges, and bulges and shade at the crossings) has taken over from loose fibres.
 * Mirrors `place` in the shaders.
 */
export const forming = (field: Field, u: number) => {
  const [gathers, forms, whole] = field.braid
  return {
    curl: ease(curls(field), whole, u),
    tight: ease(gathers, whole, u),
    look: ease(forms, whole, u),
  }
}

/**
 * The funnel's half-width `u` along it: the braid's radius, narrowing toward `cord`, and the current's beyond it.
 * As the ropes curl, the braid's part widens to its outline, so the current meets the plait without a waist.
 * Mirrors `width` in `place` in the shaders.
 */
const funnelWidth = (field: Field, u: number) =>
  field.cord *
    (1 + SHAPE.swell * (1 - u)) *
    (1 + (SHAPE.swing + SHAPE.fray - 1) * forming(field, u).curl) +
  field.spread * Math.max(1 - u / field.braid[2], 0) ** SHAPE.taper

/**
 * How far from the braid's spine a fibre at `jitter` across its band lies, in braid radii, where strand `strand` has
 * turned `twist`, its ropes have curled `curl` (0 to 1) around each other, `loosened` times as wide and as far apart as
 * the plait's bands, and its band's look has taken over `look` of the way: before they curl, the strands run side by
 * side, `splay` apart; curled, each swings across the plait, and its band is widest where it passes in front and
 * thinnest behind. Mirrors `band` in the shaders.
 */
export const band = (
  twist: number,
  strand: number,
  jitter: number,
  edge: boolean,
  along: number,
  drift: number,
  curl = 1,
  loosened = 1,
  look = 1,
) => {
  const centre = (strand - 1) * SHAPE.splay * loosened
  const swung = SHAPE.swing * Math.sin(twist)
  const across = SHAPE.flat + ((1 - SHAPE.flat) * (1 + Math.sin(2 * twist))) / 2
  return (
    centre +
    (swung - centre) * curl +
    (jitter + (edge ? 0 : SHAPE.drift * Math.sin(along * SHAPE.weave + drift))) *
      SHAPE.fray *
      loosened *
      (1 + (across - 1) * look)
  )
}

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

/**
 * How far into the braid thread `th` is `u` along `field`: `braided`, how far it has gathered from its lane into its
 * strand's rope, and how far the plait has formed there (see `forming`). Mirrors `place` in the shaders.
 */
export const knit = (field: Field, th: ReturnType<typeof thread>, u: number) => ({
  braided: ease(th.leaves, th.joins, u),
  ...forming(field, u),
})

/** A thread's position at `u` (0 at the start, 1 at the end) and time `t` in seconds. Mirrors `place` in the shaders. */
export function position(field: Field, i: number, u: number, t: number): Point {
  const { start: p0, control: p1, end: p2, cord } = field
  const th = thread(field, i)
  const { lane, pin, strand, phase, wander, jitter, drift, edge } = th
  const a = 1 - u
  const x = a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0]
  const y = a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1]
  const tx = 2 * a * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0])
  const ty = 2 * a * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1])
  const length = Math.hypot(tx, ty) || 1
  const nx = -ty / length
  const ny = tx / length

  // The braid's radius narrows linearly to `cord`; the funnel narrows onto the braid.
  // The braid draws in to a hot point over the last `point` px, where it meets what it lights.
  const radius =
    cord *
    (1 + SHAPE.swell * a) *
    (1 + (SHAPE.pointWidth - 1) * ease(1 - SHAPE.point / spineLength(field), 1, u))
  const width = funnelWidth(field, u)
  const held = pin < 0 ? 1 : 1 - (1 - SHAPE.pinned) * Math.exp(-(((u - pin) / 0.09) ** 2))
  const sway =
    Math.sin(u * 4.5 + t * 0.35 + phase) * 0.6 + Math.sin(u * 9 - t * 0.23 + phase * 1.7) * 0.4
  const bend = wander.reach * Math.sin(u * wander.bends + t * 0.12 + wander.phase)
  const current = width * (lane + SHAPE.wave * held * sway + bend)

  const { braided, curl, tight, look } = knit(field, th, u)
  const loosened = 1 + SHAPE.ropeLoose * (1 - tight)
  const twist = twistOf(field, strand, u, t)
  const inBand = radius * band(twist, strand, jitter, edge, u, drift, curl, loosened, look)
  const offset = current + (inBand - current) * braided
  return [x + nx * offset, y + ny * offset]
}

/**
 * A ribbon's gradient phase: steps of the golden ratio, so neighbouring ribbons differ. Mirrors `pick` in the shaders.
 */
export const ribbonPick = (ribbon: number) => {
  const x = ribbon * 0.618034 + SHAPE.hue
  return x - Math.floor(x)
}

/**
 * How far through its breath strand `strand` is `along` (in gradient units) at time `t`, -1 to 1: a slow wave
 * travelling toward the end. Mirrors `breath` in the shaders.
 */
export const breath = (strand: number, along: number, t: number) =>
  Math.sin(TAU * (t * SHAPE.breath - along * SHAPE.breathWaves) + (strand * TAU) / 3)

/**
 * How far through its violet-to-amber cycle a thread is, in cycles: `along` its path in gradient units, of which
 * `wound` were spent in the plait, `pick` its own phase, at time `t`, breathing at `breathing`. Mirrors `hueOf` in the
 * shaders.
 */
export const hueOf = (along: number, wound: number, pick: number, t: number, breathing: number) =>
  along * SHAPE.gradient +
  wound * (SHAPE.braidGradient - SHAPE.gradient) -
  t * SHAPE.flow +
  pick +
  SHAPE.breathWarmth * breathing

/** How warm a thread is at hue `phase` (in cycles): 0 violet, 1 amber. Mirrors `warmth` in the shaders. */
export const warmthAt = (phase: number) => 0.5 + 0.5 * Math.sin(TAU * phase)

type Vec3 = readonly [number, number, number]
type Mat3 = readonly [Vec3, Vec3, Vec3]
/**
 * Björn Ottosson's OKLab, by rows: linear sRGB to cone responses, their cube roots to OKLab, and back. shaders.ts writes
 * them into WGSL and GLSL.
 */
export const OKLAB = {
  lms: [
    [0.4122214708, 0.5363325363, 0.0514459929],
    [0.2119034982, 0.6806995451, 0.1073969566],
    [0.0883024619, 0.2817188376, 0.6299787005],
  ],
  lab: [
    [0.2104542553, 0.793617785, -0.0040720468],
    [1.9779984951, -2.428592205, 0.4505937099],
    [0.0259040371, 0.7827717662, -0.808675766],
  ],
  lmsFrom: [
    [1, 0.3963377774, 0.2158037573],
    [1, -0.1055613458, -0.0638541728],
    [1, -0.0894841775, -1.291485548],
  ],
  rgb: [
    [4.0767416621, -3.3077115913, 0.2309699292],
    [-1.2684380046, 2.6097574011, -0.3413193965],
    [-0.0041960863, -0.7034186147, 1.707614701],
  ],
} as const satisfies Record<string, Mat3>

const times = (m: Mat3, v: Vec3): Vec3 => [
  m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
  m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
  m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
]
const each = (v: Vec3, f: (x: number) => number): Vec3 => [f(v[0]), f(v[1]), f(v[2])]
/** Linear light to OKLab, and back. Mirror `oklab` and `fromOklab` in the shaders. */
const oklab = (c: Vec3) =>
  times(
    OKLAB.lab,
    each(times(OKLAB.lms, c), (x) => Math.cbrt(Math.max(x, 0))),
  )
const fromOklab = (lab: Vec3) =>
  times(
    OKLAB.rgb,
    each(times(OKLAB.lmsFrom, lab), (x) => x ** 3),
  )

/** A page colour (sRGB, 0 to 1) as linear light, and back, as the shaders' `linear` does. */
const GAMMA = 2.2
const toLinear = (c: Vec3) => each(c, (x) => x ** GAMMA)
const toPage = (c: Vec3) => each(c, (x) => Math.max(x, 0) ** (1 / GAMMA))

/**
 * How far the mix leans toward amber: OKLab holds violet's hue through the first third of the way to this amber and
 * reaches amber's only in the last eighth, so the mix runs 1 − (1 − w)^AMBERWARD of the way, giving amber about as much
 * of each cycle as violet, with a long stretch of magenta and pink between. Mirrors the shaders.
 */
export const AMBERWARD = 1.6

/**
 * `violet` to `amber` (sRGB, 0 to 1) at `w`, as sRGB: mixed in OKLab with their chroma kept, so the way between runs
 * through magenta and pink rather than a muddy mauve. Mirrors `blend` in the shaders, which keep it as linear light.
 */
export function blend(violet: Vec3, amber: Vec3, w: number): Vec3 {
  const a = oklab(toLinear(violet))
  const b = oklab(toLinear(amber))
  const t = 1 - (1 - w) ** AMBERWARD
  const m: Vec3 = [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t, a[2] + (b[2] - a[2]) * t]
  const chroma = Math.hypot(a[1], a[2]) + (Math.hypot(b[1], b[2]) - Math.hypot(a[1], a[2])) * t
  const k = chroma / Math.max(Math.hypot(m[1], m[2]), 1e-5)
  return toPage(fromOklab([m[0], m[1] * k, m[2] * k]))
}

/**
 * How warm thread `i` is at `u` along it and time `t`: 0 violet, 1 amber. Every thread runs violet to amber and back,
 * the gradient flowing toward the end, faster in the plait; in the current most share their ribbon's phase, and as
 * they gather, their strand's. Mirrors the colour in the shaders; `braided` is how far it has gathered, 0 to 1. The
 * shaders then shade the braid by depth, leaning a gold strand violet behind its neighbours (`cool`), lighting the bands
 * in front, and sparking glints; the 2D renderers stroke in pieces too long to follow the braid's depth, so they leave
 * all of that out rather than band the braid into seams.
 */
export const warmth = (field: Field, i: number, u: number, t: number, braided: number) => {
  const { ribbon, strand } = thread(field, i)
  const pick = isTraced(i) || hash(i + 9.7) < SHAPE.coherence ? ribbonPick(ribbon) : hash(i + 4.4)
  return warmthAt(
    hueOf(
      u,
      eased(field.braid[1], field.braid[2], u),
      pick + (strand / 3 - pick) * braided,
      t,
      breath(strand, u, t),
    ),
  )
}

/**
 * A thread's brightness, as the shaders pick it, `knitted` (0 to 1) of the way into the plait: loose, it glows; there
 * a band's edge fibres burn brighter and its inner ones dimmer. The lead burns brighter all the way. Breathing is left
 * out: the 2D renderers draw one still frame.
 */
export const brightness = (field: Field, i: number, knitted = 0) => {
  const own =
    i < field.labels.length
      ? SHAPE.labelled
      : isTraced(i)
        ? 1
        : SHAPE.dim + (1 - SHAPE.dim) * hash(i + 2.2) ** SHAPE.skew
  // Inside a band the fibres glow more evenly than in the funnel: the cube root of their own brightness.
  const inBand = thread(field, i).edge ? SHAPE.edgeLight : SHAPE.innerLight * Math.cbrt(own)
  const loose = own * SHAPE.glow
  return (loose + (inBand - loose) * knitted) * (isTraced(i) ? SHAPE.traced : 1)
}

/**
 * Where the hero's strands stand where it ends, at time 0, so the page's cord can carry them on: strand 0's twist (the
 * others are a third of a turn on each), its hue (in gradient cycles, before its strand's third), and how far its
 * fibres have drifted (in units along).
 */
export const seamOf = (field: Field) => ({
  twist: twistOf(field, 0, 1, 0),
  hue: hueOf(1, eased(field.braid[1], field.braid[2], 1), 0, 0, 0),
  drift: 1,
})
export type Seam = ReturnType<typeof seamOf>
