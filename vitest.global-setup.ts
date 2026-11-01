import { mkdtemp, rm, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { MIGRATED_DATA_DIR_ENV, migratedDataDir } from './packages/storage/src/testing.ts'

/**
 * Migrate one in-memory database for the whole run. Without it, each test file's first
 * `inMemoryStorage()` runs initdb itself, which under a loaded run took over ten seconds of that
 * test's time.
 */
export default async () => {
  const dir = await mkdtemp(join(tmpdir(), 'discord-mcp-pglite-'))
  const path = join(dir, 'migrated.tar')
  await writeFile(path, Buffer.from(await (await migratedDataDir()).arrayBuffer()))
  // Test workers start after this, with this process's environment.
  process.env[MIGRATED_DATA_DIR_ENV] = path
  return () => rm(dir, { recursive: true, force: true })
}
