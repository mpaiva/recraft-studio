import { balance, vectorize } from '@/lib/recraft/client'
import { UNITS } from '@/lib/recraft/cost'
import { MAX_UPLOAD_BYTES, sniff } from '@/lib/recraft/make-style'
import { artwork, inert, normalize } from '@/lib/recraft/svg'

/** Recraft's limit for a vectorize input. */
const MAX_BYTES = 10 * 1024 * 1024
/** An SVG someone brings is optimized here, not sent anywhere; this only keeps a stray huge file out. */
const MAX_SVG_BYTES = MAX_UPLOAD_BYTES

/**
 * Turn an image into an SVG for the Illustration Studio.
 *
 * A raster image (PNG, JPG, WebP) is traced by Recraft. An image that is
 * already SVG is not sent anywhere: it is made inert, optimized the same way
 * Recraft's answers are, and costs nothing — tracing a vector would only make
 * it worse.
 *
 * The price is Recraft's published 10 units, not a measurement (see cost.ts),
 * so the balance is read before and after and the difference is reported as
 * what it actually cost.
 */
export async function POST(request: Request) {
  try {
    const form = await request.formData()
    const file = form.get('image')
    if (!file || typeof file === 'string') return Response.json({ error: 'Add an image.' }, { status: 400 })
    const bytes = new Uint8Array(await file.arrayBuffer())
    const name = (file.name || 'image').replace(/[^\w.-]+/g, '-').slice(0, 80)

    const head = Buffer.from(bytes.subarray(0, 512)).toString('utf8').replace(/^﻿/, '').trimStart()
    if (head.startsWith('<?xml') || head.startsWith('<svg') || /^<!--[\s\S]*?-->\s*<svg/.test(head)) {
      if (bytes.length > MAX_SVG_BYTES) return Response.json({ error: 'That SVG is over 5 MB.' }, { status: 400 })
      const clean = inert(Buffer.from(bytes).toString('utf8'))
      const { svg, width, height } = normalize(clean, '1024x1024')
      return Response.json({ source: 'svg', svg, width, height, art: artwork(clean, '1024x1024'), spent: 0 })
    }

    const kind = sniff(bytes)
    if (!kind) return Response.json({ error: 'Use a PNG, JPG, WebP or SVG image.' }, { status: 400 })
    if (bytes.length > MAX_BYTES) return Response.json({ error: 'Recraft vectorizes images up to 10 MB.' }, { status: 400 })

    const before = await balance()
    if (before < UNITS.vectorize) {
      return Response.json(
        { error: `Not enough API credit: vectorizing needs about ${UNITS.vectorize} units and the balance is ${before}.` },
        { status: 402 },
      )
    }

    const { data, ext } = await vectorize({ name, bytes })
    // Read after the call whatever it answered, so a charge for a bad answer is still reported.
    const after = await balance().catch(() => null)
    const spent = after == null ? null : before - after
    if (ext !== 'svg') {
      return Response.json({ error: 'Recraft did not answer with an SVG.', spent }, { status: 502 })
    }
    const source = data.toString('utf8')
    const { svg, width, height } = normalize(source, '1024x1024')
    return Response.json({ source: 'recraft', svg, width, height, art: artwork(source, '1024x1024'), spent, estimate: UNITS.vectorize })
  } catch (error) {
    const message = (error as Error).message
    return Response.json({ error: message }, { status: /^Recraft 4\d\d/.test(message) || /not an SVG/.test(message) ? 400 : 500 })
  }
}
