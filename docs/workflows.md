---
title: Scripts and workflows
description: Run discord.js once with discord_script_run, or publish workflows that run on Gateway events, slash commands, cron schedules, and webhooks.
order: 2
---

Agents write plain discord.js. A script runs once, now. A workflow is published, then runs as the
bot on events, schedules, and HTTP requests while no agent is connected. Both run in sandboxed
[workerd](https://github.com/cloudflare/workerd) isolates that never see the bot's token; see
[Security](security.md).

## Scripts

`discord_script_run` batches many Discord calls into one tool call. The source is a
module whose default export receives a discord.js `Client`:

```ts
import { EmbedBuilder } from 'discord.js'

export default async ({ client }) => {
  const channel = await client.channels.fetch('123456789012345678')
  for (const title of ['One', 'Two', 'Three']) {
    await channel.send({ embeds: [new EmbedBuilder().setTitle(title)] })
  }
  return 'sent'
}
```

Pass `grants` with the call: `operations` lists catalog operation IDs, `families`
grants a family's read and write operations, and `hosts` lists hostnames the script
may `fetch()`. Destructive and admin operations must be named in `operations`. A
refused call fails inside the script with HTTP 403 and is listed in the result's `denied`.

Each script runs once in a fresh workerd process with no Gateway connection and no bot token.
Every request it makes, whatever its URL, reaches a broker in the relay. The broker matches
Discord calls to catalog operations, checks the grants, and replays them with the request's bot
token. Outbound HTTP reaches granted hosts on public addresses only. One bot's scripts run one at
a time. A script is killed after `timeoutSeconds` (30 by default, 120 at most).

The HTTP relay offers the tool only when `DISCORD_OAUTH_ALLOWED_USER_IDS` is set.
Local stdio always offers it. workerd ships as an npm dependency for glibc Linux,
macOS, and Windows.

## Workflows

A workflow is discord.js code that runs as the bot on Gateway events, cron schedules, and
inbound HTTP requests, while no agent is connected. It is written like an ordinary bot:

```ts
import { Client, Events, GatewayIntentBits } from 'discord.js'

const client = new Client({
  intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMessages, GatewayIntentBits.MessageContent],
})

client.on(Events.MessageCreate, async (message) => {
  if (message.content === 'ping') await message.reply('pong')
})

client.login(process.env.DISCORD_TOKEN)
```

`discord_workflow_publish` bundles the source with esbuild and loads it once in workerd to
find the events its clients listen for and the intents and schedules they declare, then stores
the bundle as the workflow's next immutable revision.

A workflow may import npm packages listed in `dependencies`, with a version, range, or tag;
pass a `package-lock.json` as `lockfile` to pin every version. npm installs them from the
public registry with install scripts off, through a proxy that reaches only the registry.
Each revision records every package version it was built with. Publishing fails, before any
revision is stored, on a package that can't be bundled or loaded in workerd, such as a native
addon, and on code that can't work when each event runs in a fresh isolate: collectors,
`awaitMessages`, and URL attachments. These checks read the workflow's own syntax, so a call
built at runtime, or made inside a dependency, gets past them. Installs are capped at 256 MB
and two at a time per bot host. discord.js and `textile` always come from the platform, even
for a package that installs its own.

`discord_workflow_enable` runs a revision and returns its grants, intents, and schedules;
Discord's privileged intents must be on in the Developer Portal first. While any workflow is
enabled, the bot stays online without agent calls. After a restart, workflows also run the
events Discord replays.

### Events and slash commands

Workflows listen for `messageCreate`, `messageUpdate`, `messageDelete`,
`messageReactionAdd`, `messageReactionRemove`, `guildMemberAdd`, `guildMemberRemove`, and
`interactionCreate`. Each event runs each listening workflow in its own fresh workerd
process for at most 30 seconds, so nothing in memory lasts between events, and listeners
may receive partial objects. Each workflow receives only the events its own intents cover.
A guild's events run in order; interactions run at once. The bot's own messages are not
delivered. Grants work as for scripts. A workflow may also set the bot's presence, and answer the
interaction it is handling (`reply`, `deferReply`, `editReply`, `followUp`) with the
`interaction` and `webhook` families:

```ts
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand() || interaction.commandName !== 'hello') return
  await interaction.deferReply()
  await interaction.editReply(`hello ${interaction.options.getString('who')}`)
})
```

### Schedules

To run on a schedule, a client lists five-field cron expressions, in UTC, in a `schedules`
option and listens for `schedule`:

```ts
const client = new Client({ intents: [], schedules: ['0 9 * * *'] })

client.on('schedule', async ({ cron, scheduledAt }) => {
  const channel = await client.channels.fetch('123456789012345678')
  await channel.send(`Digest for ${scheduledAt.toISOString().slice(0, 10)}`)
})
```

A workflow declares at most ten schedules, which together fire at most every five minutes, and
each client hears only its own schedules. Each tick runs once, however many bot hosts there are,
and schedules start when the workflow is enabled. A tick missed while the bot's host was down, or
the bot was offline, runs once, late, when the bot is back online: each schedule runs its most
recent missed tick and skips the earlier ones, and `scheduledAt` says when it was due.

### Webhooks

A workflow answers webhooks when it default-exports a fetch handler. It needs no Gateway
listeners, but calls Discord through a client created at the top level:

```ts
import { Client } from 'discord.js'

const client = new Client({ intents: [] })

export default {
  async fetch(request: Request) {
    const { text } = await request.json()
    await client.rest.post('/channels/123456789012345678/messages', { body: { content: text } })
    return new Response('ok')
  },
}
```

Once enabled, any request to `/workflows/<bot ID>/<name>` on the relay, or to a path below it,
runs the handler in a fresh workerd process for at most 10 seconds. Built-in endpoints never
live under `/workflows/`, so a route can't shadow one. Routes need no login, so a handler
should verify its sender, for example by a signature over the exact body bytes it receives.
Request bodies are limited to 1 MiB, and a response body over about 700 KiB fails. The
response keeps only its status, body, and `Content-Type`, and is served with a sandbox
content security policy, since routes share the relay's origin. A disabled or deleted
workflow's route answers 404. While Discord has the bot offline, its routes answer 503 with
`Retry-After: 1`. Each bot may have eight route requests waiting or running; more get 503
too.

### State

A workflow keeps state between runs in its own key-value store:

```ts
import { kv } from 'textile'

const count = ((await kv.get('count')) ?? 0) + 1
await kv.set('count', count)
```

Values are anything JSON can hold. State belongs to the workflow, not a revision: it lasts
across runs, revisions, and restarts, and goes when the workflow is deleted. A workflow's
keys and values take at most 1 MiB together, and a key at most 512 bytes; a `set` past
either throws and stores nothing. Only one guild's non-interaction events run in order:
interactions, route requests, direct messages from different channels, and other guilds'
events run at the same time, so their writes to one key can interleave, and the last one wins.

### Logs and changes

`discord_workflow_logs` shows the bot's recent runs, newest first: each run's event
(`schedule <cron>` for a tick, `HTTP` and the method for a route request), outcome, error, and
console output, filtered by workflow or to failures only. A run keeps up to 16,384 characters of
output; one that timed out or crashed keeps none. Bot and interaction tokens in logs and errors
read `[redacted]`. Runs stay readable for 7 days, up to the newest 1,000 per workflow. Bot hosts
delete expired runs at startup, and at most hourly while workflows run.

Anyone with relay access and the bot's token manages its workflows. Every publish, enable,
disable, and delete is recorded with the acting human's Discord user ID, and
`discord_workflow_list` shows the latest changes. Workflow tools need
[bot hosting](https://github.com/mia-cx/textile#bot-hosting).
