<script lang="ts">
import { page } from '$app/state'
import { markdownPath } from '$lib/markdown-paths'

/** Copy page and View as Markdown: the current page's Markdown twin, for pasting into an agent or reading raw. */
const href = $derived(markdownPath(page.url.pathname))
let copied = $state(false)
let failed = $state(false)

async function copy() {
  failed = false
  try {
    const response = await fetch(href, { headers: { accept: 'text/markdown' } })
    if (!response.ok) throw new Error(`HTTP ${response.status}`)
    await navigator.clipboard.writeText(await response.text())
    copied = true
    setTimeout(() => (copied = false), 2000)
  } catch {
    failed = true
  }
}
</script>

<div class="flex flex-wrap items-center gap-x-5 gap-y-1">
  <button type="button" class="control" onclick={copy} aria-live="polite">
    <!-- Both labels share one cell, so the button keeps its width as the label changes. -->
    <span class="grid">
      <span class="label" class:shown={!copied && !failed}>Copy page</span>
      <span class="label" class:shown={copied}>Copied</span>
      <span class="label" class:shown={failed}>Couldn’t copy</span>
    </span>
  </button>
  <a class="control" {href}>View as Markdown</a>
</div>

<style>
  .control {
    display: inline-flex;
    align-items: center;
    min-height: 2.75rem;
    color: var(--accent-text);
    font: inherit;
    cursor: pointer;
    text-decoration: underline;
    text-decoration-thickness: 1px;
    text-underline-offset: 0.2em;
  }
  .control:hover {
    text-decoration-thickness: 2px;
  }
  .label {
    grid-area: 1 / 1;
    visibility: hidden;
  }
  .label.shown {
    visibility: visible;
  }
</style>
