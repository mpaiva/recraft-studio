import 'server-only'

import Anthropic from '@anthropic-ai/sdk'

/**
 * Rewrite a list of subjects so each one is a concrete, drawable scene from the
 * given industry — or, with no subjects, propose some.
 *
 * This costs cents, not Recraft units, and nothing is drawn: the result goes
 * back into the subjects box for a person to read and edit before they spend
 * anything. That is the point of it being a separate step.
 *
 * The system prompt is written against what the drawing prompt already does.
 * The brief is prefixed and the industry appended on the Recraft side, so
 * repeating either here would say it twice. The preamble forbids lettering, so
 * a subject that depends on legible words ("a dashboard showing revenue")
 * would fight it — it asks for scenes that read without text.
 */
const SYSTEM = `You write subject lines for a set of illustrations. Each line becomes one image.

A good subject is a concrete, visual scene: who or what is in it, what is happening, and where. It should read without any text — no signs, labels, screens with words, charts with numbers, or logos, because the illustrations contain no lettering.

Make each subject specific to the industry you are given: its people, tools, places, and moments. Avoid clichés (handshakes, lightbulbs, gears, generic office meetings).

Do not restate the brief or name the industry; both are added separately. Keep each subject to one line of at most 15 words. Make the subjects in a set distinct from one another. Write in American English (operating room, not operating theatre; color, not colour).`

const MAX_SET = 6

const client = new Anthropic()

export async function improveSubjects(input: {
  brief: string
  industry: string
  subjects: string[]
  count: number
}): Promise<string[]> {
  const subjects = input.subjects.slice(0, MAX_SET)
  const count = subjects.length || Math.max(1, Math.min(input.count, MAX_SET))

  const ask = [
    input.brief && `Brief: ${input.brief}`,
    input.industry && `Industry: ${input.industry}`,
    subjects.length
      ? `Rewrite these ${count} subjects, one for one, in the same order:\n${subjects.map((s) => `- ${s}`).join('\n')}`
      : `Propose ${count} subjects.`,
  ]
    .filter(Boolean)
    .join('\n\n')

  const response = await client.beta.messages.create({
    model: 'claude-opus-5',
    max_tokens: 16000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: {
      effort: 'low',
      format: {
        type: 'json_schema',
        schema: {
          type: 'object',
          properties: { subjects: { type: 'array', items: { type: 'string' } } },
          required: ['subjects'],
          additionalProperties: false,
        },
      },
    },
    system: SYSTEM,
    messages: [{ role: 'user', content: ask }],
  })

  if (response.stop_reason === 'refusal') {
    throw new Error('Claude declined to rewrite these subjects.')
  }

  const text = response.content.find((b) => b.type === 'text')?.text ?? ''
  const out: unknown = JSON.parse(text)?.subjects
  if (!Array.isArray(out)) throw new Error('No subjects in the response.')

  return out.map((s) => String(s).trim()).filter(Boolean).slice(0, MAX_SET)
}
