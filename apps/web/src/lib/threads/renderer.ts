import { type Field, MAX_LABELS, position, SEGMENTS, tint } from './geometry'
import {
  threadFragmentGlsl,
  threadVertexGlsl,
  threadWgsl,
  toneFragmentGlsl,
  toneVertexGlsl,
  toneWgsl,
  UNIFORM_VEC4S,
  VERTICES_PER_THREAD,
} from './shaders'

/** The colours a field draws with, read from the page's tokens: three thread colours and the ink behind them. */
export interface Palette {
  readonly threads: readonly [violet: RGB, amber: RGB, silver: RGB]
  readonly background: RGB
}
export type RGB = readonly [r: number, g: number, b: number]

/** A field drawn on one canvas. `draw` renders a frame at `time` seconds; the canvas is already sized in device pixels. */
export interface Renderer {
  readonly kind: 'webgpu' | 'webgl2' | '2d'
  draw(field: Field, palette: Palette, time: number): void
  destroy(): void
  /** Settles when the renderer can no longer draw, as when the browser resets the GPU; the field then starts over. */
  readonly lost?: Promise<unknown>
}

/** How much light the tone map lets through: higher is brighter, saturating sooner. */
const EXPOSURE = 1.25

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
  u.set([...palette.background, EXPOSURE], 44)
  return u
}

let gpuDevice: Promise<GPUDevice | undefined> | undefined

/**
 * One device for every field on the page, until it is lost; the next field to start asks for a new one. Undefined when
 * the browser has no WebGPU or no adapter.
 */
const device = () => {
  if (gpuDevice) return gpuDevice
  const requested = (async () => {
    if (!('gpu' in navigator)) return undefined
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    const gpu = await adapter?.requestDevice()
    gpu?.addEventListener('uncapturederror', (event) =>
      // biome-ignore lint/suspicious/noConsole: the page keeps working without the field; the console is where a failed effect gets reported.
      console.error('The thread field’s GPU work failed.', event.error.message),
    )
    void gpu?.lost.then(() => {
      if (gpuDevice === requested) gpuDevice = undefined
    })
    return gpu
  })().catch(() => undefined)
  gpuDevice = requested
  return requested
}

const HDR: GPUTextureFormat = 'rgba16float'

export async function webgpu(canvas: HTMLCanvasElement): Promise<Renderer | undefined> {
  const gpu = await device()
  // Only with a device: asking for the context claims the canvas, which would leave no fallback.
  if (!gpu) return undefined
  const context = canvas.getContext('webgpu')
  if (!context) return undefined
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device: gpu, format, alphaMode: 'opaque' })

  const threadModule = gpu.createShaderModule({ code: threadWgsl })
  const toneModule = gpu.createShaderModule({ code: toneWgsl })
  const threads = gpu.createRenderPipeline({
    layout: 'auto',
    vertex: { module: threadModule, entryPoint: 'vs' },
    fragment: {
      module: threadModule,
      entryPoint: 'fs',
      targets: [
        {
          format: HDR,
          blend: {
            color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
            alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
          },
        },
      ],
    },
    primitive: { topology: 'triangle-strip' },
  })
  const tone = gpu.createRenderPipeline({
    layout: 'auto',
    vertex: { module: toneModule, entryPoint: 'vs' },
    fragment: { module: toneModule, entryPoint: 'fs', targets: [{ format }] },
    primitive: { topology: 'triangle-list' },
  })
  const uniforms = gpu.createBuffer({
    size: UNIFORM_VEC4S * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const threadBindings = gpu.createBindGroup({
    layout: threads.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms } }],
  })

  let light: { texture: GPUTexture; view: GPUTextureView; tone: GPUBindGroup } | undefined
  /** The half-float target the threads add into, remade when the canvas changes size. */
  const target = () => {
    if (light && light.texture.width === canvas.width && light.texture.height === canvas.height)
      return light
    light?.texture.destroy()
    const texture = gpu.createTexture({
      size: [canvas.width, canvas.height],
      format: HDR,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
    const view = texture.createView()
    light = {
      texture,
      view,
      tone: gpu.createBindGroup({
        layout: tone.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: view },
        ],
      }),
    }
    return light
  }

  return {
    kind: 'webgpu',
    lost: gpu.lost,
    draw(field, palette, time) {
      const { view, tone: toneBindings } = target()
      gpu.queue.writeBuffer(uniforms, 0, pack(canvas, field, palette, time))
      const encoder = gpu.createCommandEncoder()
      const add = encoder.beginRenderPass({
        colorAttachments: [{ view, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] }],
      })
      add.setPipeline(threads)
      add.setBindGroup(0, threadBindings)
      add.draw(VERTICES_PER_THREAD, field.count)
      add.end()
      const map = encoder.beginRenderPass({
        colorAttachments: [
          { view: context.getCurrentTexture().createView(), loadOp: 'clear', storeOp: 'store' },
        ],
      })
      map.setPipeline(tone)
      map.setBindGroup(0, toneBindings)
      map.draw(3)
      map.end()
      gpu.queue.submit([encoder.finish()])
    },
    destroy() {
      light?.texture.destroy()
      uniforms.destroy()
      context.unconfigure()
    },
  }
}

