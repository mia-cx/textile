<script lang="ts">
import 'virtual:svartz/tailwind-sources.css'
import SvartzRuntimePage from '@svartz/ui/runtime'
import { page } from '$app/state'
import type { PageData } from './$types'

let { data }: { data: PageData } = $props()
</script>

<svelte:head>
  {#each data.svartzStylesheets as stylesheet}
    <link rel="stylesheet" href={stylesheet} />
  {/each}
</svelte:head>

<SvartzRuntimePage pathname={page.url.pathname} />
