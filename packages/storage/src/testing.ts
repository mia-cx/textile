import { randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { PGlite } from '@electric-sql/pglite'
import { drizzle } from 'drizzle-orm/pglite'
import { migrate } from 'drizzle-orm/pglite/migrator'
import { Client } from 'pg'
import type { Storage } from './index.ts'
import { advisoryLocks } from './locks.ts'
import * as schema from './schema.ts'
import { createStorage, migrationsFolder } from './store.ts'

/**
 * The data directory of a freshly migrated database. A new PGlite runs initdb in WebAssembly,
 * about five times the cost of loading a data directory, and seconds of CPU on a busy machine.
 */
export const migratedDataDir = async (): Promise<Blob> => {
  const client = new PGlite()
  await migrate(drizzle(client, { schema }), { migrationsFolder })
  const dump = await client.dumpDataDir('none')
  await client.close()
  return dump
}

/** A file holding `migratedDataDir()`, which a test run's global setup writes once for all. */
export const MIGRATED_DATA_DIR_ENV = 'DISCORD_MCP_TEST_PGLITE_DATA_DIR'

let template: Promise<Blob> | undefined

/** The run's migrated data directory, or else this process's own, made once. */
const migrated = () =>
  (template ??= (async () => {
    const path = process.env[MIGRATED_DATA_DIR_ENV]
    return path === undefined ? migratedDataDir() : new Blob([await readFile(path)])
  })())

/**
 * A migrated in-process Postgres (PGlite) for tests. Each call is a fresh, empty database. PGlite
 * has one session, which holds every advisory lock it takes.
 */
export const inMemoryStorage = async (): Promise<Storage> => {
  const client = new PGlite({ loadDataDir: await migrated() })
  const db = drizzle(client, { schema })
  const locks = advisoryLocks(async () => ({
    query: async (text, values) =>
      (await client.query<Record<string, unknown>>(text, [...values])).rows,
    close: async () => {},
  }))
  return createStorage(
    db,
    locks,
    () => client.close(),
    async (channel, { payload, listening }) => {
      const unlisten = await client.listen(channel, payload)
      listening()
      return () => unlisten()
    },
  )
}

/**
 * A fresh, empty database on the Postgres server at `TEST_DATABASE_URL`, for behaviour PGlite's one
 * session can't show, such as two processes contending for a lock. Undefined when it is unset.
 */
export const postgresTestDatabase = async () => {
  const server = process.env.TEST_DATABASE_URL
  if (server === undefined || server === '') return undefined
  const name = `test_${randomUUID().replaceAll('-', '')}`
  const admin = async (statement: string) => {
    const client = new Client({ connectionString: server })
    await client.connect()
    try {
      await client.query(statement)
    } finally {
      await client.end()
    }
  }
  await admin(`create database ${name}`)
  const url = new URL(server)
  url.pathname = `/${name}`
  return {
    url: url.href,
    drop: () => admin(`drop database ${name} with (force)`),
  }
}
