# textile.cx design

Textile takes the events Discord sends and the code an agent writes and turns them into one bot that stays online. The
site draws exactly that: hundreds of fine luminous threads, some named for real Discord events, stream in from the left
and braid into one cord that ends in a Discord window, where the bot answers. No stock imagery and no icon cards; every
part of the page is either a thread or the product.

## Audience and journey

People building AI agents arrive from a link or a search, decide whether Textile does what their agent needs, then sign
in with Discord or read the docs. The landing page answers in the order they ask, each part beside the product doing it:

1. **Hero.** What it is, and the two ways forward: Sign in with Discord, Read the docs.
2. **Publish.** One real workflow, `standup.ts`, beside the `discord_workflow_publish` and `discord_workflow_enable`
   calls and what Textile answers. It runs on Textile: published in workerd, it reports exactly the events, schedules,
   route, and grants shown.
3. **Slash commands, schedules, webhooks.** The same workflow's three triggers, each working: run `/standup`, see the
   cron week, call the route with and without its secret.
4. **Scripts.** One `discord_script_run` beside the messages it sends.
5. **Voice.** Speakers as separate streams, beside the real opt-out notice (`packages/bot-host/src/consent.ts`); opting
   out takes your stream away.
6. **Access.** Access opens in rounds; threads braid into the sign-in button.

Demos that look like actions say they are simulations. The MCP tool table lives in the docs, at `/docs/tools/`.

