# Recraft Studio

A small web app that turns a brief into a **set of SVG illustrations**, and a
written record of what was learned building an illustration pipeline against
Recraft's API.

Spun out of the generation pipeline in the `jupiter` site repo, where the same
code draws the illustrations on a personal site as a committed, reviewed batch.
This repo takes the parts worth keeping and points them at a different job:
arbitrary input, at request time, in the browser.

## What it does

- A **brief** sets the direction the whole set shares.
- An optional **industry** is added to every prompt as context for the setting
  and props.
- **Subjects**, one per line, become one illustration each — or leave them empty
  and get variations on the brief.
- One **palette** is derived from the brief and shared across the set, so the
  images look like they belong together. It is shown live, before anything is
  spent; **Reroll** moves it, a **scheme** (triad, complementary, analogous,
  monochromatic and more, or Auto) decides how its hues sit on the wheel, and an
  optional **brand color** anchors it — used exactly, with the other two placed
  around its hue.
- The **cost is shown before anything is spent**, checked against the real API
  balance.
- Output is **SVG**: normalized, optimized, inlined, and downloadable.

## Setup

```bash
npm install
cp .env.local.example .env.local   # then add your token
npm run dev
```

`RECRAFT_API_TOKEN` is required. `RECRAFT_STYLE_ID` is optional but strongly
recommended — without it the app falls back to a built-in substyle, which is a
floor rather than a substitute. The UI says which one is in use.

`ANTHROPIC_API_KEY` is needed only for the **Improve subjects** button, which
asks Claude to rewrite the subject lines for the chosen industry. Drawing works
without it.

To train a style on reference images, see
[docs/RECRAFT-API.md](docs/RECRAFT-API.md#styles-trained--substyle--nothing).
Use a `vector_illustration` base, or the API answers with raster and there is no
SVG to hand back.

## Cost

Every image is real money. Vector generation is taken as **80 API units** each
(see the doc for where that number comes from and how confident it is), so a set
of four costs about 320. Sets are capped at six.

The balance the app checks is Recraft's **prepaid API pool**, which is separate
from the subscription credits the web editor spends. A paid-up plan can sit
beside a zero here.

## Layout

```
src/lib/recraft/client.ts   the API: balance, styles, generation
src/lib/recraft/svg.ts      normalize + optimize the SVG that comes back
src/lib/recraft/cost.ts     units per image, and the measurement behind it
src/lib/recraft/prompt.ts   the preamble, clause by clause
src/lib/palette.ts          three colors from a seed, as wheel geometry
src/lib/improve.ts          rewrite subjects for an industry, via Claude
src/app/api/balance         what the account can spend
src/app/api/generate        draw a set
src/app/api/improve         rewrite the subjects (Claude, no Recraft units)
src/app/Studio.tsx          the UI
```

## Docs

- **[RECRAFT-API.md](docs/RECRAFT-API.md)** — how the API actually behaves:
  the two balances, units per image, style tiers, color control, response
  sniffing, C2PA.
- **[DECISIONS.md](docs/DECISIONS.md)** — why this is shaped the way it is,
  including the runs that died partway through and the six originals that got
  overwritten.

## Status

Early. It generates and downloads sets; it does not persist them, and there is
no auth on the generate or improve routes. Read the last section of `DECISIONS.md` before
adding either — the rules about replacing files were paid for once already.
