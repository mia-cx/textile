import { clockAt, ticking } from './clock'

/**
 * The pointer stirring the loose threads like air. As a mouse or pen moves over the page, its path is cut into short
 * segments, each kept in a small ring (`ring`) with how fast it moved. Every thread field reads the ring each frame:
 * threads near a segment are blown aside in the direction of travel, the nearer the further, and drift slowly back
 * (see `ringing`, mirrored as `ringing` in the shaders). Only where they are loose: the plait never moves. A pluck, in
 * the code, is one such segment and the gust it blows.
 *
 * The ring holds page pixels and the shared clock's seconds; each field turns it into its own coordinates (`pluckField`
 * in geometry.ts, `pluckCord` in cord.ts) and hands it to its shaders as uniforms, which ring a pluck only while its
 * time lasts.
 */

export const PLUCK = {
  /** Gusts the ring holds: a pointer moving all the time cuts this many in a `life`, each `segment` long. */
  ring: 48,
  /** Seconds a thread drifts after the pointer passes, back at rest by the end. */
  life: 2.4,
  /**
   * Seconds a thread takes to be blown to its furthest: it starts moving the moment the pointer passes, at its fastest
   * then, and slows to a stop there, so it answers at once but never moves quickly.
   */
  catch: 0.6,
  /** How far from the pointer's path the air reaches, in px: a thread this far off moves 37% as far as one it crossed. */
  reach: 70,
  /**
   * How far a thread is blown aside at most, in px, by the fastest sweep; and how far, at most, every gust on it at once
   * can displace it together, reached smoothly: never a kink.
   */
  pull: 28,
  most: 40,
  /**
   * The pointer's speed, in px/s, at which a gust reaches 63% of its strength (see `strengthOf`): a fifth of it at half
   * this speed, a twenty-fifth at a fifth, so a slow sweep barely stirs.
   */
  speed: 1500,
  /** Slower than this, in px/s, the pointer is resting over the threads, not stirring them. */
  rest: 60,
  /**
   * The longest stretch of thread a gust moves, in px, centred where the pointer passed, shorter where an anchor (where
   * the thread enters, or meets its strand's plait) is nearer. It bows smoothly from rest at the stretch's ends to its
   * furthest where the pointer passed, with no corner.
   */
  stretch: 1000,
  /**
   * How near either end of the stretch, as a share of it, the bow peaks at most: passed nearer an anchor, it peaks here,
   * so it never climbs steeply off the anchor.
   */
  edge: 0.25,
  /**
   * The share of fibres the air moves at all, each as far as its seed says, from barely to fully; the rest hold still
   * behind them, so the field shows depth.
   */
  free: 0.4,
  /** How much brighter a blown thread burns at its furthest. */
  light: 0.35,
  /**
   * How long, in seconds, the pointer's path runs before it is cut into a gust: often enough that a thread starts to move
   * soon after the pointer passes, and seldom enough that the ring holds a whole sweep for `life` (`ring` × `segment` ≥
   * `life`). A path is also cut when the pointer stops for this long.
   */
  segment: 0.05,
  /**
   * How long without moving, in seconds, at least, and longer than two of its recent moves, the pointer has paused: the
   * path so far is cut, and the next move runs on from where it paused.
   */
  still: 0.05,
  /**
   * The slowest a moving pointer reports, in seconds between moves: a move after a gap no longer than this took the whole
   * gap, so a pointer reporting slowly reads as one continuous sweep at its real pace. After a longer gap the pointer was
   * at rest, and the move took as long as one of its recent moves, so a flick from rest reads as fast as it went.
   */
  cadence: 0.15,
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
/** When the last pluck was cut, ms on the events' clock: a moving pointer cuts at most one a `segment`. */
let blown = Number.NEGATIVE_INFINITY

/**
 * The pointer's path since the last pluck was cut: where it started (`x0`, `y0`, at `t0`, ms on the events' clock),
 * where it first turned back on itself, if it has (`tx`, `ty`, at `tt`, NaN if not), and the latest move along it
 * (`x1`, `y1`, at `t1`), which it keeps while there is no path (`t0` NaN), as where the pointer rests. And how long its
 * recent moves took, ms.
 */
const path = {
  x0: 0,
  y0: 0,
  t0: Number.NaN,
  tx: 0,
  ty: 0,
  tt: Number.NaN,
  x1: 0,
  y1: 0,
  t1: Number.NaN,
  interval: 16,
}
const begin = (x: number, y: number, at: number) => {
  path.x0 = path.x1 = x
  path.y0 = path.y1 = y
  path.t0 = path.t1 = at
  path.tt = Number.NaN
}
const drop = () => {
  path.t0 = path.tt = Number.NaN
}

/** Seconds after the pointer passed when a thread has drifted back all but a hundredth of the way: under 0.3px. */
const FADED = PLUCK.life - 2 * PLUCK.segment

/**
 * The slot whose pluck stops ringing soonest, at `clock` (the fields' clock): one long done, or, when a sweep fills the
 * ring, the oldest, by then `FADED` into its `life` (one cut a `segment` turns the ring over in a `life`). If even that
 * one still drifts, as when the pointer cuts plucks faster than the ring turns over, -1: the new pluck is let go, since
 * cutting the old one short would snap its threads back.
 */
const soonest = (clock: number) => {
  let best = 0
  const end = (k: number) => (ring[k * SLOT + 5] ?? 0) + (ring[k * SLOT + 6] ?? 0)
  for (let k = 1; k < PLUCK.ring; k++) if (end(k) < end(best)) best = k
  return clock - end(best) >= FADED ? best : -1
}

/** Panels are opaque: over one, the pointer is on the glass, not on the threads behind it. */
const GLASS = '[data-weave-panel]'

let motion: MediaQueryList | undefined

/**
 * How hard a gust blows, 0 to 1, for a pointer that moved `length` px in `span` seconds. Like the drag of a moving
 * body, it grows with the square of the speed, so a slow pointer barely stirs the threads and a fast one blows them
 * hard. And it carries as much air as the path covered of the reach either side of it: a slow pointer cuts many short
 * gusts across one thread where a fast one cuts a single long one, and the gusts on a thread add up to the same either
 * way, so only the speed sets how far it moves. Mirrors `strengthOf` in the shaders.
 */
export const strengthOf = (length: number, span: number) =>
  (1 - Math.exp(-((length / span / PLUCK.speed) ** 2))) * Math.min(1, length / (2 * PLUCK.reach))

/**
 * Cuts the path from its start to (`x`, `y`), where the pointer was at `t`, into a pluck at `now` (ms, the events'
 * clock), if the pointer moved along it faster than `rest`, and carries the path on from there. Its threads are caught
 * from `now` on, never before, so none starts mid-catch. Plucks ring on the fields' clock, which runs only while one of
 * them animates: with none on screen, nothing shows them, and their time could never run out, so then nothing is cut.
 */
const blow = (x: number, y: number, t: number, now: number) => {
  if (t > path.t0) {
    const span = (t - path.t0) / 1000
    const length = Math.hypot(x - path.x0, y - path.y0)
    const clock = clockAt(now)
    const slot = soonest(clock)
    if (length / span >= PLUCK.rest && ticking(now) && slot >= 0) {
      const strength = strengthOf(length, span)
      const o = slot * SLOT
      ring[o] = path.x0
      ring[o + 1] = path.y0
      ring[o + 2] = x
      ring[o + 3] = y
      ring[o + 4] = PLUCK.pull * strength
      ring[o + 5] = clock
      ring[o + 6] = span
      ring[o + 7] = strength
      writes += 1
      stamps[slot] = writes
      blown = now
    }
  }
  path.x0 = x
  path.y0 = y
  path.t0 = t
  path.tt = Number.NaN
}

/**
 * Cuts the path so far into plucks at `now`: up to where it turned back on itself, if it did, so a quick wiggle blows
 * each way it went rather than only what it netted, and on from there to its latest move only if `whole`, as when the
 * pointer stops. Cut only at a turn, the rest runs on into the next segment, so the pointer still cuts about one pluck
 * a segment however it wiggles, and the ring keeps every pluck for its whole `life`.
 */
const cut = (now: number, whole = false) => {
  if (Number.isNaN(path.t0)) return
  const turned = !Number.isNaN(path.tt)
  if (turned) blow(path.tx, path.ty, path.tt, now)
  if (whole || !turned) blow(path.x1, path.y1, path.t1, now)
}

/**
 * Cuts the path so far and ends it, keeping where the pointer rests, as a rest does (`settle`); or forgetting it too, as
 * when the pointer leaves the threads, for a panel or touch, so nothing is joined across where it went (`leave`). And,
 * once the pointer has gone a segment without moving, cuts the path so far but keeps its place (`stop`), so the last of
 * a movement plucks too while slower pointer events, further apart than a segment, still carry one path on.
 */
let stopped: ReturnType<typeof setTimeout> | undefined
const settle = (now: number) => {
  cut(now, true)
  drop()
}
const leave = (now: number) => {
  settle(now)
  path.t1 = Number.NaN
}
const stop = () => cut(performance.now(), true)

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
    // After a pause, or from nowhere: what came before blows, and this move runs on from where the pointer was, however
    // far, along the straight line it swept between, so every thread that line crosses is caught. With nowhere it was
    // (it left the window, crossed a panel, or the page scrolled), the path starts here.
    settle(at)
    if (gap > 0) {
      path.x0 = path.x1
      path.y0 = path.y1
      if (gap <= PLUCK.cadence * 1000) {
        // Moving, but reporting slowly (a busy frame holds its moves back): the line took the whole gap, and the next
        // moves keep to its pace.
        path.t0 = path.t1
        path.interval = gap
      } else {
        // From rest: the move took as long as one of its recent moves, so a flick from rest blows as hard as it went.
        path.t0 = at - path.interval
      }
    } else begin(x, y, at)
  } else {
    path.interval = Math.min(Math.max(gap, 4), PLUCK.cadence * 1000)
    // Turning back on itself: the next cut ends there (see `cut`).
    const back = (x - path.x1) * (path.x1 - path.x0) + (y - path.y1) * (path.y1 - path.y0) < 0
    if (back && Number.isNaN(path.tt)) {
      path.tx = path.x1
      path.ty = path.y1
      path.tt = path.t1
    }
  }
  path.x1 = x
  path.y1 = y
  path.t1 = at
  if (Math.min(at - path.t0, at - blown) >= PLUCK.segment * 1000) cut(at)
  stopped = setTimeout(stop, PLUCK.segment * 1000)
}

