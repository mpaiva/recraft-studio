import { readFile } from 'node:fs/promises'
import path from 'node:path'

/**
 * The ClearCo Illustration Studio, served from its own folder.
 *
 * The Studio's front end lives in the `illustration` repo (`app/`), and stays
 * there: this route reads it from disk on each request rather than copying it
 * in, so an edit there shows up here on reload and there is one copy to keep.
 * Served from this origin, the Studio can reach `/api/studio/*` — Recraft for
 * the drawing, Claude for the concepts, and the library on disk — without the
 * token ever leaving the server.
 *
 * `ILLUSTRATION_APP_DIR` points somewhere else if the two repos are not
 * siblings.
 */
const DIR = path.resolve(process.env.ILLUSTRATION_APP_DIR || path.join(process.cwd(), '..', 'illustration', 'app'))

const TYPES: Record<string, string> = {
  '.html': 'text/html; charset=utf-8',
  '.css': 'text/css; charset=utf-8',
  '.js': 'text/javascript; charset=utf-8',
  '.svg': 'image/svg+xml',
  '.zip': 'application/zip',
}

export async function GET(_request: Request, { params }: { params: Promise<{ path?: string[] }> }) {
  const parts = (await params).path ?? []
  const name = parts.length ? parts.join('/') : 'index.html'

  // Flat folder, known types, no way out of it.
  const type = TYPES[path.extname(name)]
  if (parts.length > 1 || !/^[\w.-]+$/.test(name) || name.startsWith('.') || !type) {
    return new Response('Not found', { status: 404 })
  }

  let body: Buffer
  try {
    body = await readFile(path.join(DIR, name))
  } catch {
    const hint =
      name === 'index.html'
        ? `The Studio was not found at ${DIR}. Set ILLUSTRATION_APP_DIR in .env.local to the illustration repo's app/ folder.`
        : 'Not found'
    return new Response(hint, { status: 404, headers: { 'Content-Type': 'text/plain; charset=utf-8' } })
  }

  if (name.endsWith('.html')) {
    // The pages link their CSS, JS and the skill zip by bare name. Next serves
    // /studio without a trailing slash, where "engine.js" would resolve to
    // /engine.js, so those names are pointed here. (Not a <base> tag: that
    // would also send the style guide's #anchors to another URL.) The viewport
    // is what claude.ai adds when the page is published there.
    const html = body
      .toString('utf8')
      .replace(/\b(href|src)="([\w.-]+\.(?:css|js|html))"/g, '$1="/studio/$2"')
      .replace(/fetch\('([\w.-]+\.zip)'\)/g, "fetch('/studio/$1')")
    const head = '<meta name="viewport" content="width=device-width, initial-scale=1">\n'
    return new Response(head + html, { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } })
  }
  return new Response(new Uint8Array(body), { headers: { 'Content-Type': type, 'Cache-Control': 'no-cache' } })
}
