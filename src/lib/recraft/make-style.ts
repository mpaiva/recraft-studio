import 'server-only'

import { existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import path from 'node:path'
import { randomBytes } from 'node:crypto'

import { balance, createStyle, draw } from './client'
import { UNITS } from './cost'
import { addToRegistry } from './registry'
import { custom, drawSample, V4 } from './styles'

/**
 * Make a Recraft style from a written description.
 *
 * Recraft builds styles from images, not words, so a description has to
 * become images first. This happens in two steps with a person in between,
 * because the first step is where the money goes:
 *
 * 1. **References.** The description is drawn a few times, each over a
 *    different ordinary scene, so the style learns a *look* rather than a
 *    subject. Raster, because `POST /styles` takes PNG, JPG or WebP and not
 *    SVG; `recraftv4_1`, 35 units each. Saved as a draft and shown back.
 * 2. **The style.** From the references the person keeps: the style itself
 *    (5 units, created for the same model the app draws with, and carrying the
 *    description as its prompt), a record in `data/styles.json`, and the
 *    standard sample so it sits in the picker like every other style (50).
 *
 * The drawing preamble is deliberately *not* used for references. It asks for
 * "expressive painterly marks", which would argue with whatever the person
 * described — and the references are the style, so the argument would win.
 *
 * Nothing is overwritten and nothing paid for is thrown away. Each draft gets
 * a new directory, files are written with `wx`, and references the person
 * does not keep stay on disk.
 */

const REF_MODEL = 'recraftv4_1'
const REF_SIZE = '1280x832'
export const REF_UNITS = UNITS.recraftv4_1
export const CREATE_UNITS = UNITS.createStyle + V4.units

/** Ordinary scenes, different enough that what they share is the style. */
const REF_SCENES = [
  'a person reading at a kitchen table by a window',
  'a busy street corner with shops and a bicycle',
  'a potted plant and a coffee cup on a windowsill',
  'a hiker on a hill path with distant mountains',
]
export const MAX_REFS = REF_SCENES.length

const REF_ROOT = path.join(process.cwd(), 'public', 'style-references')
const DRAFT = /^[a-z0-9]+-[a-f0-9]{6}$/

/** A draft id this app could have made — anything else, including a path, is refused. */
export const isDraft = (draft: string) => DRAFT.test(draft)
const REF_FILE = /^ref-\d\.(png|jpg|webp)$/

export type Reference = { file: string; url: string } | { error: string }

async function preflight(needed: number) {
  const credits = await balance()
  if (credits < needed) {
    throw new Error(`Not enough API credit: this needs ${needed} units and the balance is ${credits}.`)
  }
}

/** Step 1: draw references for a description. Returns the draft they are in. */
export async function drawReferences(description: string, count: number) {
  const n = Math.max(1, Math.min(MAX_REFS, Math.floor(count)))
  await preflight(n * REF_UNITS)

  const draft = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
  const dir = path.join(REF_ROOT, draft)
  mkdirSync(REF_ROOT, { recursive: true })
  mkdirSync(dir) // not recursive: throws if the draft somehow exists, rather than writing into it

  // One at a time, like everything else that spends: a failure costs what it drew.
  const references: Reference[] = []
  let spent = 0
  for (const [i, scene] of REF_SCENES.slice(0, n).entries()) {
    try {
      const { data, ext } = await draw({
        model: REF_MODEL,
        size: REF_SIZE,
        prompt: `${description}. The scene: ${scene}. No text, no lettering, no numbers.`,
      })
      spent += REF_UNITS
      if (ext === 'svg') {
        references.push({ error: 'Came back as SVG, which a style cannot be made from.' })
        continue
      }
      const file = `ref-${i + 1}.${ext}`
      writeFileSync(path.join(dir, file), data, { flag: 'wx' })
      references.push({ file, url: `/style-references/${draft}/${file}` })
    } catch (error) {
      references.push({ error: (error as Error).message })
    }
  }

  return { draft, references, spent }
}

/** Step 2: make the style from the references the person kept. */
export async function makeStyle(input: { draft: string; files: string[]; name: string; description: string }) {
  if (!isDraft(input.draft)) throw new Error('Unknown draft.')
  // Only names this app wrote, inside the draft's own directory.
  const files = [...new Set(input.files)].filter((f) => REF_FILE.test(f))
  if (!files.length) throw new Error('Keep at least one reference.')
  const dir = path.join(REF_ROOT, input.draft)
  for (const f of files) if (!existsSync(path.join(dir, f))) throw new Error(`Reference ${f} is not in this draft.`)

  await preflight(CREATE_UNITS)

  const id = await createStyle({
    files: files.map((f) => ({ name: f, bytes: readFileSync(path.join(dir, f)) })),
    model: V4.model,
    prompt: input.description,
  })

  // Recorded before the sample is drawn: the style exists and was paid for,
  // so a failed sample must not lose the only record of what it is.
  addToRegistry(id, {
    name: input.name,
    description: input.description,
    created: new Date().toISOString(),
    references: files.map((f) => `/style-references/${input.draft}/${f}`),
  })

  // Built directly rather than looked up: the account listing may not show a
  // style made a second ago, and it is already paid for.
  const style = custom(id, 'vector_illustration')
  let sample: string
  try {
    sample = await drawSample(style)
  } catch (error) {
    sample = (error as Error).message
  }

  return { key: style.key, sample }
}
