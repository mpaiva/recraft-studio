# Decisions, and the incidents behind them

The API notes are in [RECRAFT-API.md](RECRAFT-API.md). This file is about the
design of the thing built on top, and most of it is scar tissue.

## Generation is a command there, a request here

The pipeline this was ported from lives in a statically exported site. There,
generation is a command a person runs, the output is committed, and every
drawing passes through a diff before anyone sees it. That is right for a
personal site: a redraw at build time would change the whole site on every
deploy, with no diff anyone could review, for money nobody agreed to spend.

This app is the opposite job. The subject comes from whoever is typing, so the
drawing cannot exist before the request does. That needs a runtime.

The consequence to keep hold of: **the token now lives in a server that
strangers might reach.** It buys images with real money. No route here returns
it, `client.ts` is `server-only`, and the generation route caps a set at six.

## A wrong preflight is worse than no preflight

Two batch runs died partway through. The first ran out of API credit eight
images in, because the prepaid API pool was empty while the subscription was
fully paid — two different balances, and the wrong one was being looked at.

The fix was a preflight. The preflight then let a run die at **twenty-seven**
images, because it was built on a units-per-image constant that was off by a
factor of forty, and it printed a confident, wrong, reassuring number the whole
way down.

So: check the balance before the batch, show the arithmetic rather than a
verdict, and treat the units constant as a measurement with a provenance note
rather than a fact.

## Sequential, not parallel

`Promise.all` over a set is faster and strictly worse. A failure halfway through
still bills for everything already in flight and returns nothing usable.

Drawing one at a time means a failure costs exactly what it drew, and the
partial set still comes back. Four good drawings and one rate-limit should give
you four drawings and a message — not an error page and a bill for five.

## Replacing a drawing is a different act from making one

In the original pipeline, generation overwrote `raw/<slug>.<ext>` in place, and
raw files were not committed. A pass that changed British spellings to American
touched six subject lines by one word each. The next run saw six moved cache
keys, redrew six illustrations nobody had asked to change, for real money, and
**destroyed the only copy of each original.** Nothing in the output said
"replacing". They scrolled past identically to the new ones.

Two rules came out of it, and they generalize well beyond this tool:

1. **Make replacement opt-in and name it.** A cache key moving is not consent.
2. **Never overwrite the only copy.** Superseded files get renamed, not
   clobbered. A rename costs nothing and is the difference between changing your
   mind and not being able to.

This app does not persist anything yet, so neither rule has a home in the code
here — which is precisely why they are written down. The first feature that
saves a set to disk needs both on day one.

## One palette per set, not per image

The original seeds each drawing's palette from its own slug, because the
drawings are independent pieces scattered across a site: adding a thirty-ninth
should leave the other thirty-eight untouched, rather than reshuffling a
sequence and invalidating everything after it.

Here the images are meant to belong together, so the seed is the brief and every
image in the set gets the same three hues. Same arithmetic, opposite grain.

The seeding itself is non-negotiable in both. `Math.random()` would give a
different result for the same input every time, which makes a result impossible
to reproduce and a bill impossible to predict.

## The drawings do not theme, and that is a real cost

The colors are baked into the SVG. The drawing looks the same on a light page
and a dark one, and it sits outside whatever design-token system the host
application has.

That is the price of letting the model decide how to spend three given hues, and
it is worth stating out loud rather than discovering later. The alternative —
stripping color and recoloring at render time — was tried in the original and
produces flat, dead shapes, because the model's color choices carry the
modeling.
