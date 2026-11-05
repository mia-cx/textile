<script lang="ts">
// The site's design tokens; svartz.config.ts maps Svartz's tokens onto them.
import '@discord-mcp/web/tokens.css'

let { children } = $props()
</script>

{@render children()}
