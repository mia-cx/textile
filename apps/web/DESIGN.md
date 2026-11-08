# textile.cx design

Textile takes the events Discord sends and the code an agent writes and turns them into one bot that stays online. The
site draws exactly that: hundreds of fine luminous threads, some named for real Discord events, stream in from the left
and braid into one cord that ends in a Discord window, where the bot answers. No stock imagery and no icon cards; every
part of the page is either a thread or the product.

## Audience and journey

People building AI agents arrive from a link or a search, decide whether Textile does what their agent needs, then sign
in with Discord or read the docs. The landing page answers in the order they ask, each part beside the product doing it:

1. **Hero.** What it is, and the two ways forward: Request access (which signs in with Discord), Read the docs.
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
| `--thread-violet`, `-amber` | | `#9a6bff`, `#ffad5a` | The threads only, never text |
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
for event labels, the 2D fallbacks, and the social card. The page's cord (`cord.ts`) runs the same braid down the page.

- Threads enter along the whole left edge and follow a quadratic curve to the target's edge, inside a funnel whose
  nearly straight edges close in steadily until they meet the braid's outline, tangent to it, so there is no knee, no
  waist, and no straight run. They travel in eleven loose bundles of varying width that share a lane, a sway, and
  mostly a colour (golden-ratio steps, so neighbours differ). Most fibres hug their bundle and a few fray far from it
  on slow curves of their own, and one thread in sixteen strays between bundles, so the bundles read as loose fibre,
  not cables.
- `braid` holds three points along the field. From `gathers`, the bundles start gathering into three strands side by
  side, inner lanes mostly first; from `forms`, the strands grow their swing into a plait over half the stretch to
  `whole`, and every thread has joined its strand by 70% of it. The hero measures them from its layout, again when
  webfonts load: the bundles start to gather behind the copy, 1.2 gaps before its right edge and at least 360px, so
  they converge over a long stretch even where the gap is narrow; the plait forms only in the open gap between the copy
  and the window, at every width, never behind the window, whose glass would show it through the messages; and it is
  whole where it meets the window. Each thread eases in with no corner, so the plait has no visible start. The braid
  narrows linearly to `cord` and keeps one helix angle, a long pitch of 11 radii per twist (about 34°), so each crossing
  has room, twisting tighter as it goes. It meets the window at the page cord's own radius, with no taper, so one braid
  runs in at the window's left and out of its bottom; it runs on 24px under the window's server rail, so its end never
  shows. The window drops its black shadow there, so the cord's end stays
  bright, and a frame around it, which the window's clipping can't cut, takes the cord's light: a band on its rim about
  as tall as the braid, and faintly across its face, falling off as the inverse square of the distance from the cord's
  end. The close's button takes the same contact: the plait is whole at its edge and runs on behind the opaque pill to
  its middle, with a subtle warm rim, its violet face kept, its label 4.5:1. Wherever the cord meets an element, it
  ends hidden behind it, never at its edge.
- Only violet and amber: every thread runs one long gradient from violet through magenta and pink to amber and back,
  on a plain sine, so it spends as long between the two as in them, flowing toward the target. A cycle spans about
  800px on a loose strand and 260px in the plait. The colours mix in OKLab with their chroma kept: a plain OKLab mix of
  this violet and amber halves its chroma at the midpoint into a dusty mauve, so the mix is lifted back to the two
  colours' chroma. As threads gather they take their strand's phase, a third of a cycle from its neighbours', so each
  band shows both colours and no band is one colour. The rate is integrated along the field, so the colour never
  sweeps where it changes. Every strand breathes: a slow wave of light (±22%) and warmth, about six seconds long,
  travelling toward the target.
- The threads emit light, in linear units with real range. A loose fibre glows: its own light runs from 0.22 to 1 of
  the brightest, mostly moderate, times 1.7, so the current reads as the braid's light fanned out. The braid's bands
  are hotter, and glints a few hundred times a fibre. Glints spark on a fifth of the braid's fibres where a strand
  passes over its neighbour, burning warm white. On loose fibres, now and then a streak of light runs along one fibre
  in its own violet or amber: a soft rise, a long fading tail, a low peak, so it reads as light moving rather than a
  fleck; in the hero they speed up and lengthen into the braid. Each thread is one instance, a triangle strip of 201
  point pairs (crowded toward the end, where the braid twists tightest) widened 2px for its own halo. Pulses of light
  run along every thread toward the target, at its own phase in the funnel and in step within the braid, so they
  travel along it. Threads add their light into a half-float target.
- The lead: four fibres that burn four times brighter than the brightest of the rest, on a lane of their own inside
  the labelled threads, above the headline. They take the colour and sway of a bundle on the far side of the current,
  so they move unlike the bundles beside them and cross them as a strand of their own. They gather into the top strand
  and ride its band's edge through the plait. The page's cord carries the hero's strands on as themselves: its thread
  `i` is the hero's thread `i`, in the same strand, with the same fibre, and it picks up the hero's twist, colour, and
  drift where the hero's cord meets the window, carried on behind the window to its bottom, on the same clock. So the
  lead runs down the whole cord, on its strand's rope as the strands part behind each section, and on along its
  strand's own path to a speaker in voice.
