import { createPlugin, ELEMENT_NODE, type ElementNode, htmlToMarkdown, type Node } from '@mdream/js'
import { markdownPath } from '$lib/markdown-paths'

/** The layout puts each page's own content in `#content`, the skip link's target, outside the header and footer. */
const CONTENT = '#content'

/** Decoration and machinery: they mean nothing outside the screen. */
const SKIPPED_TAGS = new Set(['svg', 'script', 'style', 'template', 'button', 'form'])

/** Routes that act rather than render: they have no Markdown twin. */
const ACTIONS = /^\/(login|logout|auth)(\/|$)/

const isElement = (node: Node): node is ElementNode => node.type === ELEMENT_NODE

const isNoise = ({ name, attributes }: ElementNode) =>
  SKIPPED_TAGS.has(name) ||
  attributes['aria-hidden'] === 'true' ||
  attributes['data-markdown'] === 'skip' ||
  attributes.hidden !== undefined ||
  attributes.role === 'tablist'

/**
 * Drops what only works on screen, keeps links between pages in Markdown, and heads each element that names itself with
 * `data-markdown-heading`, such as a tab panel: unselected panels are inert, not hidden, so Markdown carries every one.
 */
const pagePlugin = (page: URL) => {
  const skipped = new WeakSet<ElementNode>()
  return createPlugin({
    processAttributes({ name, attributes }) {
      if (name !== 'a' || !attributes.href) return
      const target = new URL(attributes.href, page)
      // Following a link to another of the site's pages stays in Markdown. Files (llms.txt), fragments, and sign-in,
      // which is an action rather than a page, stay as they are.
      const isPage =
        target.origin === page.origin &&
        !/\.[a-z]+$/i.test(target.pathname) &&
        !ACTIONS.test(target.pathname) &&
        !attributes.href.startsWith('#')
      if (isPage) {
        attributes.href = markdownPath(target.pathname) + target.search + target.hash
      }
    },
    beforeNodeProcess({ node }) {
      const parentSkipped = node.parent ? skipped.has(node.parent) : false
      if (!isElement(node)) return parentSkipped ? { skip: true } : undefined
      if (!parentSkipped && !isNoise(node)) return undefined
      skipped.add(node)
      return { skip: true }
    },
    onNodeEnter(element) {
      const heading = element.attributes['data-markdown-heading']
      return heading ? `\n\n### ${heading}\n\n` : undefined
    },
  })
}

/** The page rendered at `page` as compact Markdown: its content without the header and footer, links absolute. */
export function pageToMarkdown(html: string, page: URL) {
  const markdown = htmlToMarkdown(html, {
    origin: page.origin,
    clean: true,
    hooks: [pagePlugin(page)],
    plugins: {
      filter: { include: html.includes('id="content"') ? [CONTENT] : [] },
      // Description lists (tools, safeguards) as `- **Term**: description`.
      tagOverrides: {
        dl: { enter: '\n', exit: '\n' },
        dt: { enter: '- **', exit: '**:', spacing: [0, 0], isInline: true },
        dd: { enter: '', exit: '\n', spacing: [0, 0], isInline: true },
      },
    },
  })
  const compact = markdown.replace(/[ \t]+$/gm, '').replace(/\n{3,}/g, '\n\n')
  return `${compact.trim()}\n`
}
