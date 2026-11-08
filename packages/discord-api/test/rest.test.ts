import { setTimeout as delay } from 'node:timers/promises'
import { Effect, Fiber, Redacted } from 'effect'
import { describe, expect, it } from 'vitest'
import { createRateLimiter, DiscordRest } from '../src/rest.ts'

describe('DiscordRest', () => {
  // A deadline that interrupts a request must not leave it waiting to reach Discord later.
  it('cancels an interrupted request that is waiting out a rate limit, so it never reaches Discord', async () => {
    const sent: Array<string> = []
    const discord: typeof fetch = async (input, init) => {
      // Like fetch, an aborted request never goes out.
      init?.signal?.throwIfAborted()
      sent.push(new URL(String(input)).pathname)
      // The bucket is empty until it resets.
      return new Response(null, {
        status: 204,
        headers: {
          'x-ratelimit-bucket': 'members',
          'x-ratelimit-limit': '1',
          'x-ratelimit-remaining': '0',
          'x-ratelimit-reset-after': '0.2',
        },
      })
    }
    const limiter = createRateLimiter(
      { timeoutMs: 10_000, retries: 0, maxRateLimitWaitMs: 1_000 },
      discord,
    )
    const put = (userId: string) =>
      Effect.flatMap(DiscordRest, (rest) =>
        rest.request({
          method: 'PUT',
          route: `/guilds/456789012345678901/members/${userId}`,
          operationFamily: 'test',
        }),
      ).pipe(Effect.provide(DiscordRest.shared(Redacted.make('bot-token'), limiter)))

    // The first answer names the bucket, and the second empties it.
    await Effect.runPromise(put('234567890123456782'))
    await Effect.runPromise(put('234567890123456783'))
    const waiting = Effect.runFork(put('234567890123456784'))
    // Let it reach the rate-limit wait.
    await delay(50)
    await Effect.runPromise(Fiber.interrupt(waiting))
    await delay(400)
    expect(sent).toEqual([
      '/api/v10/guilds/456789012345678901/members/234567890123456782',
      '/api/v10/guilds/456789012345678901/members/234567890123456783',
    ])
    limiter.close()
  })
})
