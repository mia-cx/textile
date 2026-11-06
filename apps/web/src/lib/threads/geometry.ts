/**
 * The thread field's shape, shared by every renderer: the WGSL and GLSL shaders run the same math per vertex, and this
 * module runs it on the CPU to place the event labels and to draw the 2D fallback.
 *
 * Threads stream from `start` along a quadratic curve through `control` to `end`. Near the start they fan out across
 * `spread` pixels and drift like a current; from `braid` (a fraction of the way along) they twist into one cord of
 * radius `cord`, three strands around each other, which ends at `end`.
 */

export type Point = readonly [x: number, y: number]

/** A labelled thread: it passes exactly through its label at `at` along the curve, `lane` across the fan (-1 to 1). */
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
  readonly spread: number
  readonly cord: number
  readonly braid: number
  readonly count: number
  /** Overall brightness, 0 to 1. */
  readonly intensity: number
  /** The first threads carry these labels, in order. At most four. */
  readonly labels: ReadonlyArray<Label>
}

export const MAX_LABELS = 4
/** Points along each thread. Enough for smooth curves at 2000px wide. */
export const SEGMENTS = 200

const TAU = Math.PI * 2

/** The field's shape, which the shaders read too (shaders.ts writes them into WGSL and GLSL). */
export const SHAPE = {
  /** Cord radii per full twist of the braid. */
  pitch: 4.5,
  /** How long the fan stays open before it closes into the cord: higher holds it open longer. */
  opening: 2.6,
  /** How far the current sways, as a fraction of the spread. */
  wave: 0.2,
  /** How far a thread strays from its strand in the cord, in cord radii. */
  fray: 0.55,
  /** How many ribbons the threads travel in, and how wide each is, as a fraction of the whole fan. */
  ribbons: 9,
  ribbon: 0.16,
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
 * mostly a colour, so the fan reads as a current; in the cord, each thread follows one of three strands.
 */
export const thread = (field: Field, i: number) => {
  const label = field.labels[i]
  const ribbon = Math.floor(hash(i + 1.3) * SHAPE.ribbons)
  const centre = ((ribbon + 0.5) / SHAPE.ribbons) * 2 - 1 + (hash(ribbon + 11) - 0.5) * 0.15
  return {
    lane: label ? label.lane : centre + (hash(i + 0.5) - 0.5) * SHAPE.ribbon,
    pin: label ? label.at : -1,
    strand: i % 3,
    phase: hash(ribbon + 3.3) * TAU + hash(i + 3.3) * 0.6,
    jitter: hash(i + 5.9) * 2 - 1,
    ribbon,
  }
}

/** A thread's position at `u` (0 at the start, 1 at the end) and time `t` in seconds. Mirrors `position` in the shaders. */
export function position(field: Field, i: number, u: number, t: number): Point {
  const { start: p0, control: p1, end: p2, spread, cord, braid } = field
  const { lane, pin, strand, phase, jitter } = thread(field, i)
  const a = 1 - u
  const x = a * a * p0[0] + 2 * a * u * p1[0] + u * u * p2[0]
  const y = a * a * p0[1] + 2 * a * u * p1[1] + u * u * p2[1]
  const tx = 2 * a * (p1[0] - p0[0]) + 2 * u * (p2[0] - p1[0])
  const ty = 2 * a * (p1[1] - p0[1]) + 2 * u * (p2[1] - p1[1])
  const length = Math.hypot(tx, ty) || 1
  const nx = -ty / length
  const ny = tx / length

  const open = 1 - smoothstep(0, braid, u) ** SHAPE.opening
  const held = pin < 0 ? 1 : 1 - Math.exp(-(((u - pin) / 0.09) ** 2))
  const sway =
    Math.sin(u * 4.5 + t * 0.35 + phase) * 0.6 + Math.sin(u * 9 - t * 0.23 + phase * 1.7) * 0.4
  const fan = lane * spread * open + spread * SHAPE.wave * open * held * sway

  // One full twist every `pitch` cord radii along the cord, turning slowly over time.
  const twist = (((u - braid) * length) / (cord * SHAPE.pitch)) * TAU - t * 0.8 + (strand * TAU) / 3
  const twisted = cord * (Math.sin(twist) + jitter * SHAPE.fray)
  const offset = fan + (twisted - fan) * smoothstep(braid - 0.12, braid + 0.03, u)
  return [x + nx * offset, y + ny * offset]
}

/** A colour index from a pick in [0, 1): violet, amber, or silver, in the field's proportions. */
const paint = (pick: number) => (pick < 0.48 ? 0 : pick < 0.8 ? 1 : 2)

/**
 * A thread's colour in the fan (0 violet, 1 amber, 2 silver) and its brightness, as the shaders pick them. Most threads
 * take their ribbon's colour. In the cord, each takes its strand's colour instead.
 */
export const tint = (field: Field, i: number) => {
  const { ribbon } = thread(field, i)
  return {
    colour: paint(hash(i + 9.7) < 0.75 ? hash(ribbon * 1.7 + 9.7) : hash(i + 4.4)),
    brightness: i < field.labels.length ? 1 : 0.22 + 0.78 * hash(i + 2.2) ** 3,
  }
}
