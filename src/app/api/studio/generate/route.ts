import { balance, draw } from '@/lib/recraft/client'
import { estimate } from '@/lib/recraft/cost'
import { defaultKey, resolveStyle, type StyleOption } from '@/lib/recraft/styles'
import { artwork } from '@/lib/recraft/svg'
import { parseHex } from '@/lib/palette'
import { saveRaster } from '@/lib/studio/rasters'

/** The Studio proposes two concepts; a little room above that, and no more. */
const MAX_CONCEPTS = 4

/** Recraft V3's prompt limit, in characters. A longer prompt is a 400 that costs nothing, but says less. */
const MAX_PROMPT = 1000

/**
 * V3 sizes, as width/height. The Studio's containers are 2:1, 1:1 and 2:3, and
 * any custom size in between, so the drawing is asked for at the nearest shape
 * rather than always at 3:2 and letterboxed.
 */
const V3_SIZES = [
  '1024x1024', '1365x1024', '1024x1365', '1536x1024', '1024x1536', '1820x1024', '1024x1820',
  '1024x2048', '2048x1024', '1434x1024', '1024x1434', '1024x1280', '1280x1024', '1024x1707', '1707x1024',
]

/**
 * The size to ask for. Account styles go to V4, which rejects V3's sizes, so
 * they keep the one size known to work (docs/RECRAFT-API.md) and the Studio
 * fits the drawing into the container.
 */
function sizeFor(style: StyleOption, width: number, height: number): string {
  const v3 = style.kind === 'curated' || String(style.params.model ?? '').startsWith('recraftv3')
  if (!v3 || !(width > 0 && height > 0)) return style.size
  const want = Math.log(width / height)
  return V3_SIZES.reduce((best, s) => {
    const [w, h] = s.split('x').map(Number)
    const [bw, bh] = best.split('x').map(Number)
    return Math.abs(Math.log(w / h) - want) < Math.abs(Math.log(bw / bh) - want) ? s : best
  })
}

export type StudioItem =
  | { ok: true; title: string; viewBox: string; markup: string; shapes: number; cleared: boolean }
  | { ok: true; title: string; raster: { url: string; width: number; height: number } }
  | { ok: false; title: string; error: string }

export type StudioEvent =
  | { type: 'start'; count: number; style: { key: string; name: string; units: number }; size: string }
  | { type: 'item'; index: number; item: StudioItem }
  | { type: 'done'; spent: { images: number; units: number } }

/**
 * Draw the Illustration Studio's concepts.
 *
 * A raster style (`raster:<name>`) draws an image instead, which is saved on
 * this server (`lib/studio/rasters.ts`) and returned as a URL.
 *
 * The Studio writes its own prompts — its brand style, role composition, safe
 * zone and tone are in them — so they are sent as they are, without this
 * repo's preamble. That preamble asks for painterly marks that fill the frame
 * edge to edge, which is the opposite of an empty state that must stay quieter
 * than its button. The colors come as the Studio's four seed tokens and are
 * passed as numbers, which the API honors.
 *
 * The money rules are the same as `/api/generate`, for the same reasons
 * (docs/DECISIONS.md): the balance is checked before anything is drawn, the
 * images are drawn one at a time, a partial set comes back, and a closed tab
 * stops the drawing.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const concepts: { title: string; prompt: string }[] = Array.isArray(body?.concepts)
      ? body.concepts
          .map((c: { title?: unknown; prompt?: unknown }) => ({
            title: String(c?.title ?? '').trim().slice(0, 80),
            prompt: String(c?.prompt ?? '').trim(),
          }))
          .filter((c: { prompt: string }) => c.prompt)
      : []

    if (!concepts.length) return Response.json({ error: 'No concepts to draw.' }, { status: 400 })
    if (concepts.length > MAX_CONCEPTS) {
      return Response.json({ error: `At most ${MAX_CONCEPTS} concepts at a time.` }, { status: 400 })
    }
    const long = concepts.find((c) => c.prompt.length > MAX_PROMPT)
    if (long) {
      return Response.json(
        { error: `The prompt for “${long.title}” is ${long.prompt.length} characters; Recraft takes ${MAX_PROMPT}.` },
        { status: 400 },
      )
    }

    // Refuse a bad color rather than drop it: a set drawn without the brand
    // colors it asked for is off-brand and still billed. No colors at all is a
    // choice, though — the Studio sends none when the style is its library, so
    // the references decide the palette instead of competing numbers.
    const colors = (Array.isArray(body?.colors) ? body.colors : []).map((c: unknown) => [String(c), parseHex(String(c))] as const)
    const badColor = colors.find(([, rgb]: readonly [string, unknown]) => !rgb)
    if (badColor) {
      return Response.json({ error: `Colors must be hex like #4a6ed0; got "${badColor[0]}".` }, { status: 400 })
    }
    const background = body?.background ? parseHex(String(body.background)) : null
    if (body?.background && !background) {
      return Response.json({ error: `Background "${body.background}" is not a hex color.` }, { status: 400 })
    }

    let style: StyleOption
    try {
      style = await resolveStyle(String(body?.style ?? '').trim() || defaultKey())
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 })
    }
    const size = sizeFor(style, Number(body?.width), Number(body?.height))

    const needed = estimate(concepts.length, style.units)
    const credits = await balance()
    if (credits < needed) {
      return Response.json(
        {
          error:
            `Not enough API credit: ${concepts.length} concept${concepts.length === 1 ? '' : 's'} needs about ` +
            `${needed} units at ${style.units} each in ${style.name}, and the balance is ${credits}. ` +
            'This is the prepaid API pool, which is separate from Recraft subscription credits.',
          credits,
          needed,
        },
        { status: 402 },
      )
    }

    const controls = {
      ...(colors.length ? { colors: colors.map(([, rgb]: readonly [string, [number, number, number]]) => ({ rgb })) } : {}),
      ...(background ? { background_color: { rgb: background } } : {}),
    }

    const encoder = new TextEncoder()
    let cancelled = false

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: StudioEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        send({ type: 'start', count: concepts.length, style: { key: style.key, name: style.name, units: style.units }, size })

        let drawn = 0
        for (const [index, concept] of concepts.entries()) {
          if (cancelled) break
          let item: StudioItem
          try {
            const { data, ext } = await draw({ prompt: concept.prompt, size, ...style.params, controls })
            drawn += 1
            if (style.format === 'raster') {
              // Kept here, not linked: it has to outlive Recraft's link, and be same-origin for the Studio.
              const [width, height] = size.split('x').map(Number)
              item =
                ext === 'svg'
                  ? { ok: false, title: concept.title, error: 'Recraft answered with SVG for a raster style.' }
                  : { ok: true, title: concept.title, raster: { url: saveRaster(data, ext), width, height } }
            } else {
              item =
                ext === 'svg'
                  ? { ok: true, title: concept.title, ...artwork(data.toString('utf8'), size, background ?? undefined) }
                  : {
                      ok: false,
                      title: concept.title,
                      error: `Recraft answered with ${ext.toUpperCase()}, not SVG. ${style.name} is a raster style; pick a vector one.`,
                    }
            }
          } catch (error) {
            item = { ok: false, title: concept.title, error: (error as Error).message }
          }
          if (cancelled) break
          send({ type: 'item', index, item })
        }

        if (!cancelled) {
          send({ type: 'done', spent: { images: drawn, units: drawn * style.units } })
          controller.close()
        }
      },
      cancel() {
        cancelled = true
      },
    })

    return new Response(stream, {
      headers: {
        'Content-Type': 'application/x-ndjson; charset=utf-8',
        'Cache-Control': 'no-cache',
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
