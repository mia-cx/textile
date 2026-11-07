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
export const STANDUP_POST = 'What did you ship?'

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
  // A key per person: different people's answers never collide
  const key = \`shipped:\${interaction.user.id}\`
  const last = await kv.get(key)
  await kv.set(key, shipped)
  const logged = \`Logged: \${shipped}.\`
  const reply = last ? \`\${logged} Last time: \${last}.\` : logged
  // A Discord message holds at most 2,000 characters
  await interaction.reply(reply.slice(0, 2000))
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
  notice: "I'm relaying voice in this channel to an AI agent.",
  optOutHere: 'Opt out here',
  optOutAll: 'Opt out of all Textile bots',
  optedOutHere: "I won't relay your voice in this server.",
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

Host your Discord bot and manage it over MCP.

Textile is a Discord MCP server with bot hosting. You supply a bot token and sign in with Discord.
Your agent can call Discord APIs and publish discord.js workflows that run while the agent is offline.
Textile also supports one-off scripts and voice, using your own speech model.

[Sign in with Discord](${origin}/login) · [Read the docs](${origin}/docs.md)

## Bot hosting

Your bot can keep answering commands after you close your agent. Publish and enable a discord.js workflow through MCP.
This example runs a weekday standup. It posts a reminder and saves what each person shipped:

${fence('ts', WORKFLOW)}

Call \`${CALLS[0].tool}\` with the source and grants. This stores a revision and returns:

${fence('json', CALLS[0].result)}

Call \`${CALLS[1].tool}\` to start it. Enabled workflows keep the bot online without agent calls.
[Read about workflows](${origin}/docs/workflows.md) for grants, supported events and runtime limits.

## Slash commands

The \`/standup\` command saves your update and shows the previous one:

> ${standupReply('the onboarding flow', 'dark mode for the docs')}

Register the command through \`discord_api_admin\` with a required \`shipped\` string option before using it.
Publishing the workflow does not register the command.

## Scheduled messages

Set a cron schedule for reminders or regular updates. This one posts in #standup at 9:00 UTC on weekdays:

> ${STANDUP_POST}

The cron expression is \`${CRON}\`. After downtime, the scheduler selects the latest missed tick per schedule and skips earlier ticks.
It dispatches each tick at most once. A crash between recording a tick and starting it can lose that run.

## Webhook updates

Post a deploy update to Discord from your CI job. The route is public, so your handler must check the sender.
This handler checks a shared secret and returns \`401 unauthorized\` if it is missing or wrong.
Replace the example IDs and secret with your own:

${fence('http', `POST ${ROUTE}\nAuthorization: Bearer ${SECRET}\nContent-Type: application/json\n\n{ "text": "Deployed v2.4.1" }`)}

## One-off scripts

Use \`discord_script_run\` to send several messages in one MCP call.
It accepts discord.js code, including embeds like these. Pass the source and its grants with the tool call:

${fence('ts', SCRIPT)}

## Voice chat

Connect your speech model to Discord over a WebSocket. Receive each speaker's audio separately in Opus or PCM16.
Call \`discord_voice_join\` and connect to the returned WebSocket path. Send audio over the socket to speak through the bot.
Set \`receive: true\` to hear the channel. The bot posts this notice before relaying audio:

> ${VOICE_NOTICE.notice}
>
> **${VOICE_NOTICE.optOutHere}** · **${VOICE_NOTICE.optOutAll}**

Anyone in the channel can opt out of this bot in this server, or all Textile bots.
Textile doesn't store audio. Receiving is best-effort because Discord doesn't support bots receiving voice.
[Read about voice](${origin}/docs/voice.md).

The website demos send nothing to Discord. Their buttons only change the demos.

## Try Textile

Textile is in closed alpha. [Sign in with Discord](${origin}/login) to check your access.
[See every MCP tool](${origin}/docs/tools.md).
`
