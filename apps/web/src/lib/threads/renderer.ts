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
import {
  BLOOM_SCALE,
  bloomWgsl,
  blurFragmentGlsl,
  screenVertexGlsl,
  shrinkFragmentGlsl,
  threadFragmentGlsl,
  threadVertexGlsl,
  threadWgsl,
  toneFragmentGlsl,
  toneWgsl,
  UNIFORM_VEC4S,
  VERTICES_PER_THREAD,
} from './shaders'

/** The colours a field draws with, read from the page's tokens: the two thread colours and the ink behind them. */
export interface Palette {
  readonly threads: readonly [violet: RGB, amber: RGB]
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
const EXPOSURE = 1.45

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

/** The bloom target's size in pixels, for a canvas: a fixed fraction of its CSS size. */
const bloomSize = (canvas: HTMLCanvasElement) =>
  [
    Math.max(1, Math.round(canvas.clientWidth * BLOOM_SCALE)),
    Math.max(1, Math.round(canvas.clientHeight * BLOOM_SCALE)),
  ] as const

type Size = { readonly width: number; readonly height: number }
/**
 * Whether targets made earlier no longer fit `canvas`: its device size changed, or its CSS size did, which sizes the
 * bloom. Zooming the page can change the second alone.
 */
const resized = (canvas: HTMLCanvasElement, light: Size | undefined, glow: Size | undefined) => {
  const [width, height] = bloomSize(canvas)
  return (
    light?.width !== canvas.width ||
    light.height !== canvas.height ||
    glow?.width !== width ||
    glow.height !== height
  )
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
  const bloomModule = gpu.createShaderModule({ code: bloomWgsl })
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
  /** A pass that covers its whole target with one triangle, as every pass after the threads does. */
  const screen = (module: GPUShaderModule, entryPoint: string, target: GPUTextureFormat) =>
    gpu.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint, targets: [{ format: target }] },
      primitive: { topology: 'triangle-list' },
    })
  const shrink = screen(bloomModule, 'shrink', HDR)
  const across = screen(bloomModule, 'across', HDR)
  const down = screen(bloomModule, 'down', HDR)
  const tone = screen(toneModule, 'fs', format)
  const filtering = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear' })
  const uniforms = gpu.createBuffer({
    size: UNIFORM_VEC4S * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  const threadBindings = gpu.createBindGroup({
    layout: threads.getBindGroupLayout(0),
    entries: [{ binding: 0, resource: { buffer: uniforms } }],
  })

  const texture = (width: number, height: number) =>
    gpu.createTexture({
      size: [width, height],
      format: HDR,
      usage: GPUTextureUsage.RENDER_ATTACHMENT | GPUTextureUsage.TEXTURE_BINDING,
    })
  const sampling = (pipeline: GPURenderPipeline, source: GPUTexture) =>
    gpu.createBindGroup({
      layout: pipeline.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: source.createView() },
        { binding: 1, resource: filtering },
      ],
    })

  type Targets = ReturnType<typeof targets>
  /**
   * The half-float target the threads add into, and two small ones the bloom blurs between, with every pass's
   * bindings. Remade when the canvas changes size.
   */
  const targets = () => {
    const light = texture(canvas.width, canvas.height)
    const [width, height] = bloomSize(canvas)
    const glow = texture(width, height)
    const blurred = texture(width, height)
    return {
      light,
      glow,
      blurred,
      shrink: sampling(shrink, light),
      across: sampling(across, glow),
      down: sampling(down, blurred),
      tone: gpu.createBindGroup({
        layout: tone.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: light.createView() },
          { binding: 2, resource: glow.createView() },
          { binding: 3, resource: filtering },
        ],
      }),
    }
  }
  let current: Targets | undefined
  const sized = () => {
    if (current && !resized(canvas, current.light, current.glow)) return current
    for (const old of [current?.light, current?.glow, current?.blurred]) old?.destroy()
    current = targets()
    return current
  }

  const run = (
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    bindings: GPUBindGroup,
    into: GPUTextureView,
    count = 3,
    instances = 1,
  ) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        { view: into, loadOp: 'clear', storeOp: 'store', clearValue: [0, 0, 0, 0] },
      ],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindings)
    pass.draw(count, instances)
    pass.end()
  }

  return {
    kind: 'webgpu',
    lost: gpu.lost,
    draw(field, palette, time) {
      const t = sized()
      gpu.queue.writeBuffer(uniforms, 0, pack(canvas, field, palette, time))
      const encoder = gpu.createCommandEncoder()
      run(encoder, threads, threadBindings, t.light.createView(), VERTICES_PER_THREAD, field.count)
      run(encoder, shrink, t.shrink, t.glow.createView())
      run(encoder, across, t.across, t.blurred.createView())
      run(encoder, down, t.down, t.glow.createView())
      run(encoder, tone, t.tone, context.getCurrentTexture().createView())
      gpu.queue.submit([encoder.finish()])
    },
    destroy() {
      for (const old of [current?.light, current?.glow, current?.blurred]) old?.destroy()
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
  // Half-float targets need this; without it the threads add straight onto the canvas, unbloomed, and clip instead of
  // tone-mapping.
  const float = gl.getExtension('EXT_color_buffer_float') !== null
  const threads = compile(gl, threadVertexGlsl, threadFragmentGlsl)
  const threadUniforms = gl.getUniformLocation(threads, 'U')
  /** A full-screen pass's program, with its samplers bound to texture units 0, 1, … in the order named. */
  const pass = (fragment: string, samplers: ReadonlyArray<string>) => {
    const program = compile(gl, screenVertexGlsl, fragment)
    gl.useProgram(program)
    for (const [unit, name] of samplers.entries())
      gl.uniform1i(gl.getUniformLocation(program, name), unit)
    return program
  }
  const passes = float
    ? {
        shrink: pass(shrinkFragmentGlsl, ['source']),
        blur: pass(blurFragmentGlsl, ['source']),
        tone: pass(toneFragmentGlsl, ['light', 'bloom']),
      }
    : undefined
  const blurDirection = passes && gl.getUniformLocation(passes.blur, 'direction')
  const toneUniforms = passes && gl.getUniformLocation(passes.tone, 'U')
  const vao = gl.createVertexArray()

  /** A half-float texture with its framebuffer, filtered so the bloom can sample between its pixels. */
  const surface = (width: number, height: number) => {
    const texture = gl.createTexture()
    gl.bindTexture(gl.TEXTURE_2D, texture)
    gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA16F, width, height)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE)
    gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE)
    const framebuffer = gl.createFramebuffer()
    gl.bindFramebuffer(gl.FRAMEBUFFER, framebuffer)
    gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0)
    return { texture, framebuffer, width, height }
  }
  type Surface = ReturnType<typeof surface>
  let light: Surface | undefined
  let glow: Surface | undefined
  let blurred: Surface | undefined
  const resize = () => {
    if (!resized(canvas, light, glow)) return
    for (const old of [light, glow, blurred]) {
      if (!old) continue
      gl.deleteTexture(old.texture)
      gl.deleteFramebuffer(old.framebuffer)
    }
    const [width, height] = bloomSize(canvas)
    light = surface(canvas.width, canvas.height)
    glow = surface(width, height)
    blurred = surface(width, height)
  }

  /** Draws the program in use over all of `into` (the canvas when undefined), sampling `sources` on units 0, 1, … */
  const screen = (into: Surface | undefined, sources: ReadonlyArray<Surface>) => {
    gl.bindFramebuffer(gl.FRAMEBUFFER, into?.framebuffer ?? null)
    gl.viewport(0, 0, into?.width ?? canvas.width, into?.height ?? canvas.height)
    for (const [unit, from] of sources.entries()) {
      gl.activeTexture(gl.TEXTURE0 + unit)
      gl.bindTexture(gl.TEXTURE_2D, from.texture)
    }
    gl.drawArrays(gl.TRIANGLES, 0, 3)
  }

  return {
    kind: 'webgl2',
    draw(field, palette, time) {
      if (passes) resize()
      const uniforms = pack(canvas, field, palette, time)
      gl.bindVertexArray(vao)
      gl.bindFramebuffer(gl.FRAMEBUFFER, light?.framebuffer ?? null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      const [r, g, b] = passes ? [0, 0, 0] : palette.background
      gl.clearColor(r, g, b, 1)
      gl.clear(gl.COLOR_BUFFER_BIT)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      gl.useProgram(threads)
      gl.uniform4fv(threadUniforms, uniforms)
      gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, VERTICES_PER_THREAD, field.count)
      gl.disable(gl.BLEND)
      if (!passes || !light || !glow || !blurred) return

      gl.useProgram(passes.shrink)
      screen(glow, [light])
      gl.useProgram(passes.blur)
      gl.uniform2f(blurDirection ?? null, 1, 0)
      screen(blurred, [glow])
      gl.uniform2f(blurDirection ?? null, 0, 1)
      screen(glow, [blurred])
      gl.useProgram(passes.tone)
      gl.uniform4fv(toneUniforms ?? null, uniforms)
      screen(undefined, [light, glow])
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
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
        const alpha = 0.8 * brightness(field, i) * field.intensity
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
          stroke(i, s, to, colour, braided ? alpha * BRAID_STILL : alpha)
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
