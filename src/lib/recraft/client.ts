import 'server-only'

import { PREAMBLE, SIZE } from './prompt'

/**
 * The Recraft API, and the four things about it that cost time to learn.
 *
 * **1. The API balance is not the subscription balance.** Recraft bills the API
 * from a prepaid pool that is separate from the credits the web editor spends.
 * A fully paid-up plan can sit beside a zero here, and the only symptom is a
 * 400 on the first image. `balance()` exists so that shows up before a batch
 * rather than eight images into one.
 *
 * **2. A trained style is not the same as a substyle.** `style_id` points at a
 * style trained on reference images and is the difference between a set that
 * shares a look and a set that merely shares a substyle. Without one this falls
 * back to `colored_stencil`, which is a floor, not a substitute.
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

/**
 * The style parameters for a generation.
 *
 * A style id is not a secret and it decides what everything looks like, so it
 * belongs somewhere visible. In the repo this came from it is committed to a
 * JSON file for exactly that reason: held in an ignored file it would be absent
 * on any other machine, and the fallback would quietly draw in a different
 * style rather than fail — the worst kind of difference, because nothing
 * reports it. Here it is an env var, so the fallback announces itself in the
 * response instead.
 */
export function style(): { key: string; params: Record<string, string>; trained: boolean } {
  const id = process.env.RECRAFT_STYLE_ID?.trim()
  return id
    ? { key: `style_id:${id}`, params: { style_id: id }, trained: true }
    : {
        key: 'substyle:colored_stencil',
        params: { style: 'vector_illustration', substyle: 'colored_stencil' },
        trained: false,
      }
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
 * One image. `colors` are exact RGB triples the API honours, which is why the
 * preamble says nothing about hue.
 */
export async function generate(
  subject: string,
  colors: [number, number, number][],
): Promise<Generated> {
  const res = await fetch(`${API}/images/generations`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${token()}` },
    body: JSON.stringify({
      prompt: `${PREAMBLE} ${subject}`,
      size: SIZE,
      ...style().params,
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
