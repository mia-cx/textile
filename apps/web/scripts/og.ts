// Renders static/og.png, the 1200×630 card social sites show for every page: the hero's threads braiding toward the
// headline, drawn from the same geometry as the live field (src/lib/threads/geometry.ts), in the site's type and
// colours. Needs Chromium on PATH (`CHROMIUM` overrides it). Run with `pnpm og` after changing the field, the palette,
// or the headline, and commit the image.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import {
  along,
  blend,
  brightness,
  type Field,
  knit,
  position,
  thread,
  warmth,
} from '../src/lib/threads/geometry.ts'

const app = fileURLToPath(new URL('..', import.meta.url))
const fonts = join(app, 'node_modules/@fontsource-variable')
const [WIDTH, HEIGHT] = [1200, 630]
/** The page's tokens (src/lib/tokens.css): the card is rendered outside the page, so it can't read them. */
const INK = '#07060c'
const VIOLET = [0x7a / 255, 0x45 / 255, 0xff / 255] as const
const AMBER = [0xff / 255, 0x9f / 255, 0x5a / 255] as const

const field: Field = {
  start: [-60, HEIGHT * 0.5],
  control: [WIDTH * 0.32, HEIGHT * 0.5],
  end: [WIDTH * 0.62, HEIGHT * 0.5],
  spread: HEIGHT * 0.54,
  cord: 5,
  braid: [0.1, 0.3, 0.9],
  count: 420,
  intensity: 1,
  labels: [],
}
const POINTS = 160
/** A settled moment of the current, as the page's still frame shows. */
const STILL_TIME = 12
/**
 * Points per piece a thread is stroked in, each piece a gradient from its first point's colour to its last's, so the
 * violet-to-amber gradient runs along it with no seam.
 */
const PIECE = 8
/** A colour `w` of the way from violet to amber, mixed in OKLab as the page's threads are. */
const mixed = (w: number) =>
  `rgb(${blend(VIOLET, AMBER, w)
    .map((c) => Math.round(Math.min(c, 1) * 255))
    .join(' ')})`
const threads = Array.from({ length: field.count }, (_, i) => {
  // Each point's place, colour, and opacity. As a thread gathers it eases into its strand's colour, and in the plait
  // its band's light, as the shaders do.
  const th = thread(field, i)
  const points = Array.from({ length: POINTS + 1 }, (_, s) => {
    const u = along(s / POINTS)
    const [x, y] = position(field, i, u, STILL_TIME)
    const { braided, look } = knit(field, th, u)
    const colour = mixed(warmth(field, i, u, STILL_TIME, braided))
    const opacity = Math.min(1, 0.12 + 0.5 * brightness(field, i, braided * look))
    return { x, y, colour, opacity }
  })
  return Array.from({ length: POINTS / PIECE }, (_, n) => {
    const piece = points.slice(n * PIECE, (n + 1) * PIECE + 1)
    const first = piece[0]
    const last = piece.at(-1)
    if (!first || !last) return ''
    const id = `g${i}-${n}`
    const d = piece
      .map(({ x, y }, s) => `${s === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
      .join('')
    const stop = (at: number, p: typeof first) =>
      `<stop offset="${at}" stop-color="${p.colour}" stop-opacity="${p.opacity.toFixed(2)}"/>`
    return `<linearGradient id="${id}" gradientUnits="userSpaceOnUse" x1="${first.x.toFixed(1)}" y1="${first.y.toFixed(1)}" x2="${last.x.toFixed(1)}" y2="${last.y.toFixed(1)}">${stop(0, first)}${stop(1, last)}</linearGradient><path d="${d}" stroke="url(#${id})"/>`
  }).join('')
}).join('')

const html = `<!doctype html><html><head><style>
@font-face { font-family: Geist; src: url(file://${fonts}/geist/files/geist-latin-wght-normal.woff2) format('woff2'); font-weight: 100 900; }
html, body { margin: 0; width: ${WIDTH}px; height: ${HEIGHT}px; overflow: hidden; background: ${INK}; color: #f4f2fa; font-family: Geist; }
svg { position: absolute; inset: 0; mix-blend-mode: screen; }
path { fill: none; stroke-width: 1; }
.veil { position: absolute; inset: 0; background: linear-gradient(90deg, transparent 30%, ${INK} 66%); }
main { position: absolute; inset: 0; display: flex; flex-direction: column; justify-content: space-between; align-items: flex-end; padding: 64px 72px; text-align: right; }
.wordmark { font-size: 44px; font-weight: 600; letter-spacing: -0.045em; }
h1 { margin: 0; font-size: 96px; line-height: 0.98; font-weight: 600; letter-spacing: -0.045em; }
</style></head><body><svg viewBox="0 0 ${WIDTH} ${HEIGHT}">${threads}</svg><div class="veil"></div>
<main><span class="wordmark">textile</span><h1>Discord bots<br>for AI agents</h1></main></body></html>`

const dir = mkdtempSync(join(tmpdir(), 'textile-og-'))
writeFileSync(join(dir, 'og.html'), html)
execFileSync(
  process.env.CHROMIUM ?? 'chromium',
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    `--window-size=${WIDTH},${HEIGHT}`,
    `--screenshot=${join(app, 'static/og.png')}`,
    `file://${join(dir, 'og.html')}`,
  ],
  { stdio: 'ignore', timeout: 60_000 },
)
process.stdout.write('Wrote static/og.png\n')
