import { balance, generate } from '@/lib/recraft/client'
import { estimate } from '@/lib/recraft/cost'
import { defaultKey, resolveStyle } from '@/lib/recraft/styles'
import { normalize } from '@/lib/recraft/svg'
import { paletteFor, parseHex, schemeById } from '@/lib/palette'

/** Every image is real money. A typo in a loop should not be able to spend it all. */
const MAX_SET = 6

export type Item =
  | { ok: true; subject: string; svg: string; width: number; height: number; shapes: number }
  | { ok: false; subject: string; error: string }

/**
 * What the response streams, one JSON object per line: `start` once, an
 * `item` as each image finishes, then `done`. Errors found before anything is
 * spent are an ordinary JSON response with a status instead.
 */
export type SetEvent =
  | {
      type: 'start'
      subjects: string[]
      style: { key: string; name: string; size: string; units: number }
      palette: { hex: string[]; scheme: { name: string; reason: string }; base: number }
    }
  | { type: 'item'; index: number; item: Item }
  | { type: 'done'; spent: { images: number; units: number } }

/**
 * Draw a set.
 *
 * Three decisions here are about money rather than code, and each one exists
 * because of something that actually went wrong in the pipeline this was ported
 * from:
 *
 * **The balance is checked before anything is drawn.** A run once died eight
 * images in because the API's prepaid pool was empty while the subscription was
 * fully paid. A second run died at twenty-seven because the preflight was built
 * on a wrong units-per-image constant and printed a reassuring number while it
 * happened. Refusing up front, with the arithmetic shown, is the only version
 * of this that helps.
 *
 * **Images are drawn one at a time, not in parallel.** Parallel is faster and
 * strictly worse here: a failure halfway through a `Promise.all` still bills
 * for everything already in flight, and returns nothing. Sequential means a
 * failure costs exactly what it drew, and whatever succeeded still comes back.
 *
 * **A partial set is returned, not thrown away.** The response carries per-item
 * results, so four good drawings and one 429 gives you four drawings and a
 * message — not an error page and a bill for five.
 *
 * **Each image is sent the moment it exists.** A set of six takes minutes; the
 * response streams, so the stage fills in as drawings arrive rather than all
 * at once at the end. And if the person leaves — closes the tab, reloads — the
 * stream is cancelled and nothing more is drawn, so no one pays for images no
 * one will see.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const brief: string = (body?.brief ?? '').trim()
    const salt: string = (body?.salt ?? '').trim()
    const industry: string = (body?.industry ?? '').trim()
    const brand: string = (body?.brand ?? '').trim()
    const scheme: string = (body?.scheme ?? '').trim()
    const styleKey: string = (body?.style ?? '').trim() || defaultKey()

    const subjects: string[] = Array.isArray(body?.subjects)
      ? body.subjects.map((s: unknown) => String(s).trim()).filter(Boolean)
      : []

    if (!brief && !subjects.length) {
      return Response.json({ error: 'Give it a brief, or one subject per line.' }, { status: 400 })
    }

    // Refuse rather than drop it: a brand color that silently fell back to a
    // hashed hue would draw a whole set off-brand and bill for it.
    if (brand && !parseHex(brand)) {
      return Response.json({ error: `Brand color "${brand}" is not a hex color like #0f766e.` }, { status: 400 })
    }
    if (scheme && !schemeById(scheme)) {
      return Response.json({ error: `Unknown color scheme "${scheme}".` }, { status: 400 })
    }

    // The style decides the model, the size and the price, so it is resolved
    // before the preflight — the estimate has to be for the style actually used.
    let style
    try {
      style = await resolveStyle(styleKey)
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 })
    }

    // No subjects means "variations on the brief": the same request N times,
    // which the model answers differently each time.
    const count = Math.min(subjects.length || Number(body?.count ?? 3), MAX_SET)
    const work = subjects.length ? subjects.slice(0, MAX_SET) : Array.from({ length: count }, () => brief)

    // Preflight. Free to ask, and the only thing standing between a typo and a
    // spent balance.
    const needed = estimate(work.length, style.units)
    const credits = await balance()
    if (credits < needed) {
      return Response.json(
        {
          error:
            `Not enough API credit: ${work.length} image${work.length === 1 ? '' : 's'} ` +
            `needs about ${needed} units at ${style.units} each in ${style.name}, and the balance is ${credits}. ` +
            'Note this is the prepaid API pool, which is separate from Recraft subscription credits.',
          credits,
          needed,
        },
        { status: 402 },
      )
    }

    // One palette for the whole set — the images are meant to belong together.
    // The form previews this same call, so what was shown is what is drawn.
    const palette = paletteFor(brief || work[0], salt, brand, scheme)

    const encoder = new TextEncoder()
    let cancelled = false

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: SetEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))

        send({
          type: 'start',
          subjects: work,
          style: { key: style.key, name: style.name, size: style.size, units: style.units },
          palette: { hex: palette.hex, scheme: palette.scheme, base: Math.round(palette.base) },
        })

        let drawn = 0
        for (const [index, subject] of work.entries()) {
          if (cancelled) break

          // Prefix the shared brief when the subjects are individual lines, so every
          // image in the set still carries the same direction.
          // The industry goes last, as context rather than as the subject: it should
          // steer the props and setting without taking over what is being drawn.
          const scene = subjects.length && brief ? `${brief} ${subject}` : subject
          const prompt = industry ? `${scene}. Industry: ${industry}.` : scene

          let item: Item
          try {
            const { data, ext } = await generate(prompt, palette.colors, style)
            drawn += 1
            if (ext !== 'svg') {
              // A raster answer means the style is not a vector style. Say so
              // rather than returning something the caller cannot use as SVG.
              item = {
                ok: false,
                subject,
                error:
                  `Recraft answered with ${ext.toUpperCase()}, not SVG. The style in use (${style.name}) is a ` +
                  'raster style — train or select a vector_illustration style to get SVG out.',
              }
            } else {
              const { svg, width, height, shapes } = normalize(data.toString('utf8'), style.size)
              item = { ok: true, subject, svg, width, height, shapes }
            }
          } catch (error) {
            item = { ok: false, subject, error: (error as Error).message }
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
        // Proxies buffer by default, which would turn a stream back into one late answer.
        'X-Accel-Buffering': 'no',
      },
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
