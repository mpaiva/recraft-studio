import { allStyles, defaultKey } from '@/lib/recraft/styles'

/**
 * Every style the picker can show: Recraft's curated vector library, then the
 * account's own. Free to ask — listing styles does not spend units.
 *
 * The wire parameters stay on the server; the form only needs to know what a
 * style is called, what it costs, whether it can be used, and what it looks
 * like.
 */
export async function GET() {
  try {
    const styles = (await allStyles()).map((style) => {
      const { params, ...rest } = style
      void params
      return rest
    })
    return Response.json({ styles, defaultKey: defaultKey() })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
