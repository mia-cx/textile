import { clockAt } from './clock'

/**
 * Plucking the loose threads with the pointer. As a mouse or pen moves over the page, its path is cut into short
 * segments, each kept in a small ring (`ring`) with how hard it was struck. Every thread field reads the ring each
 * frame: a thread that crossed a segment is caught, pulled sideways in the direction of travel, and released, and then
 * rings as a damped standing wave between its anchors (see `ringing`, mirrored as `ringing` in the shaders). Only where
 * it is loose: the plait never rings.
 *
 * The ring holds page pixels and the shared clock's seconds; each field turns it into its own coordinates (`pluckField`
 * in geometry.ts, `pluckCord` in cord.ts) and hands it to its shaders as uniforms, which ring a pluck only while its
 * time lasts.
 */

export const PLUCK = {
  /** Plucks the ring holds: a pointer moving all the time cuts this many in a `life`, each `segment` long. */
  ring: 24,
  /** Seconds a thread rings after the pointer reaches it, its ring fading to nothing by the end. */
  life: 1.5,
  /** Seconds the pointer holds a thread, pulling it aside, before it slips free and rings. */
  catch: 0.07,
  /**
   * How near the pointer's path a thread passes to be caught outright, in px; and how much its neighbours within
   * `sympatheticReach` ring along, a little, as fibres in one bundle do.
   */
  reach: 4,
  sympathy: 0.2,
  sympatheticReach: 24,
  /** How far a thread is pulled aside at most, in px, by the fastest flick: never a kink, never over text. */
  pull: 12,
  /** The pointer's speed, in px/s, at which a pluck reaches 63% of its strength: a slow sweep ripples softly. */
  speed: 1200,
  /** Slower than this, in px/s, the pointer is resting on the threads, not plucking them. */
  rest: 60,
  /**
   * The longest stretch a pluck rings, in px, centred where it was plucked: a fibre is held by its neighbours further
   * out, so a pluck rings the stretch around it, shorter where an anchor (where the thread enters, or meets its
   * strand's plait) is nearer.
   */
  stretch: 440,
  /**
   * How fast a wave runs along a thread, in px/s, which sets its pitch: its fundamental rings at `wave / 2L` for a
   * stretch L px long, between `pitch` Hz, low enough for every frame to show it. Each fibre is strung a little tighter
   * or looser, up to `detune` of its pitch either way, so neighbours plucked together drift apart and shimmer.
   */
  wave: 3200,
  pitch: [1.6, 5] as const,
  detune: 0.15,
  /**
   * How long the fundamental takes to fall to 1/e, in seconds, for the softest pluck and the hardest; each overtone
   * dies `n` times faster.
   */
  decay: [0.3, 0.55] as const,
  /** How close to an anchor, as a share of the stretch, a pluck counts as being plucked: nearer, the shape holds. */
  edge: 0.03,
  /**
   * How much brighter a ringing thread burns at its strongest, and its glints: crests of light running out from where
   * it was plucked, `glintWave` px apart at `glintSpeed` px/s, over a share `glow` of light along the whole stretch.
   */
  light: 0.9,
  glow: 0.35,
  glintWave: 140,
  glintSpeed: 700,
  /**
   * How long, in seconds, the pointer's path runs before it is cut into a pluck: often enough that each thread is caught
   * soon after the pointer crosses it, and seldom enough that the ring holds a whole sweep, however fast, for `life`.
   */
  segment: 0.06,
} as const

/** Floats per slot of the ring: where the path ran (x0, y0, x1, y1, page px), its pull, start, span, and strength. */
export const SLOT = 8

/**
 * The ring of recent plucks, `SLOT` floats each: the pointer's path from (x0, y0) to (x1, y1) in page px; how far it
 * pulls a thread it crosses at right angles, in px; the clock time the pointer reaches its start's threads, and how
 * long it takes to reach its end's (each thread is caught as the path reaches it, replayed from when the segment is
 * cut, so no thread is caught late); and its strength, 0 to 1. A slot whose pull is 0 holds nothing.
 */
export const ring = new Float32Array(PLUCK.ring * SLOT)

/** How many plucks have been written to the ring: a field turns the ring into its own only when this changes. */
let writes = 0
export const written = () => writes

/** The pointer's path since the last pluck was cut: where it started, and when (ms, the events' clock). */
let from = { x: 0, y: 0, at: Number.NaN }
const restart = (x = 0, y = 0, at = Number.NaN) => {
  from.x = x
  from.y = y
  from.at = at
}

/** A slot no thread rings in any more at clock time `time`, or -1 while every slot still rings. */
const free = (time: number) => {
  for (let k = 0; k < PLUCK.ring; k++)
    if ((ring[k * SLOT + 5] ?? 0) + (ring[k * SLOT + 6] ?? 0) + PLUCK.life < time) return k
  return -1
}

/** Panels are opaque: over one, the pointer is on the glass, not on the threads behind it. */
const GLASS = '[data-weave-panel]'

let motion: MediaQueryList | undefined

const move = (event: PointerEvent) => {
  // Touch scrolls the page; only a hovering mouse or pen plucks.
  if (event.pointerType !== 'mouse' && event.pointerType !== 'pen') return restart()
  if (!motion?.matches) return restart()
  if (event.target instanceof Element && event.target.closest(GLASS)) return restart()
  const { pageX: x, pageY: y, timeStamp: at } = event
  if (Number.isNaN(from.at)) return restart(x, y, at)
  const span = (at - from.at) / 1000
  if (span < PLUCK.segment) return
  const speed = Math.hypot(x - from.x, y - from.y) / span
  if (speed < PLUCK.rest) return restart(x, y, at)
  const time = clockAt(at)
  const k = free(time)
  // Every slot still rings: the path runs on into the next pluck.
  if (k < 0) return
  const strength = 1 - Math.exp(-speed / PLUCK.speed)
  const o = k * SLOT
  ring[o] = from.x
  ring[o + 1] = from.y
  ring[o + 2] = x
  ring[o + 3] = y
  ring[o + 4] = PLUCK.pull * strength
  ring[o + 5] = time
  ring[o + 6] = span
  ring[o + 7] = strength
  writes += 1
  restart(x, y, at)
}

