import { balance, draw } from '@/lib/recraft/client'
import { estimate } from '@/lib/recraft/cost'
import { resolveStyle, type StyleOption } from '@/lib/recraft/styles'
import { normalize } from '@/lib/recraft/svg'
import { parseHex } from '@/lib/palette'
import { saveExample, type Example } from '@/lib/studio/examples'

/** A look at a style, not a batch: a handful at a time. */
const MAX_EXAMPLES = 4
const MAX_PROMPT = 1000

export type ExampleItem = ({ ok: true } & Example) | { ok: false; title: string; error: string }

export type ExampleEvent =
  | { type: 'start'; count: number; style: { key: string; name: string; units: number } }
  | { type: 'item'; index: number; item: ExampleItem }
  | { type: 'done'; spent: { images: number; units: number } }

/**
 * Draw examples of a style for the Illustration Studio's style browser, and
 * keep them (`lib/studio/examples.ts`), so a style is paid to be shown once and
 * not once per visitor.
 *
 * The Studio writes the prompts — its own subjects and composition — and sends
 * its seed colors as numbers. The money rules are `/api/generate`'s: balance
 * checked first, one drawing at a time, what finished is kept and reported,
 * and a closed dialog stops the rest.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const examples: { title: string; prompt: string }[] = (Array.isArray(body?.examples) ? body.examples : [])
      .map((e: { title?: unknown; prompt?: unknown }) => ({
        title: String(e?.title ?? '').trim().slice(0, 60),
        prompt: String(e?.prompt ?? '').trim(),
      }))
      .filter((e: { title: string; prompt: string }) => e.title && e.prompt)
    if (!examples.length) return Response.json({ error: 'No examples to draw.' }, { status: 400 })
    if (examples.length > MAX_EXAMPLES) {
      return Response.json({ error: `At most ${MAX_EXAMPLES} examples at a time.` }, { status: 400 })
    }
    if (examples.some((e) => e.prompt.length > MAX_PROMPT)) {
      return Response.json({ error: `Prompts are at most ${MAX_PROMPT} characters.` }, { status: 400 })
    }

    const colors = (Array.isArray(body?.colors) ? body.colors : []).map((c: unknown) => parseHex(String(c)))
    if (!colors.length || colors.some((c: unknown) => !c)) {
      return Response.json({ error: 'Colors must be hex like #4a6ed0.' }, { status: 400 })
    }
    const background = body?.background ? parseHex(String(body.background)) : null

    let style: StyleOption
    try {
      style = await resolveStyle(String(body?.style ?? ''))
    } catch (error) {
      return Response.json({ error: (error as Error).message }, { status: 400 })
    }

    const needed = estimate(examples.length, style.units)
    const credits = await balance()
    if (credits < needed) {
      return Response.json(
        { error: `Not enough API credit: ${examples.length} examples need ${needed} units and the balance is ${credits}.`, credits, needed },
        { status: 402 },
      )
    }

    const controls = {
      colors: colors.map((rgb: [number, number, number]) => ({ rgb })),
      ...(background ? { background_color: { rgb: background } } : {}),
    }
    const encoder = new TextEncoder()
    let cancelled = false

    const stream = new ReadableStream<Uint8Array>({
      async start(controller) {
        const send = (event: ExampleEvent) => controller.enqueue(encoder.encode(`${JSON.stringify(event)}\n`))
        send({ type: 'start', count: examples.length, style: { key: style.key, name: style.name, units: style.units } })

        let drawn = 0
        for (const [index, example] of examples.entries()) {
          if (cancelled) break
          let item: ExampleItem
          try {
            const { data, ext } = await draw({ prompt: example.prompt, size: style.size, ...style.params, controls })
            drawn += 1
            // Saved even if the dialog has closed since: it was paid for.
            const raster = style.format === 'raster'
            item =
              raster && ext !== 'svg'
                ? { ok: true, ...saveExample(style.key, example.title, data, ext) }
                : !raster && ext === 'svg'
                  ? { ok: true, ...saveExample(style.key, example.title, normalize(data.toString('utf8'), style.size).svg) }
                  : { ok: false, title: example.title, error: `Recraft answered with ${ext.toUpperCase()}, not ${raster ? 'an image' : 'SVG'}.` }
          } catch (error) {
            item = { ok: false, title: example.title, error: (error as Error).message }
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
      headers: { 'Content-Type': 'application/x-ndjson; charset=utf-8', 'Cache-Control': 'no-cache', 'X-Accel-Buffering': 'no' },
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