/**
 * The page scrolled under the pointer: the path so far plucks, and where the pointer rested is forgotten, since the
 * page has moved beneath it without it moving, and joining across that would pluck along a path it never swept.
 */
const scrolled = () => {
  clearTimeout(stopped)
  leave(performance.now())
}

/**
 * The pointer left the window (`out`), or the browser took it over for a drag (`cancel`), which reports no moves until
 * the drop: where it was is forgotten, so its next move never joins across where it went.
 */
const cancel = (event: PointerEvent) => {
  clearTimeout(stopped)
  leave(event.timeStamp)
}
const out = (event: PointerEvent) => {
  if (event.relatedTarget === null) cancel(event)
}

let listeners = 0

/**
 * Starts listening for plucks, once for every field that reads them; the returned function stops, and the last to stop
 * removes the listeners. With reduced motion nothing is plucked.
 */
export function listen() {
  if (listeners++ === 0) {
    motion = matchMedia('(prefers-reduced-motion: no-preference)')
    drop()
    addEventListener('pointermove', move, { passive: true })
    addEventListener('pointerout', out, { passive: true })
    addEventListener('pointercancel', cancel, { passive: true })
    addEventListener('scroll', scrolled, { passive: true })
  }
  return () => {
    if (--listeners > 0) return
    removeEventListener('pointermove', move)
    removeEventListener('pointerout', out)
    removeEventListener('pointercancel', cancel)
    removeEventListener('scroll', scrolled)
    clearTimeout(stopped)
  }
}

