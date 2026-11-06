import { randomInt } from 'node:crypto'
import { createServer } from 'node:http'

/**
 * A free port on 127.0.0.1 for a server whose URL others must know before it listens, such as a
 * bot host in every host's `BOT_HOSTS`.
 *
 * It comes from below the ephemeral range (32768 and up on Linux, 49152 on macOS). Every
 * `listen(0)` in a parallel test run takes its port from that range, so one picked there and
 * released can be taken while its server is still starting.
 */
export const reservedPort = async (): Promise<number> => {
  for (;;) {
    const port = randomInt(20_000, 32_000)
    const server = createServer()
    const free = await new Promise<boolean>((resolve) => {
      server.once('error', () => resolve(false))
      server.listen(port, '127.0.0.1', () => resolve(true))
    })
    if (!free) continue
    await new Promise<void>((resolve) => server.close(() => resolve()))
    return port
  }
}
