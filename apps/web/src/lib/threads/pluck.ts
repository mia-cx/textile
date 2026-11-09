import { clockAt, ticking } from './clock'

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
  ring: 48,
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
  /**
   * How far a thread is pulled aside at most, in px, by the fastest flick; and how far, at most, every pluck ringing it
   * at once can displace it together, reached smoothly: never a kink, never over text.
   */
  pull: 12,
  most: 16,
  /** The pointer's speed, in px/s, at which a pluck reaches 63% of its strength: a slow sweep ripples softly. */
  speed: 1200,
  /** Slower than this, in px/s, the pointer is resting on the threads, not plucking them. */
  rest: 60,
  /**
   * The longest stretch a pluck rings, in px, centred where it was plucked: a fibre is held by its neighbours further
   * out, so a pluck rings the stretch around it, shorter where an anchor (where the thread enters, or meets its
   * strand's plait) is nearer. Where the stretch ends short of an anchor, its ring tapers off over its outer `taper`,
   * so the thread runs on from it with no corner.
   */
  stretch: 440,
  taper: 0.15,
  /**
   * How fast a wave runs along a thread, in px/s, which sets its pitch: its fundamental rings at `wave / 2L` for a
   * stretch L px long, about 2 Hz for the longest and higher as an anchor shortens it, up to `pitch[1]` Hz, low enough
   * for every frame to show it. Each fibre is strung a little tighter or looser, up to `detune` of its pitch either way,
   * so neighbours plucked together drift apart and shimmer.
   */
  wave: 1800,
  pitch: [2, 6] as const,
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
   * How long, in seconds, the pointer's path runs before it is cut into a pluck: often enough that a thread is caught
   * soon after the pointer crosses it (each is caught a segment's span after, so 30 to 50ms at 60 Hz), and seldom
   * enough that the ring holds a whole sweep, however fast, for `life`. A path is also cut when the pointer stops for
   * this long.
   */
  segment: 0.03,
  /**
   * How long without moving the pointer rests, in seconds, at least, and longer than two of its recent moves: a move
   * after a rest counts from where it rested, as long as one of its recent moves took, so a flick from beside a string
   * catches it as firmly as the rest. From further than `leap` px away (it left the window, or crossed a panel), the
   * path starts where it is.
   */
  still: 0.05,
  leap: 64,
} as const

/** Floats per slot of the ring: where the path ran (x0, y0, x1, y1, page px), its pull, start, span, and strength. */
export const SLOT = 8

/**
 * The ring of recent plucks, `SLOT` floats each: the pointer's path from (x0, y0) to (x1, y1) in page px; how far it
 * pulls a thread it crosses at right angles, in px; the clock time the path was cut, when its start's threads are
 * caught, and how long the pointer took along it, so each thread after is caught that much later, in the order the
 * pointer crossed them, each `span` after it did; and its strength, 0 to 1. A slot whose pull is 0 holds nothing.
 */
export const ring = new Float32Array(PLUCK.ring * SLOT)

/**
 * When each slot of the ring was last written, as a count of plucks: a field turns a slot into its own terms only when
 * its stamp changes, so a sweep costs it one slot a pluck, not the whole ring.
 */
export const stamps = new Uint32Array(PLUCK.ring)
let writes = 0

/**
 * The pointer's path since the last pluck was cut: where it started (`x0`, `y0`, at `t0`, ms on the events' clock),
 * and the latest move along it (`x1`, `y1`, at `t1`), which it keeps while there is no path (`t0` NaN), as where the
 * pointer rests. And how long its recent moves took, ms.
 */
const path = { x0: 0, y0: 0, t0: Number.NaN, x1: 0, y1: 0, t1: Number.NaN, interval: 16 }
const begin = (x: number, y: number, at: number) => {
  path.x0 = path.x1 = x
  path.y0 = path.y1 = y
  path.t0 = path.t1 = at
}
const drop = () => {
  path.t0 = Number.NaN
}

/**
 * The slot whose pluck stops ringing soonest: one long done, or, when a sweep fills the ring, the oldest, by then faded
 * all but to nothing, so the newest is never kept waiting.
 */
const soonest = () => {
  let best = 0
  const end = (k: number) => (ring[k * SLOT + 5] ?? 0) + (ring[k * SLOT + 6] ?? 0)
  for (let k = 1; k < PLUCK.ring; k++) if (end(k) < end(best)) best = k
  return best
}

/** Panels are opaque: over one, the pointer is on the glass, not on the threads behind it. */
const GLASS = '[data-weave-panel]'

let motion: MediaQueryList | undefined

/**
 * Cuts the path so far into a pluck at `now` (ms, the events' clock), if the pointer moved along it fast enough to
 * pluck, and carries the path on from its latest move. Its threads are caught from `now` on, never before, so none
 * starts mid-catch. Plucks ring on the fields' clock, which runs only while one of them animates: with none on screen,
 * nothing shows them, and their time could never run out, so then nothing is cut.
 */
