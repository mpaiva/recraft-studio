# The Recraft API, as actually encountered

Notes from building an illustration pipeline against Recraft's external API and
then porting the useful parts here. Everything below was learned by hitting it,
not by reading the marketing page. Where a number was measured, it says so;
where it was inferred, it says that too.

Base URL: `https://external.api.recraft.ai/v1`. Auth is `Authorization: Bearer <token>`.

## The balance is not the balance you think it is

`GET /users/me` returns `credits`. **This is a prepaid API pool, separate from
the subscription credits the Recraft web editor spends.** A fully paid-up
subscription can sit beside a zero here, and the only symptom is a `400` on the
first image you try to generate.

A batch run once died eight images in for exactly this reason. Check before a
batch, not after the first failure — the call is free.

## Units per image are not "one credit per image"

Measured, from a single 37-image run: balance 1115 before, 35 after, 27 images
drawn. That is **40 units per raster image**.

Vector was then taken as double that, 80, by analogy with Recraft's pricing —
and nobody checked for a long time. Measured on 2026-09-24, one image each,
balance read before and after:

- `recraftv3_vector` (a curated style, or the old substyle): **80 units**
- `recraftv4_styles_vector` (a style id from the account): **50 units**

So the price is per model, and the model follows the style.

This matters more than it looks. An earlier version of the preflight assumed 1
and 2 units, told a 37-image run it needed 37 units against a balance of 1115,
and let the run die at twenty-seven while printing a reassuring number. A wrong
constant is worse than no constant, because it converts a loud failure into a
quiet one.

## Styles: trained > substyle > nothing

Three tiers, and the gap between them is large:

1. **A trained style** (`style_id`), created with `POST /styles` from reference
   images. This is the difference between a set that shares a look and a set
   that merely shares a substyle. If you want coherent sets, you want this.
2. **A built-in substyle** (`style: 'vector_illustration', substyle: 'colored_stencil'`).
   A reasonable floor. Consistent, but generic.
3. **Neither.** Do not. Tried once: with no style and no substyle the model
   returns *a photograph of an illustration sitting on a desk*, lettering and
   all.

`POST /styles` takes `multipart/form-data`: a `style` field naming the base
family, a `model` the style is for, an optional `prompt` stored with it, and
one file part per reference image (any field name). It returns `{ id }` and
costs 5 units. References must be **PNG, JPG or WebP — not SVG**, at most ten.

A style can be made from references drawn by Recraft itself. Tested
2026-09-24: three `recraftv4_1` raster images drawn from a written description
(35 units each), made into a style with `model: recraftv4_styles_vector`, then
drawn with that same model — SVG out, and recognizably the described look. The
model given at creation must match the one used to draw.

**The style id is not a secret and it decides what everything looks like.** Keep
it somewhere visible and shared — committed config, not an ignored `.env`. Held
in an ignored file it is absent on every other machine, and a fallback quietly
draws in a different style rather than failing. That is the worst kind of
difference, because nothing reports it.

### A style id now means V4, and V4 has its own sizes

`GET /styles` lists the account's styles — id, base family, creation time. No
names and no preview images. There is no endpoint for Recraft's curated
library; those names are in the docs and are sent as `style: 'Colored stencil'`
with `model: 'recraftv3_vector'`.

A `style_id` sent with no model now resolves to **Recraft V4 Styles**, which
rejects V3's sizes: `1536x1024` comes back as a 400, *"Recraft V4 Styles doesn't
support 1536x1024 image size"*. Send `model: 'recraftv4_styles_vector'` and
its 3:2 size, `1280x832`. The listing does not say which model a style was made
for, so this is the assumption, and it held for the one vector style tested.

A rejected request costs nothing, so a 400 is a cheap way to learn a rule.

### Raster styles from references: `recraftv4_styles` and `any`

Per the API docs (2026-09-24): for V4 models the raster base style is `any`
(`digital_illustration` and `realistic_image` are V2/V3 only), and the default
creation model is `recraftv4_styles`. The Illustration Studio makes its raster
library style that way and draws with `model: recraftv4_styles` and the
`style_id`, at `1280x832` — assumed from V4 Styles vector, not yet drawn. 35
units an image on the pricing page.

The docs also describe `style_references` on `POST /images/generations`: up to
ten PNG/JPG/WebP images attached to the drawing itself, for raster and vector,
defaulting to `recraftv4_styles`. Untried here. If it works as written, it would
let the Studio send its library with each drawing instead of making a style.

### Base family decides raster vs vector

`digital_illustration` trains on richer references but answers with raster.
`vector_illustration` answers with SVG. If you need SVG out, the style has to be
a vector style all the way down — a raster style with a vector request still
returns raster.

## Colors: pass numbers, not adjectives

`controls.colors` takes RGB triples and **the model honors them**. A probe
asking for green, magenta and yellow came back green, magenta and yellow.

Asking in prose does not work, and fails in a specific way worth knowing. "Rich
color" produced thirty-eight drawings in one blue. Naming the wanted spread —
"many different hues, warm and cool together" — produced sixteen reds and twelve
azures, which is two blues rather than one, and not what was asked for either.

The cause is not weak wording. A trained style is built from reference images,
and **images beat a sentence**: whatever the references were made of is what
comes back, and the prompt only gets a vote. So specify color as numbers and
let the prompt ask for things the references cannot decide — saturation,
contrast, framing.

## The response format is not in the URL

`POST /images/generations` returns `data[0].url`. Download it, then **sniff the
first bytes** to find out what you got:

- `<?xml` or `<svg` → SVG
- bytes 8–12 are `WEBP` → WebP
- otherwise → PNG

The URL does not reliably tell you. Getting this wrong means writing `.svg`
files containing PNG, which fails much later and confusingly.

## Prompt clauses that earn their place

Each of these was added in response to something the model actually did:

- **"No text, no lettering, no numbers"** — models put invented words into
  illustrations constantly, and misspelled fake text is worse than no drawing.
- **"fills the whole frame edge to edge. No border, no frame, no vignette"** —
  without it, a meaningful share come back matted, as if photographed hanging in
  a gallery.
- **"saturated and high in contrast, nothing muted, nothing washed out"** —
  works *with* the numeric colors rather than against them, because it asks
  about saturation and says nothing about hue.

And one worth removing: a set of light negatives ("no sparks, no glare, no
beams, no starfields") were scars from an earlier style trained on a single
image of electrical discharge, which turned every workbench into welding. When
that style was replaced the negatives stayed for a while, fighting a look they
were never aimed at. **Prompt clauses should be deleted when the thing they
defended against is gone.**

## Vectorize is its own endpoint, and cheap

`POST /images/vectorize` takes a multipart `file` (PNG, JPG or WebP; at most
10 MB, 16 MP and 4096 px on the long side, at least 256 px on the short side)
and answers `{ image: { url } }` pointing at an SVG. 10 units, per the pricing
page and the balance on the first run (2026-09-24). A too-small image is a 400
(`invalid_image_format`, "min image dimension should be no less than 256"),
which costs nothing. The Illustration Studio scales images into range before
sending them, and never sends one that is already SVG.

## C2PA provenance does not survive optimization

Recraft embeds a C2PA manifest in a `<metadata>` element. C2PA hashes the bytes
it signs, so the moment you run SVGO — or recolor, or reformat — the manifest
describes bytes that no longer exist and verification fails.

Dropping it is therefore correct rather than careless. But keep the untouched
original somewhere if provenance matters to you; you cannot reconstruct it.
