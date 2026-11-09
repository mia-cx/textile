<script lang="ts">
import type { Snippet } from 'svelte'

/**
 * One Discord message. A bot's carries the APP tag; a reply to a slash command shows who used which command above it,
 * as Discord does.
 */
let {
  author,
  bot = false,
  time,
  used,
  children,
}: {
  author: string
  bot?: boolean
  time: string
  /** The slash command this message answers, and who ran it: `{ by: 'you', command: '/standup' }`. */
  used?: { by: string; command: string }
  children: Snippet
} = $props()
</script>

<article class="message" class:reply={used}>
  {#if used}
    <p class="used"><span class="mini" aria-hidden="true"></span><span class="who">{used.by}</span> used <span class="command">{used.command}</span></p>
  {/if}
  <span class="avatar" class:bot aria-hidden="true">{#if !bot}{author.slice(0, 1).toUpperCase()}{/if}</span>
  <div class="body">
    <p class="meta">
      <span class="author">{author}</span>
      {#if bot}<span class="tag">APP</span>{/if}
      <span class="time">{time}</span>
    </p>
    <div class="content">{@render children()}</div>
  </div>
</article>

<style>
  .message {
    display: grid;
    grid-template-columns: 2.625rem minmax(0, 1fr);
    column-gap: 0.875rem;
    align-items: start;
  }
  .used {
    grid-column: 2;
    display: flex;
    align-items: center;
    gap: 0.35rem;
    margin-bottom: 0.25rem;
    color: #b5bac1;
    font-size: 0.875rem;
    position: relative;
  }
  /* Discord's reply spine, from the avatar up to the command line. */
  .used::before {
    content: '';
    position: absolute;
    left: -2.125rem;
    top: 0.6rem;
    width: 1.75rem;
    height: 0.75rem;
    border-left: 2px solid #4e5058;
    border-top: 2px solid #4e5058;
    border-top-left-radius: 6px;
  }
  .mini {
    width: 1rem;
    height: 1rem;
    border-radius: 50%;
    background: #4e5058;
  }
  .who {
    color: #dbdee1;
    font-weight: 500;
  }
  .command {
    color: #c9b6ff;
    font-weight: 500;
  }
  .avatar {
    grid-column: 1;
    display: grid;
    place-items: center;
    width: 2.625rem;
    height: 2.625rem;
    border-radius: 50%;
    background: #4e5058;
    color: #fff;
    font-weight: 600;
  }
  .avatar.bot {
    background:
      conic-gradient(from 200deg, var(--thread-violet), var(--thread-amber), var(--thread-violet));
    box-shadow: inset 0 0 0 6px rgb(20 18 30);
  }
  .body {
    grid-column: 2;
    min-width: 0;
  }
  .meta {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    gap: 0.375rem;
  }
  .author {
    color: #f2f3f5;
    font-weight: 600;
  }
  .tag {
    padding: 0.05rem 0.3rem;
    border-radius: var(--radius-xs);
    background: var(--accent);
    color: #fff;
    font-size: 0.6875rem;
    font-weight: 600;
    line-height: 1.3;
    align-self: center;
  }
  .time {
    color: #949ba4;
    font-size: 0.8125rem;
  }
  .content {
    margin-top: 0.125rem;
    color: #dbdee1;
    overflow-wrap: anywhere;
  }
</style>
