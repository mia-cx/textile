// Renders static/og.png, the 1200×630 card social sites show for every page: the woven mark beside the headline, in the
// site's own type and colours. Needs Chromium on PATH (`CHROMIUM` overrides it). Run with `pnpm og` after changing the
// mark, the palette, or the headline, and commit the image.
import { execFileSync } from 'node:child_process'
import { mkdtempSync, readFileSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { fileURLToPath } from 'node:url'

const app = fileURLToPath(new URL('..', import.meta.url))
const font = join(
  app,
  'node_modules/@fontsource-variable/recursive/files/recursive-latin-full-normal.woff2',
)
const mark = readFileSync(join(app, 'static/favicon.svg'), 'utf8').replace(
  /<style>[\s\S]*?<\/style>/,
  '<style>.cloth{fill:none}.warp{fill:#2c3b94}.weft{fill:#c4472e}</style>',
)

const warps = Array.from({ length: 30 }, (_, i) => 20 + i * 40)
const band = `<svg width="1200" height="120" viewBox="0 0 1200 120">
  ${warps.map((x) => `<line x1="${x}" y1="0" x2="${x}" y2="120" stroke="#8f97c4" stroke-width="14"/>`).join('')}
  ${[24, 60, 96]
    .map(
      (y, r) =>
        `<line x1="0" y1="${y}" x2="1200" y2="${y}" stroke="${r === 1 ? '#c9952d' : '#b5432c'}" stroke-width="24"/>` +
        warps
          .filter((_, c) => (r + c) % 2 === 0)
          .map(
            (x) =>
              `<line x1="${x}" y1="${y - 15}" x2="${x}" y2="${y + 15}" stroke="#f5f0e6" stroke-width="20"/><line x1="${x}" y1="${y - 16}" x2="${x}" y2="${y + 16}" stroke="#8f97c4" stroke-width="14"/>`,
          )
          .join(''),
    )
    .join('')}
</svg>`

const html = `<!doctype html><html><head><style>
@font-face { font-family: Recursive; src: url(file://${font}) format('woff2'); font-weight: 300 1000; }
html, body { margin: 0; width: 1200px; height: 630px; overflow: hidden; background: #f5f0e6; color: #141b45; font-family: Recursive; }
main { position: absolute; inset: 0 0 120px; display: flex; flex-direction: column; justify-content: center; padding: 0 88px; gap: 28px; }
.brand { display: flex; align-items: center; gap: 20px; font-size: 52px; font-weight: 800; font-variation-settings: 'CASL' 1; letter-spacing: -0.02em; }
.brand svg { width: 76px; height: 76px; }
h1 { margin: 0; font-size: 92px; line-height: 1; font-weight: 800; font-variation-settings: 'CASL' 1; letter-spacing: -0.01em; }
.band { position: absolute; left: 0; right: 0; bottom: 0; }
</style></head><body><main><div class="brand">${mark}<span>textile</span></div><h1>Discord bots<br>for AI agents</h1></main><div class="band">${band}</div></body></html>`

const dir = mkdtempSync(join(tmpdir(), 'textile-og-'))
writeFileSync(join(dir, 'og.html'), html)
execFileSync(
  process.env.CHROMIUM ?? 'chromium',
  [
    '--headless=new',
    '--disable-gpu',
    '--hide-scrollbars',
    '--window-size=1200,630',
    `--screenshot=${join(app, 'static/og.png')}`,
    `file://${join(dir, 'og.html')}`,
  ],
  { stdio: 'ignore', timeout: 60_000 },
)
console.log('Wrote static/og.png')
