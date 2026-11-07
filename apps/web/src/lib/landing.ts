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

Your agent writes the code. Textile keeps the bot online.

Textile hosts Discord bots for AI agents. Connect your agent over MCP to call Discord APIs, publish discord.js
workflows, run scripts, and join voice channels. You supply the bot token and sign in with Discord.
Textile runs no AI models; your agent supplies those.

[Sign in with Discord](${origin}/login) · [Read the docs](${origin}/docs.md)

## Run discord.js on Textile

Your agent publishes a discord.js workflow over MCP, then enables it. Textile runs it even when your agent disconnects.
This example posts weekday standup prompts, saves slash command answers, and accepts updates from an HTTP caller:

${fence('ts', WORKFLOW)}

Publish with \`${CALLS[0].tool}\` to store a revision. The result lists its triggers and grants:

${fence('json', CALLS[0].result)}

Enable it with \`${CALLS[1].tool}\`. Enabled workflows keep the bot online without agent calls.
When publishing, your agent grants the workflow access to specific Discord operations and external hosts.
Each run starts in a fresh sandbox.
Textile checks calls against those grants and keeps the bot token outside the sandbox.
[Read about workflows](${origin}/docs/workflows.md) for supported events and runtime limits.

## Reply to slash commands

Register \`/standup\` with a required \`shipped\` string option before using this workflow.
Your agent can register it through \`discord_api_admin\`; publishing a workflow does not register commands.
When someone runs \`/standup shipped:the onboarding flow\`, the workflow saves their answer in its key-value store:

> ${standupReply('the onboarding flow', 'dark mode for the docs')}

## Post on a schedule

Use a UTC cron expression for recurring posts. \`${CRON}\` schedules this prompt for 9:00 each weekday:

> ${STANDUP_POST}

The scheduler dispatches each tick at most once. After downtime, it selects the latest missed tick per schedule.
Earlier missed ticks are skipped. A crash between recording a tick and starting it can lose that run.

## Post to Discord from a webhook

Give your workflow an HTTP handler to accept updates from another service.
This example serves \`${ROUTE}\` and checks a shared secret before posting to Discord.
Replace the example IDs and secret with your own. Routes are public; your handler must authenticate the caller.
A request without the secret gets \`401 unauthorized\` and posts nothing.

${fence('http', `POST ${ROUTE}\nAuthorization: Bearer ${SECRET}\nContent-Type: application/json\n\n{ "text": "Deployed v2.4.1" }`)}

## Many Discord calls, one tool call

Send a batch of messages with \`discord_script_run\`.
Your agent supplies discord.js code and its grants, and Textile runs it once:

${fence('ts', SCRIPT)}

## Connect your agent to voice

Let your agent speak in a Discord voice channel. It can receive each speaker's audio separately, in Opus or PCM16.
Your agent supplies the speech model. Call \`discord_voice_join\` and connect to the returned WebSocket path.
Set \`receive: true\` to request incoming audio, tagged with each speaker's Discord ID.
The bot posts an opt-out notice before relaying voice:

> ${VOICE_NOTICE.notice}
>
> **${VOICE_NOTICE.optOutHere}** · **${VOICE_NOTICE.optOutAll}**

People can opt out of this bot in this server, or every Textile bot. Textile drops their audio before decryption.
Textile doesn't store audio. Receiving is best-effort because Discord doesn't support bots receiving voice.
[Read about voice](${origin}/docs/voice.md).

The interactive examples on the website are simulations. They send nothing to Discord and do not change voice preferences.

## Check your alpha access

The alpha is invite-only. [Sign in with Discord](${origin}/login) to check whether you have access.
[See every MCP tool](${origin}/docs/tools.md).
`
