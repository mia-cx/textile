---
title: Voice
description: Play audio in a Discord voice channel and hear each speaker separately, over one WebSocket, with an opt-out notice for everyone in the channel.
order: 3
---

An agent can play audio in a voice channel, as music bots do, and hear each person speaking.
Discord encrypts the audio end to end with DAVE. Sending needs no notice to the channel;
receiving always posts one first. Textile relays audio and never stores it, and runs no speech
models: agents bring their own. Voice needs
[bot hosting](https://github.com/mia-cx/textile#bot-hosting).

## Join and send

1. Call `discord_voice_join` with `guildId` and `channelId`, and `receive: true` to hear the
   channel. The bot needs View Channel, Connect, and Speak. It returns the voice socket's path,
   `/voice?guild_id=…`, and whether it is `receiving`.
2. Open a WebSocket to that path on the relay's host (`wss:` for `https:`) with the same
   `Authorization` and `X-Discord-Bot-Token` headers as `/mcp`, adding the codec to the query:
   - `codec=opus`: each binary message is one Opus packet of 20 ms, 48 kHz stereo audio.
   - `codec=pcm16&sample_rate=R&channels=C`: little-endian 16-bit PCM, interleaved when stereo,
     at `R` of 8000, 12000, 16000, 24000, or 48000 Hz and `C` of 1 (default) or 2. Messages may
     split frames but not samples.
3. Send audio as binary messages. The bot speaks while audio arrives and stops when it pauses for
   more than 100 ms. Audio sent faster than real time waits: once a second of it is queued, the
   bot host stops reading the socket until it plays.

## Receive

With `receive: true`, the bot joins deafened and posts a notice in the voice channel's chat, which
needs Send Messages there:

> I'm relaying voice in this channel to an AI agent.

Its buttons let anyone opt out: **Opt out here** of this bot in this server, or **Opt out of all
Textile bots** of every bot Textile hosts. Each reply is visible only to the person who clicked,
and offers an undo. Once the notice is up the bot undeafens, and the socket sends:

- A binary message per packet: the speaker's user ID as 8 bytes, big-endian, then one packet in
  the socket's codec. `pcm16` decodes each speaker separately.
- JSON text events: `{"type":"join","user_id":"…"}` and `{"type":"leave","user_id":"…"}` as
  people come and go, and `{"type":"speaking","user_id":"…","speaking":true}` (or `false`).

When the notice can't be posted, `receiving` is false, `reason` says why, and the session only
sends audio. The same happens when the bot's application has an Interactions Endpoint URL, since
Discord would send the buttons' clicks there instead of to Textile. Joining the same channel
again switches receiving on or off. If the bot is moved to another channel, it stops receiving
until it joins with `receive: true` there.

People who opted out never appear: their audio is dropped before it is decrypted. Opt-outs and
undos apply at once on every bot host, which Postgres notifies of each one. While a bot host's
notification connection is down, it relays nobody, and it checks everyone again once it
reconnects. Opt-outs are stored as user IDs only, with the bot and server for a per-bot opt-out.
The buttons answer while the bot is online.

Discord neither documents nor supports bots receiving voice, so receiving is best-effort and may
break without notice. A speaker is heard only once Discord names their audio stream, so their
first packets may be dropped. Packets carry no sequence numbers, so the agent can't detect loss or
reordering. Audio a slow agent hasn't read past about 1 MiB is dropped.

## Errors and closing

Before upgrading, the relay answers 401 or 403 for bad credentials, 400 for a bad query, and
409 when the bot is not in a voice channel in that server. The socket closes with:

| Code | Meaning |
| --- | --- |
| 1000 | The bot left the channel, through `discord_voice_leave` or because Discord disconnected it. |
| 1001 | The bot went offline, or the server is shutting down. |
| 1003 | A text message arrived; send audio as binary messages. |
| 1007 | A message was not valid audio for the codec. |
| 1009 | A message was larger than 256 KiB. |
| 4000 | A newer socket for the same server replaced this one. |

Closing the socket stops playback after any queued audio; the bot stays in the channel until it
leaves. Joining another channel in the same server moves the bot and closes its socket. An open
socket keeps the bot online past its 24-hour idle timeout. Voice outlasts a resumed Gateway
connection, but not a new Gateway session or a server restart: join again after a 1001 close.
