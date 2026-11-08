---
title: Security
description: What each credential grants, where bot tokens live, what agent code can reach, and how people in voice channels opt out.
order: 4
---

## Two credentials, two questions

Every HTTP request to the relay carries two credentials:

```http
Authorization: Bearer YOUR_RELAY_OAUTH_ACCESS_TOKEN
X-Discord-Bot-Token: YOUR_DISCORD_BOT_TOKEN
```

- **The OAuth credential says which human is asking.** Login requests Discord's `identify` scope,
  plus `guilds.join` when the operator sets a community server, so sign-in can add the human to it.
  Operators restrict access with `DISCORD_OAUTH_ALLOWED_USER_IDS`: unlisted accounts can't
  finish login or use credentials issued earlier. Stored tokens, scripts, workflows, and voice
  run only with that list set.
- **The bot token says what may be done.** Login doesn't prove bot ownership or restrict a bot to
  that human's guild permissions. Whoever holds a bot's token holds that bot's authority,
  including managing its workflows. Discord decides each call against the bot.

The relay checks both with Discord on every request and caches neither result. Responses use
`Cache-Control: no-store`. Revoking Discord authorization or resetting the bot token stops the
next request. Neither credential belongs in a URL, a tool argument, or a log; redact both headers
in clients and proxies.

## Logins

The OAuth credential is an encrypted, audience-bound relay token that encloses the human's
Discord login grant. It expires with that grant, after seven days at most. Refreshing rotates
Discord's own refresh token, and Discord rejects a reused one, so a stolen refresh token or
authorization code works at most once. No login state lives in server memory.

## Stored bot tokens

An agent's first call for a bot stores its token in Postgres, encrypted with the operator's
`TOKEN_VAULT_KEY`, and so is each Gateway shard's session. Only bot hosts hold the key. Central
replicas, which serve MCP, hold no bot tokens.

## Agent code

Scripts and workflows run in sandboxed [workerd](https://github.com/cloudflare/workerd)
isolates, each run in a fresh process under a deadline. The isolate never sees the bot's token.

- **Every request goes to the broker.** Whatever URL the code fetches, the request reaches
  Textile's broker. It matches each Discord call to a catalog operation, checks the code's
  grants, and replays allowed calls with the real token.
- **Grants are explicit.** Each script and workflow declares the operations it may call and the
  hosts it may reach. Destructive and admin operations must be named one by one. A refused call
  fails with HTTP 403.
- **Egress reaches public hosts only.** Outbound HTTP goes to granted hosts. The broker checks
  every address a hostname resolves to and every redirect target, refuses private, loopback,
  link-local, cloud metadata, and IPv4-mapped addresses, and connects to the address it checked.
- **Logs are redacted.** Bot and interaction tokens in workflow logs and errors read `[redacted]`.
- **Changes are attributed.** Every workflow publish, enable, disable, and delete is recorded
  with the acting human's Discord user ID.

Workflow webhook routes need no login, so each handler verifies its own callers, for example by
a signature over the exact body bytes. Route responses are served with a sandbox content
security policy. See [Scripts and workflows](workflows.md).

## Voice

Before a bot receives anyone's voice, it posts a notice in the channel's chat with two buttons:
**Opt out here**, for this bot in this server, and **Opt out of all Textile bots**. Textile
handles those clicks itself; they never reach workflows or agents. Opted-out speakers' audio is
dropped before it is decrypted. If the notice can't be posted, the session only sends audio.
Textile never stores audio. See [Voice](voice.md).

## Permissions

Search and describe report each operation's Discord permission requirements. The relay does not
enforce them; Discord does. Destructive and admin tool calls act directly under the bot's
permissions, with no confirmation step, so supervise the agents you connect.

## Report a vulnerability

Email [hello@mia.cx](mailto:hello@mia.cx). Never include passwords or tokens.