/**
 * How a thread drifts `along` px along it, where the pointer passed it `at` px along it, between anchors `from` and `to`
 * (px along it), `age` seconds after the pointer passed, blown at `strength` (0 to 1), for a fibre whose `seed` (0 to 1)
 * sets how freely it moves: how far it is displaced for a pull of 1 px, and how much light it adds. Mirrors `ringing`
 * in the shaders.
 *
 * The stretch around where the pointer passed, at most `stretch` long between the anchors, bows aside, from rest at its
 * ends to its furthest where the pointer passed, flat at both so it bends with no corner. It starts moving at once and
 * slows to its furthest over `catch`, then drifts back to rest, slowly and without overshooting, by `life`. Only the
 * `free` share of fibres moves, each as far as its seed says, from barely to fully, so some threads stir in front of
 * others that hold still, and the field shows depth.
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
  if (age <= 0 || age >= PLUCK.life || !(stretch > 0) || x <= 0 || x >= 1) return rung
  const p = Math.min(Math.max((at - low) / stretch, PLUCK.edge), 1 - PLUCK.edge)
  const shape = x < p ? smoothstep(0, p, x) : 1 - smoothstep(p, 1, x)
  const blown =
    age < PLUCK.catch
      ? Math.sin(((Math.PI / 2) * age) / PLUCK.catch)
      : 1 - smoothstep(PLUCK.catch, PLUCK.life, age)
  const free = smoothstep(1 - PLUCK.free, 1, seed)
  rung.shift = shape * blown * free
  rung.light = strength * shape * blown * free
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
 * `along`, how far along the path it crossed (0 to 1; the nearer end if it missed), and `grip`, how much of the air
 * reaches it: 1 if it crossed, falling off softly with distance over `reach`. Mirrors `caught` in the shaders. Like
 * `ringing`, it returns the same object every call.
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
  hit.along = along
  hit.grip = Math.exp(-((miss / PLUCK.reach) ** 2))
  return hit
}
const hit = { along: 0, grip: 0 }

/** How far beyond either side of its own sway a thread can be missed and still move at all, in px. */
export const MISS = PLUCK.reach * 3

const smoothstep = (a: number, b: number, x: number) => {
  const t = Math.min(1, Math.max(0, (x - a) / (b - a)))
  return t * t * (3 - 2 * t)
}
