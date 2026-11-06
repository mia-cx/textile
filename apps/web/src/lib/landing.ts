/**
 * The landing page's product facts: the MCP tools (README.md's table) and workflow samples that run on Textile
 * (docs/workflows.md, and the workflow tests in packages/isolate and apps/server). Keep them in step with those.
 */

export const TOOL_GROUPS = [
  {
    name: 'Discord API',
    tools: [
      ['discord_api_search', 'Find operations and the permissions they need.'],
      ['discord_api_describe', 'Read an operation’s parameters and body schema.'],
      ['discord_api_read', 'Run read operations.'],
      ['discord_api_write', 'Run create and update operations.'],
      ['discord_api_destructive', 'Run deletes and other destructive operations.'],
      ['discord_api_admin', 'Change bot and application settings and commands.'],
      ['discord_guild_get', 'Read a server, compact and typed.'],
      ['discord_permissions_explain', 'Diagnose effective server and channel permissions.'],
    ],
  },
  {
    name: 'Scripts and workflows',
    tools: [
      ['discord_script_run', 'Run discord.js once, as the bot.'],
      ['discord_workflow_publish', 'Store a new revision of a workflow.'],
      ['discord_workflow_list', 'List workflows and who changed them.'],
      ['discord_workflow_enable', 'Run a revision and show its grants.'],
      ['discord_workflow_disable', 'Stop running a workflow.'],
      ['discord_workflow_delete', 'Delete a workflow, its state, and its logs.'],
      ['discord_workflow_logs', 'Read recent runs, errors, and console output.'],
    ],
  },
  {
    name: 'Voice',
    tools: [
      ['discord_voice_join', 'Join a voice channel to play audio, and optionally hear it.'],
      ['discord_voice_leave', 'Leave a server’s voice channel.'],
    ],
  },
] as const

export const WORKFLOWS = [
  {
    name: 'Messages',
    summary: 'Answer messages, joins, and reactions as they happen.',
    source: `import { Client, Events, GatewayIntentBits } from 'discord.js'

const client = new Client({
  intents: [
    GatewayIntentBits.Guilds,
    GatewayIntentBits.GuildMessages,
    GatewayIntentBits.MessageContent,
  ],
})

client.on(Events.MessageCreate, async (message) => {
  if (message.content === 'ping') await message.reply('pong')
})

client.login(process.env.DISCORD_TOKEN)`,
  },
  {
    name: 'Slash commands',
    summary: 'Answer slash commands and buttons.',
    source: `import { Client, Events } from 'discord.js'

const client = new Client({ intents: [] })

client.on(Events.InteractionCreate, async (interaction) => {
  if (!interaction.isChatInputCommand()) return
  if (interaction.commandName !== 'hello') return
  await interaction.deferReply()
  const who = interaction.options.getString('who')
  await interaction.editReply(\`hello \${who}\`)
})

client.login(process.env.DISCORD_TOKEN)`,
  },
  {
    name: 'Schedules',
    summary: 'Post on a cron schedule. Each tick runs once, never twice.',
    source: `import { Client } from 'discord.js'

const client = new Client({ intents: [], schedules: ['0 9 * * *'] })

client.on('schedule', async ({ scheduledAt }) => {
  const channel = await client.channels.fetch('123456789012345678')
  const day = scheduledAt.toISOString().slice(0, 10)
  await channel.send(\`Digest for \${day}\`)
})`,
  },
  {
    name: 'Webhooks',
    summary:
      'Give the bot an HTTP route for other services to call. Anyone can reach it, so it checks the caller.',
    source: `import { Client } from 'discord.js'

const client = new Client({ intents: [] })
// The secret you give the service that calls this route.
const SECRET = 'replace-with-a-long-random-string'

export default {
  async fetch(request: Request) {
    if (request.headers.get('authorization') !== \`Bearer \${SECRET}\`) {
      return new Response('unauthorized', { status: 401 })
    }
    const { text } = await request.json()
    await client.rest.post('/channels/123456789012345678/messages', {
      body: { content: text },
    })
    return new Response('ok')
  },
}`,
  },
] as const

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
