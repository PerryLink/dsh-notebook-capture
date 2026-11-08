/**
 * `nb_card` — Markdown capture card + SARIF.
 * @module dsh-notebook-capture/tools/nb-card
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { NotebookCapture } from '../capture.ts'
import { renderCardMarkdown, renderSarif } from '../report.ts'
import { VERSION } from '../version.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    markdown: { type: 'string' },
    sarif: { type: 'json' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `nb_card` tool.
 * @returns the tool definition.
 */
export function makeNbCardTool() {
  return defineTool({
    name: 'nb_card',
    description: [
      'Render a notebook capture as a Markdown card + SARIF 2.1.0 (dsh-notebook-capture).',
      '',
      'The card lists the notebook hash, kernel, environment declarations with hashes, imports, recorded seeds, and each issue with a concrete suggestion. It repeats that the card proves what the file says, not that the notebook reproduces its outputs.',
    ].join('\n'),
    parameters: {
      capture: { type: 'json', required: true, description: 'The capture from nb_capture.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; markdown: string } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `nb_card failed (${result.error.code}): ${result.error.message}` }]
        return [{ type: 'text', text: result.markdown }]
      },
    },
    async execute(args: unknown) {
      const request = args as { capture?: NotebookCapture }
      if (request.capture === undefined || request.capture.analysis === undefined) {
        return { ok: false as const, error: { code: 'INVALID_INPUT', message: 'pass the capture object from nb_capture' } }
      }
      return { ok: true as const, markdown: renderCardMarkdown(request.capture), sarif: renderSarif(request.capture.analysis, VERSION) as never }
    },
  })
}
