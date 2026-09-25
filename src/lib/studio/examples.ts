import 'server-only'

import { existsSync, mkdirSync, readdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { sampleFile } from '@/lib/recraft/styles'

/**
 * Extra drawings of a style, so it can be judged on more than its one sample
 * before it is picked.
 *
 * The sample is the same lighthouse in the same three colors for every style,
 * which is right for comparing styles against each other and says little about
 * how a style handles an empty state or a new hire. Examples are the
 * Illustration Studio's own subjects, drawn on request in the person's palette.
 *
 * They are paid for, so the rules are docs/DECISIONS.md's: one directory per
 * style under `public/style-examples/`, one file per drawing, created with `wx`
 * and numbered so a new one never lands on an old one. Nothing here replaces or
 * deletes a file, and every later visitor sees what was drawn.
 */
const ROOT = path.join(process.cwd(), 'public', 'style-examples')

export type Example = { url: string; title: string }

function dir(key: string): string {
  return sampleFile(key).replace(/\.\w+$/, '')
}

function slug(text: string): string {
  return text.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 48) || 'example'
}

/** Oldest first, titled from the file name: `03-offer-accepted.svg` → "Offer accepted". */
export function listExamples(key: string): Example[] {
  const d = path.join(ROOT, dir(key))
  if (!existsSync(d)) return []
  return readdirSync(d)
    .filter((f) => /^\d+-[a-z0-9-]+\.(svg|png|webp|jpg)$/.test(f))
    .sort()
    .map((f) => {
      const words = f.replace(/^\d+-/, '').replace(/\.\w+$/, '').replace(/-/g, ' ')
      return { url: `/style-examples/${dir(key)}/${f}`, title: words.charAt(0).toUpperCase() + words.slice(1) }
    })
}

/** `data` is SVG markup for a vector style, or image bytes with their extension for a raster one. */
export function saveExample(key: string, title: string, data: string | Uint8Array, ext = 'svg'): Example {
  const d = path.join(ROOT, dir(key))
  mkdirSync(d, { recursive: true })
  const taken = readdirSync(d).map((f) => Number(f.split('-')[0]) || 0)
  let n = Math.max(0, ...taken) + 1
  for (;;) {
    const file = `${String(n).padStart(2, '0')}-${slug(title)}.${ext}`
    try {
      writeFileSync(path.join(d, file), data, { flag: 'wx' })
      return { url: `/style-examples/${dir(key)}/${file}`, title }
    } catch (error) {
      // Two requests numbering at once: take the next number rather than the other's file.
      if ((error as NodeJS.ErrnoException).code !== 'EEXIST') throw error
      n += 1
    }
  }
}
