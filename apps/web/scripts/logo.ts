// Renders Textile's mark, the trefoil, into static/icons/<size>.png: the favicons, the touch and manifest icons, and
// the header's mark; social.png, a padded avatar for social profiles, and social.gif, the same avatar animated for the
// Discord server (see `tails` in src/lib/threads/trefoil.ts); and banner.png, a profile header of the hero's threads
// beside its headline, also drawn at 1200×630 as static/og.png, the card social sites show for every page. It captures the study page (src/routes/dev/trefoil) on the site's ink, as the 1024 page at 2×
// pixel density, so every pixel of glow is the browser's own, then downsizes it the way Ditherette's
// lanczos3-scale-aware does: a Lanczos-3 kernel stretched by the scale factor, in linear light, so thin bright fibres
// average as light does instead of darkening. Sizes of 64 and below start from a capture with a thicker band, and
// smaller sizes get a little more light, for what fine glow loses averaged into few pixels.
//
// Needs the dev server running (`pnpm dev`; `LOGO_URL` overrides its address) and Chromium on PATH (`CHROMIUM`
// overrides it), and ffmpeg for the GIF. Run with `pnpm logo` after changing the mark or the cord's shaders, and commit
// the images.
import { execFileSync, spawn } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { setTimeout as sleep } from 'node:timers/promises'
import { PNG } from 'pngjs'
import { MARK, SMALL_MARK, TAILS_SECONDS } from '../src/lib/threads/trefoil.ts'

const URL_BASE = process.env.LOGO_URL ?? 'http://localhost:5173'
const OUT = new URL('../static/icons/', import.meta.url)
/** The sizes static/ serves: favicons, the header's mark at 2×, the touch icon, and the manifest's. */
const SIZES = [16, 32, 48, 64, 128, 180, 192, 512]
/**
 * The favicons, drawn as little app icons on a rounded tile of ink, and how round its corners are, as a share of its
 * size. The touch and manifest icons stay square: the systems that show them round their corners themselves.
 */
const FAVICONS = [16, 32, 48]
const TILE_RADIUS = 0.22
/** Below this size, the mark starts from the thicker capture. */
const SMALL = 64
/** The thicker capture: the small mark's band and intensity (SMALL_MARK in src/lib/threads/trefoil.ts). */
const THICK = `&band=${SMALL_MARK.band}&intensity=${SMALL_MARK.intensity}`
/**
 * The favicons' capture: the small mark drawn smaller in its square (`fill`), its band shrunk with it, so it keeps its
 * look with clear ink between the knot and the tile's rounded edge.
 */
const TILE_FILL = 0.6
const TILE = `&fill=${TILE_FILL}&band=${(SMALL_MARK.band * TILE_FILL) / SMALL_MARK.fill}&intensity=${SMALL_MARK.intensity}`
/**
 * The social avatar, social.png: the full mark drawn smaller still in its square, its band shrunk with it, so a round
 * crop leaves a wide ring of ink around all three lobes.
 */
const SOCIAL_FILL = 0.55
const SOCIAL_SIZE = 1024
const SOCIAL = `&fill=${SOCIAL_FILL}&band=${(MARK.band * SOCIAL_FILL) / MARK.fill}`
/**
 * The animated avatar, social.gif: how long its loop is, its frames a second, how long its start cross-fades, its
 * size (the square Discord asks for a server icon).
 */
const LOOP = { seconds: TAILS_SECONDS, fps: 25, blend: 1, size: 512 }
/** The social banner, banner.png (src/routes/dev/banner), at a profile header's 3:1. */
const BANNER = [1500, 500] as const
/** The same banner as the social card, static/og.png, at the 1.91:1 social sites show. */
const CARD = [1200, 630] as const
/** The site's ink (src/lib/tokens.css): only light above it is brightened, so the ground stays the ink. */
const INK = '#07060c'

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const ink = [1, 3, 5].map((i) => toLinear(Number.parseInt(INK.slice(i, i + 2), 16) / 255))
/** Extra light for a size: none at 512 and up, half again at 16. */
const gain = (size: number) => 1 + 0.1 * Math.max(0, Math.log2(512 / size))

interface Image {
  readonly width: number
  readonly height: number
  readonly data: Float32Array
}

/** How many times a capture is tried: headless Chromium now and then shoots before the page's first frame. */
const ATTEMPTS = 4

/** The mark's study page at 1024, still, with `query`'s settings. */
const study = (query = '') => capture(`/dev/trefoil?size=1024&still${query}`, 1024, 1024)

