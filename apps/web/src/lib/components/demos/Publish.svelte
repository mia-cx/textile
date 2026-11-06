<script lang="ts">
import { CALLS, WORKFLOW, WORKFLOW_NAME } from '$lib/landing'
import Code from '../Code.svelte'
import Tabs from '../Tabs.svelte'

/** The workflow's source beside the two tool calls an agent makes to run it, with what Textile answers to each. */
</script>

<div class="frame">
  <div class="publish">
    <Code source={WORKFLOW} title="{WORKFLOW_NAME}.ts" label="The {WORKFLOW_NAME} workflow" />
    <div>
      <Tabs id="calls" label="The agent’s tool calls" tabs={CALLS.map((call) => call.tool)}>
        {#snippet panel(i)}
          {@const call = CALLS[i]}
          {#if call}
            <div class="call">
              <Code source={call.arguments} title="Arguments" label="{call.tool} arguments" />
              <Code source={call.result} title="Result" label="{call.tool} result" />
            </div>
          {/if}
        {/snippet}
      </Tabs>
    </div>
  </div>
</div>

<style>
  .frame {
    container-type: inline-size;
  }
  .publish {
    display: grid;
    gap: 1.25rem;
  }
  .call {
    display: grid;
    gap: 0.75rem;
  }
  @container (min-width: 56rem) {
    .publish {
      grid-template-columns: minmax(0, 1fr) minmax(0, 1fr);
      align-items: start;
    }
  }
</style>
