/**
 * Draw one sample per style, for the style picker.
 *
 *   npm run samples            show what would be drawn and what it costs
 *   npm run samples -- --yes   draw it
 *
 * Every drawing is real money, so this follows the rules the rest of the repo
 * learned the hard way (docs/DECISIONS.md):
 *
 * - **Nothing is spent without `--yes`**, and the plan shows the arithmetic —
 *   per-style units, total, balance — rather than a verdict.
 * - **One at a time.** A failure costs what it drew, and everything before it
 *   is kept.
 * - **Never overwrites.** Files are opened with `wx`, so an existing sample
 *   cannot be replaced by accident. To redraw one, move its file out of
 *   `public/style-samples/` first — that is the opt-in, and the old drawing
 *   survives it.
 *
 * Every sample uses the same subject and palette, so the only thing that
 * differs between two of them is the style.
 */
import { writeFileSync } from 'node:fs'
import path from 'node:path'

import { balance, generate } from '../src/lib/recraft/client'
import { allStyles, SAMPLE_DIR, sampleFile } from '../src/lib/recraft/styles'
import { normalize } from '../src/lib/recraft/svg'

const SUBJECT = 'A lighthouse keeper climbing a spiral staircase at dusk'
const COLORS: [number, number, number][] = [
  [48, 136, 105],
  [49, 152, 196],
  [164, 55, 95],
]

async function main() {
  const styles = await allStyles()
  const todo = styles.filter((s) => !s.disabled && !s.sample)
  const skipped = styles.filter((s) => s.disabled)
  const cost = todo.reduce((sum, s) => sum + s.units, 0)
  const credits = await balance()

  console.log(`${styles.length} styles: ${styles.length - todo.length - skipped.length} already have a sample, ${skipped.length} cannot be drawn as SVG.`)
  for (const s of todo) console.log(`  draw  ${s.name.padEnd(28)} ${s.units} units`)
  console.log(`Total ${cost} units against a balance of ${credits}.`)

  if (!todo.length) return
  if (cost > credits) throw new Error(`Not enough API credit: needs ${cost}, balance is ${credits}.`)
  if (!process.argv.includes('--yes')) {
    console.log('Nothing drawn. Run again with --yes to spend it.')
    return
  }

  let spent = 0
  for (const [n, style] of todo.entries()) {
    const label = `[${n + 1}/${todo.length}] ${style.name}`
    try {
      const { data, ext } = await generate(SUBJECT, COLORS, style)
      if (ext !== 'svg') {
        console.log(`${label}: answered ${ext}, not SVG — nothing saved`)
      } else {
        const { svg } = normalize(data.toString('utf8'), style.size)
        writeFileSync(path.join(SAMPLE_DIR, sampleFile(style.key)), svg, { flag: 'wx' })
        console.log(`${label}: saved ${sampleFile(style.key)}`)
      }
      spent += style.units
    } catch (error) {
      console.log(`${label}: FAILED — ${(error as Error).message}`)
    }
  }

  const after = await balance()
  console.log(`Estimated ${spent} units; the balance moved by ${credits - after} (${credits} → ${after}).`)
}

main().catch((error) => {
  console.error(error.message)
  process.exit(1)
})
