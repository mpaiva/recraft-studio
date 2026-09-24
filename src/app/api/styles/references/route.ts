import { drawReferences, MAX_REFS } from '@/lib/recraft/make-style'

/**
 * Step one of making a style: draw reference images from a description.
 *
 * This is where a new style costs money, so it is its own request — the
 * person sees what was drawn before anything else is spent on it.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const description: string = String(body?.description ?? '').trim()
    const count = Number(body?.count ?? 3)

    if (description.length < 10) {
      return Response.json({ error: 'Describe the style in a sentence or two.' }, { status: 400 })
    }
    if (description.length > 600) {
      return Response.json({ error: 'Keep the description under 600 characters.' }, { status: 400 })
    }
    if (!Number.isInteger(count) || count < 1 || count > MAX_REFS) {
      return Response.json({ error: `Draw between 1 and ${MAX_REFS} references.` }, { status: 400 })
    }

    return Response.json(await drawReferences(description, count))
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
