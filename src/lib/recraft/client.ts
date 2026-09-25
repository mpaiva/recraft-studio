import 'server-only'

import { PREAMBLE } from './prompt'
import type { StyleOption } from './styles'

/**
 * The Recraft API, and the four things about it that cost time to learn.
 *
 * **1. The API balance is not the subscription balance.** Recraft bills the API
 * from a prepaid pool that is separate from the credits the web editor spends.
 * A fully paid-up plan can sit beside a zero here, and the only symptom is a
 * 400 on the first image. `balance()` exists so that shows up before a batch
 * rather than eight images into one.
 *
 * **2. A style decides the model, the size and the price.** A curated style
 * goes to Recraft V3; a style id now resolves to Recraft V4 Styles, which
 * rejects V3's sizes. `styles.ts` holds that mapping, and `generate()` takes
 * the resolved style rather than guessing.
 *
 * **3. Dropping the substyle entirely is worse than either.** Tried once: with
 * no style and no substyle the model returns a *photograph of an illustration
 * sitting on a desk*, lettering and all.
 *
 * **4. The response format is not in the URL.** A vector style answers with SVG
 * and a raster style with WebP or PNG, and the download URL does not reliably
 * say which. Sniff the first bytes.
 */
const API = 'https://external.api.recraft.ai/v1'

export function token(): string {
  const found = process.env.RECRAFT_API_TOKEN
  if (!found || found === 'your_token_here') {
    throw new Error('RECRAFT_API_TOKEN is missing or still the placeholder in .env.local')
  }
  return found
}

/**
 * What the API will actually let you spend.
 *
 * Worth asking before a batch rather than after the first image.
 */
export async function balance(): Promise<number> {
  const res = await fetch(`${API}/users/me`, {
    headers: { Authorization: `Bearer ${token()}` },
  })
  if (!res.ok) throw new Error(`Could not read the Recraft balance: ${res.status}`)
  return Number(JSON.parse(await res.text())?.credits ?? 0)
}

/** A style on this account, as `GET /v1/styles` lists it. No name, no preview. */
export type AccountStyle = { id: string; style: string; creation_time?: string; is_private?: boolean }

/** The account's own styles. Free to ask. */
export async function listStyles(): Promise<AccountStyle[]> {
  const res = await fetch(`${API}/styles`, { headers: { Authorization: `Bearer ${token()}` } })
  if (!res.ok) throw new Error(`Could not list Recraft styles: ${res.status}`)
  return (JSON.parse(await res.text())?.styles ?? []) as AccountStyle[]
}

/**
 * Make a style from reference images and return its id. 5 units.
 *
 * References must be PNG, JPG or WebP — not SVG — at most 10 of them. `model`
 * is the model the style will be used with; it has to match at generation
 * time, which is why the app creates for `recraftv4_styles_vector` and draws
 * with the same. `prompt` is stored with the style, so a style made from a
 * description keeps the description.
 */
export async function createStyle({
  files,
  model,
  style = 'vector_illustration',
  prompt,
  match,
}: {
  files: { name: string; bytes: Uint8Array }[]
  model: string
  style?: string
  prompt?: string
  /** How closely drawings follow the references: V4 takes `flexible` (Recraft's default) or `precise`. */
  match?: 'flexible' | 'precise'
}): Promise<string> {
  const form = new FormData()
  form.append('model', model)
  form.append('style', style)
  if (prompt) form.append('prompt', prompt)
  if (match) form.append('match', match)
  files.forEach((file, i) => form.append(`file${i + 1}`, new Blob([file.bytes as BlobPart]), file.name))

  const res = await fetch(`${API}/styles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  })

  const body = await res.text()
  if (!res.ok) throw new Error(`Recraft ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body).id
}

export type Generated = { data: Buffer; ext: 'svg' | 'webp' | 'png' | 'jpg' }

/**
 * One image from a finished request body, with nothing added. Most callers
 * want `generate()`, which adds the preamble and the colors; this is for the
 * few that must not — reference images for a new style are drawn from the
 * person's own description, and the preamble would argue with it.
 */
export async function draw(request: Record<string, unknown>): Promise<Generated> {
  const res = await fetch(`${API}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify(request),
  })

  const body = await res.text()
  if (!res.ok) throw new Error(`Recraft ${res.status}: ${body.slice(0, 400)}`)

  const url = JSON.parse(body)?.data?.[0]?.url
  if (!url) throw new Error(`No image url in response: ${body.slice(0, 400)}`)

  const file = await fetch(url)
  if (!file.ok) throw new Error(`Download failed: ${file.status}`)
  const data = Buffer.from(await file.arrayBuffer())

  // The first bytes say what came back; the URL does not always.
  const head = data.subarray(0, 12)
  const ext =
    head.toString('utf8', 0, 5) === '<?xml' || head.toString('utf8', 0, 4) === '<svg'
      ? 'svg'
      : head.toString('utf8', 8, 12) === 'WEBP'
        ? 'webp'
        : head[0] === 0xff && head[1] === 0xd8
          ? 'jpg'
          : 'png'

  return { data, ext }
}

/**
 * Trace a raster image into vector. PNG, JPG or WebP, at most 10 MB, 16 MP and
 * 4096 px on the long side, at least 256 px on the short side — Recraft's
 * limits, which a 400 enforces for free. Answers with an SVG.
 */
export async function vectorize(file: { name: string; bytes: Uint8Array }): Promise<Generated> {
  const form = new FormData()
  form.append('file', new Blob([file.bytes as BlobPart]), file.name)
  const res = await fetch(`${API}/images/vectorize`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  })
  const body = await res.text()
  if (!res.ok) throw new Error(`Recraft ${res.status}: ${body.slice(0, 400)}`)
  const url = JSON.parse(body)?.image?.url
  if (!url) throw new Error(`No image url in response: ${body.slice(0, 400)}`)
  const out = await fetch(url)
  if (!out.ok) throw new Error(`Download failed: ${out.status}`)
  const data = Buffer.from(await out.arrayBuffer())
  const head = data.toString('utf8', 0, 256).trimStart()
  return { data, ext: head.startsWith('<?xml') || head.startsWith('<svg') ? 'svg' : 'png' }
}

/**
 * One image. `colors` are exact RGB triples the API honors, which is why the
 * preamble says nothing about hue.
 */
export async function generate(
  subject: string,
  colors: [number, number, number][],
  style: StyleOption,
): Promise<Generated> {
  return draw({
    prompt: `${PREAMBLE} ${subject}`,
    size: style.size,
    ...style.params,
    controls: { colors: colors.map((c) => ({ rgb: c })) },
  })
}
