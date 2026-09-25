import { JSDOM } from 'jsdom'
import { optimize } from 'svgo'

const SHAPES = 'path, rect, circle, ellipse, polygon, polyline'

/**
 * Precision and path merging, which is most of the saving.
 *
 * `removeMetadata` is left at its SVGO default, which drops Recraft's C2PA
 * provenance manifest. That is correct here rather than careless: C2PA hashes
 * the bytes it signs, and optimizing has already changed them, so carrying the
 * manifest forward would ship a provenance claim that fails verification.
 *
 * If provenance matters to you, keep the untouched original — this app returns
 * `raw` alongside the optimized markup for exactly that reason.
 */
export function shrink(source: string): string {
  return optimize(source, { multipass: true, floatPrecision: 1 }).data
}

export type Normalized = {
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
 * Note what does *not* happen: the colors are left alone. The drawing carries
 * its own palette and will look the same on a light page and a dark one. That
 * is a real trade — it means these drawings sit outside any design-token system
 * — and it is the price of letting the model choose how to use the three hues
 * it was given.
 */
/** `size` is what was asked for, `WIDTHxHEIGHT` — used only if the SVG has no viewBox. */
export function normalize(source: string, size: string): Normalized {
  const dom = new JSDOM(source, { contentType: 'image/svg+xml' })
  const svg = dom.window.document.documentElement

  svg.querySelector('metadata')?.remove()

  const viewBox = svg.getAttribute('viewBox') ?? `0 0 ${size.replace('x', ' ')}`
  const [, , width, height] = viewBox.split(/\s+/).map(Number)

  svg.removeAttribute('width')
  svg.removeAttribute('height')
  svg.setAttribute('xmlns', 'http://www.w3.org/2000/svg')

  const shapes = svg.querySelectorAll(SHAPES).length

  return { svg: shrink(svg.outerHTML), width, height, shapes }
}

export type Artwork = {
  viewBox: string
  /** The drawing's children, without the outer `<svg>`, for a host to wrap and lay out. */
  markup: string
  shapes: number
  /** Whether a full-frame background was taken out. */
  cleared: boolean
}

/**
 * A drawing for the Illustration Studio, which places artwork inside its own
 * container, surface and safe zone rather than showing it edge to edge.
 *
 * **The full-frame background goes.** Every Recraft vector answer starts with a
 * path covering the whole viewBox (`M0 0h2048v1365H0z`). Left in, it paints the
 * container's surface a color the host did not choose — wrong on a dark
 * surface — and makes the Studio's visual-weight check read 100%. Only a first
 * shape that exactly covers the frame is removed; large shapes that merely
 * happen to be big are part of the drawing and stay — and only when it is the
 * color that was asked for (`background`) or near white. Some styles draw
 * light lines over a dark frame (Engraving is white on black), and taking that
 * frame away would leave white lines on a white card.
 */
export function artwork(source: string, size: string, background?: [number, number, number]): Artwork {
  const { svg } = normalize(source, size)
  const dom = new JSDOM(svg, { contentType: 'image/svg+xml' })
  const root = dom.window.document.documentElement
  const viewBox = root.getAttribute('viewBox') ?? `0 0 ${size.replace('x', ' ')}`
  const [, , w, h] = viewBox.split(/\s+/).map(Number)

  const first = Array.from(root.children).find((el) => el.tagName !== 'defs')
  const covers =
    !!first &&
    ((first.tagName === 'path' && fullFrame(first.getAttribute('d') ?? '', w, h)) ||
      (first.tagName === 'rect' &&
        Number(first.getAttribute('x') ?? 0) <= 0 &&
        Number(first.getAttribute('y') ?? 0) <= 0 &&
        Number(first.getAttribute('width')) >= w &&
        Number(first.getAttribute('height')) >= h))
  const cleared = covers && plain(first.getAttribute('fill') ?? '#000', background)
  if (cleared) first.remove()

  return { viewBox, markup: root.innerHTML, shapes: root.querySelectorAll(SHAPES).length, cleared }
}

/**
 * `M0 0h2048v1365H0z` or `M0 0v1365h2048V0z`: a rectangle from the origin
 * covering the frame. Both spellings come back, depending on the style.
 */
function fullFrame(d: string, w: number, h: number): boolean {
  const s = d.replace(/,/g, ' ').replace(/\s+/g, '').trim()
  const across = s.match(/^M00h([\d.]+)v([\d.]+)H0[zZ]$/)
  if (across) return Number(across[1]) >= w && Number(across[2]) >= h
  const down = s.match(/^M00v([\d.]+)h([\d.]+)V0[zZ]$/)
  return !!down && Number(down[2]) >= w && Number(down[1]) >= h
}

/** A fill that is the requested background, or close to white. */
function plain(fill: string, background?: [number, number, number]): boolean {
  const hex = fill.trim().match(/^#([0-9a-f]{3}|[0-9a-f]{6})$/i)?.[1]
  if (!hex) return /^white$/i.test(fill.trim())
  const full = hex.length === 3 ? hex.replace(/./g, (c) => c + c) : hex
  const rgb = [0, 2, 4].map((i) => parseInt(full.slice(i, i + 2), 16))
  if (rgb.every((c) => c >= 235)) return true
  return !!background && Math.hypot(...rgb.map((c, i) => c - background[i])) < 40
}

/**
 * An SVG a person uploaded, with everything that runs or loads taken out:
 * scripts, event handlers, foreign HTML, and links or images that point off
 * the file. Drawing is left alone. The Studio shows these through <img>, where
 * none of it could run anyway; this is for the file they download and the
 * copy that lands in the library.
 */
export function inert(source: string): string {
  const dom = new JSDOM(source, { contentType: 'image/svg+xml' })
  const doc = dom.window.document
  if (doc.documentElement.tagName.toLowerCase() !== 'svg') throw new Error('That file is not an SVG.')
  doc.querySelectorAll('script, foreignObject, iframe, object, embed').forEach((el) => el.remove())
  doc.querySelectorAll('*').forEach((el) => {
    for (const attr of Array.from(el.attributes)) {
      const name = attr.name.toLowerCase()
      const external = (name === 'href' || name === 'xlink:href') && !attr.value.trim().startsWith('#')
      if (name.startsWith('on') || external) el.removeAttribute(attr.name)
    }
  })
  return doc.documentElement.outerHTML
}
