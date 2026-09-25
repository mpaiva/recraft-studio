import { SampleError, sampleJson, type SampleImage } from '@/lib/studio/sample'

const IMAGE_TYPES = new Set(['image/png', 'image/jpeg', 'image/webp', 'image/gif'])
/** Base64 characters; about 5 MB of image, Claude's per-image limit. */
const MAX_IMAGE = 7_000_000

/** The Studio's `sample.json(prompt, { images })`, answered by Claude on this server. */
export async function POST(request: Request) {
  try {
    const body = await request.json()
    const prompt = String(body?.prompt ?? '').trim()
    if (!prompt) return Response.json({ error: 'No prompt.', code: 'error' }, { status: 400 })

    const images: SampleImage[] = (Array.isArray(body?.images) ? body.images : []).slice(0, 1)
    if (images.some((i) => !IMAGE_TYPES.has(i?.media_type) || typeof i?.data !== 'string' || i.data.length > MAX_IMAGE)) {
      return Response.json({ error: 'Images must be PNG, JPG, WebP or GIF under 5 MB.', code: 'image_rejected' }, { status: 400 })
    }

    return Response.json({ result: await sampleJson(prompt, images) })
  } catch (error) {
    if (error instanceof SampleError) {
      const status = error.code === 'rate_limited' ? 429 : error.code === 'not_granted' ? 503 : 422
      return Response.json({ error: error.message, code: error.code }, { status })
    }
    return Response.json({ error: (error as Error).message, code: 'error' }, { status: 500 })
  }
}
