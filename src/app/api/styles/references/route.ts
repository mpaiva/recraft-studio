import { drawReferences, MAX_REFS, MAX_TOTAL } from '@/lib/recraft/make-style'

/**
 * Step one of making a style: draw reference images from a description, and
 * take in any the person brought.
 *
 * This is where a new style costs money, so it is its own request — the
 * person sees what was drawn before anything else is spent on it.
 *
 * JSON (`{ description, count }`) draws references only. Multipart form data
 * adds uploads: `description`, `count`, and up to ten `image` files, which are
 * free and let `count` be 0.
 */
export async function POST(request: Request) {
  try {
    let description: string
    let count: number
    let uploads: Uint8Array[] = []

    if ((request.headers.get('content-type') ?? '').includes('multipart/form-data')) {
      const form = await request.formData()
      description = String(form.get('description') ?? '').trim()
      count = Number(form.get('count') ?? 0)
      const files = form.getAll('image').filter((f): f is File => typeof f !== 'string')
      if (files.length > MAX_TOTAL) {
        return Response.json({ error: `Add at most ${MAX_TOTAL} images.` }, { status: 400 })
      }
      uploads = await Promise.all(files.map(async (f) => new Uint8Array(await f.arrayBuffer())))
    } else {
      const body = await request.json()
      description = String(body?.description ?? '').trim()
      count = Number(body?.count ?? 3)
    }

    if (description.length < 10) {
      return Response.json({ error: 'Describe the style in a sentence or two.' }, { status: 400 })
    }
    if (description.length > 600) {
      return Response.json({ error: 'Keep the description under 600 characters.' }, { status: 400 })
    }
    const least = uploads.length ? 0 : 1
    if (!Number.isInteger(count) || count < least || count > MAX_REFS) {
      return Response.json({ error: `Draw between ${least} and ${MAX_REFS} references.` }, { status: 400 })
    }
    if (count + uploads.length > MAX_TOTAL) {
      return Response.json({ error: `A style is made from at most ${MAX_TOTAL} images in all.` }, { status: 400 })
    }

    return Response.json(await drawReferences(description, count, uploads))
  } catch (error) {
    // Bad uploads are the caller's to fix, and nothing was spent on them.
    const message = (error as Error).message
    return Response.json({ error: message }, { status: /^Image \d+ is/.test(message) ? 400 : 500 })
  }
}
