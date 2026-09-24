import 'server-only'

import { existsSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * What Recraft does not keep about a style: its name, what it was meant to
 * look like, and what it was made from.
 *
 * `GET /v1/styles` returns an id, a base family and a date — nothing a person
 * could choose by. So styles made here are recorded in `data/styles.json`,
 * which is committed: a style id decides what everything looks like, and held
 * in an ignored file it would be a mystery on every other machine
 * (docs/RECRAFT-API.md).
 *
 * The file is only ever added to. An id already in it is refused rather than
 * replaced, and the write goes to a temporary file first and is then renamed
 * over, so a crash halfway cannot leave it truncated — the rules in
 * docs/DECISIONS.md about never destroying the only copy.
 */

export type StyleRecord = {
  name: string
  description: string
  created: string
  /** Public paths of the reference images the style was made from. */
  references: string[]
}

const FILE = path.join(process.cwd(), 'data', 'styles.json')

export function readRegistry(): Record<string, StyleRecord> {
  if (!existsSync(FILE)) return {}
  return JSON.parse(readFileSync(FILE, 'utf8'))
}

export function addToRegistry(id: string, record: StyleRecord): void {
  const registry = readRegistry()
  if (registry[id]) throw new Error(`Style ${id} is already recorded; refusing to replace it.`)
  const next = { ...registry, [id]: record }
  const temp = `${FILE}.${process.pid}.tmp`
  writeFileSync(temp, `${JSON.stringify(next, null, 2)}\n`, { flag: 'wx' })
  renameSync(temp, FILE)
}
