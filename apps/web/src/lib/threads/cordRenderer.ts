import {
  CORD_THREADS,
  type Cord,
  cordThread,
  cordWarmth,
  MAX_COPY,
  MAX_PEELS,
  PEEL_THREADS,
  place,
  ROW,
  TEXELS,
  visible,
} from './cord'
import { hash, SHAPE } from './geometry'
import { type Painter, type Scene, webgl2Painter, webgpuPainter } from './gpu'
import { EXPOSURE, type Palette, type RGB } from './renderer'
import { CORD_VEC4S, cordVertexGlsl, cordWgsl } from './shaders'

/** The part of the page a cord canvas shows: its top-left, in the weave's pixels, and how far down the cord is drawn. */
export interface View {
  readonly left: number
  readonly top: number
  readonly tip: number
}

/** A cord drawn on one canvas over the page; `load` gives it the cord, `draw` a frame of the part `view` shows. */
export interface CordRenderer {
  readonly kind: 'webgpu' | 'webgl2' | '2d'
  load(cord: Cord): void
  draw(palette: Palette, time: number, view: View): void
  /** Clears the canvas, as when the cord no longer shows where it is. */
  clear(): void
  destroy(): void
  /** Settles when the renderer can no longer draw, as when the browser resets the GPU; the cord then starts over. */
  readonly lost?: Promise<unknown>
}

/** How bright the cord is, against the hero's field. */
const INTENSITY = 0.8

const SCENE: Scene = {
  wgsl: cordWgsl,
  glsl: cordVertexGlsl,
  vec4s: CORD_VEC4S,
  over: true,
  data: true,
}

/** A cord drawn by a GPU painter: only its samples on screen, with every peel. */
const cordOn = (canvas: HTMLCanvasElement, painter: Painter): CordRenderer => {
  let cord: Cord | undefined
  const uniforms = new Float32Array(CORD_VEC4S * 4)
  return {
    kind: painter.kind,
    lost: painter.lost,
    load(next) {
      cord = next
      painter.upload(next.data, ROW * TEXELS, next.rows)
    },
    draw(palette, time, view) {
      if (!cord) return
      const dpr = canvas.width / Math.max(canvas.clientWidth, 1)
      const width = canvas.width / dpr
      const height = canvas.height / dpr
      const shown = visible(cord, view.top, Math.min(view.top + height, view.tip))
      const peels = cord.paths.slice(1, 1 + MAX_PEELS)
      uniforms.fill(0)
      uniforms.set([width, height, dpr, time], 0)
      uniforms.set([view.left, view.top, view.tip, INTENSITY], 4)
      uniforms.set(
        [cord.seam.twist, cord.seam.hue, Math.min(cord.copy.length, MAX_COPY), cord.seam.drift],
        8,
      )
      uniforms.set([cord.radius, CORD_THREADS, 0, shown.first], 12)
      uniforms.set([shown.count, peels.length], 16)
      for (const [p, peel] of peels.entries()) uniforms.set([peel.first, peel.count], 20 + p * 2)
      for (const [i, rgb] of palette.threads.entries()) uniforms.set(rgb, 32 + i * 4)
      uniforms.set([...palette.background, EXPOSURE], 40)
      for (const [r, box] of cord.copy.slice(0, MAX_COPY).entries())
        uniforms.set([box.left, box.top, box.right, box.bottom], 44 + r * 4)
      const longest = Math.max(shown.count, ...peels.map((peel) => peel.count))
      painter.paint(uniforms, longest * 2, CORD_THREADS + peels.length * PEEL_THREADS)
    },
    // No threads: every pass runs on empty light, and the tone pass leaves the canvas transparent.
    clear: () => painter.paint(uniforms, 0, 0),
    destroy: () => painter.destroy(),
  }
}

export async function cordWebgpu(canvas: HTMLCanvasElement): Promise<CordRenderer | undefined> {
  const painter = await webgpuPainter(canvas, SCENE)
  return painter && cordOn(canvas, painter)
}

export function cordWebgl2(canvas: HTMLCanvasElement): CordRenderer | undefined {
  const painter = webgl2Painter(canvas, SCENE)
  return painter && cordOn(canvas, painter)
}

/** Every how many of the cord's threads the 2D fallback strokes, and how many samples long each piece of one is. */
const STILL_EVERY = 3
const STILL_PIECE = 96

/** A stretch of one thread, as the 2D fallback strokes it: how far up and down it reaches, its path, and its colour. */
interface Piece {
  readonly top: number
  readonly bottom: number
  readonly path: Path2D
  readonly style: CanvasGradient
}

