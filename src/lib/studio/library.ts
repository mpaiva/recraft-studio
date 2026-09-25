import 'server-only'

import { randomBytes } from 'node:crypto'
import { existsSync, mkdirSync, readdirSync, readFileSync, renameSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * The Illustration Studio's library, on disk, for when the Studio is served
 * from here rather than published as a claude.ai artifact (where the artifact's
 * own database holds it).
 *
 * Three collections, the same the Studio uses there: `illustrations` (approved
 * concepts), `objects` (vocabulary added by the team) and `settings` (the team
 * seed color). One JSON file per document under `data/studio-library/`.
 *
 * The rules are docs/DECISIONS.md's, because approved drawings drawn by Recraft
 * were paid for and exist nowhere else:
 *
 * - New documents are created with `wx`, so an existing file is never written into.
 * - Replacing a document moves the old one to `.attic/` first, then renames a
 *   complete new file into place — never an overwrite of the only copy.
 * - Deleting moves the file to `.attic/` too. The Studio says "can't be undone",
 *   which is true of the Studio; the file is still there for a person.
 */

export const COLLECTIONS = ['illustrations', 'objects', 'settings'] as const
export type Collection = (typeof COLLECTIONS)[number]

/** An approved Recraft drawing is tens of kilobytes; this leaves room and no more. */
export const MAX_DOC = 2_000_000

export const ROOT = path.join(process.cwd(), 'data', 'studio-library')
const ATTIC = path.join(ROOT, '.attic')

export function isCollection(name: string): name is Collection {
  return (COLLECTIONS as readonly string[]).includes(name)
}

export function isId(id: string): boolean {
  return /^[a-z0-9][a-z0-9-]{0,63}$/i.test(id)
}

function file(collection: Collection, id: string): string {
  if (!isId(id)) throw new Error(`Bad document id "${id}".`)
  return path.join(ROOT, collection, `${id}.json`)
}

function stamp(): string {
  return new Date().toISOString().replace(/[:.]/g, '-')
}

function retire(collection: Collection, id: string): void {
  const from = file(collection, id)
  if (!existsSync(from)) return
  const dir = path.join(ATTIC, collection)
  mkdirSync(dir, { recursive: true })
  renameSync(from, path.join(dir, `${id}.${stamp()}.json`))
}

export type Doc = { id: string; data: Record<string, unknown> }

export function list(collection: Collection): Doc[] {
  const dir = path.join(ROOT, collection)
  if (!existsSync(dir)) return []
  const docs = readdirSync(dir)
    .filter((f) => f.endsWith('.json'))
    .map((f) => ({ id: f.slice(0, -5), data: JSON.parse(readFileSync(path.join(dir, f), 'utf8')) }))
  // Newest first, as the Studio asks the artifact database for.
  return docs.sort((a, b) => String(b.data.createdAt ?? '').localeCompare(String(a.data.createdAt ?? '')))
}

export function add(collection: Collection, data: Record<string, unknown>): string {
  mkdirSync(path.join(ROOT, collection), { recursive: true })
  const id = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}`
  writeFileSync(file(collection, id), JSON.stringify(data, null, 2), { flag: 'wx' })
  return id
}

export function set(collection: Collection, id: string, data: Record<string, unknown>): void {
  mkdirSync(path.join(ROOT, collection), { recursive: true })
  const temp = path.join(ROOT, collection, `.${id}.${process.pid}.tmp`)
  writeFileSync(temp, JSON.stringify(data, null, 2), { flag: 'wx' })
  retire(collection, id)
  renameSync(temp, file(collection, id))
}

export function remove(collection: Collection, id: string): void {
  if (!existsSync(file(collection, id))) throw new Error('Not found.')
  retire(collection, id)
}
