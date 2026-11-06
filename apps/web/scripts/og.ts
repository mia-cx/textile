// Renders static/og.png, the 1200×630 card social sites show for every page: the hero's threads braiding toward the
// headline, drawn from the same geometry as the live field (src/lib/threads/geometry.ts), in the site's type and
// colours. Needs Chromium on PATH (`CHROMIUM` overrides it). Run with `pnpm og` after changing the field, the palette,
// or the headline, and commit the image.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'
import { along, type Field, position, tint } from '../src/lib/threads/geometry.ts'

const app = fileURLToPath(new URL('..', import.meta.url))
const fonts = join(app, 'node_modules/@fontsource-variable')
const [WIDTH, HEIGHT] = [1200, 630]
/** The page's tokens (src/lib/tokens.css): the card is rendered outside the page, so it can't read them. */
const INK = '#07060c'
const COLOURS = ['#9a6bff', '#ffad5a', '#d4d7ea']

const field: Field = {
  start: [-60, HEIGHT * 0.5],
  control: [WIDTH * 0.32, HEIGHT * 0.5],
  end: [WIDTH * 0.62, HEIGHT * 0.5],
  spread: HEIGHT * 0.54,
  cord: 5,
  braid: 0.6,
  count: 420,
  intensity: 1,
  labels: [],
}
const POINTS = 160
/** A settled moment of the current, as the page's still frame shows. */
const STILL_TIME = 12
const threads = Array.from({ length: field.count }, (_, i) => {
  const d = Array.from({ length: POINTS + 1 }, (_, s) =>
    position(field, i, along(s / POINTS), STILL_TIME),
  )
    .map(([x, y], s) => `${s === 0 ? 'M' : 'L'}${x.toFixed(1)} ${y.toFixed(1)}`)
    .join('')
  const { colour, brightness } = tint(field, i)
  return `<path d="${d}" stroke="${COLOURS[colour]}" stroke-opacity="${(0.12 + 0.5 * brightness).toFixed(2)}"/>`
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