let listeners = 0

/**
 * Starts listening for plucks, once for every field that reads them; the returned function stops, and the last to stop
 * removes the listener. With reduced motion nothing is plucked.
 */
export function listen() {
  if (listeners++ === 0) {
    motion = matchMedia('(prefers-reduced-motion: no-preference)')
    from = { x: 0, y: 0, at: Number.NaN }
    addEventListener('pointermove', move, { passive: true })
  }
  return () => {
    if (--listeners === 0) removeEventListener('pointermove', move)
  }
}

/**
 * How a thread rings `along` px along it, plucked `at` px along it, between anchors `from` and `to` (px along it),
 * `age` seconds after the pointer reached it, struck at `strength` (0 to 1), for a fibre whose `seed` (0 to 1) sets how
 * tightly it is strung: how far it is displaced for a pull of 1 px, and how much light it adds. Mirrors `ringing` in
 * the shaders.
 *
 * It rings the stretch around where it was plucked, at most `stretch` long, between the anchors. The pull draws that
 * stretch into a plucked string's shape, the first three modes of a triangle peaking where it was plucked, so it bends
 * smoothly with no corner. Released, each mode rings at its own multiple of the fundamental, set by the stretch's
 * length, and dies away faster the higher it is; harder plucks ring longer. All of it fades to nothing by `life`.
 */
export function ringing(
  along: number,
  from: number,
  to: number,
  at: number,
  age: number,
  strength: number,
  seed: number,
) {
  const low = Math.max(from, at - PLUCK.stretch / 2)
  const stretch = Math.min(to, at + PLUCK.stretch / 2) - low
  const x = (along - low) / stretch
  if (age <= 0 || !(stretch > 0) || x <= 0 || x >= 1) return { shift: 0, light: 0 }
  const p = Math.min(Math.max((at - low) / stretch, PLUCK.edge), 1 - PLUCK.edge)
  const sp = Math.sin(Math.PI * p)
  const cp = Math.cos(Math.PI * p)
  const sx = Math.sin(Math.PI * x)
  const cx = Math.cos(Math.PI * x)
  // A plucked string's modes, sin(nπp) sin(nπx) / n², scaled so the triangle they sum to peaks at 1.
  const k = 2 / (Math.PI * Math.PI * p * (1 - p))
  const m1 = k * sp * sx
  const m2 = ((k * 2 * sp * cp) / 4) * 2 * sx * cx
  const m3 = ((k * sp * (3 - 4 * sp * sp)) / 9) * sx * (3 - 4 * sx * sx)
  const shape = m1 + m2 + m3
  const fade = 1 - smoothstep(PLUCK.life * 0.6, PLUCK.life, age)
  let shift: number
  let energy: number
  if (age < PLUCK.catch) {
    const pulled = smoothstep(0, PLUCK.catch, age)
    shift = shape * pulled
    energy = pulled
  } else {
    const a = age - PLUCK.catch
    const pitch =
      Math.min(Math.max(PLUCK.wave / (2 * stretch), PLUCK.pitch[0]), PLUCK.pitch[1]) *
      (1 + PLUCK.detune * (2 * seed - 1))
    const q1 = Math.cos(Math.PI * 2 * pitch * a)
    const q2 = 2 * q1 * q1 - 1
    const q3 = q1 * (4 * q1 * q1 - 3)
    const e1 = Math.exp(-a / (PLUCK.decay[0] + (PLUCK.decay[1] - PLUCK.decay[0]) * strength))
    shift = m1 * q1 * e1 + m2 * q2 * e1 * e1 + m3 * q3 * e1 * e1 * e1
    energy = e1
  }
  const away = Math.abs(x - p) * stretch
  const crest =
    0.5 + 0.5 * Math.cos((Math.PI * 2 * (away - PLUCK.glintSpeed * age)) / PLUCK.glintWave)
  const glint = crest ** 8
  return {
    shift: shift * fade,
    light: strength * energy * fade * Math.abs(shape) * (PLUCK.glow + (1 - PLUCK.glow) * glint),
  }
}

/**
 * Where a thread meets the pointer's path, from how far beside each end of the path it ran (`d0`, `d1`, px across):
 * `along`, how far along the path it crossed (0 to 1; the nearer end if it missed), and `grip`, how firmly it was
 * caught: 1 if it crossed, falling off fast with distance, and a little for neighbours within `sympatheticReach`.
 * Mirrors `caught` in the shaders.
 */
export function caught(d0: number, d1: number) {
  const crosses = d0 * d1 <= 0
  const gap = d0 - d1
  const along = crosses
    ? Math.abs(gap) > 1e-6
      ? Math.min(Math.max(d0 / gap, 0), 1)
      : 0
    : Math.abs(d0) <= Math.abs(d1)
      ? 0
      : 1
  const miss = crosses ? 0 : Math.min(Math.abs(d0), Math.abs(d1))
  const near = Math.exp(-((miss / PLUCK.reach) ** 2))
  const far = PLUCK.sympathy * Math.exp(-((miss / PLUCK.sympatheticReach) ** 2))
  return { along, grip: far + (1 - far) * near }
}

/** How far beyond either side of its own sway a thread can be missed and still ring at all, in px. */
export const MISS = PLUCK.sympatheticReach * 3

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
