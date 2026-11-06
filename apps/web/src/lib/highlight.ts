/**
 * Just enough TypeScript highlighting for the landing page's samples: comments, strings, keywords, and the property
 * keys a reader scans for. Returns escaped HTML. The docs highlight their own code through Svartz.
 */
const TOKEN =
  /(\/\/[^\n]*)|(`(?:\\.|[^`\\])*`|'(?:\\.|[^'\\])*')|\b(import|from|export|default|const|async|await|if|return|new|for|of)\b|\b([A-Za-z_$][\w$]*)(?=\s*:(?!:))/g

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;')

export function highlight(source: string) {
  let html = ''
  let last = 0
  for (const match of source.matchAll(TOKEN)) {
    const [text, comment, string, keyword] = match
    const kind = comment ? 'comment' : string ? 'string' : keyword ? 'keyword' : 'key'
    html += `${escapeHtml(source.slice(last, match.index))}<span class="tok-${kind}">${escapeHtml(text)}</span>`
    last = match.index + text.length
  }
  return html + escapeHtml(source.slice(last))
}
