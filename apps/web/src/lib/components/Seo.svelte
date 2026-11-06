<script lang="ts">
import { page as current } from '$app/state'
import { markdownPath } from '$lib/markdown-paths'
import { ORIGIN, page, SITE_NAME, type SitePath } from '$lib/site'

/** A site page's title, description, canonical URL, social cards, and Markdown twin. */
let { path, noindex = false }: { path: SitePath; noindex?: boolean } = $props()
const { title, description } = $derived(page(path))
const canonical = $derived(`${ORIGIN}${path}`)
const image = `${ORIGIN}/og.png`
</script>

<svelte:head>
  <title>{title}</title>
  <meta name="description" content={description} />
  <link rel="canonical" href={canonical} />
  <link rel="alternate" type="text/markdown" href={markdownPath(current.url.pathname)} />
  {#if noindex}<meta name="robots" content="noindex" />{/if}
  <meta property="og:site_name" content={SITE_NAME} />
  <meta property="og:type" content="website" />
  <meta property="og:title" content={title} />
  <meta property="og:description" content={description} />
  <meta property="og:url" content={canonical} />
  <meta property="og:image" content={image} />
  <meta property="og:image:width" content="1200" />
  <meta property="og:image:height" content="630" />
  <meta property="og:image:alt" content="Threads of light braiding into one cord, beside the words: Discord bots for AI agents." />
  <meta name="twitter:card" content="summary_large_image" />
  <meta name="twitter:title" content={title} />
  <meta name="twitter:description" content={description} />
  <meta name="twitter:image" content={image} />
</svelte:head>
