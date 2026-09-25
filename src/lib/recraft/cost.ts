/**
 * What an image costs, in API units — which is *not* "one credit per image",
 * and is not one number either: it depends on the model the style needs.
 *
 * This is the most expensive thing in this repo to get wrong, so it carries the
 * measurements rather than guesses.
 *
 * The original constants said 1 and 2. A preflight built on them told a
 * 37-image run it needed 37 units against a balance of 1115, and the run died
 * after 27 images. Measured from that run: 1115 before, 35 after, 27 drawn —
 * **40 units per raster image**.
 *
 * Vector was then taken as 80 by analogy with Recraft's pricing, and nobody had
 * checked. Measured on 2026-09-24, one image each, balance read before and
 * after:
 *
 * - `recraftv3_vector` (curated styles, and the old substyle fallback): **80**
 * - `recraftv4_styles_vector` (styles from the account): **50**
 *
 * Making a style adds two more, measured on the first style made here
 * (2026-09-24, balance read between steps): **35** per `recraftv4_1` raster
 * image — the references — and **5** to create the style. Both match
 * Recraft's pricing page.
 *
 * A raster style from this account (`recraftv4_styles` with a `style_id`, which
 * is what the Illustration Studio's raster library style is) is **35** per
 * Recraft's pricing page (2026-09-24) — not yet measured here.
 *
 * Vectorizing an image is **10**: Recraft's pricing page says so, and the
 * first real run (2026-09-24, a 384×256 PNG) moved the balance by 10.
 * `/api/studio/vectorize` still reads the balance before and after each one and
 * reports the difference, in case it ever stops matching.
 *
 * A wrong constant is worse than no constant. The first version of this check
 * let a run die at twenty-seven while printing a reassuring number, which is a
 * worse failure than not checking at all.
 */
export const UNITS = {
  raster: 40,
  recraftv3_vector: 80,
  recraftv4_styles_vector: 50,
  recraftv4_1: 35,
  createStyle: 5,
  recraftv4_styles_raster: 35,
  vectorize: 10,
} as const

export function estimate(count: number, unitsPerImage: number): number {
  return count * unitsPerImage
}
