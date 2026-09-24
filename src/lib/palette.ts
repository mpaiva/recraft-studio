/**
 * Three colors for a set, as wheel geometry rather than taste.
 *
 * **Why colors are numbers and not words.** Two attempts at asking for them in
 * prose both failed, in the same way. "Rich color" gave thirty-eight drawings
 * in one blue. Naming the wanted spread — "many different hues, warm and cool
 * together" — gave a set that was red in sixteen and azure in twelve, which is
 * two blues rather than one and not what was asked for either. The cause is not
 * weak wording: a trained style is built from reference images, and images beat
 * a sentence. Whatever the references were made of is what comes back, and the
 * preamble only gets a vote.
 *
 * Recraft takes `controls.colors` as RGB triples alongside a custom style and
 * honors them — a probe asking for green, magenta and yellow came back green,
 * magenta and yellow. So the hues are numbers, and the prompt has stopped
 * arguing about them.
 *
 * **Why it is seeded and not random.** `Math.random()` would give a different
 * set every time the same brief was typed, which makes a result impossible to
 * reproduce and a bill impossible to predict. Hashing the brief gives colors
 * that look arbitrary across different briefs and cannot move on their own.
 *
 * **One palette per set, not per image** — and this is the deliberate
 * difference from the pipeline this was ported from. There, each drawing was
 * seeded by its own slug, because the drawings are independent pieces scattered
 * across a site and adding a thirty-ninth should leave the other thirty-eight
 * untouched. Here the whole point is that the images belong together, so the
 * seed is the brief and every image in the set is handed the same three hues.
 *
 * `salt` is how you change your mind: a different salt moves the palette for
 * this brief and nothing else.
 *
 * **Why it runs in the browser too.** The palette is free to compute and the
 * drawings are not, so the form shows it live, before anything is spent. That
 * only means something if the preview is the palette the server will use, so
 * this module has no Node imports and both sides call the same `paletteFor`.
 *
 * **A brand color anchors the set rather than replacing the scheme.** Given
 * one, its hue becomes the base the scheme is measured from and it is used
 * exactly as the first color; the other two are still placed by the wheel
 * geometry and the seed. Picking all three by hand would throw away the one
 * thing the schemes are for — keeping the colors from landing on top of each
 * other.
 */

export type Scheme = {
  /** Stable key, for the form and the API. */
  id: string
  name: string
  /** Degrees added to the base hue, in order. Offset 0 is where a brand color sits. */
  offsets: [number, number, number]
  /** Why those angles and not others — worth showing next to the result. */
  reason: string
  /** Whether Auto may land on it. See the note on SCHEMES. */
  auto: boolean
  /** How far, in degrees, each companion hue may wander either way. Default 12. */
  wobble?: number
  /**
   * Fixed saturation and value per color, for schemes that separate their
   * colors by lightness rather than hue. Without it both come from the seed,
   * inside the floors.
   */
  tones?: { saturation: [number, number, number]; value: [number, number, number] }
}

export type Palette = {
  colors: [number, number, number][]
  hex: string[]
  /** Final hue angles in degrees, after the offsets and the wobble. */
  hues: number[]
  /** Where the hash landed on the wheel, before anything was added. */
  base: number
  scheme: Scheme
  /** True when the seed chose the scheme rather than the person. */
  auto: boolean
}

