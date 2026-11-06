<script lang="ts">
import { highlight } from '$lib/highlight'

/** A TypeScript sample on an indigo swatch. */
let { source, label }: { source: string; label?: string } = $props()
</script>

<!-- A sample wider than a phone scrolls sideways, so keyboard users can focus it to scroll. -->
<!-- svelte-ignore a11y_no_noninteractive_tabindex -->
<pre class="code" tabindex="0" aria-label={label}><code class="language-ts">{@html highlight(source)}</code></pre>

<style>
  .code {
    overflow-x: auto;
    padding: 1.125rem 1.25rem;
    border-radius: var(--radius-l);
    background: var(--code-bg);
    color: var(--code-text);
    font-size: 0.875rem;
    line-height: 1.65;
    tab-size: 2;
  }
  .code :global(.tok-comment) {
    color: var(--code-muted);
  }
  .code :global(.tok-string) {
    color: var(--code-string);
  }
  .code :global(.tok-keyword) {
    color: var(--code-key);
  }
  .code :global(.tok-key) {
    color: var(--code-prop);
  }
</style>