const CHROMIUM = process.env.CHROMIUM ?? 'chromium'
const BROWSER = [
  '--headless=new',
  '--no-sandbox',
  '--hide-scrollbars',
  // The thread field's one still frame, at the moment its current looks settled.
  '--force-prefers-reduced-motion',
  '--force-device-scale-factor=2',
]
/** Software WebGL, so it renders the same on a machine without a GPU. */
const SOFTWARE = ['--use-angle=swiftshader', '--enable-unsafe-swiftshader']

/** Drawn, the threads light pixels far above the ink; a frame shot too early is ink all over. */
const drawn = (image: Image) => image.data.some((v) => v > 0.2)
const nothing = (path: string, tries: number) =>
  new Error(`${path} drew nothing in ${tries} tries. Is the dev server running at ${URL_BASE}?`)

/** A study page `width` by `height` CSS px, still, as a linear RGB image at 2× that. */
function capture(path: string, width: number, height: number): Image {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const dir = mkdtempSync(join(tmpdir(), 'textile-logo-'))
    const file = join(dir, 'shot.png')
    execFileSync(CHROMIUM, [
      ...BROWSER,
      ...SOFTWARE,
      `--window-size=${width},${height}`,
      '--virtual-time-budget=8000',
      `--screenshot=${file}`,
      `${URL_BASE}${path}`,
    ])
    const image = decode(readFileSync(file))
    rmSync(dir, { recursive: true })
    if (drawn(image)) return image
  }
  throw nothing(path, ATTEMPTS)
}

/**
 * The animated mark's frames: the study page at `path`, `width` by `height` CSS px, opened once in Chromium and driven
 * over its DevTools protocol, each of `frames` shown by the page's `showFrame` and shot, then handed to `keep`, so only
 * what it keeps of each stays in memory. One page for them all spares each frame the browser's start and the GPU's.
 *
 * Software GL takes seconds a frame. `LOGO_BROWSER`, the DevTools address of a headless Chromium already running on a
 * machine whose GPU it can screenshot (a Mac's, over SSH tunnels), renders them in moments.
 */
