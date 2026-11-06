import { vi } from 'vitest'

/**
 * How long `vi.waitFor` polls before it fails, unless a call says otherwise.
 *
 * Vitest's default is one second. That deadline measures the machine, not the behaviour: in a
 * loaded full-suite run, what a test waits for (a socket round trip, a query, a spawned process)
 * can take longer, and the test fails while the code is right. A wait should fail only when its
 * condition never holds, so this sits just inside the test timeout, where the failure still names
 * the assertion that never passed.
 */
const WAIT_FOR_TIMEOUT_MS = 15_000

const waitFor = vi.waitFor
vi.waitFor = (callback, options) =>
  waitFor(
    callback,
    typeof options === 'number' ? options : { timeout: WAIT_FOR_TIMEOUT_MS, ...options },
  )
