/**
 * The thread field's shape, shared by every renderer: the WGSL and GLSL shaders run the same math per vertex, and this
 * module runs it on the CPU to place the event labels and to draw the 2D fallback.
 *
 * Threads stream from `start` along a quadratic curve through `control` to `end`, inside a funnel whose nearly straight
 * edges close in steadily from where they enter, `spread` pixels either side, until they meet the braid. From `braid`
 * (a fraction of the way along) on, threads keep leaving the funnel to join a three-strand braid inside it, the
 * innermost first and the outermost last. The braid narrows to a cord of radius `cord` and twists tighter as it goes,
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
  /** How far along (0 to 1) the first threads join the braid. */
  readonly braid: number
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
  /** Braid radii per full twist: the braid keeps one helix angle, so it twists tighter as it narrows. */
  pitch: 7.5,
  /** How many cord radii the braid widens by from `end` back to `start`: it narrows linearly to `cord`. */
  swell: 15,
  /**
   * How the funnel narrows: its width beyond the braid's goes as (1 - u / close)^taper, nearly straight edges that
   * close in steadily from the left edge and meet the braid, tangent to it, at `close` (a fraction of the way along).
   */
  taper: 1.3,
  close: 0.92,
  /** How far the current sways, as a fraction of the funnel's width. */
  wave: 0.14,
  /** How far a thread strays from its strand in the braid, in braid radii. */
  fray: 0.4,
  /**
   * How many ribbons the threads travel in, and how wide each is, as a fraction of the whole funnel: narrower than the
   * gaps between them, so the current reads as separate strands of fibre on the dark.
   */
  ribbons: 11,
  ribbon: 0.1,
  /**
   * Where the ribbons' colours start in their golden-ratio steps: from the top, violet, amber, violet, silver, violet,
   * violet, amber, violet, silver, amber, violet. Amber runs high, low, and through the middle, among violet, and the
   * outermost ribbons stay violet, darker than silver where they pass the page's header.
   */
  hue: 0,
  /** How much of the way a thread takes to join the braid, and how far along the last thread has joined. */
  join: 0.16,
  joined: 0.85,
  /**
   * How strictly threads join in order from the inner lanes out: 1 by lane alone, 0 at random. Between, the braid fills
   * out as soon as it forms, while the outermost threads still join last.
   */
  inward: 0.5,
  /** How fast the braid turns, in radians per second: its crossings travel toward `end`. */
  spin: 0.9,
  /** How bright a labelled thread is, against 1 for the brightest of the rest: its fibre stands out on the dark. */
  labelled: 2,
} as const

/** The same hash the shaders use: a thread's index to a stable pseudo-random number in [0, 1). */
export const hash = (n: number) => {
  const x = Math.sin(n * 12.9898 + 78.233) * 43758.5453
  return x - Math.floor(x)
}

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}

/**
 * What makes one thread itself. Threads travel in ribbons (`SHAPE.ribbons` of them) that share a lane, a sway, and
 * mostly a colour, so the funnel reads as a current. Each joins one of the braid's three strands at `joins`: inner
 * lanes early, outer lanes late, labelled threads only after their label.
 */
export const thread = (field: Field, i: number) => {
  const label = field.labels[i]
  const ribbon = Math.floor(hash(i + 1.3) * SHAPE.ribbons)
  const centre = ((ribbon + 0.5) / SHAPE.ribbons) * 2 - 1 + (hash(ribbon + 11) - 0.5) * 0.15
  const lane = label ? label.lane : centre + (hash(i + 0.5) - 0.5) * SHAPE.ribbon
  const order = Math.min(1, SHAPE.inward * Math.abs(lane) + (1 - SHAPE.inward) * hash(i + 7.1))
  const joins = field.braid + (SHAPE.joined - field.braid) * order
  return {
    lane,
    pin: label ? label.at : -1,
    joins: label ? Math.max(joins, Math.min(SHAPE.joined, label.at + SHAPE.join * 1.5)) : joins,
    strand: i % 3,
    phase: hash(ribbon + 3.3) * TAU + hash(i + 3.3) * 0.6,
    jitter: hash(i + 5.9) * 2 - 1,
    ribbon,
  }
}

/** About how long the spine is, in pixels: between its chord and its control polygon. Mirrors the shaders. */
const spineLength = ({ start: p0, control: p1, end: p2 }: Field) =>
  (2 * Math.hypot(p2[0] - p0[0], p2[1] - p0[1]) +
    Math.hypot(p1[0] - p0[0], p1[1] - p0[1]) +
    Math.hypot(p2[0] - p1[0], p2[1] - p1[1])) /
  3

/** A thread's position at `u` (0 at the start, 1 at the end) and time `t` in seconds. Mirrors `place` in the shaders. */
export function position(field: Field, i: number, u: number, t: number): Point {
  const { start: p0, control: p1, end: p2, spread, cord } = field
  const { lane, pin, joins, strand, phase, jitter } = thread(field, i)
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
  const width = radius + spread * Math.max(1 - u / SHAPE.close, 0) ** SHAPE.taper
  const held = pin < 0 ? 1 : 1 - Math.exp(-(((u - pin) / 0.09) ** 2))
  const sway =
    Math.sin(u * 4.5 + t * 0.35 + phase) * 0.6 + Math.sin(u * 9 - t * 0.23 + phase * 1.7) * 0.4
  const current = width * (lane + SHAPE.wave * held * sway)

  // The twist's angle integrates one turn per `pitch` radii along a spine whose radius narrows linearly: a logarithm.
  const turns = spineLength(field) / (SHAPE.pitch * cord * SHAPE.swell)
  const twist =
    turns * TAU * Math.log((1 + SHAPE.swell) / (1 + SHAPE.swell * a)) -
    t * SHAPE.spin +
    (strand * TAU) / 3
  const braided = radius * (Math.sin(twist) + jitter * SHAPE.fray)
  const offset = current + (braided - current) * smoothstep(joins - SHAPE.join, joins, u)
  return [x + nx * offset, y + ny * offset]
}

/** A colour index from a pick in [0, 1): violet, amber, or silver, in the field's proportions. */
const paint = (pick: number) => (pick < 0.48 ? 0 : pick < 0.8 ? 1 : 2)
/**
 * A ribbon's colour pick: steps of the golden ratio, so neighbouring ribbons differ and every field gets all three
 * colours in proportion. Mirrors `ribbonPick` in the shaders.
 */
const ribbonPick = (ribbon: number) => {
  const x = ribbon * 0.618034 + SHAPE.hue
  return x - Math.floor(x)
}

/**
 * A thread's colour in the funnel (0 violet, 1 amber, 2 silver) and its brightness, as the shaders pick them. Most
 * threads take their ribbon's colour. In the braid, each takes its strand's colour instead.
 */
export const tint = (field: Field, i: number) => {
  const { ribbon } = thread(field, i)
  return {
    colour: paint(hash(i + 9.7) < 0.75 ? ribbonPick(ribbon) : hash(i + 4.4)),
    brightness: i < field.labels.length ? SHAPE.labelled : 0.22 + 0.78 * hash(i + 2.2) ** 3,
  }
}
