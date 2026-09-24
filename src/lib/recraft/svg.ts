import { JSDOM } from 'jsdom'
import { optimize } from 'svgo'

import { SIZE } from './prompt'

const SHAPES = 'path, rect, circle, ellipse, polygon, polyline'

/**
 * Precision and path merging, which is most of the saving.
 *
 * `removeMetadata` is left at its SVGO default, which drops Recraft's C2PA
 * provenance manifest. That is correct here rather than careless: C2PA hashes
 * the bytes it signs, and optimising has already changed them, so carrying the
 * manifest forward would ship a provenance claim that fails verification.
 *
 * If provenance matters to you, keep the untouched original — this app returns
 * `raw` alongside the optimised markup for exactly that reason.
 */
export function shrink(source: string): string {
  return optimize(source, { multipass: true, floatPrecision: 1 }).data
}

export type Normalised = {
  /** The markup, ready to inline or serve. */
  svg: string
  width: number
  height: number
  /** How many drawable shapes survived — a rough complexity signal. */
  shapes: number
}

/**
 * Make a Recraft SVG safe to drop into a page at any size.
 *
 * Three things happen, each for a reason:
 *
 * **The metadata element goes**, for the C2PA reason above.
 *
 * **`width` and `height` are removed and only `viewBox` is kept.** Those
 * attributes pin the drawing to one size; the page should decide how big it is.
 * The viewBox is what makes it scale, and it is also the only place the aspect
 * ratio survives, which is why the dimensions are returned separately — a
 * caller that wants to reserve layout space needs them as numbers, not as
 * attributes fighting its CSS.
 *
 * **`xmlns` is set explicitly.** Inline SVG in HTML does not strictly need it,
 * but the same markup written to a `.svg` file does, and it is the same string
 * either way.
 *
 * Note what does *not* happen: the colours are left alone. The drawing carries
 * its own palette and will look the same on a light page and a dark one. That
 * is a real trade — it means these drawings sit outside any design-token system
 * — and it is the price of letting the model choose how to use the three hues
 * it was given.
 */
export function normalise(source: string): Normalised {
  const dom = new JSDOM(source, { contentType: 'image/svg+xml' })
  const svg = dom.window.document.documentElement

  svg.querySelector('metadata')?.remove()

  const viewBox = svg.getAttribute('viewBox') ?? `0 0 ${SIZE.replace('x', ' ')}`
  const [, , width, height] = viewBox.split(/\s+/).map(Number)

  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const shapes = svg.querySelectorAll(SHAPES).length

  return { svg: shrink(svg.outerHTML), width, height, shapes }
}
