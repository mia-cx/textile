import { describe, expect, it, vi } from 'vitest'
import { prepareScript } from '../src/bundle.ts'
import { makeIsolateHost, type ScriptExecution } from '../src/isolate-host.ts'

/**
 * A deadline only a hung script reaches, for tests that are not about deadlines. A deadline runs
 * from spawn, and starting workerd alone can take seconds on a busy machine.
 */
const UNHURRIED_MS = 15_000

const execution = async (
  botId: string,
  source: string,
  timeoutMs: number,
): Promise<ScriptExecution> => ({
  botId,
  queue: botId,
  botUser: { id: botId, username: `bot-${botId}`, discriminator: '0', bot: true },
  modules: await prepareScript(source),
  timeoutMs,
  broker: async () => new Response(null, { status: 404 }),
})

/**
 * An execution that holds its slot until `release`. Its script's first fetch reaches the broker,
 * which marks it started and answers once released. Scheduling tests order runs with these, not
 * with sleeps a slow workerd start can outlast.
 */
const held = async (botId: string) => {
  const source = 'export default async () => { await fetch("http://hold.test/") }'
  let release = () => {}
  const released = new Promise<void>((resolve) => {
    release = resolve
  })
  let started = false
  const run: ScriptExecution = {
    ...(await execution(botId, source, UNHURRIED_MS)),
    broker: async () => {
      started = true
      await released
      return new Response(null)
    },
  }
  return { run, release, started: () => started }
}