const cut = (now: number) => {
  if (Number.isNaN(path.t0) || path.t1 <= path.t0) return
  const span = (path.t1 - path.t0) / 1000
  const speed = Math.hypot(path.x1 - path.x0, path.y1 - path.y0) / span
  if (speed >= PLUCK.rest && ticking(now)) {
    const strength = 1 - Math.exp(-speed / PLUCK.speed)
    const slot = soonest()
    const o = slot * SLOT
    ring[o] = path.x0
    ring[o + 1] = path.y0
    ring[o + 2] = path.x1
    ring[o + 3] = path.y1
    ring[o + 4] = PLUCK.pull * strength
    ring[o + 5] = clockAt(now)
    ring[o + 6] = span
    ring[o + 7] = strength
    writes += 1
    stamps[slot] = writes
  }
  begin(path.x1, path.y1, path.t1)
}

/**
 * Cuts the path so far and ends it, keeping where the pointer rests, as a rest does (`settle`); or forgetting it too, as
 * when the pointer leaves the threads, for a panel or touch, so nothing is joined across where it went (`leave`). And,
 * once the pointer has gone a segment without moving, cuts the path so far but keeps its place (`stop`), so the last of
 * a movement plucks too while slower pointer events, further apart than a segment, still carry one path on.
 */
let stopped: ReturnType<typeof setTimeout> | undefined
const settle = (now: number) => {
  cut(now)
  drop()
}
const leave = (now: number) => {
  settle(now)
  path.t1 = Number.NaN
}
const stop = () => cut(performance.now())

const move = (event: PointerEvent) => {
  clearTimeout(stopped)
  const { pageX: x, pageY: y, timeStamp: at } = event
  // Touch scrolls the page; only a hovering mouse or pen plucks. Over a panel, the pointer is on the glass: the path up
  // to it plucks, and stops there.
  const plucking =
    (event.pointerType === 'mouse' || event.pointerType === 'pen') &&
    motion?.matches === true &&
    !(event.target instanceof Element && event.target.closest(GLASS))
  if (!plucking) return leave(at)
  const gap = at - path.t1
  if (Number.isNaN(path.t0) || !(gap <= Math.max(PLUCK.still * 1000, 2 * path.interval))) {
    // From rest, or from nothing: what came before plucks, and this move counts from where the pointer rested, over one
    // recent move's time; from far off, or with nowhere it rested, the path starts here.
    settle(at)
    if (gap > 0 && Math.hypot(x - path.x1, y - path.y1) <= PLUCK.leap) {
      path.x0 = path.x1
      path.y0 = path.y1
      path.t0 = at - Math.min(gap, path.interval)
    } else begin(x, y, at)
  } else path.interval = Math.min(Math.max(gap, 4), PLUCK.still * 1000)
  path.x1 = x
  path.y1 = y
  path.t1 = at
  if (at - path.t0 >= PLUCK.segment * 1000) cut(at)
  stopped = setTimeout(stop, PLUCK.segment * 1000)
}

let listeners = 0

/**
 * Starts listening for plucks, once for every field that reads them; the returned function stops, and the last to stop
 * removes the listener. With reduced motion nothing is plucked.
 */
export function listen() {
  if (listeners++ === 0) {
    motion = matchMedia('(prefers-reduced-motion: no-preference)')
    drop()
    addEventListener('pointermove', move, { passive: true })
  }
  return () => {
    if (--listeners > 0) return
    removeEventListener('pointermove', move)
    clearTimeout(stopped)
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
 *
 * It returns the same object every call, so labels can ride their threads every frame without allocating: read it
 * before calling again.
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
  rung.shift = 0
  rung.light = 0
  if (age <= 0 || !(stretch > 0) || x <= 0 || x >= 1) return rung
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
  // Fading out by `life`, and tapering off at the stretch's ends so the thread runs on from them with no corner.
  const fade =
    (1 - smoothstep(PLUCK.life * 0.6, PLUCK.life, age)) *
    smoothstep(0, PLUCK.taper, x) *
    smoothstep(0, PLUCK.taper, 1 - x)
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
  rung.shift = shift * fade
  rung.light = strength * energy * fade * Math.abs(shape) * (PLUCK.glow + (1 - PLUCK.glow) * glint)
  return rung
}
const rung = { shift: 0, light: 0 }

/**
 * Every pluck's displacement of one point, `shift` px summed, bounded smoothly to `most`: one pluck passes nearly
 * whole, and a thread swept again and again never bends further. Mirrors `bounded` in the shaders.
 */
export const bounded = (shift: number) => {
  const q = (shift / PLUCK.most) ** 2
  return shift / Math.sqrt(Math.sqrt(1 + q * q))
}

/**
 * Where a thread meets the pointer's path, from how far beside each end of the path it ran (`d0`, `d1`, px across):
 * `along`, how far along the path it crossed (0 to 1; the nearer end if it missed), and `grip`, how firmly it was
 * caught: 1 if it crossed, falling off fast with distance, and a little for neighbours within `sympatheticReach`.
 * Mirrors `caught` in the shaders. Like `ringing`, it returns the same object every call.
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
  hit.along = along
  hit.grip = far + (1 - far) * near
  return hit
}
const hit = { along: 0, grip: 0 }

/** How far beyond either side of its own sway a thread can be missed and still ring at all, in px. */
export const MISS = PLUCK.sympatheticReach * 3

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
