import { configured } from '@/lib/studio/sample'

/**
 * How the Illustration Studio finds out it is being served from here, and what
 * it can use: Recraft (a token is set), Claude (a key is set), and the library
 * on disk (always). Free, and never says more than yes or no about a secret.
 */
export async function GET() {
  const token = process.env.RECRAFT_API_TOKEN
  return Response.json({
    studio: true,
    recraft: !!token && token !== 'your_token_here',
    claude: configured(),
    library: true,
  })
}
