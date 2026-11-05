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

/**
 * Every docs page, by page path: the notes the docs build lists in its own `/docs/llms.txt`, then the listings Svartz
 * generates beside them (recent notes, tags, and a listing of the notes in each folder). Listings have no note, so
 * their Markdown is the converted page.
 */
export async function docsPages(assets: Env['ASSETS'], url: URL): Promise<ReadonlyArray<DocsPage>> {
  const response = await assets.fetch(new URL(`${DOCS_BASE}/llms.txt`, url))
  if (!response.ok) throw new Error(`The docs build has no llms.txt: ${response.status}`)
  const notes = [...(await response.text()).matchAll(LLMS_PAGE)].map(
    ([, title = '', href = '', description = '']) => ({
      path: pageOf(new URL(href).pathname) ?? DOCS_BASE,
      title,
      description,
    }),
  )
  // Every folder above a note, below the docs: `guides`, `guides/voice`.
  const folders = [
    ...new Set(
      notes.flatMap(({ path }) => {
        const dirs = path
          .slice(DOCS_BASE.length + 1)
          .split('/')
          .slice(0, -1)
        return dirs.map((_, depth) => dirs.slice(0, depth + 1).join('/'))
      }),
    ),
  ].sort()
  return [
    ...notes,
    { path: `${DOCS_BASE}/feed`, title: 'Recently updated', description: 'The latest docs pages.' },
    { path: `${DOCS_BASE}/tags`, title: 'Tags', description: 'Every tag the docs use.' },
    { path: `${DOCS_BASE}/folders`, title: 'Folders', description: 'Every docs page, by folder.' },
    ...folders.map((folder) => ({
      path: `${DOCS_BASE}/folders/${folder}`,
      title: `Folder: ${folder}`,
      description: `The pages in \`${folder}/\`.`,
    })),
  ]
}
