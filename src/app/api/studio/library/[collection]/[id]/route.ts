import { isCollection, isId, MAX_DOC, remove, set } from '@/lib/studio/library'

type Params = { params: Promise<{ collection: string; id: string }> }

async function target(params: Params['params']) {
  const { collection, id } = await params
  if (!isCollection(collection) || !isId(id)) return null
  return { collection, id }
}

/** Replace a document. The old one is kept in `.attic/`, never overwritten. */
export async function PUT(request: Request, { params }: Params) {
  const t = await target(params)
  if (!t) return Response.json({ error: 'Unknown document.' }, { status: 404 })
  try {
    const text = await request.text()
    if (text.length > MAX_DOC) return Response.json({ error: 'Too large.', code: 'quota_exceeded' }, { status: 413 })
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return Response.json({ error: 'A document is a JSON object.', code: 'invalid_argument' }, { status: 400 })
    }
    set(t.collection, t.id, data)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

/** Take a document out of the library. The file moves to `.attic/`. */
export async function DELETE(_request: Request, { params }: Params) {
  const t = await target(params)
  if (!t) return Response.json({ error: 'Unknown document.' }, { status: 404 })
  try {
    remove(t.collection, t.id)
    return Response.json({ ok: true })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 404 })
  }
}
