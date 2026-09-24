/**
 * The preamble every prompt carries, and why each clause is in it.
 *
 * Carried over from the pipeline this repo was spun out of, where each of these
 * was added in response to something the model actually did:
 *
 * **"saturated and high in contrast", "nothing muted, nothing washed out"** —
 * colours are passed separately as exact RGB numbers the API honours, so this
 * asks for saturation and deliberately says nothing about hue. A prose clause
 * naming colours here would be a second opinion fighting those numbers.
 *
 * **"No text, no lettering, no numbers"** — generative models put invented
 * words into illustrations constantly, and misspelt fake text in a published
 * drawing is worse than no drawing.
 *
 * **"fills the whole frame edge to edge. No border, no frame, no vignette"** —
 * without it, a meaningful share of results come back matted, as though
 * photographed in a gallery.
 *
 * A note on what is NOT here: there used to be light negatives — no sparks, no
 * glare, no beams, no starfields. They were scars from an earlier style trained
 * on a single image of electrical discharge, which turned every workbench into
 * welding. When that style was replaced the negatives stayed for a while,
 * fighting a look they were never aimed at. Prompt clauses should be removed
 * when the thing they were defending against is gone.
 */
export const PREAMBLE =
  'An evocative digital illustration, saturated and high in contrast, with bold ' +
  'confident ink line work and expressive painterly marks. Nothing muted, nothing washed out. ' +
  'No text, no lettering, no numbers. ' +
  'The artwork fills the whole frame edge to edge. No border, no frame, no vignette.'

/** Recraft wants `WIDTHxHEIGHT`. 3:2 landscape. */
export const SIZE = '1536x1024'
