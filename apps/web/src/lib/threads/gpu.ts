import {
  BLOOM_LEVELS,
  BLOOM_SCALE,
  bloomWgsl,
  downFragmentGlsl,
  screenVertexGlsl,
  shrinkFragmentGlsl,
  threadFragmentGlsl,
  toneFragmentGlsl,
  toneOverFragmentGlsl,
  toneWgsl,
  upFragmentGlsl,
} from './shaders'

/**
 * The GPU pipeline every thread renderer shares: threads add their light into a half-float target, the bloom spreads a
 * share of it as glare through a chain of ever smaller targets (see shaders.ts), and the tone pass maps both onto the
 * canvas, over its own ink or, for a `Scene` drawn `over` the page, as premultiplied light on a transparent canvas. A
 * `Scene` brings the thread pass's shaders; a `Painter` runs them, in WebGPU or WebGL2.
 */
export interface Scene {
  /** The thread pass's WGSL module: `vs` and `fs`, reading the uniforms at binding 0 and any `data` at binding 1. */
  readonly wgsl: string
  /** The thread pass's GLSL vertex shader, reading the uniforms `U` and any `data` as the sampler `data`. */
  readonly glsl: string
  /** How many vec4 uniforms the scene packs. */
  readonly vec4s: number
  /** Whether the canvas is transparent, its light laid over the page, rather than painted on its own ink. */
  readonly over: boolean
  /** Whether the thread pass reads a float texture (`Painter.upload`). */
  readonly data: boolean
}

/** A scene's pipeline on one canvas, already sized in device pixels. */
export interface Painter {
  readonly kind: 'webgpu' | 'webgl2'
  /**
   * Draws a frame: `instances` threads of `vertices` vertices each, with these uniforms. Off-screen targets follow the
   * canvas's size.
   */
  paint(uniforms: Float32Array, vertices: number, instances: number): void
  /** Replaces the scene's data texture: `width` × `height` RGBA float texels. */
  upload(data: Float32Array, width: number, height: number): void
  destroy(): void
  /** Settles when the painter can no longer draw, as when the browser resets the GPU. */
  readonly lost?: Promise<unknown>
}

/**
 * A bloom target's size in pixels, for a canvas: the first `level` a fixed fraction of its CSS size, each next one half
 * the one before.
 */
const bloomSize = (canvas: HTMLCanvasElement, level: number) => {
  const scale = BLOOM_SCALE / 2 ** level
  return [
    Math.max(1, Math.round(canvas.clientWidth * scale)),
    Math.max(1, Math.round(canvas.clientHeight * scale)),
  ] as const
}
const LEVELS = Array.from({ length: BLOOM_LEVELS }, (_, level) => level)

type Size = { readonly width: number; readonly height: number }
/**
 * Whether targets made earlier no longer fit `canvas`: its device size changed, or its CSS size did, which sizes the
 * bloom. Zooming the page can change the second alone.
 */
const resized = (canvas: HTMLCanvasElement, light: Size | undefined, glow: Size | undefined) => {
  const [width, height] = bloomSize(canvas, 0)
  return (
    light?.width !== canvas.width ||
    light.height !== canvas.height ||
    glow?.width !== width ||
    glow.height !== height
  )
}

let gpuDevice: Promise<GPUDevice | undefined> | undefined

/**
 * One device for every canvas on the page, until it is lost; the next painter to start asks for a new one. Undefined
 * when the browser has no WebGPU or no adapter.
 */
