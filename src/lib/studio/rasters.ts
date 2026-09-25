import 'server-only'

import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

/**
 * Raster drawings for the Illustration Studio, kept on this server.
 *
 * Recraft answers with a link to its own storage. The Studio copies the image
 * here instead of pointing at that link: it has to outlive the link if it is
 * approved into the library, and it has to be same-origin for the Studio to
 * measure its pixels. Every file is new (`wx`, a fresh name) and nothing here
 * removes one — the rules in docs/DECISIONS.md, for drawings that were paid for.
 */
const DIR = path.join(process.cwd(), 'public', 'studio-rasters')

export function saveRaster(bytes: Uint8Array, ext: string): string {
  mkdirSync(DIR, { recursive: true })
  const file = `${Date.now().toString(36)}-${randomBytes(4).toString('hex')}.${ext}`
  writeFileSync(path.join(DIR, file), bytes, { flag: 'wx' })
  return `/studio-rasters/${file}`
}
