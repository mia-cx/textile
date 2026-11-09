/**
 * The time every thread field on the page reads, in seconds, so the hero's strands and the cord that carries them on
 * turn, flow, and breathe in step: the cord picks up the hero's strands at the window's seam only if both are at the
 * same moment. Each field still draws only while it shows; whichever animates advances the clock, once per frame.
 */

/** The moment reduced motion and the 2D fallbacks show, where the current looks settled, and where the clock starts. */
export const STILL_TIME = 12
/** The longest step between frames, in seconds, so a stalled or hidden tab doesn't jump the current forward. */
const MAX_STEP = 0.1

let elapsed = STILL_TIME
let last = Number.NEGATIVE_INFINITY

/**
 * Advances the clock to the frame at `now` (a requestAnimationFrame timestamp, in ms) and returns it. Every field
 * calls it from its frame callback; fields drawing the same frame share its timestamp, so only the first moves it.
 */
export function advance(now: number) {
  const step = (now - last) / 1000
  if (step > 0) elapsed += Math.min(step, MAX_STEP)
  last = now
  return elapsed
}

/** The clock's time at `now` (ms, as events and frames stamp it), between frames: as the next frame will see it. */
export const clockAt = (now: number) =>
  elapsed + Math.min(Math.max((now - last) / 1000, 0), MAX_STEP)
