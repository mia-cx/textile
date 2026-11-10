import {
  behindCopy,
  CORD_THREADS,
  type Cord,
  cordThread,
  cordWarmth,
  FADE,
  MAX_STRINGS,
  nearCopy,
  PEEL_THREADS,
  place,
  ROW,
  TEXELS,
  tipY,
  visible,
} from './cord'
import { blend, hash, SHAPE } from './geometry'
import { type Painter, type Scene, webgl2Painter, webgpuPainter } from './gpu'
import { EXPOSURE, type Palette, type RGB } from './renderer'
import { CORD_PLUCKS, CORD_STRINGS, CORD_VEC4S, cordVertexGlsl, cordWgsl } from './shaders'

/** The part of the page a cord canvas shows: its top-left, in the weave's pixels, and how far along its route the cord's tip is. */
export interface View {
  readonly left: number
  readonly top: number
  readonly tip: number
}

/**
 * A cord drawn on one canvas over the page; `load` gives it the cord, `draw` a frame of the part `view` shows, its loose
 * strands ringing as `plucks` says (see `pluckCord`).
 */
export interface CordRenderer {
  readonly kind: 'webgpu' | 'webgl2' | '2d'
  load(cord: Cord): void
  draw(palette: Palette, time: number, view: View, plucks?: Float32Array): void
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
    draw(palette, time, view, plucks) {
      if (!cord) return
      const dpr = canvas.width / Math.max(canvas.clientWidth, 1)
      const width = canvas.width / dpr
      const height = canvas.height / dpr
      const shown = visible(cord, view.top, Math.min(view.top + height, tipY(cord, view.tip)))
      // The peels, then the strands' own paths, if the cord's strands run on past its end.
      const owned = cord.paths.slice(cord.strands ? -3 : cord.paths.length)
      const peels = cord.paths.slice(1, cord.paths.length - owned.length)
      const copy = nearCopy(cord, view.top, view.top + height)
      uniforms.fill(0)
      uniforms.set([width, height, dpr, time], 0)
      uniforms.set([view.left, view.top, view.tip, INTENSITY], 4)
      uniforms.set([cord.seam.twist, cord.seam.hue, copy.length, cord.seam.drift], 8)
      uniforms.set([cord.radius, CORD_THREADS, 0, shown.first], 12)
      uniforms.set([shown.count, peels.length, cord.strands ? 1 : 0, cord.paths[0]?.count ?? 0], 16)
      for (const [p, span] of [...peels, ...owned].entries())
        uniforms.set([span.first, span.count], 20 + p * 2)
      for (const [i, rgb] of palette.threads.entries()) uniforms.set(rgb, 32 + i * 4)
      uniforms.set([...palette.background, EXPOSURE], 40)
      for (const [r, box] of copy.entries())
        uniforms.set([box.left, box.top, box.right, box.bottom], 44 + r * 4)
      // The loose stretches each sample names, for the plucks.
      for (let n = 0; n < Math.min(cord.strings.length, MAX_STRINGS); n++) {
        uniforms[CORD_STRINGS * 4 + n * 2] = cord.strings[n]?.[0] ?? 0
        uniforms[CORD_STRINGS * 4 + n * 2 + 1] = cord.strings[n]?.[1] ?? 0
      }
      if (plucks) uniforms.set(plucks, CORD_PLUCKS * 4)
      const longest = Math.max(
        shown.count + Math.max(0, ...owned.map((span) => span.count)),
        ...peels.map((peel) => peel.count),
      )
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
const STILL_PIECE = 4

/**
 * A stretch of one thread, as the 2D fallback strokes it: how far up and down it reaches, how far along the cord's route
 * its middle is, its path, and its colour.
 */
interface Piece {
  readonly top: number
  readonly bottom: number
  readonly route: number
  readonly path: Path2D
  readonly style: CanvasGradient
}

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
    const mixed = (w: number) => blend(violet, amber, w)
    const owned = laid.strands ? 3 : 0
    const peels = laid.paths.length - 1 - owned
    const threads = [
      ...Array.from({ length: Math.ceil(CORD_THREADS / STILL_EVERY) }, (_, n) => n * STILL_EVERY),
      ...Array.from({ length: peels * PEEL_THREADS }, (_, n) => CORD_THREADS + n),
    ]
    return threads.flatMap((i) => {
      const th = cordThread(i)
      // A cord thread runs on past the cord's end along its strand's own path, as on the GPU.
      const spans = [
        laid.paths[th.path],
        th.path === 0 && owned ? laid.paths[1 + peels + th.strand] : undefined,
      ].flatMap((span) => (span ? [span] : []))
      const samples = spans.flatMap(({ first, count }) =>
        Array.from({ length: count }, (_, k) => first + k),
      )
      if (samples.length < 2) return []
      const own = 0.5 * SHAPE.glow * (SHAPE.dim + (1 - SHAPE.dim) * hash(i + 2.2) ** SHAPE.skew)
      const points = samples.map((k) => {
        const { warmth, leads } = cordWarmth(laid, i, k, time, th)
        const o = k * TEXELS * 4
        // How bright the path is here, as the GPU's strands read it: coming up where a strand peels off a panel's edge.
        const light = laid.data[o + 10] ?? 1
        const at = place(laid, i, k, time, th).point
        return {
          at,
          route: laid.data[o + 12] ?? 0,
          // The lead is TRACED times the brightest of the rest, dimmed behind words and between stacked panels.
          colour: css(
            mixed(warmth),
            Math.min(1, (leads ? 0.5 * SHAPE.traced : own) * light) * behindCopy(laid, at),
          ),
        }
      })
      // Neighbouring pieces share their end point, so the thread runs on unbroken. Each piece's colour runs along its
      // chord, with a stop at each end. Each piece is drawn at one light as the tip fades the cord, so pieces are
      // short, a small step of the fade apiece, and each thread's start at a different sample, so no steps line up
      // across the cord.
      const shift = (i * 7) % STILL_PIECE
      const starts = [
        0,
        ...Array.from(
          { length: Math.ceil(points.length / STILL_PIECE) },
          (_, n) => shift + n * STILL_PIECE,
        ),
      ].filter(
        (start, n, all) => start < points.length - 1 && (n === 0 || start > (all[n - 1] ?? -1)),
      )
      return starts.map((start, n) => {
        const run = points.slice(start, (starts[n + 1] ?? points.length - 1) + 1)
        const [x0, y0] = run[0]?.at ?? [0, 0]
        const [x1, y1] = run.at(-1)?.at ?? [0, 0]
        const length = (x1 - x0) ** 2 + (y1 - y0) ** 2 || 1
        const style = context.createLinearGradient(x0, y0, x1, y1)
        const path = new Path2D()
        for (const [k, { at, colour }] of run.entries()) {
          const [x, y] = at
          k === 0 ? path.moveTo(x, y) : path.lineTo(x, y)
          if (k !== 0 && k !== run.length - 1) continue
          const along = ((x - x0) * (x1 - x0) + (y - y0) * (y1 - y0)) / length
          style.addColorStop(Math.min(1, Math.max(0, along)), colour)
        }
        const heights = run.map(({ at }) => at[1])
        const route = run[Math.floor(run.length / 2)]?.route ?? 0
        return { top: Math.min(...heights), bottom: Math.max(...heights), route, path, style }
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
      const bottom = view.top + canvas.height / dpr
      context.setTransform(dpr, 0, 0, dpr, -view.left * dpr, -view.top * dpr)
      context.clearRect(view.left, view.top, width, canvas.height / dpr)
      context.save()
      context.globalCompositeOperation = 'lighter'
      context.lineWidth = 0.8
      // Each piece fades out over FADE along the route above the tip, as the GPU's strands do.
      for (const piece of pieces) {
        if (piece.bottom < view.top || piece.top > bottom || piece.route > view.tip) continue
        const t = Math.min(1, Math.max(0, (view.tip - piece.route) / FADE))
        context.globalAlpha = t * t * (3 - 2 * t)
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
