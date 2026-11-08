/**
 * `nb_analyze` — structural analysis of a notebook.
 * @module dsh-notebook-capture/tools/nb-analyze
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { NbError, type NotebookRuntime } from '../runtime.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    analysis: { type: 'json' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `nb_analyze` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeNbAnalyzeTool(runtime: NotebookRuntime) {
  return defineTool({
    name: 'nb_analyze',
    description: [
      'Analyze a Jupyter notebook for reproducibility signals without executing it (dsh-notebook-capture).',
      '',
      'Reports kernel/language version, code vs markdown cells, execution order (out-of-order and never-run cells), imports, runtime package installs, random seeds, absolute path literals, and whether outputs were saved. Every finding is about the saved file, not about whether the analysis is correct.',
    ].join('\n'),
    parameters: {
      text: { type: 'string', description: 'Notebook JSON text (mutually exclusive with path).' },
      path: { type: 'string', description: 'Workspace-relative .ipynb file.' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; analysis: { cells: number; codeCells: number; outOfOrder: boolean; issues: unknown[]; seeds: unknown[] } } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `nb_analyze failed (${result.error.code}): ${result.error.message}` }]
        return [
          {
            type: 'text',
            text: `nb_analyze: ${result.analysis.cells} cell(s) / ${result.analysis.codeCells} code; out-of-order ${result.analysis.outOfOrder ? 'yes' : 'no'}; seeds ${result.analysis.seeds.length}; issues ${result.analysis.issues.length}`,
          },
        ]
      },
    },
    async execute(args: unknown) {
      const request = args as { text?: string; path?: string }
      try {
        return { ok: true as const, analysis: (await runtime.analyze(request)) as never }
      } catch (error) {
        if (error instanceof NbError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
