<script lang="ts">
import Code from './Code.svelte'

/**
 * Code samples behind a tab list, with the WAI-ARIA tabs pattern: arrow keys, Home, and End move between tabs, and
 * only the selected tab is in the tab order. Every panel stays in the page, so the Markdown twin carries them all.
 */
let {
  id,
  tabs,
}: { id: string; tabs: ReadonlyArray<{ name: string; summary: string; source: string }> } = $props()
let selected = $state(0)
const buttons: Array<HTMLButtonElement> = []

function onkeydown(event: KeyboardEvent) {
  const last = tabs.length - 1
  const next =
    event.key === 'ArrowRight'
      ? selected === last
        ? 0
        : selected + 1
      : event.key === 'ArrowLeft'
        ? selected === 0
          ? last
          : selected - 1
        : event.key === 'Home'
          ? 0
          : event.key === 'End'
            ? last
            : undefined
  if (next === undefined) return
  event.preventDefault()
  selected = next
  buttons[next]?.focus()
}
</script>

<div>
  <div role="tablist" aria-label="Workflow triggers" class="tablist" tabindex="-1" {onkeydown}>
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
        {tab.name}
      </button>
    {/each}
  </div>
  <!-- Panels share one grid cell, so switching tabs never moves what follows. -->
  <div class="panels">
    {#each tabs as tab, i}
      <div
        role="tabpanel"
        id="{id}-panel-{i}"
        aria-labelledby="{id}-tab-{i}"
        class="panel"
        class:shown={selected === i}
        data-markdown-heading={tab.name}
        inert={selected !== i}
      >
        <p class="summary">{tab.summary}</p>
        <Code source={tab.source} label="{tab.name} workflow" />
      </div>
    {/each}
  </div>
</div>

<style>
  .tablist {
    display: flex;
    flex-wrap: wrap;
    gap: 0.25rem;
    padding: 0.25rem;
    border-radius: var(--radius-l);
    background: var(--sunken);
    width: fit-content;
    max-width: 100%;
  }
  [role='tab'] {
    min-height: 2.75rem;
    padding: 0.375rem 0.875rem;
    border-radius: var(--radius-m);
    color: var(--muted);
    font-weight: 600;
    cursor: pointer;
    transition:
      background-color 250ms cubic-bezier(0.22, 1, 0.36, 1),
      color 250ms cubic-bezier(0.22, 1, 0.36, 1);
  }
  [role='tab']:hover {
    color: var(--ink);
  }
  /* Raised, and underlined in indigo: the underline carries the state at over 3:1 in both modes, not colour alone. */
  [role='tab'][aria-selected='true'] {
    background: var(--surface);
    color: var(--ink);
    box-shadow: inset 0 -2px 0 var(--accent);
  }
  .panels {
    display: grid;
    margin-top: 1rem;
  }
  .panel {
    grid-area: 1 / 1;
    min-width: 0;
  }
  /* Unselected panels keep their size in the shared cell, unseen and inert; only the selected one shows. */
  .panel:not(.shown) {
    visibility: hidden;
  }
  .summary {
    margin-bottom: 0.75rem;
  }
</style>
