import type { NextConfig } from 'next'

/**
 * A server, deliberately — and this is the one architectural line between this
 * repo and the site it was spun out of.
 *
 * Jupiter is `output: 'export'`: generation is a command a person runs, the
 * result is committed, and every drawing passes through a diff before anyone
 * sees it. That is right for a personal site, where a redraw on every deploy
 * would silently change the whole thing.
 *
 * This is the opposite job. The subject comes from whoever is typing, so the
 * drawing cannot exist until the request does. That needs a runtime, and the
 * runtime is what keeps RECRAFT_API_TOKEN off the client — the token buys
 * images with real money, so it never reaches the browser and no route here
 * returns it.
 */
const nextConfig: NextConfig = {}

export default nextConfig
