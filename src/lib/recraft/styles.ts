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
  /** Public URLs of the images a style made here was built from. */
  references?: string[]
  /** Made from the Illustration Studio's library (see api/studio/library-style). */
  library?: boolean
  /** What it draws. Everything but the Studio's raster styles is vector. */
  format?: 'vector' | 'raster'
  /** For raster styles: Recraft's own grouping, photographic or illustration. */
  group?: 'Photo' | 'Illustration'
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

/**
 * Recraft V3 raster styles, for the Illustration Studio's raster output, as
 * listed in the API docs (2026-09-24). Sent by display name like the vector
 * ones, with `model: 'recraftv3'`, the same sizes and the same color controls.
 * 40 units an image (the raster measurement in cost.ts). Kept out of
 * `allStyles()`, which Clear Studio's picker reads and which only draws SVG.
 */
export const RASTER_CURATED: { name: string; group: 'Photo' | 'Illustration' }[] = [
  ...['Photorealism', 'Enterprise', 'Natural light', 'Studio photo', 'HDR', 'Hard flash', 'Motion blur', 'Black & white',
    'Evening light', 'Faded Nostalgia', 'Forest life', 'Mystic Naturalism', 'Natural Tones', 'Organic Calm', 'Real-Life Glow',
    'Retro Realism', 'Retro Snapshot', 'Urban Drama', 'Village Realism', 'Warm Folk', 'Product photo'].map((name) => ({ name, group: 'Photo' as const })),
  ...['Illustration', 'Hand-drawn', 'Grain', 'Bold Sketch', 'Pencil sketch', 'Retro Pop', 'Clay', 'Risograph', 'Color engraving',
    'Pixel art', 'Antiquarian', 'Bold fantasy', 'Child book', 'Cover', 'Crosshatch', 'Digital engraving', 'Expressionism',
    'Freehand details', 'Grain 2.0', 'Graphic intensity', 'Hard Comics', 'Long shadow', 'Modern Folk', 'Multicolor', 'Neon Calm',
    'Noir', 'Nostalgic pastel', 'Outline details', 'Pastel gradient', 'Pastel sketch', 'Pop art', 'Pop renaissance', 'Street art',
    'Tablet sketch', 'Urban Glow', 'Urban sketching', 'Young adult book', 'Young adult book 2', 'Seamless Digital'].map((name) => ({ name, group: 'Illustration' as const })),
]

const V3 = { model: 'recraftv3_vector', size: '1536x1024', units: UNITS.recraftv3_vector }
export const V4 = { model: 'recraftv4_styles_vector', size: '1280x832', units: UNITS.recraftv4_styles_vector }
/**
 * Raster styles made here (the Studio's raster library style): created and drawn with `recraftv4_styles`,
 * base style `any`. The size is V4 Styles' 3:2, as for vector — assumed, and a 400 would say otherwise for free.
 */
export const V4_RASTER = { model: 'recraftv4_styles', style: 'any', size: '1280x832', units: UNITS.recraftv4_styles_raster }

/** The style used when nobody has chosen one: the old substyle fallback, by its curated name. */
export const FALLBACK_KEY = 'curated:Colored stencil'

/** Where sample drawings live, on disk and on the web. */
export const SAMPLE_DIR = path.join(process.cwd(), 'public', 'style-samples')

export function sampleFile(key: string): string {
  const slug = key.replace(/^(curated|custom|raster):/, '').toLowerCase().replace(/[^a-z0-9]+/g, '-')
  // Raster styles share names with nothing vector, but are kept apart anyway; their samples are images.
  return key.startsWith('raster:') ? `raster-${slug}.webp` : `${key.startsWith('custom:') ? 'custom-' : ''}${slug}.svg`
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

function raster(entry: { name: string; group: 'Photo' | 'Illustration' }): StyleOption {
  return withSample({
    key: `raster:${entry.name}`,
    kind: 'curated',
    format: 'raster',
    group: entry.group,
    name: entry.name,
    params: { model: 'recraftv3', style: entry.name },
    size: V3.size,
    units: UNITS.raster,
  })
}

/**
 * The Illustration Studio's raster styles: Recraft's curated ones, then raster styles recorded in the
 * registry — shared styles picked by id, not the library's own (the Studio shows those as "Your library").
 * Listing them is free.
 */
export function rasterStyles(): StyleOption[] {
  const recorded = Object.entries(readRegistry())
    .filter(([, r]) => r.format === 'raster' && !r.library)
    .map(([id]) => custom(id, 'any'))
  return [...RASTER_CURATED.map(raster), ...recorded]
}

export function custom(id: string, family: string, created?: string): StyleOption {
  const record = readRegistry()[id]
  // Only a raster style this app recorded is drawable as raster: for the rest, the model is unknown. A
  // recorded model (a shared V3 style) overrides V4 Styles, with V3's size and price.
  if (record?.format === 'raster') {
    const v3 = record.model === 'recraftv3'
    return withSample({
      key: `custom:${id}`,
      kind: 'custom',
      format: 'raster',
      name: record.name,
      description: record.description,
      references: record.references,
      library: record.library,
      params: { model: record.model ?? V4_RASTER.model, style_id: id },
      size: v3 ? V3.size : V4_RASTER.size,
      units: v3 ? UNITS.raster : V4_RASTER.units,
      created: created ?? record.created,
    })
  }
  return withSample({
    key: `custom:${id}`,
    kind: 'custom',
    name: record?.name ?? `Your style ${id.slice(0, 8)}`,
    description: record?.description,
    references: record?.references,
    library: record?.library,
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
  // Raster styles made here are drawn only by the Studio's raster output; this list is the vector one.
  const listed = mine.map((s) => custom(s.id, s.style, s.creation_time)).filter((s) => s.format !== 'raster')
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
  if (key.startsWith('raster:')) {
    const entry = RASTER_CURATED.find((r) => r.name === key.slice('raster:'.length))
    if (!entry) throw new Error(`Unknown raster style "${key.slice('raster:'.length)}".`)
    return raster(entry)
  }
  if (key.startsWith('custom:')) {
    const id = key.slice('custom:'.length)
    // The account listing can lag a style made seconds ago; one this app recorded making is trusted.
    const record = readRegistry()[id]
    if (record?.format === 'raster') return custom(id, 'any')
    const found = (await allStyles()).find((s) => s.key === key) ?? (record ? custom(id, 'vector_illustration') : undefined)
    if (!found) throw new Error(`Style ${id} is not on this Recraft account.`)
    if (found.disabled) throw new Error(found.disabled)
    return found
  }
  throw new Error(`Unknown style "${key}".`)
}
