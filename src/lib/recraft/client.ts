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
 * Train a style on reference images and return its id.
 *
 * `base` must be one of Recraft's own style families. `vector_illustration`
 * keeps the output SVG, which is what this app wants; `digital_illustration`
 * trains on richer references but answers with raster.
 */
export async function createStyle(
  files: { name: string; bytes: Uint8Array }[],
  base = 'vector_illustration',
): Promise<string> {
  const form = new FormData()
  form.append('style', base)
  for (const file of files) {
    form.append('file', new Blob([file.bytes as BlobPart]), file.name)
  }

  const res = await fetch(`${API}/styles`, {
    method: 'POST',
    headers: { Authorization: `Bearer ${token()}` },
    body: form,
  })

  const body = await res.text()
  if (!res.ok) throw new Error(`Recraft ${res.status}: ${body.slice(0, 400)}`)
  return JSON.parse(body).id
}

export type Generated = { data: Buffer; ext: 'svg' | 'webp' | 'png' }

/**
 * One image. `colors` are exact RGB triples the API honors, which is why the
 * preamble says nothing about hue.
 */
export async function generate(
  subject: string,
  colors: [number, number, number][],
  style: StyleOption,
): Promise<Generated> {
  const res = await fetch(`${API}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({
      prompt: `${PREAMBLE} ${subject}`,
      size: style.size,
      ...style.params,
      controls: { colors: colors.map((c) => ({ rgb: c })) },
    }),
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
        : 'png'

  return { data, ext }
}
