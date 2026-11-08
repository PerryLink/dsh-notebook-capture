/**
 * `nb_card` — Markdown capture card + SARIF.
 * @module dsh-notebook-capture/tools/nb-card
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import type { NotebookAnalysis } from '../analyze.ts'
import type { HashedFile, NotebookCapture } from '../capture.ts'
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

/** True for a finite number. */
function finite(value: unknown): value is number {
  return typeof value === 'number' && Number.isFinite(value)
}

/** True for a hashed environment file row. */
function isHashedFile(value: unknown): value is HashedFile {
  if (typeof value !== 'object' || value === null) return false
  const file = value as Partial<HashedFile>
  return typeof file.path === 'string' && finite(file.bytes) && typeof file.sha256 === 'string'
}

/** True for the parts of a capture the card/SARIF renderer reads. */
function isCapture(value: unknown): value is NotebookCapture {
  if (typeof value !== 'object' || value === null) return false
  const capture = value as Partial<NotebookCapture>
  if (typeof capture.notebook !== 'object' || capture.notebook === null) return false
  const notebook = capture.notebook as Partial<NotebookCapture['notebook']>
  if (typeof notebook.path !== 'string' || !finite(notebook.bytes) || typeof notebook.sha256 !== 'string') return false
  if (!Array.isArray(capture.environment) || !capture.environment.every(isHashedFile)) return false
  if (!Array.isArray(capture.warnings) || !capture.warnings.every(warning => typeof warning === 'string')) return false
  const analysis = capture.analysis as Partial<NotebookAnalysis> | undefined
  if (typeof analysis !== 'object' || analysis === null) return false
  if (!finite(analysis.cells) || !finite(analysis.codeCells) || !finite(analysis.markdownCells) || !finite(analysis.executedCells)) return false
  if (typeof analysis.outOfOrder !== 'boolean') return false
  if (!Array.isArray(analysis.imports) || !Array.isArray(analysis.installs) || !Array.isArray(analysis.seeds) || !Array.isArray(analysis.paths) || !Array.isArray(analysis.issues)) return false
  if (analysis.kernel !== undefined && (typeof analysis.kernel !== 'object' || analysis.kernel === null)) return false
  return analysis.issues.every(
    issue => typeof issue === 'object' && issue !== null && typeof issue.code === 'string' && typeof issue.detail === 'string' && typeof issue.suggestion === 'string',
  )
}

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
      const request = args as { capture?: unknown }
      if (!isCapture(request.capture)) {
        return { ok: false as const, error: { code: 'INVALID_INPUT', message: 'pass the capture object from nb_capture' } }
      }
      try {
        return { ok: true as const, markdown: renderCardMarkdown(request.capture), sarif: renderSarif(request.capture.analysis, VERSION) as never }
      } catch (error) {
        return { ok: false as const, error: { code: 'INVALID_INPUT', message: `could not render the capture: ${(error as Error).message}` } }
      }
    },
  })
}