/**
 * Ways to pick two companions for a hue.
 *
 * Hue is an angle, so the only thing separating two colors on this axis is the
 * distance between them in degrees — and a scheme is a choice about how to
 * spend 360 of them across three points.
 *
 * Spend them evenly and you get the triad, at 120 apart: the furthest any three
 * points can be from each other on a circle, and so the least likely to read as
 * an accident. Put two opposite instead, at 180, and you get the strongest
 * contrast two hues can have, with the third sitting near the first as support
 * rather than a third argument. Split-complementary backs that opposition off
 * by 30 degrees either side, which keeps most of the contrast but stops a
 * red-and-cyan pairing from vibrating. Accented analogous spends almost
 * nothing — 35 degrees between two of them, close enough to read as one family
 * — then puts the third at 190 so the set is mostly one mood with a single
 * thing arguing.
 *
 * **Only those four are in Auto.** They exist to stop the three hues landing on
 * top of each other, which is the failure a random hue per color produces
 * about a third of the time, and the preamble asks for high contrast. The rest
 * are real options but deliberate ones: pure analogous and monochromatic are
 * quiet by design, and square and rectangle are four-color schemes cut down to
 * three corners. Someone should choose them, not have a hash choose them.
 *
 * Monochromatic is the one scheme that cannot be expressed as hue offsets —
 * every offset is zero — so it carries its own lightness ladder instead, dark
 * to light, and a smaller wobble so the three stay one hue.
 */
export const SCHEMES: Scheme[] = [
  {
    id: 'triad',
    name: 'triad',
    offsets: [0, 120, 240],
    reason: 'Three points spaced evenly around the wheel — the furthest apart three hues can be.',
    auto: true,
  },
  {
    id: 'complementary',
    name: 'complementary',
    offsets: [0, 180, 40],
    reason: 'Two hues opposite each other, the strongest contrast available, with the third supporting the first.',
    auto: true,
  },
  {
    id: 'split',
    name: 'split complementary',
    offsets: [0, 150, 210],
    reason: 'The opposition backed off by 30 degrees either side, which keeps the contrast without the vibration.',
    auto: true,
  },
  {
    id: 'accented-analogous',
    name: 'accented analogous',
    offsets: [0, 35, 190],
    reason: 'Two neighbors reading as one family, and a third opposite them to argue with it.',
    auto: true,
  },
  {
    id: 'analogous',
    name: 'analogous',
    offsets: [0, -30, 30],
    reason: 'Three neighbors within 60 degrees — one mood, no argument. Calm, and low in contrast by design.',
    auto: false,
  },
  {
    id: 'monochromatic',
    name: 'monochromatic',
    offsets: [0, 0, 0],
    reason: 'One hue at three depths. The contrast is all in lightness, so shape does the work color usually does.',
    auto: false,
    wobble: 3,
    tones: { saturation: [0.72, 0.55, 0.38], value: [0.38, 0.62, 0.88] },
  },
  {
    id: 'square',
    name: 'square',
    offsets: [0, 90, 180],
    reason: 'Three corners of a square: a complementary pair with a hue at right angles to both.',
    auto: false,
  },
  {
    id: 'rectangle',
    name: 'rectangle',
    offsets: [0, 60, 180],
    reason: 'Three corners of a tetradic rectangle: a complementary pair, and a near neighbor to the first to warm it.',
    auto: false,
  },
]

const AUTO = SCHEMES.filter((s) => s.auto)

export function schemeById(id: string): Scheme | undefined {
  return SCHEMES.find((s) => s.id === id)
}

/**
 * HSV in, 0–255 RGB out. Saturation and value are floored on purpose, so a hue
 * reads as a color rather than as a dark.
 */
export function fromHsv(h: number, s: number, v: number): [number, number, number] {
  const c = v * s
  const x = c * (1 - Math.abs(((h / 60) % 2) - 1))
  const m = v - c
  const [r, g, b] =
    h < 60 ? [c, x, 0]
    : h < 120 ? [x, c, 0]
    : h < 180 ? [0, c, x]
    : h < 240 ? [0, x, c]
    : h < 300 ? [x, 0, c]
    : [c, 0, x]
  return [Math.round((r + m) * 255), Math.round((g + m) * 255), Math.round((b + m) * 255)]
}

export function toHex(colors: [number, number, number][]): string[] {
  return colors.map((c) => `#${c.map((n) => n.toString(16).padStart(2, '0')).join('')}`)
}

