import 'server-only'

import { existsSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { generate, listStyles } from './client'
import { UNITS } from './cost'
import { readRegistry } from './registry'
import { normalize } from './svg'

/**
 * Every style the app can draw in, and what each one needs on the wire.
 *
 * A style is not just a name. Each kind needs its own model, its own size and
 * costs a different amount, and getting any of them wrong fails in a
 * different way — all three were found by drawing, on 2026-09-24:
 *
 * **Curated styles** are Recraft's own V3 library, chosen by display name
 * (`style: 'Colored stencil'`) with `model: 'recraftv3_vector'`. There is no
 * endpoint that lists them, so the list is copied from the API docs. 80 units.
 *
 * **Your styles** come from `GET /v1/styles`. Sent without a model, a style id
 * now resolves to Recraft V4 Styles, which rejects the 1536x1024 size V3 uses —
 * so they go to `recraftv4_styles_vector` at its own 3:2 size, 1280x832. 50
 * units. The listing does not say which model a style was created for; this
 * assumes V4, which is the API's default for styles created there.
 *
 * **Styles made here** are account styles like any other, with a name and a
 * description from `data/styles.json`, since Recraft stores neither.
 *
 * **Raster styles are listed but not drawable.** The app's whole output is SVG,
 * and a `digital_illustration` style answers in pixels. They stay in the list
 * with the reason, so a style that seems to be missing is explained rather
 * than absent.
 */

export type StyleOption = {
  /** `curated:<name>` or `custom:<id>` — what the form sends. */
  key: string
  kind: 'curated' | 'custom'
  name: string
  /** What the style was described as, for styles made from a description. */
  description?: string
  /** Generation parameters: model plus style or style_id. */
  params: Record<string, string>
  size: string
  units: number
  /** Why it cannot be picked, if it cannot. */
  disabled?: string
  /** When a custom style was made, for telling them apart. */
  created?: string
  /** Public URL of the sample drawing, if one has been drawn. */
  sample?: string
}

/** Recraft V3 vector styles, as listed in the API docs. Order is theirs. */
export const CURATED = [
  'Vector art',
  'Line art',
  'Linocut',
  'Color blobs',
  'Engraving',
  'Bold stroke',
  'Chemistry',
  'Colored stencil',
  'Cosmics',
  'Cutout',
  'Depressive',
  'Editorial',
  'Emotional flat',
  'Marker outline',
  'Mosaic',
  'Naivector',
  'Roundish flat',
  'Segmented Colors',
  'Sharp contrast',
  'Thin',
  'Vector Photo',
  'Vivid shapes',
  'Seamless Vector',
]

const V3 = { model: 'recraftv3_vector', size: '1536x1024', units: UNITS.recraftv3_vector }
export const V4 = { model: 'recraftv4_styles_vector', size: '1280x832', units: UNITS.recraftv4_styles_vector }

/** The style used when nobody has chosen one: the old substyle fallback, by its curated name. */
export const FALLBACK_KEY = 'curated:Colored stencil'

/** Where sample drawings live, on disk and on the web. */
export const SAMPLE_DIR = path.join(process.cwd(), 'public', 'style-samples')

export function sampleFile(key: string): string {
  const slug = key.replace(/^curated:/, '').replace(/^custom:/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  return `${key.startsWith('custom:') ? 'custom-' : ''}${slug}.svg`
}

function withSample(style: StyleOption): StyleOption {
  const file = sampleFile(style.key)
  return existsSync(path.join(SAMPLE_DIR, file)) ? { ...style, sample: `/style-samples/${file}` } : style
}

function curated(name: string): StyleOption {
  return withSample({
    key: `curated:${name}`,
    kind: 'curated',
    name,
    params: { model: V3.model, style: name },
    size: V3.size,
    units: V3.units,
  })
}

export function custom(id: string, family: string, created?: string): StyleOption {
  const record = readRegistry()[id]
  return withSample({
    key: `custom:${id}`,
    kind: 'custom',
    name: record?.name ?? `Your style ${id.slice(0, 8)}`,
    description: record?.description,
    params: { model: V4.model, style_id: id },
    size: V4.size,
    units: V4.units,
    created,
    disabled:
      family === 'vector_illustration'
        ? undefined
        : `A ${family} style answers in raster, and this app only returns SVG.`,
  })
}

/**
 * The sample every style is drawn with: one subject, one palette, so the only
 * thing that differs between two samples is the style.
 */
export const SAMPLE_SUBJECT = 'A lighthouse keeper climbing a spiral staircase at dusk'
export const SAMPLE_COLORS: [number, number, number][] = [
  [48, 136, 105],
  [49, 152, 196],
  [164, 55, 95],
]

/**
 * Draw a style's sample and save it. Never replaces one: the file is opened
 * with `wx`, so an existing sample makes this throw instead.
 */
export async function drawSample(style: StyleOption): Promise<'saved' | string> {
  const { data, ext } = await generate(SAMPLE_SUBJECT, SAMPLE_COLORS, style)
  if (ext !== 'svg') return `answered ${ext}, not SVG — nothing saved`
  const { svg } = normalize(data.toString('utf8'), style.size)
  writeFileSync(path.join(SAMPLE_DIR, sampleFile(style.key)), svg, { flag: 'wx' })
  return 'saved'
}

/**
 * The style the form starts on. RECRAFT_STYLE_ID still works, as the default
 * rather than the only choice.
 */
export function defaultKey(): string {
  const id = process.env.RECRAFT_STYLE_ID?.trim()
  return id ? `custom:${id}` : FALLBACK_KEY
}

/** Curated styles, then the account's own, newest first. */
export async function allStyles(): Promise<StyleOption[]> {
  const mine = await listStyles()
  const envId = process.env.RECRAFT_STYLE_ID?.trim()
  const listed = mine.map((s) => custom(s.id, s.style, s.creation_time))
  // A style shared to this account, or set by id, may not be in its own listing.
  if (envId && !listed.some((s) => s.key === `custom:${envId}`)) listed.unshift(custom(envId, 'vector_illustration'))
  return [...CURATED.map(curated), ...listed]
}

/**
 * Turn what the form sent into generation parameters, or say why not.
 *
 * Custom ids are checked against the account's listing rather than passed
 * through: an unknown id would fail on the first image, after the preflight
 * had already said yes.
 */
export async function resolveStyle(key: string): Promise<StyleOption> {
  if (key.startsWith('curated:')) {
    const name = key.slice('curated:'.length)
    if (!CURATED.includes(name)) throw new Error(`Unknown curated style "${name}".`)
    return curated(name)
  }
  if (key.startsWith('custom:')) {
    const found = (await allStyles()).find((s) => s.key === key)
    if (!found) throw new Error(`Style ${key.slice('custom:'.length)} is not on this Recraft account.`)
    if (found.disabled) throw new Error(found.disabled)
    return found
  }
  throw new Error(`Unknown style "${key}".`)
}