/** Samples between the colour stops along a piece: close enough to follow the gradient's turns smoothly. */
const STILL_STOP = 8

/**
 * The fallback without a GPU: the same cord as canvas 2D strokes, still, each thread turning violet to amber along it
 * as the GPU's do. It lays its strokes out once per layout, in short pieces, each a gradient along its chord, and as
 * the page scrolls strokes only the pieces on screen.
 */
export function cordStill(canvas: HTMLCanvasElement): CordRenderer | undefined {
  const context = canvas.getContext('2d')
  if (!context) return undefined
  let cord: Cord | undefined
  let pieces: Piece[] | undefined
  let laidOut: { palette: Palette; time: number } | undefined
  const css = (rgb: RGB, alpha: number) =>
    `rgb(${rgb.map((c) => Math.round(c * 255)).join(' ')} / ${alpha.toFixed(3)})`

  const layOut = (laid: Cord, palette: Palette, time: number) => {
    const [violet, amber] = palette.threads
    const blend = (w: number): RGB => [
      violet[0] + (amber[0] - violet[0]) * w,
      violet[1] + (amber[1] - violet[1]) * w,
      violet[2] + (amber[2] - violet[2]) * w,
    ]
    const peels = Math.min(laid.paths.length - 1, MAX_PEELS)
    const threads = [
      ...Array.from({ length: Math.ceil(CORD_THREADS / STILL_EVERY) }, (_, n) => n * STILL_EVERY),
      ...Array.from({ length: peels * PEEL_THREADS }, (_, n) => CORD_THREADS + n),
    ]
    return threads.flatMap((i) => {
      const th = cordThread(i)
      const span = laid.paths[th.path]
      if (!span || span.count < 2) return []
      const own = 0.5 * (SHAPE.dim + (1 - SHAPE.dim) * hash(i + 2.2))
      const points = Array.from({ length: span.count }, (_, k) => {
        const { warmth, leads } = cordWarmth(laid, i, span.first + k, time, th)
        return {
          at: place(laid, i, span.first + k, time, th).point,
          colour: css(blend(warmth), Math.min(1, own * (leads ? SHAPE.traced : 1))),
        }
      })
      // Neighbouring pieces share their end point, so the thread runs on unbroken. Each piece's colour runs along its
      // chord, with a stop every few samples where that sample falls on it.
      return Array.from({ length: Math.ceil((points.length - 1) / STILL_PIECE) }, (_, n) => {
        const run = points.slice(n * STILL_PIECE, (n + 1) * STILL_PIECE + 1)
        const [x0, y0] = run[0]?.at ?? [0, 0]
        const [x1, y1] = run.at(-1)?.at ?? [0, 0]
        const length = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1
        const style = context.createLinearGradient(x0, y0, x1, y1)
        const path = new Path2D()
        for (const [k, { at, colour }] of run.entries()) {
          const [x, y] = at
          k === 0 ? path.moveTo(x, y) : path.lineTo(x, y)
          if (k % STILL_STOP !== 0 && k !== run.length - 1) continue
          const along = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / length
          style.addColorStop(Math.min(1, Math.max(0, along)), colour)
        }
        const heights = run.map(({ at }) => at[1])
        return { top: Math.min(...heights), bottom: Math.max(...heights), path, style }
      })
    })
  }

  return {
    kind: '2d',
    load(next) {
      cord = next
      pieces = undefined
    },
    draw(palette, time, view) {
      if (!cord) return
      if (!pieces || laidOut?.palette !== palette || laidOut.time !== time) {
        pieces = layOut(cord, palette, time)
        laidOut = { palette, time }
      }
      const dpr = canvas.width / Math.max(canvas.clientWidth, 1)
      const width = canvas.width / dpr
      const bottom = Math.min(view.top + canvas.height / dpr, view.tip)
      context.setTransform(dpr, 0, 0, dpr, -view.left * dpr, -view.top * dpr)
      context.clearRect(view.left, view.top, width, canvas.height / dpr)
      if (bottom <= view.top) return
      context.save()
      context.beginPath()
      context.rect(view.left, view.top, width, bottom - view.top)
      context.clip()
      context.globalCompositeOperation = 'lighter'
      context.lineWidth = 0.8
      for (const piece of pieces) {
        if (piece.bottom < view.top || piece.top > bottom) continue
        context.strokeStyle = piece.style
        context.stroke(piece.path)
      }
      context.restore()
    },
    clear() {
      context.setTransform(1, 0, 0, 1, 0, 0)
      context.clearRect(0, 0, canvas.width, canvas.height)
    },
    destroy() {},
  }
}