/** `#rrggbb` or `rrggbb` to RGB, or null if it is not one. */
export function parseHex(text: string): [number, number, number] | null {
  const m = /^#?([0-9a-f]{6})$/i.exec(text.trim())
  if (!m) return null
  const n = parseInt(m[1], 16)
  return [(n >> 16) & 255, (n >> 8) & 255, n & 255]
}

/** The hue angle of an RGB color, in degrees. Grays come out as 0. */
export function hueOf([r, g, b]: [number, number, number]): number {
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (!d) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

/**
 * Sixteen bytes from a string, deterministically.
 *
 * Not cryptographic, and it does not need to be: it only has to scatter
 * similar briefs across the wheel. It replaces a SHA-256 so it can run
 * synchronously in the browser, which Web Crypto cannot.
 */
export function seedBytes(text: string): Uint8Array {
  // xmur3: fold the string into a 32-bit state.
  let h = 1779033703 ^ text.length
  for (let i = 0; i < text.length; i++) {
    h = Math.imul(h ^ text.charCodeAt(i), 3432918353)
    h = (h << 13) | (h >>> 19)
  }
  h = Math.imul(h ^ (h >>> 16), 2246822507)
  h = Math.imul(h ^ (h >>> 13), 3266489909)
  let a = (h ^ (h >>> 16)) >>> 0

  // mulberry32: stretch it to as many bytes as the palette reads.
  const out = new Uint8Array(16)
  for (let i = 0; i < out.length; i += 4) {
    a = (a + 0x6d2b79f5) >>> 0
    let t = Math.imul(a ^ (a >>> 15), a | 1)
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61)
    const word = (t ^ (t >>> 14)) >>> 0
    out.set([word >>> 24, (word >>> 16) & 255, (word >>> 8) & 255, word & 255], i)
  }
  return out
}

/**
 * Three colors from at least 14 bytes of seed, optionally anchored on a brand
 * color and optionally in a scheme the person chose.
 */
export function paletteFromBytes(
  seed: Uint8Array,
  brand?: [number, number, number] | null,
  chosen?: Scheme,
): Palette {
  if (seed.length < 14) throw new Error('paletteFromBytes needs at least 14 bytes of seed')

  const base = brand ? hueOf(brand) : (((seed[0] << 8) | seed[1]) / 0xffff) * 360
  const scheme = chosen ?? AUTO[seed[2] % AUTO.length]
  const wobble = scheme.wobble ?? 12

  // The brand color sits at offset 0 untouched; only its companions wobble.
  const jitter = scheme.offsets.map((_, i) => (brand && i === 0 ? 0 : (seed[3 + i] / 255 - 0.5) * 2 * wobble))
  const hues = scheme.offsets.map((offset, i) => (base + offset + jitter[i] + 360) % 360)

  // A fixed ladder still gets a small nudge from the seed, so Reroll moves it.
  const saturation = hues.map((_, i) =>
    scheme.tones ? scheme.tones.saturation[i] + (seed[8 + i] / 255 - 0.5) * 0.1 : 0.42 + (seed[8 + i] / 255) * 0.33,
  )
  const value = hues.map((_, i) =>
    scheme.tones ? scheme.tones.value[i] + (seed[11 + i] / 255 - 0.5) * 0.06 : 0.52 + (seed[11 + i] / 255) * 0.33,
  )

  const colors = hues.map((h, i) => (brand && i === 0 ? brand : fromHsv(h, saturation[i], value[i])))

  return { colors, hex: toHex(colors), hues, base, scheme, auto: !chosen }
}

/** `scheme` is a scheme id, or empty for Auto. An unknown id is treated as Auto; callers that take input should check it first. */
export function paletteFor(brief: string, salt = '', brand?: string, scheme?: string): Palette {
  return paletteFromBytes(
    seedBytes(`${brief}|${salt}`),
    brand ? parseHex(brand) : null,
    scheme ? schemeById(scheme) : undefined,
  )
}