const compile = (gl: WebGL2RenderingContext, vertex: string, fragment: string) => {
  const program = gl.createProgram()
  for (const [type, source] of [
    [gl.VERTEX_SHADER, vertex],
    [gl.FRAGMENT_SHADER, fragment],
  ] as const) {
    const shader = gl.createShader(type)
    if (!shader) throw new Error('WebGL2 could not create a shader.')
    gl.shaderSource(shader, source)
    gl.compileShader(shader)
    if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS))
      throw new Error(gl.getShaderInfoLog(shader) ?? 'A thread shader did not compile.')
    gl.attachShader(program, shader)
  }
  gl.linkProgram(program)
  if (!gl.getProgramParameter(program, gl.LINK_STATUS))
    throw new Error(gl.getProgramInfoLog(program) ?? 'The thread shaders did not link.')
  return program
}

export function webgl2(canvas: HTMLCanvasElement): Renderer | undefined {
  const gl = canvas.getContext('webgl2', {
    alpha: false,
    antialias: false,
    depth: false,
    premultipliedAlpha: false,
    powerPreference: 'high-performance',
  })
  if (!gl) return undefined
  // Half-float targets need this; without it the threads add straight onto the canvas and clip instead of tone-mapping.
  const float = gl.getExtension('EXT_color_buffer_float') !== null
  const threads = compile(gl, threadVertexGlsl, threadFragmentGlsl)
  const tone = float ? compile(gl, toneVertexGlsl, toneFragmentGlsl) : undefined
  const threadUniforms = gl.getUniformLocation(threads, 'U')
  const toneUniforms = tone && gl.getUniformLocation(tone, 'U')
  const toneLight = tone && gl.getUniformLocation(tone, 'light')
  const vao = gl.createVertexArray()

  let light: WebGLTexture | undefined
  let framebuffer: WebGLFramebuffer | undefined
  let size = ''
  const target = () => {
    if (!float || size === `${canvas.width}x${canvas.height}`) return
    size = `${canvas.width}x${canvas.height}`
    if (light) gl.deleteTexture(light)
    if (framebuffer) gl.deleteFramebuffer(framebuffer)
    light = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, light)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, canvas.width, canvas.height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, light, 0)
  }

  return {
    kind: 'webgl2',
    draw(field, palette, time) {
      target()
      const uniforms = pack(canvas, field, palette, time)
      gl.viewport(0, 0, canvas.width, canvas.height)
      gl.bindVertexArray(vao)

      gl.bindFramebuffer(gl.FRAMEBUFFER, float ? (framebuffer ?? null) : null)
      const [r, g, b] = float ? [0, 0, 0] : palette.background
      gl.clearColor(r, g, b, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.useProgram(threads)
      gl.uniform4fv(threadUniforms, uniforms)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, VERTICES_PER_THREAD, field.count)
      gl.disable(gl.BLEND)
      if (!tone) return

      gl.bindFramebuffer(gl.FRAMEBUFFER, null)
      gl.useProgram(tone)
      gl.uniform4fv(toneUniforms ?? null, uniforms)
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, light ?? null)
      gl.uniform1i(toneLight ?? null, 0)
      gl.drawArrays(gl.TRIANGLES, 0, 3)
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}

/** Points per thread in the 2D fallback, and how many threads it draws at most: one still frame, drawn once. */
const STILL_SEGMENTS = SEGMENTS / 2
const STILL_THREADS = 320

/** The fallback without a GPU: the same field, as one still frame of canvas 2D strokes. */
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
      context.lineWidth = 0.8
      const count = Math.min(field.count, STILL_THREADS)
      for (let i = 0; i < count; i++) {
        const { colour, brightness } = tint(field, i)
        context.strokeStyle = css(
          palette.threads[colour] ?? palette.threads[0],
          0.55 * brightness * field.intensity,
        )
        context.beginPath()
        for (let s = 0; s <= STILL_SEGMENTS; s++) {
          const [x, y] = position(field, i, s / STILL_SEGMENTS, time)
          if (s === 0) context.moveTo(x, y)
          else context.lineTo(x, y)
        }
        context.stroke()
      }
    },
    destroy() {},
  }
}
