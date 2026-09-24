import { balance, generate, style } from '@/lib/recraft/client'
import { estimate, UNITS_PER_IMAGE } from '@/lib/recraft/cost'
import { normalize } from '@/lib/recraft/svg'
import { paletteFor } from '@/lib/palette'

/** Every image is real money. A typo in a loop should not be able to spend it all. */
const MAX_SET = 6

export type Item =
  | { ok: true; subject: string; svg: string; width: number; height: number; shapes: number }
  | { ok: false; subject: string; error: string }

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
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const brief: string = (body?.brief ?? '').trim()
    const salt: string = (body?.salt ?? '').trim()
    const industry: string = (body?.industry ?? '').trim()

    const subjects: string[] = Array.isArray(body?.subjects)
      ? body.subjects.map((s: unknown) => String(s).trim()).filter(Boolean)
      : []

    if (!brief && !subjects.length) {
      return Response.json({ error: 'Give it a brief, or one subject per line.' }, { status: 400 })
    }

    // No subjects means "variations on the brief": the same request N times,
    // which the model answers differently each time.
    const count = Math.min(subjects.length || Number(body?.count ?? 3), MAX_SET)
    const work = subjects.length ? subjects.slice(0, MAX_SET) : Array.from({ length: count }, () => brief)

    // Preflight. Free to ask, and the only thing standing between a typo and a
    // spent balance.
    const needed = estimate(work.length)
    const credits = await balance()
    if (credits < needed) {
      return Response.json(
        {
          error:
            `Not enough API credit: ${work.length} image${work.length === 1 ? '' : 's'} ` +
            `needs about ${needed} units at ${UNITS_PER_IMAGE} each, and the balance is ${credits}. ` +
            'Note this is the prepaid API pool, which is separate from Recraft subscription credits.',
          credits,
          needed,
        },
        { status: 402 },
      )
    }

    // One palette for the whole set — the images are meant to belong together.
    const palette = paletteFor(brief || work[0], salt)
    const { trained, key } = style()

    const items: Item[] = []
    let drawn = 0

    for (const subject of work) {
      // Prefix the shared brief when the subjects are individual lines, so every
      // image in the set still carries the same direction.
      // The industry goes last, as context rather than as the subject: it should
      // steer the props and setting without taking over what is being drawn.
      const scene = subjects.length && brief ? `${brief} ${subject}` : subject
      const prompt = industry ? `${scene}. Industry: ${industry}.` : scene

      try {
        const { data, ext } = await generate(prompt, palette.colors)

        if (ext !== 'svg') {
          // A raster answer means the style is not a vector style. Say so
          // rather than returning something the caller cannot use as SVG.
          items.push({
            ok: false,
            subject,
            error:
              `Recraft answered with ${ext.toUpperCase()}, not SVG. The style in use (${key}) is a ` +
              'raster style — train or select a vector_illustration style to get SVG out.',
          })
          drawn += 1
          continue
        }

        const { svg, width, height, shapes } = normalize(data.toString('utf8'))
        items.push({ ok: true, subject, svg, width, height, shapes })
        drawn += 1
      } catch (error) {
        items.push({ ok: false, subject, error: (error as Error).message })
      }
    }

    return Response.json({
      items,
      palette: { hex: palette.hex, scheme: palette.scheme, base: Math.round(palette.base) },
      style: { trained, key },
      spent: { images: drawn, units: drawn * UNITS_PER_IMAGE },
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