- 6% of the light scatters into glare, as in a lens or the air: a chain of seven bloom targets from a quarter of the
  CSS size down, each halving the last with a 13-tap filter, then added back up through a tent, an equal share per
  octave. That sums to a glare falling off as `1 / (1 + (r / 4.7px)²)` out to about 500px: a tight core, a long faint
  tail, no visible edge, so only light hot enough to matter visibly blooms. AgX maps it to the screen: hues stay
  saturated as light brightens, and only the hottest burns toward white. Dithered, over the ink.
- Labelled threads glow twice as bright as the rest and leave the current's outer edge onto clear dark, where the
  concept places them; they join the braid only after their label. They are pinned where the label sits, so labels are
  placed once per resize, never per frame. Labels are placed as fractions of the hero while its copy scales on its own,
  so they show from a hero 1280px wide and 760px tall, where they clear it.
- The field passes behind the hero's copy dimmed by a soft radial shade, and the subline carries its own text shadow, so
  the copy reads cleanly with no visible box. The field also dims itself to a quarter behind the headline, subline,
  and buttons, fading back over 32px around each, and only there: over the brightest 1% of field pixels behind it, the
  headline holds 4.6:1 and the subline 11.7:1.
- Renderers, in order: WebGPU, WebGL2 (with `EXT_color_buffer_float`, else straight additive), then one still canvas 2D
  frame. Asking for a context claims the canvas, so a failed renderer leaves a fresh one. A lost GPU device is replaced
  once; after a second loss the field uses WebGL2 or 2D.
- It renders only while on screen (IntersectionObserver) and the tab is visible. With reduced motion it draws one still
  frame. Off screen or hidden, a resize marks the frame stale and it is drawn when the field shows.
- The hero carries 560 threads above 1600px, 440 below, and 280 on phones, where they come down into the top of the
  window. The close carries 420 above 1600px and 340 below, and shows only side by side, where it has room beside its
  copy.

Between, the cord (`Weave`) leaves the hero window's bottom and carries the braid down the page on the GPU, as the hero
draws it. Its course is a smooth curve, like a hanging rope: it crosses each section's gap, with the section's event
on its knot, still on its way to the section's resting line, which it reaches 30% of the way to the next gap. Each
section sets that line by its layout, so the cord never drifts to the page's edge: down the middle of a centred
section, in the gutter between a demo and its words (`data-weave="gutter"`), or over a demo's top
(`data-weave-at`). It wanders off course in two slow waves of up to 40px, and sways with time, up to 22px over 11 and
17 seconds, easing in after the window and out before it ends, so the seam and the voice demo hold still. Behind each
section it comes apart in three overlapping stages and gathers again the same way: the plait loosens (its swing widens
and its pitch lengthens), its three strands drift apart as loose ropes still swinging around each other, and only then
does each rope fray into its fibres. A loose rope's fibres run a little apart in the colour cycle, so each rope shows
both colours. Where a section carries something from one panel into the next (`data-weave-held`: Slash commands,
Webhook updates), the cord runs through the demo braided, straight and still, showing between panels as the thing
travelling. Above a centred demo (Slash commands) it first comes apart on its line: its three ropes part
symmetrically, the outer two arcing out around the heading and copy, 56px clear of their widest line, still ropes with
a little swing, then sweep back together behind the demo's top edge and braid again. Where loose strands pass behind
panels stacked with a narrow gap, the gap dims like words, so no clipped stubs show. In Voice the cord ends: its plait
loosens into three ropes, and each strand runs on along its own path, the same fibres, twist and colour, at full
width, behind its speaker's avatar to its middle, the right rope to the top speaker so none cross. Strands keep their colour and fibres throughout; behind each line of the
prose, tight to its words with 12px to spare, the strands dim to 1%, fading back over 120px, so the prose and its links
hold 4.5:1 or more. The cord draws down in steps as the reader scrolls: as each section's heading crosses 60% of the
screen, the cord is drawn through the whole section; between steps it holds, then eases on, its tip following on a
critically damped spring that settles in about a second, fading out along its route. With reduced motion it is simply
drawn, and holds still.

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
Each voice stream is a procedural speech waveform: a dense voice under syllables of uneven loudness, with gaps between
words and flat pauses between phrases, each speaker with their own pitch and pace, flowing toward the socket while on
screen. Reduced motion holds one moment, all three speaking. Every control is a native element
that works without any effect.

## Components

| Component | What it is |
| --- | --- |
| `threads/ThreadField` | The live field, braiding into `target`; `layout` places it per size. |
| `threads/Weave` | The cord down the page, carrying on the hero's strands from `seam`. |
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
