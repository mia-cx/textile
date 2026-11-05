import { pageOf } from '$lib/markdown-paths'

/** Where the docs site (apps/docs) is mounted; its `paths.base` is the same. */
export const DOCS_BASE = '/docs'

/** The Markdown copy the docs build writes for the note at a page path: `/docs/index.md` for the docs home. */
const copyOf = (path: string) => (path === DOCS_BASE ? `${DOCS_BASE}/index.md` : `${path}.md`)

/** A link that leaves the docs or stays on the page: a scheme, a protocol-relative URL, a root path, or a fragment. */
const NOT_RELATIVE = /^([a-z][a-z\d+.-]*:|\/|#)/i

/** A Markdown link's destination, after `](`. */
const DESTINATION = /\]\(([^\s()<>]+)/g

/**
 * The docs page at `path` as Markdown, or undefined when no note renders there (a folder listing, an unknown path).
 * It is the copy the docs build writes beside the page, so agents read what the page shows. Its links to other notes
 * are relative to the copy; they become absolute on `url`'s origin, so the Markdown reads the same at any URL.
 */
export async function docsMarkdown(assets: Env['ASSETS'], path: string, url: URL) {
  if (path !== DOCS_BASE && !path.startsWith(`${DOCS_BASE}/`)) return undefined
  const file = new URL(copyOf(path), url)
  const response = await assets.fetch(file)
  if (!response.ok) return undefined
  return (await response.text()).replace(DESTINATION, (link, href: string) =>
    NOT_RELATIVE.test(href) ? link : `](${new URL(href, file).href}`,
  )
}

/** A page in the docs build's own llms.txt: `- [Title](https://textile.cx/docs/page.md): description`. */
const LLMS_PAGE = /^- \[(.+)\]\((\S+\.md)\)(?:: (.*))?$/gm

export interface DocsPage {
  readonly path: string
  readonly title: string
  readonly description: string
}

/** Every docs note, by page path, from the docs build's `/docs/llms.txt`. */
export async function docsPages(assets: Env['ASSETS'], url: URL): Promise<ReadonlyArray<DocsPage>> {
  const response = await assets.fetch(new URL(`${DOCS_BASE}/llms.txt`, url))
  if (!response.ok) throw new Error(`The docs build has no llms.txt: ${response.status}`)
  return [...(await response.text()).matchAll(LLMS_PAGE)].map(
    ([, title = '', href = '', description = '']) => ({
      path: pageOf(new URL(href).pathname) ?? DOCS_BASE,
      title,
      description,
    }),
  )
}