async function film<T>(
  path: string,
  width: number,
  height: number,
  frames: ReadonlyArray<readonly [phase: number, seconds: number]>,
  keep: (image: Image) => T,
) {
  const port = 9300 + Math.floor(Math.random() * 600)
  const address = process.env.LOGO_BROWSER ?? `http://127.0.0.1:${port}`
  const profile = mkdtempSync(join(tmpdir(), 'textile-film-'))
  const browser = process.env.LOGO_BROWSER
    ? undefined
    : spawn(
        CHROMIUM,
        [
          ...BROWSER,
          ...SOFTWARE,
          `--remote-debugging-port=${port}`,
          `--user-data-dir=${profile}`,
          'about:blank',
        ],
        { stdio: 'ignore' },
      )
  try {
    let page: { webSocketDebuggerUrl: string } | undefined
    for (let wait = 0; !page && wait < 50; wait++) {
      await sleep(200)
      const targets = await fetch(`${address}/json`)
        .then((r) => r.json() as Promise<{ type: string; webSocketDebuggerUrl: string }[]>)
        .catch(() => [])
      page = targets.find((t) => t.type === 'page')
    }
    if (!page) throw new Error(`Chromium at ${address} has no page to drive.`)
    const socket = new WebSocket(page.webSocketDebuggerUrl)
    await new Promise((open) => socket.addEventListener('open', open, { once: true }))
    const pending = new Map<number, (result: Record<string, unknown>) => void>()
    socket.addEventListener('message', ({ data }) => {
      const { id, result } = JSON.parse(String(data))
      pending.get(id)?.(result)
    })
    let id = 0
    const send = (method: string, params = {}) =>
      new Promise<Record<string, unknown>>((done) => {
        pending.set(++id, done)
        socket.send(JSON.stringify({ id, method, params }))
      })
    const evaluate = (expression: string) =>
      send('Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true })
    await send('Emulation.setDeviceMetricsOverride', {
      width,
      height,
      deviceScaleFactor: 2,
      mobile: false,
    })
    await send('Page.navigate', { url: `${URL_BASE}${path}` })
    for (let wait = 0; wait < 100; wait++) {
      const { result } = (await evaluate('typeof showFrame')) as { result?: { value?: string } }
      if (result?.value === 'function') break
      await sleep(100)
    }
    const kept: T[] = []
    for (const [phase, seconds] of frames) {
      let image: Image | undefined
      // The page draws once its GPU is ready, a moment after it loads: until then a frame is ink.
      for (let attempt = 1; !image; attempt++) {
        await evaluate(`showFrame(${phase}, ${seconds})`)
        const { data } = (await send('Page.captureScreenshot', { format: 'png' })) as {
          data: string
        }
        const shot = decode(Buffer.from(data, 'base64'))
        if (drawn(shot)) image = shot
        else if (attempt === ATTEMPTS) throw nothing(path, ATTEMPTS)
        else await sleep(1000)
      }
      kept.push(keep(image))
      process.stdout.write(`\rsocial.gif: frame ${kept.length} of ${frames.length}`)
    }
    process.stdout.write('\n')
    socket.close()
    return kept
  } finally {
    browser?.kill()
    rmSync(profile, { recursive: true, force: true })
  }
}

/** A PNG as a linear RGB image. */
function decode(file: Buffer): Image {
  const png = PNG.sync.read(file)
  const data = new Float32Array(png.width * png.height * 3)
  for (let i = 0; i < png.width * png.height; i++)
    for (let c = 0; c < 3; c++) data[i * 3 + c] = toLinear((png.data[i * 4 + c] ?? 0) / 255)
  return { width: png.width, height: png.height, data }
}

const lanczos = (x: number) => {
  if (x === 0) return 1
  if (Math.abs(x) >= 3) return 0
  const px = Math.PI * x
  return (3 * Math.sin(px) * Math.sin(px / 3)) / (px * px)
}

/**
 * One pass of the scale-aware kernel along each of `lines` rows `from` samples long, to `to` samples, written
 * transposed, so the same pass run again resizes the other axis and turns the image back upright.
 */
function pass(src: Float32Array, from: number, to: number, lines: number) {
  const scale = from / to
  const out = new Float32Array(to * lines * 3)
  for (let o = 0; o < to; o++) {
    const centre = (o + 0.5) * scale - 0.5
    const reach = 3 * Math.max(1, scale)
    const lo = Math.max(0, Math.ceil(centre - reach))
    const hi = Math.min(from - 1, Math.floor(centre + reach))
    const weights = Float64Array.from({ length: hi - lo + 1 }, (_, k) =>
      lanczos((lo + k - centre) / Math.max(1, scale)),
    )
    const sum = weights.reduce((a, b) => a + b, 0)
    // Indexed loops: this runs tens of millions of times an image, where an iterator costs seconds.
    for (let line = 0; line < lines; line++)
      for (let c = 0; c < 3; c++) {
        let acc = 0
        const first = (line * from + lo) * 3 + c
        for (let k = 0; k < weights.length; k++)
          acc += (src[first + k * 3] ?? 0) * (weights[k] ?? 0)
        out[(o * lines + line) * 3 + c] = acc / sum
      }
  }
  return out
}

/**
 * How much of a pixel at (x, y) a rounded square `size` across covers, its corners `radius` round: 1 inside, 0 outside,
 * and the share in between along its edge, so the corners are smooth at any size.
 */
function cover(x: number, y: number, size: number, radius: number) {
  const corner = (v: number) => Math.max(radius - (v + 0.5), v + 0.5 - (size - radius), 0)
  const dx = corner(x)
  const dy = corner(y)
  return Math.min(1, Math.max(0, radius - Math.hypot(dx, dy) + 0.5))
}

/** `image` resized to `width` by `height`, one axis and then the other. */
const resize = (image: Image, width: number, height: number) =>
  pass(pass(image.data, image.width, width, image.height), image.height, height, width)

/**
 * The image on the site's ink, `width` by `height`, or as a little app icon: the ink a rounded square with clear
 * corners, so a favicon stands on its own dark tile in a light browser too.
 */
function icon(image: Image, width: number, height = width, rounded = false) {
  const data = resize(image, width, height)
  const png = new PNG({ width, height })
  const extra = gain(Math.min(width, height))
  const radius = width * TILE_RADIUS
  for (let i = 0; i < width * height; i++) {
    for (let c = 0; c < 3; c++) {
      const base = ink[c] ?? 0
      const lit = base + Math.max(0, (data[i * 3 + c] ?? 0) - base) * extra
      png.data[i * 4 + c] = Math.round(toSrgb(Math.min(1, lit)) * 255)
    }
    const alpha = rounded ? cover(i % width, Math.floor(i / width), width, radius) : 1
    png.data[i * 4 + 3] = Math.round(alpha * 255)
  }
  return PNG.sync.write(png)
}

/**
 * The mark as light alone, for laying over other light, as the header lays it over the hero's threads: the light
 * above the ink, less the bloom's veil (the brightest it is along the square's edge, so the square vanishes), as a
 * transparent PNG that is as opaque as its brightest channel, the way the page's canvases lay their light.
 */
function light(image: Image, size: number) {
  const data = resize(image, size, size)
  const extra = gain(size)
  const above = (i: number, c: number) =>
    Math.max(0, (data[i * 3 + c] ?? 0) - (ink[c] ?? 0)) * extra
  const last = size - 1
  const border = Array.from({ length: size }, (_, at) => [
    at,
    last * size + at,
    at * size,
    at * size + last,
  ]).flat()
  /** The brightest a pixel's light is, in any channel. */
  const peak = (i: number) => Math.max(above(i, 0), above(i, 1), above(i, 2))
  const veil = Math.max(...border.map(peak))
  const png = new PNG({ width: size, height: size })
  for (let i = 0; i < size * size; i++) {
    // Fading out over the veil's own level: gone at the square's edge, whole by twice that, so the shaded strands
    // under the crossings keep their shape. All three channels alike, so the light keeps its hue.
    const t = Math.min(1, Math.max(0, (peak(i) - veil * 0.6) / veil))
    const keep = t * t * (3 - 2 * t)
    const shown = [0, 1, 2].map((c) => toSrgb(Math.min(1, above(i, c) * keep)))
    const alpha = Math.max(...shown)
    for (let c = 0; c < 3; c++)
      png.data[i * 4 + c] = Math.round((alpha > 0 ? (shown[c] ?? 0) / alpha : 0) * 255)
    png.data[i * 4 + 3] = Math.round(alpha * 255)
  }
  return PNG.sync.write(png)
}

/**
 * social.gif: the avatar looping, `LOOP.seconds` long at `LOOP.fps`, as the server icon Discord animates. Each frame is
 * the study page at its phase of the loop and that many seconds into the cord's motion. The fibres' motion doesn't
 * repeat, so the loop's first `LOOP.blend` seconds cross-fade, in linear light, from the frames one loop on into their
 * own: the last frame runs on into the first.
 */
async function animated() {
  const { seconds, fps, blend, size } = LOOP
  const frames = Math.round(seconds * fps)
  const extra = Math.round(blend * fps)
  const shots = await film(
    `/dev/trefoil?size=1024&still${SOCIAL}`,
    1024,
    1024,
    Array.from({ length: frames + extra }, (_, k) => [(k % frames) / frames, k / fps] as const),
    (shot): Image => ({ width: size, height: size, data: resize(shot, size, size) }),
  )
  const dir = mkdtempSync(join(tmpdir(), 'textile-loop-'))
  for (const [k, frame] of shots.slice(0, frames).entries()) {
    const later = shots[k + frames]
    if (later) {
      const t = k / extra
      const own = t * t * (3 - 2 * t)
      frame.data.forEach((v, i) => {
        frame.data[i] = v * own + (later.data[i] ?? 0) * (1 - own)
      })
    }
    writeFileSync(join(dir, `${String(k).padStart(4, '0')}.png`), icon(frame, size))
  }
  execFileSync('ffmpeg', [
    ...['-loglevel', 'error', '-y', '-framerate', String(fps)],
    ...['-i', join(dir, '%04d.png')],
    // One palette for the whole loop, so the ink and the colours hold still from frame to frame, and an ordered
    // dither: it keeps the dark glow from banding, and repeats from frame to frame, so it packs a third smaller than
    // error diffusion's.
    ...[
      '-vf',
      'split[a][b];[a]palettegen=stats_mode=full[p];[b][p]paletteuse=dither=bayer:bayer_scale=4',
    ],
    ...['-loop', '0', new URL('social.gif', OUT).pathname],
  ])
  rmSync(dir, { recursive: true })
}

const mark = study()
const thick = study(THICK)
const tile = study(TILE)
mkdirSync(OUT, { recursive: true })
for (const size of SIZES) {
  const favicon = FAVICONS.includes(size)
  const source = favicon ? tile : size <= SMALL ? thick : mark
  writeFileSync(new URL(`${size}.png`, OUT), icon(source, size, size, favicon))
}
/** The header's mark, as light, at 2× its 32px. */
writeFileSync(new URL('light-64.png', OUT), light(thick, 64))
writeFileSync(new URL('social.png', OUT), icon(study(SOCIAL), SOCIAL_SIZE))
for (const [file, [width, height]] of [
  ['banner.png', BANNER],
  ['../og.png', CARD],
] as const)
  writeFileSync(
    new URL(file, OUT),
    icon(capture(`/dev/banner?w=${width}&h=${height}`, width, height), width, height),
  )
await animated()
