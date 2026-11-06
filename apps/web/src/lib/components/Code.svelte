<script lang="ts">
import { highlight } from '$lib/highlight'

/** A code sample on ink, highlighted by `src/lib/highlight.ts`, with its file or tool name above it when given. */
let { source, label, title }: { source: string; label: string; title?: string } = $props()
</script>

<div class="code">
  {#if title}<p class="title">{title}</p>{/if}
  <!-- A sample wider than its panel scrolls sideways, so keyboard users can focus it to scroll. -->
  <!-- svelte-ignore a11y_no_noninteractive_tabindex -->
  <pre tabindex="0" aria-label={label}><code>{@html highlight(source)}</code></pre>
</div>

<style>
  .code {
    overflow: hidden;
    border: 1px solid rgb(255 255 255 / 0.09);
    border-radius: var(--radius-l);
    background: var(--code-bg);
    color: var(--code-text);
  }
  .title {
    padding: 0.75rem 1.25rem;
    border-bottom: 1px solid rgb(255 255 255 / 0.07);
    color: var(--code-muted);
    font-family: var(--font-code);
    font-size: 0.875rem;
  }
  pre {
    overflow-x: auto;
    padding: 1.125rem 1.25rem 1.25rem;
    font-size: 0.8125rem;
    line-height: 1.7;
    tab-size: 2;
  }
  pre:focus-visible {
    outline-offset: -2px;
  }
  pre :global(.tok-comment) {
    color: var(--code-muted);
  }
  pre :global(.tok-string) {
    color: var(--code-string);
  }
  pre :global(.tok-keyword) {
    color: var(--code-keyword);
  }
  pre :global(.tok-key) {
    color: var(--code-key);
  }
</style>