describe('the isolate host', () => {
  it('kills a runaway script at its deadline', async () => {
    const host = makeIsolateHost()
    const spin = await execution('1', 'export default () => { for (;;) {} }', 2000)

    expect(await host.run(spin)).toEqual({ outcome: 'timed_out', timeoutMs: 2000 })

    // The same bot runs again: the killed process took nothing with it.
    const recovered = await host.run(
      await execution('1', 'export default () => "back"', UNHURRIED_MS),
    )
    expect(recovered).toEqual({ outcome: 'completed', result: 'back', logs: [] })
  })

  it('keeps answering another bot while one script spins', async () => {
    const host = makeIsolateHost()
    let spinning = false
    const stop = new AbortController()
    const spin: ScriptExecution = {
      ...(await execution(
        '1',
        'export default async () => { await fetch("http://spin.test/"); for (;;) {} }',
        UNHURRIED_MS,
      )),
      broker: async () => {
        spinning = true
        return new Response(null)
      },
      signal: stop.signal,
    }
    const spun = host.run(spin)
    await vi.waitFor(() => expect(spinning).toBe(true))

    const answer = await execution(
      '2',
      'export default ({ client }) => client.user.username',
      UNHURRIED_MS,
    )
    expect(await host.run(answer)).toEqual({ outcome: 'completed', result: 'bot-2', logs: [] })

    stop.abort(new Error('done spinning'))
    await expect(spun).rejects.toThrow('done spinning')
  })

  it('reports a script that never settles, or exhausts its heap, as crashed', async () => {
    const host = makeIsolateHost()
    const waiting = await execution('1', 'export default () => new Promise(() => {})', UNHURRIED_MS)
    const hog = await execution(
      '2',
      'export default () => { const a = []; for (;;) a.push(new Array(1e6).fill(1)) }',
      UNHURRIED_MS,
    )

    const [never, oom] = await Promise.all([host.run(waiting), host.run(hog)])

    expect(never.outcome).toBe('crashed')
    expect(oom.outcome).toBe('crashed')
  })

  it('reports a script that bends what the entry module returns as crashed', async () => {
    const run = await makeIsolateHost().run(
      await execution(
        '1',
        `export default () => { Array.prototype.toJSON = () => null; console.log('hi') }`,
        UNHURRIED_MS,
      ),
    )

    expect(run).toEqual({ outcome: 'crashed', message: 'The script reported a malformed result.' })
  })

  it('gives a script no way to read host files', async () => {
    const run = await makeIsolateHost().run(
      await execution(
        '1',
        `import { readFileSync } from 'node:fs'
        const attempt = async (read) => { try { return JSON.stringify(await read()) } catch (error) { return 'refused' } }
        export default async () => [
          await attempt(() => import('../../' + String() + 'package.json', { with: { type: 'json' } })),
          await attempt(() => require('../../../package.json')),
          await attempt(() => readFileSync('${process.cwd()}/package.json', 'utf8')),
        ]`,
        UNHURRIED_MS,
      ),
    )

    expect(run).toEqual({
      outcome: 'completed',
      result: ['refused', 'refused', 'refused'],
      logs: [],
    })
  })

  it('serves discord.js to default and dynamic imports alike', async () => {
    const run = await makeIsolateHost().run(
      await execution(
        '1',
        `import Discord from 'discord.js'
        export default async ({ client }) => {
          const { EmbedBuilder } = await import('discord.js')
          return [new EmbedBuilder().setTitle('dynamic').toJSON(), client instanceof Discord.Client]
        }`,
        UNHURRIED_MS,
      ),
    )

    expect(run).toEqual({
      outcome: 'completed',
      result: [{ title: 'dynamic' }, true],
      logs: [],
    })
  })

  it('returns a large result with multi-byte characters intact', async () => {
    const run = await makeIsolateHost().run(
      await execution('1', `export default () => '€'.repeat(200000)`, UNHURRIED_MS),
    )

    expect(run).toEqual({ outcome: 'completed', result: '€'.repeat(200000), logs: [] })
  })

  it('runs no more workerd processes at once than its concurrency allows', async () => {
    const host = makeIsolateHost(1)
    const finished: string[] = []
    const slow = await execution(
      '1',
      'export default () => new Promise((r) => setTimeout(r, 500))',
      UNHURRIED_MS,
    )
    const quick = await execution('2', 'export default () => "quick"', UNHURRIED_MS)

    await Promise.all([
      host.run(slow).then(() => finished.push('slow')),
      host.run(quick).then(() => finished.push('quick')),
    ])

    expect(finished).toEqual(['slow', 'quick'])
  })

  it('runs urgent executions in slots of their own, bounded like the rest', async () => {
    const host = makeIsolateHost(1)
    const finished: string[] = []
    const ordinary = await held('1')
    const first = await held('2')
    const second = await execution('3', 'export default () => 0', UNHURRIED_MS)
    const runs = Object.entries({
      ordinary: ordinary.run,
      first: { ...first.run, urgent: true },
      second: { ...second, urgent: true },
    })

    const all = Promise.all(
      runs.map(([name, run]) => host.run(run).then(() => finished.push(name))),
    )
    await vi.waitFor(() => expect([ordinary.started(), first.started()]).toEqual([true, true]))
    // One at a time in the single urgent slot, but never behind the ordinary run holding its own.
    first.release()
    await vi.waitFor(() => expect(finished).toEqual(['first', 'second']))
    ordinary.release()
    await all
    expect(finished).toEqual(['first', 'second', 'ordinary'])
  })

  it('hands a free slot to each waiting bot in turn', async () => {
    const host = makeIsolateHost(1)
    const finished: string[] = []
    const busy = await execution(
      '1',
      'export default () => new Promise((r) => setTimeout(r, 300))',
      UNHURRIED_MS,
    )
    const runs = [
      { ...busy, queue: 'bot-1:a', label: 'bot-1 a' },
      { ...busy, queue: 'bot-1:b', label: 'bot-1 b' },
      { ...busy, queue: 'bot-1:c', label: 'bot-1 c' },
      { ...(await execution('2', 'export default () => 0', UNHURRIED_MS)), label: 'bot-2' },
    ]

    await Promise.all(
      runs.map(({ label, ...run }) => host.run(run).then(() => finished.push(label))),
    )

    expect(finished).toEqual(['bot-1 a', 'bot-2', 'bot-1 b', 'bot-1 c'])
  })

  it('never lets one bot hold every slot, so another bot answers its interaction at once', async () => {
    const host = makeIsolateHost(2)
    const finished: string[] = []
    const [a, b] = [await held('1'), await held('1')]
    const runs = [
      { ...a.run, urgent: true, queue: 'bot-1:a', label: 'bot-1 a' },
      { ...b.run, urgent: true, queue: 'bot-1:b', label: 'bot-1 b' },
      {
        ...(await execution('2', 'export default () => 0', UNHURRIED_MS)),
        urgent: true,
        label: 'bot-2',
      },
    ]

    const all = Promise.all(
      runs.map(({ label, ...run }) => host.run(run).then(() => finished.push(label))),
    )
    // Bot 1 holds one of the two slots and waits for the other; bot 2 takes it.
    await vi.waitFor(() => expect(finished).toEqual(['bot-2']))
    expect(b.started()).toBe(false)
    a.release()
    await vi.waitFor(() => expect(b.started()).toBe(true))
    b.release()
    await all
    expect(finished).toEqual(['bot-2', 'bot-1 a', 'bot-1 b'])
  })

  it('skips an execution that waits for a slot past its admission deadline', async () => {
    const host = makeIsolateHost(1)
    const busy = await held('1')
    const late = {
      ...(await execution('2', 'export default () => 0', UNHURRIED_MS)),
      urgent: true,
    }

    const running = host.run({ ...busy.run, urgent: true })
    await expect(host.run({ ...late, admitWithinMs: 300 })).rejects.toThrow('No process slot')
    busy.release()
    expect((await running).outcome).toBe('completed')
    expect(await host.run(late)).toMatchObject({ outcome: 'completed' })
  })

  it('stops waiting for a slot as soon as the execution is abandoned', async () => {
    const host = makeIsolateHost(1)
    const busy = await held('1')
    const waiting = await execution('2', 'export default () => 0', UNHURRIED_MS)

    const running = host.run(busy.run)
    // Waited out, the admission deadline would refuse it with "No process slot".
    await expect(
      host.run({ ...waiting, admitWithinMs: UNHURRIED_MS, signal: AbortSignal.timeout(100) }),
    ).rejects.toMatchObject({ name: 'TimeoutError' })
    busy.release()
    expect((await running).outcome).toBe('completed')
  })

  it('lets a bot past its share use idle slots while one stays free for another bot', async () => {
    const host = makeIsolateHost(4)
    const [a, b] = [await held('1'), await held('1')]
    const running = [
      host.run({ ...a.run, urgent: true, queue: 'bot-1:a' }),
      host.run({ ...b.run, urgent: true, queue: 'bot-1:b' }),
    ]
    await vi.waitFor(() => expect([a.started(), b.started()]).toEqual([true, true]))
    // A third deferred slash command of the same bot, past its share of two, while both hold.
    const third = {
      ...(await execution('1', 'export default () => 0', UNHURRIED_MS)),
      urgent: true,
      queue: 'bot-1:c',
    }

    expect(await host.run(third)).toMatchObject({ outcome: 'completed' })
    a.release()
    b.release()
    await Promise.all(running)
  })
})
