---
title: MCP tools
description: Every tool Textile serves over MCP, for the Discord API, scripts, workflows, and voice.
order: 6
---

Every call acts as the bot whose token comes with the request, and Discord checks that bot's
permissions as it would for any bot. Search and describe report the permissions an operation
needs; Textile doesn't enforce them.

## Discord API

| Tool | Purpose |
| --- | --- |
| `discord_api_search` | Find operations and the permissions they need. |
| `discord_api_describe` | Read an operation's parameters and body schema. |
| `discord_api_read` | Run read operations. |
| `discord_api_write` | Run create and update operations. |
| `discord_api_destructive` | Run deletes and other destructive operations. |
| `discord_api_admin` | Change bot and application settings and commands. |
| `discord_guild_get` | Read a server, compact and typed. |
| `discord_permissions_explain` | Diagnose effective server and channel permissions. |

## Scripts and workflows

See [Scripts and workflows](workflows.md).

| Tool | Purpose |
| --- | --- |
| `discord_script_run` | Run discord.js once, as the bot. |
| `discord_workflow_publish` | Store a new revision of a workflow. |
| `discord_workflow_list` | List workflows and who changed them. |
| `discord_workflow_enable` | Run a revision and show its grants. |
| `discord_workflow_disable` | Stop running a workflow. |
| `discord_workflow_delete` | Delete a workflow, its state, and its logs. |
| `discord_workflow_logs` | Read recent runs, errors, and console output. |

## Voice

See [Voice](voice.md).

| Tool | Purpose |
| --- | --- |
| `discord_voice_join` | Join a voice channel to play audio, and optionally hear it. |
| `discord_voice_leave` | Leave a server's voice channel. |
