import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

/**
 * What the Illustration Studio asks Claude for, when it is served from here
 * rather than published as a claude.ai artifact: two concepts for a brief, or
 * a read of a screenshot. The Studio writes the whole prompt — the vocabulary,
 * the library matches, the role rules and the JSON shape it wants back — so
 * this only carries it and parses the answer. Costs cents, not Recraft units.
 */

/** The error codes the Studio already has copy for (see SAMPLE_COPY in its index.html). */
export type SampleCode = 'rate_limited' | 'invalid_json' | 'refused' | 'prompt_too_large' | 'not_granted' | 'error'

export class SampleError extends Error {
  constructor(
    readonly code: SampleCode,
    message: string,
  ) {
    super(message)
  }
}

export type SampleImage = { media_type: 'image/png' | 'image/jpeg' | 'image/webp' | 'image/gif'; data: string }

export function configured(): boolean {
  return !!process.env.ANTHROPIC_API_KEY
}

const client = new Anthropic()

export async function sampleJson(prompt: string, images: SampleImage[] = []): Promise<unknown> {
  if (!configured()) throw new SampleError('not_granted', 'ANTHROPIC_API_KEY is not set in .env.local.')

  let response
  try {
    response = await client.beta.messages.create({
      model: 'claude-opus-5',
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
      thinking: { type: 'adaptive' },
      output_config: { effort: 'low' },
      messages: [
        {
          role: 'user',
          content: [
            ...images.map((image) => ({
              type: 'image' as const,
              source: { type: 'base64' as const, media_type: image.media_type, data: image.data },
            })),
            { type: 'text' as const, text: prompt },
          ],
        },
      ],
    })
  } catch (error) {
    if (error instanceof Anthropic.RateLimitError) throw new SampleError('rate_limited', error.message)
    if (error instanceof Anthropic.BadRequestError && /too long|too large|maximum/i.test(error.message)) {
      throw new SampleError('prompt_too_large', error.message)
    }
    if (error instanceof Anthropic.AuthenticationError) throw new SampleError('not_granted', error.message)
    throw error
  }

  if (response.stop_reason === 'refusal') throw new SampleError('refused', 'Claude declined this brief.')

  const text = response.content.find((b) => b.type === 'text')?.text ?? ''
  // The prompts ask for only JSON; tolerate a fence or a sentence around it.
  const start = text.search(/[{[]/)
  const end = Math.max(text.lastIndexOf('}'), text.lastIndexOf(']'))
  try {
    return JSON.parse(text.slice(start, end + 1))
  } catch {
    throw new SampleError('invalid_json', 'Claude’s answer was not JSON.')
  }
}