Sign-in is one action, not a page: `/login` goes to central, which returns to `/access`, which shows one of three states
(signed out, no access yet, you're in) in the same place.

## Type

Geist for everything, Geist Mono for code and event names, both self-hosted from Fontsource. One family keeps the page
quiet enough for the threads.

| Role | Setting |
| --- | --- |
| Hero headline | 600, `clamp(3.25rem, …, 8.75rem)`, leading 0.98, tracking −0.045em |
| Section headings | 600, `clamp(2.375rem, …, 4.5rem)`, leading 1.04, tracking −0.035em |
| Body | 400, 18px at 1.6; section prose up to 21px |
| Code, events | Geist Mono, 13–15px |

Tokens: `--font-text`, `--font-code`.

## Colour

Role tokens in `src/lib/tokens.css`, shared with the docs through `apps/docs/svartz.config.ts`. Each is a `light-dark()`
pair, so `color-scheme` picks the side, as in Svartz.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--paper` | `#f8f7fb` | ink `#07060c` | Page |
| `--surface`, `--sunken` | `#ffffff`, `#efedf4` | `#110f19`, `#0b0a12` | Raised panels, wells |
| `--rule`, `--rule-strong` | `#e2dfea`, `#c4bfd2` | `#221f2e`, `#3a3549` | Lines between things |
| `--ink`, `--text`, `--muted` | `#110e1a`, `#2a2636`, `#615c70` | `#f4f2fa`, `#d9d6e4`, `#9f9bb0` | Headings, body, secondary |
| `--accent`, `--accent-text` | `#6d3df0`, `#5c35d6` | `#7a45f0`, `#b9a2ff` | Violet: actions and links |
| `--thread-violet`, `-amber`, `-silver` | | `#9a6bff`, `#ffad5a`, `#d4d7ea` | The threads only, never text |
| `--code-*` | ink `#0c0a14` | ink | Code panels are ink in both modes |

White on the violet button is 5.3:1; muted on ink is 7.5:1; muted on light paper is 6.0:1. Colour never carries meaning
alone: the selected tab is ringed, a refused request says 401, an opted-out stream says "not relayed".

**The landing page and the access page are always dark** (`data-scheme="dark"`, which `tokens.css` turns into
`color-scheme: dark` for the whole document). The threads are light added to darkness; on paper they would read as
pencil marks, and the hero would be a different product. Access is the next step after the landing page's sign-in, so it
keeps the same ground. The legal pages, errors, and docs follow the reader's mode and the docs' colour toggle.

## Shape and space

Pills for actions (52px tall) and tabs; `--radius-l` 16px for panels and the Discord windows. The page fills the screen:
a `--gutter` of `clamp(1.25rem, 4vw, 4.5rem)` and no content column. Sections split 4:8 between prose and product from
64rem, prose sticking beside long products; below that they stack, and below 30rem the Discord window drops its server
rail.

## The thread field

`src/lib/threads/`. One geometry (`geometry.ts`) runs everywhere: in WGSL for WebGPU, in GLSL for WebGL2, and on the CPU
for event labels, the 2D fallback, the section strands, and the social card.

- Threads enter along the whole left edge and follow a quadratic curve to the target's edge, inside a funnel whose
  nearly straight edges close in steadily until they meet the braid, tangent to it, so there is no knee, no pinch, and
  no straight run.
  They travel in eleven ribbons, narrower than the gaps between them, that share a lane, a sway, and a colour
  (golden-ratio steps, so neighbours differ), so the funnel reads as separate strands of fibre on the dark.
- From `braid`, past the hero's headline, threads keep leaving the funnel for a three-strand braid inside it, innermost
  first, outermost last. Its strands are violet, amber, and violet toward silver. The braid narrows linearly to `cord`
  and keeps one helix angle, so it twists tighter as it goes and meets the target at its thinnest and brightest. The
  hero's cord stops just short of the window, whose rim catches a narrow flare where it arrives.
- The threads emit light. Each is one instance, a triangle strip of 201 point pairs (crowded toward the end, where the
  braid twists tightest) widened 2px for its own halo. Pulses of light run along every thread toward the target, at its
  own phase in the funnel and in step within the braid, so they travel along it. Threads add their light into a
  half-float target. The bloom shrinks that to a quarter of the CSS size, averaging every pixel it covers, and blurs it
  both ways; the tone pass adds it back, with a near-white flare where the cord ends. The tone map keeps hue: the
  brightest channel saturates as `1 − e^(−1.25x)`, the others keep their share, and only the densest light burns toward
  white. Dithered, over the ink.
- Labelled threads run at the edge of the current, where the concept places them, and join the braid only after their
  label. They are pinned where the label sits, so labels are placed once per resize, never per frame. Labels are placed
  as fractions of the hero while its copy scales on its own, so they show from a 1280px-wide hero, where they clear it.
- The field passes behind the hero's copy dimmed by a soft radial shade, and the subline carries its own text shadow, so
  the copy reads cleanly with no visible box.
- Renderers, in order: WebGPU, WebGL2 (with `EXT_color_buffer_float`, else straight additive), then one still canvas 2D
  frame. Asking for a context claims the canvas, so a failed renderer leaves a fresh one. A lost GPU device is replaced
  once; after a second loss the field uses WebGL2 or 2D.
- It renders only while on screen (IntersectionObserver) and the tab is visible. With reduced motion it draws one still
  frame. Off screen or hidden, a resize marks the frame stale and it is drawn when the field shows.
- The hero carries 560 threads above 1600px, 440 below, and 280 on phones, where they come down into the top of the
  window. The close carries 520 and shows only side by side, where it has room beside its copy.

Between, each section's event runs as a small SVG bundle of the same geometry across the page above its heading, braiding
into a knot beside the event's name. A CSS view timeline draws the threads in as the section rises; the cron knots light
the same way. Without scroll timelines, or with reduced motion, everything is simply drawn.

Measured in Chromium 156 on an RTX 3070 (Vulkan), hero on screen at 2000×1100:

| | GPU time per frame (timestamp queries) | Script per frame |
| --- | --- | --- |
| WebGPU, DPR 1 (2000×1100 canvas) | p50 1.53 ms, p95 1.67 ms | 0.35 ms |
| WebGPU, DPR 2 (4000×2200 canvas) | p50 1.52 ms, p95 1.53 ms | 0.38 ms |

The pass is vertex-bound, so doubling the density costs no GPU time. Scrolling the whole page in 40px steps does no
layout; with both fields off screen, and with the tab hidden, the page submits no GPU work. The page is about 1,750 DOM
nodes.

## Motion

Small state changes use the transitions-dev tokens in `tokens.css`: 150ms ease-out for hovers, 250ms smooth-out for tabs.
The voice streams flow on a CSS loop; reduced motion stops them. Every control is a native element
that works without any effect.

## Components

| Component | What it is |
| --- | --- |
| `threads/ThreadField` | The live field, braiding into `target`; `layout` places it per size. |
| `threads/Strands` | A section's small SVG bundle. |
| `Section` | Heading and prose beside the product, with its event above. |
| `discord/Window`, `discord/Message` | A Discord channel and its messages, as real DOM. |
| `demos/*` | Publish, Slash, Schedule, Webhook, Script, Voice. |
| `Tabs` | WAI-ARIA tabs; unselected panels are inert, not removed. |
| `Code` | A code sample on ink, highlighted by `src/lib/highlight.ts`. |
| `PageMarkdown` | Copy page and View as Markdown, in every page's footer. |
| `Seo` | Title, description, canonical, social cards, and the Markdown alternate link. |

The landing page's Markdown twin is written, not converted: `landingMarkdown` in `src/lib/landing.ts` tells the same story
in prose, with the same workflow and calls. The social card, `static/og.png`, is drawn from the same geometry by
`pnpm og`; the favicon is three braided strands.
