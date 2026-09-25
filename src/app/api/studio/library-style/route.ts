import { randomBytes } from 'node:crypto'
import { mkdirSync, writeFileSync } from 'node:fs'
import path from 'node:path'

import { balance, createStyle } from '@/lib/recraft/client'
import { UNITS } from '@/lib/recraft/cost'
import { MAX_TOTAL, MAX_UPLOAD_BYTES, sniff } from '@/lib/recraft/make-style'
import { addToRegistry } from '@/lib/recraft/registry'
import { V4, V4_RASTER } from '@/lib/recraft/styles'

const REF_ROOT = path.join(process.cwd(), 'public', 'style-references')

/**
 * Make a Recraft style from the Illustration Studio's library, so new drawings
 * learn the look of what the team has already approved.
 *
 * Recraft takes references only when a style is made, not per drawing, so the
 * library becomes a style: the Studio draws each library illustration as an
 * image (they are SVG there), up to Recraft's ten, and sends them here. 5
 * units, and no sample drawing — the library items are its previews. The
 * Studio rebuilds it only when the library has changed since the last one.
 *
 * Made with `match: precise`, so drawings follow the references closely: the
 * point of a library style is to look like the library, and Recraft's default
 * (`flexible`) drifted visibly from it with four references.
 *
 * `format=raster` makes the raster version instead (`recraftv4_styles`, base
 * style `any`), for the Studio's raster output; the two are kept separately.
 *
 * The rules are make-style's: the images are checked before anything is
 * spent, kept in a new directory with `wx`, and the style is recorded in
 * data/styles.json as soon as it exists. Older library styles stay on the
 * account and in the registry, marked `library`, so the Studio can hide them.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const files = form.getAll('image').filter((f): f is File => typeof f !== 'string')
    const total = Number(form.get('total') ?? files.length)
    const raster = form.get('format') === 'raster'
    if (!files.length) return Response.json({ error: 'The library has no illustrations to learn from.' }, { status: 400 })
    if (files.length > MAX_TOTAL) return Response.json({ error: `A style is made from at most ${MAX_TOTAL} images.` }, { status: 400 })

    const images = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())))
    const kinds = images.map((bytes, i) => {
      const kind = sniff(bytes)
      if (!kind) throw new Error(`Image ${i + 1} is not a PNG, JPG or WebP.`)
      if (bytes.length > MAX_UPLOAD_BYTES) throw new Error(`Image ${i + 1} is over ${MAX_UPLOAD_BYTES / 1024 / 1024} MB.`)
      return kind
    })

    const credits = await balance()
    if (credits < UNITS.createStyle) {
      return Response.json({ error: `Not enough API credit: making the library style needs ${UNITS.createStyle} units and the balance is ${credits}.` }, { status: 402 })
    }

    const draft = `${Date.now().toString(36)}-${randomBytes(3).toString('hex')}`
    mkdirSync(REF_ROOT, { recursive: true })
    mkdirSync(path.join(REF_ROOT, draft))
    const names = images.map((bytes, i) => {
      const name = `lib-${i + 1}.${kinds[i]}`
      writeFileSync(path.join(REF_ROOT, draft, name), bytes, { flag: 'wx' })
      return name
    })

    const description = `The look of the team's approved illustrations: made from ${files.length}${total > files.length ? ` of ${total}` : ''} in the library.`
    const id = await createStyle({
      files: names.map((name, i) => ({ name, bytes: images[i] })),
      ...(raster ? { model: V4_RASTER.model, style: V4_RASTER.style } : { model: V4.model }),
      prompt: description,
      match: 'precise',
    })
    const references = names.map((n) => `/style-references/${draft}/${n}`)
    addToRegistry(id, {
      name: raster ? 'Your library (raster)' : 'Your library',
      description, created: new Date().toISOString(), references, library: true, format: raster ? 'raster' : 'vector',
    })

    return Response.json({ key: `custom:${id}`, id, references, units: raster ? V4_RASTER.units : V4.units, match: 'precise' })
  } catch (error) {
    const message = (error as Error).message
    return Response.json({ error: message }, { status: /^Image \d+ is/.test(message) ? 400 : 500 })
  }
}
