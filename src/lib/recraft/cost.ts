/**
 * What an image costs, in API units — which is *not* "one credit per image".
 *
 * This is the most expensive thing in this repo to get wrong, so it carries the
 * measurement rather than a guess.
 *
 * The original constants said 1 and 2. A preflight built on them told a
 * 37-image run it needed 37 units against a balance of 1115, and the run died
 * after 27 images. Measured from that run: 1115 before, 35 after, 27 drawn —
 * **40 units per raster image**. Vector is the double elsewhere in Recraft's
 * pricing, so 80 is the documented figure rather than an observed one; if you
 * ever measure it, replace this comment with what you saw.
 *
 * A wrong constant is worse than no constant. The first version of this check
 * let a run die at twenty-seven while printing a reassuring number, which is a
 * worse failure than not checking at all.
 */
export const UNITS_RASTER = 40
export const UNITS_VECTOR = 80

/** This app always asks for vector, because the whole point is SVG out. */
export const UNITS_PER_IMAGE = UNITS_VECTOR

export function estimate(count: number): number {
  return count * UNITS_PER_IMAGE
}
