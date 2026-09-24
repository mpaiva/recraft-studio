import { createHash } from 'node:crypto'

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
 */

export type Scheme = {
  name: string
  /** Degrees added to the base hue, in order. */
  offsets: [number, number, number]
  /** Why those angles and not others — worth showing next to the result. */
  reason: string
}

export type Palette = {
  colors: [number, number, number][]
  hex: string[]
  /** Final hue angles in degrees, after the offsets and the wobble. */
  hues: number[]
  /** Where the hash landed on the wheel, before anything was added. */
  base: number
  scheme: Scheme
}

/**
 * Four ways to pick two companions for a hue.
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
 * red-and-cyan pairing from vibrating. Analogous spends almost nothing — 35
 * degrees between two of them, close enough to read as one family — then puts
 * the third at 190 so the set is mostly one mood with a single thing arguing.
 *
 * The style supplies the taste. These only have to stop the three from landing
 * on top of each other, which is the failure a random hue per color would
 * produce about a third of the time.
 */
const SCHEMES: Scheme[] = [
  {
    name: 'triad',
    offsets: [0, 120, 240],
    reason: 'Three points spaced evenly around the wheel — the furthest apart three hues can be.',
  },
  {
    name: 'complementary',
    offsets: [0, 180, 40],
    reason: 'Two hues opposite each other, the strongest contrast available, with the third supporting the first.',
  },
  {
    name: 'split',
    offsets: [0, 150, 210],
    reason: 'The opposition backed off by 30 degrees either side, which keeps the contrast without the vibration.',
  },
  {
    name: 'analogous',
    offsets: [0, 35, 190],
    reason: 'Two neighbors reading as one family, and a third opposite them to argue with it.',
  },
]

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

/** Three colors from at least 14 bytes of seed. */
export function paletteFromBytes(seed: Uint8Array): Palette {
  if (seed.length < 14) throw new Error('paletteFromBytes needs at least 14 bytes of seed')

  const base = (((seed[0] << 8) | seed[1]) / 0xffff) * 360
  const scheme = SCHEMES[seed[2] % SCHEMES.length]

  const jitter = scheme.offsets.map((_, i) => (seed[3 + i] / 255 - 0.5) * 24)
  const hues = scheme.offsets.map((offset, i) => (base + offset + jitter[i] + 360) % 360)

  const saturation = hues.map((_, i) => 0.42 + (seed[8 + i] / 255) * 0.33)
  const value = hues.map((_, i) => 0.52 + (seed[11 + i] / 255) * 0.33)

  const colors = hues.map((h, i) => fromHsv(h, saturation[i], value[i]))

  return { colors, hex: toHex(colors), hues, base, scheme }
}

export function paletteFor(brief: string, salt = ''): Palette {
  return paletteFromBytes(createHash('sha256').update(`${brief}|${salt}`).digest())
}
