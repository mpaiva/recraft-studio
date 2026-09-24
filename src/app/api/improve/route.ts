import { improveSubjects } from '@/lib/improve'

/**
 * Rewrite the subjects for an industry. Nothing is drawn and no Recraft units
 * are spent — the result goes back into the form to be read before it is used.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const brief: string = (body?.brief ?? '').trim()
    const industry: string = (body?.industry ?? '').trim()
    const subjects: string[] = Array.isArray(body?.subjects)
      ? body.subjects.map((s: unknown) => String(s).trim()).filter(Boolean)
      : []

    if (!industry && !brief) {
      return Response.json({ error: 'Give it an industry or a brief to work from.' }, { status: 400 })
    }

    const improved = await improveSubjects({ brief, industry, subjects, count: Number(body?.count ?? 3) })
    return Response.json({ subjects: improved })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
