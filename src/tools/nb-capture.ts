/**
 * `nb_capture` — reproducibility capture with REP record.
 * @module dsh-notebook-capture/tools/nb-capture
 */

import { defineTool } from '@deepseek-ai/dsh-tools'
import { NbError, type NotebookRuntime } from '../runtime.ts'
import { ERROR_SCHEMA } from './shared.ts'

const OUTPUT_SCHEMA = {
  type: 'object',
  additionalProperties: false,
  properties: {
    ok: { type: 'boolean', required: true },
    capture: { type: 'json' },
    evidenceId: { type: 'string' },
    recordPath: { type: 'string' },
    error: ERROR_SCHEMA,
  },
} as const

/**
 * Build the `nb_capture` tool.
 * @param runtime - the runtime.
 * @returns the tool definition.
 */
export function makeNbCaptureTool(runtime: NotebookRuntime) {
  return defineTool({
    name: 'nb_capture',
    description: [
      'Capture a notebook as reproducibility evidence (dsh-notebook-capture).',
      '',
      'Hashes the notebook (sha256) and every environment declaration next to it (requirements.txt, environment.yml, pyproject.toml, renv.lock …), runs the structural analysis, stores the notebook as immutable REP evidence with one check per issue, and writes a record whose artifacts are the notebook and environment hashes.',
    ].join('\n'),
    parameters: {
      path: { type: 'string', required: true, description: 'Workspace-relative .ipynb file.' },
      persist: { type: 'boolean', description: 'Store evidence + record (default true).' },
    },
    output: {
      schema: OUTPUT_SCHEMA,
      render: (_args, value) => {
        const result = value as { ok: true; capture: { notebook: { path: string; sha256: string }; environment: unknown[]; analysis: { issues: unknown[] } } } | { ok: false; error: { code: string; message: string } }
        if (!result.ok) return [{ type: 'text', text: `nb_capture failed (${result.error.code}): ${result.error.message}` }]
        return [
          {
            type: 'text',
            text: `nb_capture: ${result.capture.notebook.path} sha256=${result.capture.notebook.sha256.slice(0, 12)}…; ${result.capture.environment.length} env file(s); ${result.capture.analysis.issues.length} issue(s)`,
          },
        ]
      },
    },
    async execute(args: unknown) {
      const request = args as { path?: string; persist?: boolean }
      try {
        const result = await runtime.capture({
          ...(request.path === undefined ? {} : { path: request.path }),
          ...(request.persist === undefined ? {} : { persist: request.persist }),
        })
        return {
          ok: true as const,
          capture: result.capture as never,
          ...(result.evidenceId === undefined ? {} : { evidenceId: result.evidenceId }),
          ...(result.recordPath === undefined ? {} : { recordPath: result.recordPath }),
        }
      } catch (error) {
        if (error instanceof NbError) return { ok: false as const, error: { code: error.code, message: error.message } }
        throw error
      }
    },
  })
}
