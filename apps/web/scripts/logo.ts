// Renders Textile's mark, the trefoil, into static/icons/<size>.png: the favicons, the touch and manifest icons, and
// the header's mark; and social.png, a padded avatar for social profiles and the Discord server. It captures the study page (src/routes/dev/trefoil) on the site's ink, as the 1024 page at 2×
// pixel density, so every pixel of glow is the browser's own, then downsizes it the way Ditherette's
// lanczos3-scale-aware does: a Lanczos-3 kernel stretched by the scale factor, in linear light, so thin bright fibres
// average as light does instead of darkening. Sizes of 64 and below start from a capture with a thicker band, and
// smaller sizes get a little more light, for what fine glow loses averaged into few pixels.
//
// Needs the dev server running (`pnpm dev`; `LOGO_URL` overrides its address) and Chromium on PATH (`CHROMIUM`
// overrides it). Run with `pnpm logo` after changing the mark or the cord's shaders, and commit the images.
import { execFileSync } from 'node:child_process'
import { mkdirSync, mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { PNG } from 'pngjs'
import { MARK, SMALL_MARK } from '../src/lib/threads/trefoil.ts'

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
/** The site's ink (src/lib/tokens.css): only light above it is brightened, so the ground stays the ink. */
const INK = '#07060c'

const toLinear = (c: number) => (c <= 0.04045 ? c / 12.92 : ((c + 0.055) / 1.055) ** 2.4)
const toSrgb = (c: number) => (c <= 0.0031308 ? 12.92 * c : 1.055 * c ** (1 / 2.4) - 0.055)
const ink = [1, 3, 5].map((i) => toLinear(Number.parseInt(INK.slice(i, i + 2), 16) / 255))
/** Extra light for a size: none at 512 and up, half again at 16. */
const gain = (size: number) => 1 + 0.1 * Math.max(0, Math.log2(512 / size))

interface Image {
  readonly size: number
  readonly data: Float32Array
}

/** How many times a capture is tried: headless Chromium now and then shoots before the mark's first frame. */
const ATTEMPTS = 4

/** The study page, still, as a linear RGB image 2048 px square. */
function capture(query: string): Image {
  for (let attempt = 1; attempt <= ATTEMPTS; attempt++) {
    const image = shoot(query)
    // Drawn, the mark lights pixels far above the ink; a frame shot too early is ink all over.
    if (image.data.some((v) => v > 0.2)) return image
  }
  throw new Error(
    `The study page drew nothing in ${ATTEMPTS} tries. Is the dev server running at ${URL_BASE}?`,
  )
}

function shoot(query: string): Image {
  const file = join(mkdtempSync(join(tmpdir(), 'textile-logo-')), 'mark.png')
  execFileSync(process.env.CHROMIUM ?? 'chromium', [
    '--headless=new',
    '--no-sandbox',
    '--hide-scrollbars',
    // Software WebGL, so it renders the same on a machine without a GPU.
    '--use-angle=swiftshader',
    '--enable-unsafe-swiftshader',
    '--force-device-scale-factor=2',
    '--window-size=1024,1024',
    '--virtual-time-budget=8000',
    `--screenshot=${file}`,
    `${URL_BASE}/dev/trefoil?size=1024&still${query}`,
  ])
  const png = PNG.sync.read(readFileSync(file))
  const data = new Float32Array(png.width * png.height * 3)
  for (let i = 0; i < png.width * png.height; i++)
    for (let c = 0; c < 3; c++) data[i * 3 + c] = toLinear((png.data[i * 4 + c] ?? 0) / 255)
  return { size: png.width, data }
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
    const weights = Array.from({ length: hi - lo + 1 }, (_, k) =>
      lanczos((lo + k - centre) / Math.max(1, scale)),
    )
    const sum = weights.reduce((a, b) => a + b, 0)
    for (let line = 0; line < lines; line++)
      for (let c = 0; c < 3; c++) {
        let acc = 0
        for (const [k, w] of weights.entries())
          acc += (src[(line * from + lo + k) * 3 + c] ?? 0) * w
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

/**
 * The mark on the site's ink, as a square, or as a little app icon: the ink a rounded square with clear corners, so a
 * favicon stands on its own dark tile in a light browser too.
 */
function icon(image: Image, size: number, rounded: boolean) {
  const data = pass(pass(image.data, image.size, size, image.size), image.size, size, size)
  const png = new PNG({ width: size, height: size })
  const extra = gain(size)
  const radius = size * TILE_RADIUS
  for (let i = 0; i < size * size; i++) {
    for (let c = 0; c < 3; c++) {
      const base = ink[c] ?? 0
      const lit = base + Math.max(0, (data[i * 3 + c] ?? 0) - base) * extra
      png.data[i * 4 + c] = Math.round(toSrgb(Math.min(1, lit)) * 255)
    }
    const alpha = rounded ? cover(i % size, Math.floor(i / size), size, radius) : 1
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
  const data = pass(pass(image.data, image.size, size, image.size), image.size, size, size)
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

const mark = capture('')
const thick = capture(THICK)
const tile = capture(TILE)
mkdirSync(OUT, { recursive: true })
for (const size of SIZES) {
  const favicon = FAVICONS.includes(size)
  const source = favicon ? tile : size <= SMALL ? thick : mark
  writeFileSync(new URL(`${size}.png`, OUT), icon(source, size, favicon))
}
/** The header's mark, as light, at 2× its 32px. */
writeFileSync(new URL('light-64.png', OUT), light(thick, 64))
writeFileSync(new URL('social.png', OUT), icon(capture(SOCIAL), SOCIAL_SIZE, false))
