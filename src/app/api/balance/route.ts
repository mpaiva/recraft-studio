import { balance, style } from '@/lib/recraft/client'
import { UNITS_PER_IMAGE } from '@/lib/recraft/cost'

/**
 * What the account can spend, and what it will be spent on.
 *
 * Separate from generation on purpose: this is the question you want answered
 * *before* committing to a batch, and it is free to ask. The API balance is a
 * prepaid pool distinct from the subscription credits the Recraft web editor
 * spends, so a paid-up plan can sit beside a zero here and the only other way
 * to find out is a 400 on the first image.
 */
export async function GET() {
  try {
    const { trained, key } = style()
    return Response.json({
      credits: await balance(),
      unitsPerImage: UNITS_PER_IMAGE,
      style: { trained, key },
    })
  } catch (error) {
    return Response.json({ error: (error as Error).message }, { status: 500 })
  }
}