const device = () => {
  if (gpuDevice) return gpuDevice
  const requested = (async () => {
    if (!('gpu' in navigator)) return undefined
    const adapter = await navigator.gpu.requestAdapter({ powerPreference: 'high-performance' })
    const gpu = await adapter?.requestDevice()
    gpu?.addEventListener('uncapturederror', (event) =>
      // biome-ignore lint/suspicious/noConsole: the page keeps working without the threads; the console is where a failed effect gets reported.
      console.error('The threads’ GPU work failed.', event.error.message),
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

export async function webgpuPainter(
  canvas: HTMLCanvasElement,
  scene: Scene,
): Promise<Painter | undefined> {
  const gpu = await device()
  // Only with a device: asking for the context claims the canvas, which would leave no fallback.
  if (!gpu) return undefined
  const context = canvas.getContext('webgpu')
  if (!context) return undefined
  const format = navigator.gpu.getPreferredCanvasFormat()
  context.configure({ device: gpu, format, alphaMode: scene.over ? 'premultiplied' : 'opaque' })

  const threadModule = gpu.createShaderModule({ code: scene.wgsl })
  const bloomModule = gpu.createShaderModule({ code: bloomWgsl })
  const toneModule = gpu.createShaderModule({ code: toneWgsl })
  /** Light adds where it overlaps. */
  const adding: GPUBlendState = {
    color: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
    alpha: { srcFactor: 'one', dstFactor: 'one', operation: 'add' },
  }
  const threads = gpu.createRenderPipeline({
    layout: 'auto',
    vertex: { module: threadModule, entryPoint: 'vs' },
    fragment: { module: threadModule, entryPoint: 'fs', targets: [{ format: HDR, blend: adding }] },
    primitive: { topology: 'triangle-strip' },
  })
  /** A pass that covers its whole target with one triangle, as every pass after the threads does. */
  const screen = (
    module: GPUShaderModule,
    entryPoint: string,
    target: GPUTextureFormat,
    blend?: GPUBlendState,
  ) =>
    gpu.createRenderPipeline({
      layout: 'auto',
      vertex: { module, entryPoint: 'vs' },
      fragment: { module, entryPoint, targets: [{ format: target, blend }] },
      primitive: { topology: 'triangle-list' },
    })
  const shrink = screen(bloomModule, 'shrink', HDR)
  const down = screen(bloomModule, 'down', HDR)
  const up = screen(bloomModule, 'up', HDR, adding)
  const tone = screen(toneModule, scene.over ? 'over' : 'fs', format)
  const filtering = gpu.createSampler({ magFilter: 'linear', minFilter: 'linear' })
  const uniforms = gpu.createBuffer({
    size: scene.vec4s * 16,
    usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST,
  })
  let data: GPUTexture | undefined
  let threadBindings: GPUBindGroup | undefined
  const bindThreads = () => {
    threadBindings = gpu.createBindGroup({
      layout: threads.getBindGroupLayout(0),
      entries: [
        { binding: 0, resource: { buffer: uniforms } },
        ...(data ? [{ binding: 1, resource: data.createView() }] : []),
      ],
    })
  }
  if (!scene.data) bindThreads()

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
   * The half-float target the threads add into, and the bloom's levels, with every pass's bindings. Remade when the
   * canvas changes size.
   */
  const targets = () => {
    const light = texture(canvas.width, canvas.height)
    const level = (k: number) => {
      const target = texture(...bloomSize(canvas, k))
      return { texture: target, view: target.createView() }
    }
    const first = level(0)
    const levels = [first, ...LEVELS.slice(1).map(level)]
    // Each level from the one above it, then, from the smallest up, each level's light added into the one above.
    const pairs = levels.flatMap((above, k) => {
      const below = levels[k + 1]
      return below ? [{ above, below }] : []
    })
    const bloom = [
      ...pairs.map(({ above, below }) => ({
        pipeline: down,
        bindings: sampling(down, above.texture),
        into: below.view,
        load: false,
      })),
      ...pairs.reverse().map(({ above, below }) => ({
        pipeline: up,
        bindings: sampling(up, below.texture),
        into: above.view,
        load: true,
      })),
    ]
    return {
      light,
      glow: first,
      levels: levels.map(({ texture }) => texture),
      shrink: sampling(shrink, light),
      bloom,
      tone: gpu.createBindGroup({
        layout: tone.getBindGroupLayout(0),
        entries: [
          { binding: 0, resource: { buffer: uniforms } },
          { binding: 1, resource: light.createView() },
          { binding: 2, resource: first.view },
          { binding: 3, resource: filtering },
        ],
      }),
    }
  }
  let current: Targets | undefined
  const sized = () => {
    if (current && !resized(canvas, current.light, current.glow.texture)) return current
    for (const old of [current?.light, ...(current?.levels ?? [])]) old?.destroy()
    current = targets()
    return current
  }

  /** Runs `pipeline` into `into`, clearing it first, or adding to what it holds when `load`. */
  const run = (
    encoder: GPUCommandEncoder,
    pipeline: GPURenderPipeline,
    bindings: GPUBindGroup,
    into: GPUTextureView,
    { count = 3, instances = 1, load = false } = {},
  ) => {
    const pass = encoder.beginRenderPass({
      colorAttachments: [
        {
          view: into,
          loadOp: load ? 'load' : 'clear',
          storeOp: 'store',
          clearValue: [0, 0, 0, 0],
        },
      ],
    })
    pass.setPipeline(pipeline)
    pass.setBindGroup(0, bindings)
    if (count > 0 && instances > 0) pass.draw(count, instances)
    pass.end()
  }

  return {
    kind: 'webgpu',
    lost: gpu.lost,
    paint(packed, vertices, instances) {
      if (!threadBindings) return
      const t = sized()
      gpu.queue.writeBuffer(uniforms, 0, packed)
      const encoder = gpu.createCommandEncoder()
      run(encoder, threads, threadBindings, t.light.createView(), { count: vertices, instances })
      run(encoder, shrink, t.shrink, t.glow.view)
      for (const { pipeline, bindings, into, load } of t.bloom)
        run(encoder, pipeline, bindings, into, { load })
      run(encoder, tone, t.tone, context.getCurrentTexture().createView())
      gpu.queue.submit([encoder.finish()])
    },
    upload(values, width, height) {
      data?.destroy()
      data = gpu.createTexture({
        size: [width, height],
        format: 'rgba32float',
        usage: GPUTextureUsage.TEXTURE_BINDING | GPUTextureUsage.COPY_DST,
      })
      gpu.queue.writeTexture({ texture: data }, values, { bytesPerRow: width * 16 }, [
        width,
        height,
      ])
      bindThreads()
    },
    destroy() {
      for (const old of [current?.light, ...(current?.levels ?? []), data]) old?.destroy()
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

export function webgl2Painter(canvas: HTMLCanvasElement, scene: Scene): Painter | undefined {
  const gl = canvas.getContext('webgl2', {
    alpha: scene.over,
    antialias: false,
    depth: false,
    premultipliedAlpha: true,
    powerPreference: 'high-performance',
  })
  if (!gl) return undefined
  // Half-float targets need this; without it the threads add straight onto the canvas, unbloomed, and clip instead of
  // tone-mapping.
  const float = gl.getExtension('EXT_color_buffer_float') !== null
  const threads = compile(gl, scene.glsl, threadFragmentGlsl)
  const threadUniforms = gl.getUniformLocation(threads, 'U')
  gl.useProgram(threads)
  gl.uniform1i(gl.getUniformLocation(threads, 'data'), 0)
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
        down: pass(downFragmentGlsl, ['source']),
        up: pass(upFragmentGlsl, ['source']),
        tone: pass(scene.over ? toneOverFragmentGlsl : toneFragmentGlsl, ['light', 'bloom']),
      }
    : undefined
  const toneUniforms = passes && gl.getUniformLocation(passes.tone, 'U')
  const vao = gl.createVertexArray()
  let data: WebGLTexture | undefined

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
  /** The bloom's levels, largest first. */
  let levels: Surface[] = []
  const resize = () => {
    if (!resized(canvas, light, levels[0])) return
    for (const old of [light, ...levels]) {
      if (!old) continue
      gl.deleteTexture(old.texture)
      gl.deleteFramebuffer(old.framebuffer)
    }
    light = surface(canvas.width, canvas.height)
    levels = LEVELS.map((level) => surface(...bloomSize(canvas, level)))
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
    paint(uniforms, vertices, instances) {
      if (passes) resize()
      gl.bindVertexArray(vao)
      gl.bindFramebuffer(gl.FRAMEBUFFER, light?.framebuffer ?? null)
      gl.viewport(0, 0, canvas.width, canvas.height)
      // Unbloomed, the threads add straight onto the canvas: over its ink, or over nothing when it lies over the page.
      const ink = passes || scene.over ? [0, 0, 0, 0] : [...uniforms.slice(40, 43), 1]
      gl.clearColor(ink[0] ?? 0, ink[1] ?? 0, ink[2] ?? 0, ink[3] ?? 0)
      gl.clear(gl.COLOR_BUFFER_BIT)
      if (vertices > 0 && instances > 0) {
        gl.enable(gl.BLEND)
        gl.blendFunc(gl.ONE, gl.ONE)
        gl.useProgram(threads)
        gl.uniform4fv(threadUniforms, uniforms)
        gl.activeTexture(gl.TEXTURE0)
        gl.bindTexture(gl.TEXTURE_2D, data ?? null)
        gl.drawArraysInstanced(gl.TRIANGLE_STRIP, 0, vertices, instances)
        gl.disable(gl.BLEND)
      }
      const [glow] = levels
      if (!passes || !light || !glow) return

      gl.useProgram(passes.shrink)
      screen(glow, [light])
      // Each level from the one above it, then, from the smallest up, each level's light added into the one above.
      gl.useProgram(passes.down)
      for (const [k, below] of levels.entries()) {
        const above = levels[k - 1]
        if (above) screen(below, [above])
      }
      gl.useProgram(passes.up)
      gl.enable(gl.BLEND)
      gl.blendFunc(gl.ONE, gl.ONE)
      for (const [k, above] of [...levels.entries()].reverse()) {
        const below = levels[k + 1]
        if (below) screen(above, [below])
      }
      gl.disable(gl.BLEND)
      gl.useProgram(passes.tone)
      gl.uniform4fv(toneUniforms ?? null, uniforms)
      screen(undefined, [light, glow])
    },
    upload(values, width, height) {
      if (data) gl.deleteTexture(data)
      data = gl.createTexture() ?? undefined
      gl.activeTexture(gl.TEXTURE0)
      gl.bindTexture(gl.TEXTURE_2D, data ?? null)
      gl.texStorage2D(gl.TEXTURE_2D, 1, gl.RGBA32F, width, height)
      gl.texSubImage2D(gl.TEXTURE_2D, 0, 0, 0, width, height, gl.RGBA, gl.FLOAT, values)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.NEAREST)
      gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.NEAREST)
    },
    destroy() {
      gl.getExtension('WEBGL_lose_context')?.loseContext()
    },
  }
}
