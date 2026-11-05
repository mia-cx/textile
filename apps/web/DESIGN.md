# textile.cx design

The site is cloth. Textile weaves Discord's events (the warp) together with the code an agent writes (the weft) into a
bot that runs, so the identity is plain weave: undyed linen, indigo dye, and red and yellow threads. No stock imagery;
the mark, the hero, and the section dividers are all woven in SVG from the same rule.

## Audience and journey

People building AI agents arrive from a link or a search, decide whether Textile does what their agent needs, then
either sign in with Discord or read the docs. The landing page answers in the order they ask: what it is (hero), how an
agent talks to it (MCP tools), what the bot does unattended (workflows, scripts, voice), whether it is safe (security),
and how to get in (closed alpha). Every section shows the real product: the tool names from the MCP server, workflow
code that runs on Textile, and the voice notice's own copy and buttons.

Sign-in is one action, not a page: `/login` goes straight to Discord, and Discord returns to `/access`, which shows one
of three states (signed out, no access yet, you're in) in the same column, so each reads as the next step.

## Type

Recursive, self-hosted, one variable file for everything. Its axes carry the system:

| Role | Axes | Use |
| --- | --- | --- |
| Display | `CASL 1`, weight 750–800 | Headings and the wordmark. The casual axis reads hand-lettered, like a woven label. |
| Text | `CASL 0`, weight 400–600 | Body, navigation, buttons. |
| Code | `MONO 1` | Code samples, tool names, inline code. |

The tokens are `--font-text`, `--font-code`, and `--axes-text`, `--axes-display`, `--axes-code`. Body text is 17px at
1.6; headings are balanced and tight (1.02–1.08).

## Colour

Role tokens in `src/lib/tokens.css`, shared with the docs through `apps/docs/svartz.config.ts`.

| Token | Light | Dark | Role |
| --- | --- | --- | --- |
| `--paper` | linen `#f5f0e6` | indigo night `#0d1130` | Page |
| `--surface` | `#fbf8f1` | `#141a3e` | Raised panels: the tool list, the voice notice |
| `--sunken` | `#ebe4d5` | `#090c24` | Wells: the tab bar, inline code, notice buttons |
| `--rule`, `--rule-strong` | `#d8cdb8`, `#a99c81` | `#283062`, `#4a5390` | Lines between things |
| `--ink`, `--text`, `--muted` | `#141b45`, `#262d58`, `#555a7c` | `#f4eee2`, `#ddd7c9`, `#a7a9c6` | Headings, body, secondary text |
| `--accent`, `--accent-text`, `--on-accent` | indigo `#2c3b94` | periwinkle `#aab8ff` | Actions and links |
| `--warp`, `--weft`, `--weft-alt` | `#8f97c4`, madder `#b5432c`, weld `#c9952d` | `#3b4589`, `#e8735a`, `#e9b44c` | The threads. Decoration only, never text |
| `--code-*` | indigo swatch `#182050` | `#070a1f` | Code panels stay dyed indigo in both modes |
| `--focus` | madder | coral | Focus rings |

Every text pairing passes WCAG AA in both modes; the lowest is muted on sunken at 5.3:1 (light). Colour never carries
meaning alone: links are underlined, the selected tab is raised, and the current policy page is bold.

The system picks the mode. The docs have a colour toggle that stores its choice (`svartz:color-mode`); the site reads it
before first paint, so both always match. The site itself adds no toggle.

## Shape and space

Radii are small (`--radius-s` 4px, `--radius-m` 8px, `--radius-l` 14px): soft like folded cloth, never pills. Buttons
are 44px tall, filled indigo for the primary action and outlined for the secondary one. Content sits in one 72rem column;
two-column sections (`.split`) put the explanation beside the product, and the explanation sticks beside a long list.
Below 56rem every section is one column.

## Motion

Motion tells one story: the cloth being woven.

- **Hero loom.** The warp threads are labelled with the triggers a bot listens for (`messageCreate`,
  `interactionCreate`, `guildMemberAdd`, `schedule`, `fetch`). On load, 13 weft rows pass across from the bottom up, the shuttle
  turning at each edge, in about 2.4 s. CSS keyframes on `stroke-dashoffset`; no script.
- **Woven bands.** Between sections, a strip of plain weave whose three rows pass across as it scrolls into view, driven
  by a CSS view timeline. Scrolling back unweaves it. Browsers without scroll timelines show it woven.
- **Small state changes** use the transitions-dev tokens: 150 ms ease-out for hovers, 250 ms smooth-out for tabs.

With reduced motion, the loom and bands render fully woven and nothing moves. Every control is a native element that
works without the effects.

Measured in headless Chromium at 1440×900, scrolling the whole landing page in 40px steps: 127 frames, p50 16.6 ms,
p95 17.1 ms, 0 ms of layout, 16.6 ms of style recalculation in total, 3.1 ms of script. Each woven strip is a handful of
SVG paths (a path per row, not per thread), so the page is about 2,100 DOM nodes and 48 KB of HTML.

## Components

| Component | What it is |
| --- | --- |
| `Mark` | The plain-weave mark, 3×3, as in the favicon. |
| `Loom` | The hero's labelled loom. |
| `WeaveBand` | The scroll-woven section divider. |
| `Tabs` | Workflow samples behind WAI-ARIA tabs; unselected panels are inert, not removed, so the Markdown twin has them all. |
| `Code` | A TypeScript sample on an indigo swatch, highlighted by `src/lib/highlight.ts`. Focusable, so it scrolls by keyboard. |
| `VoiceNotice` | The real voice notice with working buttons, opt-out and undo; labelled a preview. Its reply space is reserved. |
| `PageMarkdown` | Copy page and View as Markdown, in every page's footer. |
| `Seo` | Title, description, canonical, Open Graph and Twitter cards, and the Markdown alternate link. |

The social card, `static/og.png`, is rendered from the same mark and palette by `pnpm og`.
