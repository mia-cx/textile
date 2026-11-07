import {
  along,
  brightness,
  CROWD,
  type Field,
  MAX_LABELS,
  position,
  SEGMENTS,
  SHAPE,
  thread,
  warmth,
} from './geometry'
import { type Painter, type Scene, webgl2Painter, webgpuPainter } from './gpu'
import { threadVertexGlsl, threadWgsl, UNIFORM_VEC4S, VERTICES_PER_THREAD } from './shaders'

/** The colours a field draws with, read from the page's tokens: the two thread colours and the ink behind them. */
export interface Palette {
  readonly threads: readonly [violet: RGB, amber: RGB]
  readonly background: RGB
}
export type RGB = readonly [r: number, g: number, b: number]

/** `#rrggbb`, as the thread tokens are written. */
export const hex = (value: string): RGB => {
  const channel = (at: number) => Number.parseInt(value.trim().slice(at, at + 2), 16) / 255
  return [channel(1), channel(3), channel(5)]
}

/** A field drawn on one canvas. `draw` renders a frame at `time` seconds; the canvas is already sized in device pixels. */
export interface Renderer {
  readonly kind: 'webgpu' | 'webgl2' | '2d'
  draw(field: Field, palette: Palette, time: number): void
  destroy(): void
  /** Settles when the renderer can no longer draw, as when the browser resets the GPU; the field then starts over. */
  readonly lost?: Promise<unknown>
}

/** How much light the tone map lets through: higher is brighter, saturating sooner. */
export const EXPOSURE = 1.45

/** Sizes are CSS pixels: the canvas's own size divided by `dpr`. */
const pack = (canvas: HTMLCanvasElement, field: Field, palette: Palette, time: number) => {
  const dpr = canvas.width / Math.max(canvas.clientWidth, 1)
  const u = new Float32Array(UNIFORM_VEC4S * 4)
  u.set([canvas.width / dpr, canvas.height / dpr, dpr, time], 0)
  u.set([...field.start, ...field.control], 4)
  u.set([...field.end, field.spread, field.cord], 8)
  u.set([field.braid, field.count, field.intensity, Math.min(field.labels.length, MAX_LABELS)], 12)
  for (const [i, label] of field.labels.slice(0, MAX_LABELS).entries())
    u.set([label.at, label.lane], 16 + i * 4)
  for (const [i, rgb] of palette.threads.entries()) u.set(rgb, 32 + i * 4)
  u.set([...palette.background, EXPOSURE], 40)
  return u
}

/** The hero's scene: its threads' shaders, on its own ink. */
const HERO: Scene = {
  wgsl: threadWgsl,
  glsl: threadVertexGlsl,
  vec4s: UNIFORM_VEC4S,
  over: false,
  data: false,
}

/** A field drawn by a GPU painter. */
const fieldOn = (canvas: HTMLCanvasElement, painter: Painter): Renderer => ({
  kind: painter.kind,
  lost: painter.lost,
  draw: (field, palette, time) =>
    painter.paint(pack(canvas, field, palette, time), VERTICES_PER_THREAD, field.count),
  destroy: () => painter.destroy(),
})

export async function webgpu(canvas: HTMLCanvasElement): Promise<Renderer | undefined> {
  const painter = await webgpuPainter(canvas, HERO)
  return painter && fieldOn(canvas, painter)
}

export function webgl2(canvas: HTMLCanvasElement): Renderer | undefined {
  const painter = webgl2Painter(canvas, HERO)
  return painter && fieldOn(canvas, painter)
}

/** Points per thread in the 2D fallback, and how many threads it draws at most: one still frame, drawn once. */
const STILL_SEGMENTS = SEGMENTS
const STILL_THREADS = 320
/** Points per piece a thread is stroked in, each piece its own colour along the gradient. */
const STILL_PIECE = 8
/** How much light each thread gives in the still frame's braid, where they overlap. */
const BRAID_STILL = 0.3

/** The fallback without a GPU: the same field, as one still frame of canvas 2D strokes, each with a faint halo. */
export function still(canvas: HTMLCanvasElement): Renderer | undefined {
  const context = canvas.getContext('2d', { alpha: false })
  if (!context) return undefined
  return {
    kind: '2d',
    draw(field, palette, time) {
      const dpr = canvas.width / Math.max(canvas.clientWidth, 1)
      const css = (rgb: RGB, alpha: number) =>
        `rgb(${rgb.map((c) => Math.round(c * 255)).join(' ')} / ${alpha.toFixed(3)})`
      context.setTransform(dpr, 0, 0, dpr, 0, 0)
      context.globalCompositeOperation = 'source-over'
      context.fillStyle = css(palette.background, 1)
      context.fillRect(0, 0, canvas.width, canvas.height)
      context.globalCompositeOperation = 'lighter'
      const [violet, amber] = palette.threads
      const blend = (w: number): RGB => [
        violet[0] + (amber[0] - violet[0]) * w,
        violet[1] + (amber[1] - violet[1]) * w,
        violet[2] + (amber[2] - violet[2]) * w,
      ]
      /** Thread `i` from point `from` to `to` (of STILL_SEGMENTS), stroked with a faint halo under a fine core. */
      const stroke = (i: number, from: number, to: number, rgb: RGB, alpha: number) => {
        context.beginPath()
        for (let s = from; s <= to; s++) {
          const [x, y] = position(field, i, along(s / STILL_SEGMENTS), time)
          if (s === from) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.lineWidth = 5
        context.strokeStyle = css(rgb, 0.1 * alpha)
        context.stroke()
        context.lineWidth = 0.8
        context.strokeStyle = css(rgb, alpha)
        context.stroke()
      }
      const count = Math.min(field.count, STILL_THREADS)
      for (let i = 0; i < count; i++) {
        const { joins } = thread(field, i)
        // From halfway into the braid, a thread gives less light, as hundreds share it. `into` is the point there:
        // `along` inverted.
        const into = Math.ceil((1 - (1 - (joins - SHAPE.join / 2)) ** (1 / CROWD)) * STILL_SEGMENTS)
        // In short pieces, so its colour follows the gradient along it.
        for (let s = 0; s < STILL_SEGMENTS; s += STILL_PIECE) {
          const to = Math.min(s + STILL_PIECE, STILL_SEGMENTS)
          const braided = s >= into ? 1 : 0
          const colour = blend(
            warmth(field, i, along((s + to) / 2 / STILL_SEGMENTS), time, braided),
          )
          stroke(
            i,
            s,
            to,
            colour,
            0.8 * brightness(field, i, braided) * field.intensity * (braided ? BRAID_STILL : 1),
          )
        }
      }
      // The flare where the cord ends.
      const [x, y] = field.end
      const radius = field.cord * 8
      const flare = context.createRadialGradient(x, y, 0, x, y, radius)
      flare.addColorStop(0, css([1, 1, 1], 0.9 * field.intensity))
      flare.addColorStop(0.15, css(blend(0.5), 0.5 * field.intensity))
      flare.addColorStop(1, css(violet, 0))
      context.fillStyle = flare
      context.fillRect(x - radius, y - radius, radius * 2, radius * 2)
    },
    destroy() {},
  }
}
