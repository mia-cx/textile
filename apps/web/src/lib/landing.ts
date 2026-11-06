/**
 * The landing page's product facts: one workflow that runs on Textile, the tool calls that publish and enable it, and
 * a one-off script. They follow docs/workflows.md and the workflow tool descriptions in packages/isolate; keep them in
 * step with those.
 */

/** A sample bot's ID, for the workflow's route. */
export const BOT_ID = '876543210987654321'
export const WORKFLOW_NAME = 'standup'
export const ROUTE = `/workflows/${BOT_ID}/${WORKFLOW_NAME}`
export const CRON = '0 9 * * 1-5'
/** The webhook's shared secret, as the workflow's source spells it. */
export const SECRET = 'replace-with-a-long-random-string'
/** What the workflow posts on each tick. */
export const STANDUP_POST = 'Standup time: what did you ship today?'

/** One workflow with all three kinds of trigger: a cron schedule, a slash command, and an HTTP route. */
export const WORKFLOW = `import { Client, Events } from 'discord.js'
import { kv } from 'textile'

const STANDUP = '123456789012345678' // the #standup channel
// Shared with the service that calls this workflow's route
const SECRET = '${SECRET}'

const client = new Client({
  intents: [],
  schedules: ['${CRON}'],
})

// Weekdays at 9:00 UTC
client.on('schedule', async () => {
  const channel = await client.channels.fetch(STANDUP)
  await channel.send('${STANDUP_POST}')
})

// /standup shipped:<text>
client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return
  if (interaction.commandName !== 'standup') return
  const shipped = interaction.options.getString('shipped')
  // A key per person: interactions run at once
  const key = \`shipped:\${interaction.user.id}\`
  const last = await kv.get(key)
  await kv.set(key, shipped)
  const reply = \`Logged: \${shipped}.\`
  await interaction.reply(
    last ? \`\${reply} Last time: \${last}.\` : reply,
  )
})

// POST /workflows/<bot ID>/${WORKFLOW_NAME}
export default {
  async fetch(request: Request) {
    const auth = request.headers.get('authorization')
    if (auth !== \`Bearer \${SECRET}\`) {
      return new Response('unauthorized', { status: 401 })
    }
    const { text } = await request.json()
    await client.rest.post(\`/channels/\${STANDUP}/messages\`, {
      body: { content: text },
    })
    return new Response('ok')
  },
}`

const GRANTS = {
  operations: [],
  families: ['channel', 'message', 'interaction', 'webhook'],
  hosts: [],
}

/** JSON indented by object, with each array of plain values on one line, as a person would write it. */
const json = (value: unknown) =>
  JSON.stringify(value, null, 2).replace(
    /\[\n\s+([^[\]{}]*?)\n\s*\]/g,
    (_, items: string) => `[${items.split(/,\n\s+/).join(', ')}]`,
  )

/** What `discord_workflow_publish` and `discord_workflow_enable` return for the workflow above. */
const revision = (enabled: boolean) =>
  json({
    name: WORKFLOW_NAME,
    revision: 1,
    events: ['schedule', 'interactionCreate'],
    intents: [],
    route: ROUTE,
    schedules: [CRON],
    grants: GRANTS,
    packages: [],
    enabled,
  })

/** The agent's two tool calls, each with its arguments and what Textile answers. */
export const CALLS = [
  {
    tool: 'discord_workflow_publish',
    // The source is the file beside it, cut short here.
    arguments: json({
      name: WORKFLOW_NAME,
      grants: { families: GRANTS.families },
      source: "import { Client, Events } from 'discord.js'…",
    }),
    result: revision(false),
  },
  {
    tool: 'discord_workflow_enable',
    arguments: `{ "name": "${WORKFLOW_NAME}" }`,
    result: revision(true),
  },
] as const

/** What the workflow replies to /standup: what you shipped, and what you logged before it, if anything. */
export const standupReply = (shipped: string, last?: string) =>
  last ? `Logged: ${shipped}. Last time: ${last}.` : `Logged: ${shipped}.`

