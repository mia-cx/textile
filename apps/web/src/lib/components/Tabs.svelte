<script lang="ts">
import type { Snippet } from 'svelte'

/**
 * Panels behind a tab list, with the WAI-ARIA tabs pattern: arrow keys, Home, and End move between tabs, and only the
 * selected tab is in the tab order. Every panel stays in the page, inert when unselected, and all share one grid cell,
 * so switching never moves what follows.
 */
let {
  id,
  label,
  tabs,
  panel,
}: {
  id: string
  label: string
  tabs: ReadonlyArray<string>
  panel: Snippet<[index: number]>
} = $props()
let selected = $state(0)
const buttons: Array<HTMLButtonElement> = []

const KEYS: Record<string, (current: number, last: number) => number> = {
  ArrowRight: (current, last) => (current === last ? 0 : current + 1),
  ArrowLeft: (current, last) => (current === 0 ? last : current - 1),
  Home: () => 0,
  End: (_, last) => last,
}

function onkeydown(event: KeyboardEvent) {
  const move = KEYS[event.key]
  if (!move) return
  event.preventDefault()
  selected = move(selected, tabs.length - 1)
  buttons[selected]?.focus()
}
</script>

<div role="tablist" aria-label={label} class="tablist" tabindex="-1" {onkeydown} data-weave-panel>
  {#each tabs as tab, i}
    <button
      bind:this={buttons[i]}
      type="button"
      role="tab"
      id="{id}-tab-{i}"
      aria-controls="{id}-panel-{i}"
      aria-selected={selected === i}
      tabindex={selected === i ? 0 : -1}
      onclick={() => (selected = i)}
    >
      {tab}
    </button>
  {/each}
</div>
<div class="panels">
  {#each tabs as _, i}
    <div
      role="tabpanel"
      id="{id}-panel-{i}"
      aria-labelledby="{id}-tab-{i}"
      class="panel"
      class:shown={selected === i}
      inert={selected !== i}
    >
      {@render panel(i)}
    </div>
  {/each}
</div>

<style>
  .tablist {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    width: fit-content;
    max-width: 100%;
    /* A rounded rectangle, not a pill: the list wraps on narrow columns, where a pill stretches into an ellipse. Its
       corner is the tabs' plus the padding between them, so the curves nest. */
    padding: 0.375rem;
    border: 1px solid rgb(255 255 255 / 0.08);
    border-radius: calc(var(--radius-m) + 0.375rem);
    background: var(--sunken);
  }
  [role='tab'] {
    min-height: 2.75rem;
    padding: 0.375rem 1.125rem;
    border-radius: var(--radius-m);
    color: var(--muted);
    font-family: var(--font-code);
    font-size: 0.9375rem;
    cursor: pointer;
    transition:
      background-color var(--duration-fast) var(--ease-smooth-out),
      color var(--duration-fast) var(--ease-smooth-out);
  }
  [role='tab']:hover {
    color: var(--ink);
  }
  /* Raised and ringed in violet: the ring carries the state, not colour alone. */
  [role='tab'][aria-selected='true'] {
    background: var(--surface);
    color: var(--ink);
    box-shadow: inset 0 0 0 1px color-mix(in srgb, var(--accent-text) 55%, transparent);
  }
  .panels {
    display: grid;
    margin-top: 1rem;
  }
  .panel {
    grid-area: 1 / 1;
    min-width: 0;
  }
  .panel:not(.shown) {
    visibility: hidden;
  }
</style>
