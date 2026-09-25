import { CREATE_UNITS, isDraft, makeStyle, MAX_REFS, MAX_TOTAL, MAX_UPLOAD_BYTES, REF_UNITS } from '@/lib/recraft/make-style'
import { allStyles, defaultKey, rasterStyles } from '@/lib/recraft/styles'
import { listExamples } from '@/lib/studio/examples'

/**
 * Every style the picker can show: Recraft's curated vector library, then the
 * account's own. Free to ask — listing styles does not spend units.
 *
 * The wire parameters stay on the server; the form only needs to know what a
 * style is called, what it costs, whether it can be used, and what it looks
 * like.
 */
export async function GET(request: Request) {
  try {
    // `?format=raster`: the Illustration Studio's raster styles. Without it, the vector list, as before.
    const raster = new URL(request.url).searchParams.get('format') === 'raster'
    const styles = (raster ? rasterStyles() : await allStyles()).map((style) => {
      const { params, ...rest } = style
      void params
      // Drawings beyond the sample, for the Illustration Studio's style browser.
      return { ...rest, examples: listExamples(style.key) }
    })
    return Response.json({
      styles,
      defaultKey: raster ? 'raster:Illustration' : defaultKey(),
      // What making a style costs, so the form can show it before anything is spent.
      make: { refUnits: REF_UNITS, createUnits: CREATE_UNITS, maxRefs: MAX_REFS, maxTotal: MAX_TOTAL, maxUploadBytes: MAX_UPLOAD_BYTES },
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}

/**
 * Step two of making a style: turn the references the person kept into a
 * Recraft style, record its name, and draw its sample.
 */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const name: string = String(body?.name ?? '').trim()
    const description: string = String(body?.description ?? '').trim()
    const draft: string = String(body?.draft ?? '')
    const files: string[] = Array.isArray(body?.files) ? body.files.map(String) : []

    if (!name || name.length > 40) {
      return Response.json({ error: 'Give the style a name of up to 40 characters.' }, { status: 400 })
    }
    if (description.length < 10 || description.length > 600) {
      return Response.json({ error: 'The description should be 10 to 600 characters.' }, { status: 400 })
    }
    if (!isDraft(draft)) {
      return Response.json({ error: 'Unknown draft.' }, { status: 400 })
    }

    return Response.json(await makeStyle({ draft, files, name, description }))
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