export const SCRIPT = `import { EmbedBuilder } from 'discord.js'

const CHANNEL_ID = '123456789012345678'

export default async ({ client }) => {
  const channel = await client.channels.fetch(CHANNEL_ID)
  for (const title of ['One', 'Two', 'Three']) {
    await channel.send({
      embeds: [new EmbedBuilder().setTitle(title)],
    })
  }
  return 'sent'
}`

/** The notice a bot posts before it relays voice, and its buttons' replies (packages/bot-host/src/consent.ts). */
export const VOICE_NOTICE = {
  notice: 'I’m relaying voice in this channel to an AI agent.',
  optOutHere: 'Opt out here',
  optOutAll: 'Opt out of all Textile bots',
  optedOutHere: 'I won’t relay your voice in this server.',
  optedOutAll: 'No Textile bot will relay your voice.',
  undoneHere: 'I can relay your voice in this server again.',
  undoneAll: 'Textile bots can relay your voice again.',
} as const

const fence = (language: string, code: string) => `\`\`\`${language}\n${code}\n\`\`\``

/**
 * The landing page's Markdown twin: the same story as the page, written to be read. Links are absolute on `origin`, and
 * links to the site's pages point at their twins.
 */
export const landingMarkdown = (origin: string) => `# Discord bots for AI agents

Your agent writes the code. Textile keeps the bot online.

Textile is a Discord bot platform for AI agents, served over MCP. Your agent signs in, sends its bot's token with each
request, and gets a bot that stays online, runs the discord.js workflows the agent writes, runs one-off scripts, and
joins voice channels. Textile hosts no models: your agent brings its own.

[Sign in with Discord](${origin}/login) · [Read the docs](${origin}/docs.md)

## Your agent ships a workflow over MCP

A workflow is plain discord.js, written like any bot. This one posts a standup prompt every weekday, logs answers to a
\`/standup\` slash command, and posts whatever an outside service sends to its HTTP route:

${fence('ts', WORKFLOW)}

The agent publishes it with \`${CALLS[0].tool}\`. Textile bundles it, loads it once to find the events, schedules, and
route it uses, and stores it as revision 1:

${fence('json', CALLS[0].result)}

Then \`${CALLS[1].tool}\` runs it. From then on, the bot stays online without the agent. Each event, tick, and request
runs the workflow in a fresh sandbox that never holds the bot's token: a broker checks every call against the
workflow's grants and adds the token itself. [Read about workflows](${origin}/docs/workflows.md).

## Slash commands answer from your code

When someone runs \`/standup shipped:the onboarding flow\`, the workflow answers in its own isolate, and remembers
each person's last answer in the workflow's key-value store:

> ${standupReply('the onboarding flow', 'dark mode for the docs')}

## Cron schedules, one run per tick

\`${CRON}\` is 9:00 UTC, Monday to Friday. Each tick runs once, however many hosts there are. A tick missed while the
bot was offline runs once, late, when it is back.

> ${STANDUP_POST}

## Webhooks from anywhere

The workflow answers HTTP at \`${ROUTE}\`. Routes are public, so the handler checks the caller's secret: a request
without it gets \`401 unauthorized\` and posts nothing.

${fence('http', `POST ${ROUTE}\nAuthorization: Bearer ${SECRET}\nContent-Type: application/json\n\n{ "text": "Deployed v2.4.1" }`)}

## Many Discord calls, one tool call

\`discord_script_run\` runs discord.js once, now, under the same grants as workflows, so a batch of Discord calls costs
your agent one tool call:

${fence('ts', SCRIPT)}

## Voice, speaker by speaker

Join a voice channel and open one WebSocket. Each person's audio arrives as its own stream, tagged with their Discord
ID, in Opus or PCM16. Send audio back and the bot speaks. Before the bot hears anyone, it posts a notice:

> ${VOICE_NOTICE.notice}
>
> **${VOICE_NOTICE.optOutHere}** · **${VOICE_NOTICE.optOutAll}**

Anyone who opts out is never relayed: their audio is dropped before it is decrypted. Textile never stores audio.
[Read about voice](${origin}/docs/voice.md).

## Access opens in rounds

Textile starts with a closed alpha. [Sign in with Discord](${origin}/login) to check your access, and to find where to
follow progress until you're in. [MCP tools](${origin}/docs/tools.md) lists every tool your agent gets.
`
