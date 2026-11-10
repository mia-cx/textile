<script lang="ts">
import { SCRIPT } from '$lib/landing'
import Code from '../Code.svelte'
import Message from '../discord/Message.svelte'
import Window from '../discord/Window.svelte'

/** One `discord_script_run` call beside the three messages it sends. */
const TITLES = ['One', 'Two', 'Three']
</script>

<!-- The page's cord enters the one tool call, and three strands leave it, one into each message it sends. -->
<div class="frame">
  <div class="script">
    <div data-weave="top" data-weave-at="0.5" data-weave-split>
      <Code source={SCRIPT} title="discord_script_run" label="A script that sends three embeds" />
    </div>
    <Window channel="general" label="The three messages the script sends">
      {#each TITLES as title, i}
        <Message author="Weaver" bot time="Today at 2:0{i + 4} PM">
          <span class="embed" data-weave-end="window">{title}</span>
        </Message>
      {/each}
    </Window>
  </div>
</div>

<style>
  .frame {
    container-type: inline-size;
  }
  .script {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: 1.25rem;
  }
  /* Side by side, with room between for the three strands from the call to its messages. */
  @container (min-width: 50rem) {
    .script {
      grid-template-columns: minmax(0, 1.15fr) minmax(0, 1fr);
      column-gap: clamp(4rem, 9cqi, 9rem);
      align-items: center;
    }
  }
  /* An embed: a card with a coloured spine and its title. */
  .embed {
    display: block;
    width: min(100%, 18rem);
    margin-top: 0.25rem;
    padding: 0.625rem 0.875rem;
    border-left: 4px solid var(--thread-violet);
    border-radius: var(--radius-xs);
    background: rgb(255 255 255 / 0.05);
    color: #f2f3f5;
    font-weight: 600;
  }
</style>
