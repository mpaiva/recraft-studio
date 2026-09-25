import { add, isCollection, list, MAX_DOC } from '@/lib/studio/library'

export async function GET(_request: Request, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params
  if (!isCollection(collection)) return Response.json({ error: 'Unknown collection.' }, { status: 404 })
  try {
    return Response.json({ docs: list(collection) })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

export async function POST(request: Request, { params }: { params: Promise<{ collection: string }> }) {
  const { collection } = await params
  if (!isCollection(collection)) return Response.json({ error: 'Unknown collection.' }, { status: 404 })
  try {
    const text = await request.text()
    if (text.length > MAX_DOC) return Response.json({ error: 'Too large.', code: 'quota_exceeded' }, { status: 413 })
    const data = JSON.parse(text)
    if (!data || typeof data !== 'object' || Array.isArray(data)) {
      return Response.json({ error: 'A document is a JSON object.', code: 'invalid_argument' }, { status: 400 })
    }
    return Response.json({ id: add(collection, data) })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
