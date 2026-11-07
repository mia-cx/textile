import {
  CORD_THREADS,
  type Cord,
  cordThread,
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
      uniforms.set([0, 0, Math.min(cord.copy.length, MAX_COPY), 1], 8)
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

/** Every how many of the cord's threads the 2D fallback strokes: it redraws as the page scrolls, so it draws few. */
const STILL_EVERY = 3

/** The fallback without a GPU: the same cord as canvas 2D strokes, each thread one colour, still. */
export function cordStill(canvas: HTMLCanvasElement): CordRenderer | undefined {
  const context = canvas.getContext('2d')
  if (!context) return undefined
  let cord: Cord | undefined
  const css = (rgb: RGB, alpha: number) =>
    `rgb(${rgb.map((c) => Math.round(c * 255)).join(' ')} / ${alpha.toFixed(3)})`
  return {
    kind: '2d',
    load(next) {
      cord = next
    },
    draw(palette, time, view) {
      if (!cord) return
      const dpr = canvas.width / Math.max(canvas.clientWidth, 1)
      context.setTransform(dpr, 0, 0, dpr, -view.left * dpr, -view.top * dpr)
      context.clearRect(view.left, view.top, canvas.width / dpr, canvas.height / dpr)
      context.globalCompositeOperation = 'lighter'
      context.lineWidth = 0.8
      const [violet, amber] = palette.threads
      const shown = visible(cord, view.top, Math.min(view.top + canvas.height / dpr, view.tip))
      const paths = [shown, ...cord.paths.slice(1, 1 + MAX_PEELS)]
      const threads = [
        ...Array.from({ length: Math.ceil(CORD_THREADS / STILL_EVERY) }, (_, n) => n * STILL_EVERY),
        ...Array.from({ length: (paths.length - 1) * PEEL_THREADS }, (_, n) => CORD_THREADS + n),
      ]
      for (const i of threads) {
        const th = cordThread(i)
        const span = paths[th.path]
        if (!span || span.count < 2) continue
        const warm = th.strand / 3 + hash(i + 4.4) * 0.2 < 0.5 ? 0 : 1
        context.strokeStyle = css(
          warm ? amber : violet,
          0.5 * (SHAPE.dim + (1 - SHAPE.dim) * hash(i + 2.2)),
        )
        context.beginPath()
        for (let k = span.first; k < span.first + span.count; k++) {
          const [x, y] = place(cord, i, k, time).point
          if (y > view.tip) break
          if (k === span.first) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      }
    },
    destroy() {},
  }
}
