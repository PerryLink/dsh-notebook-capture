/**
 * `dsh-notebook-capture` — notebook reproducibility capture: execution order,
 * kernel, environment hashes, imports, seeds, absolute paths, output state.
 *
 * Three tools: nb_analyze, nb_capture, nb_card. Nothing is executed; only the
 * `.ipynb` JSON is read.
 *
 * Function plugin — no default export.
 * @module dsh-notebook-capture
 */

import type { Context } from '@deepseek-ai/cordis'
import { Config, resolveConfig, type Config as ConfigShape } from './config.ts'
import { NotebookRuntime, type EvidencePort } from './runtime.ts'
import { makeNbAnalyzeTool } from './tools/nb-analyze.ts'
import { makeNbCaptureTool } from './tools/nb-capture.ts'
import { makeNbCardTool } from './tools/nb-card.ts'

/** Cordis plugin name. */
export const name = 'notebook-capture'

/** The tool registry is required; the REP service is optional. */
export const inject = ['tools']

export { Config, resolveConfig }
export type { ConfigShape }
export type { ResolvedConfig } from './config.ts'
export { VERSION } from './version.ts'
export { analyzeNotebook, NotebookError, parseNotebook } from './analyze.ts'
export type { ImportFinding, InstallFinding, NotebookAnalysis, NotebookCell, NotebookIssue, Notebook, PathFinding, SeedFinding } from './analyze.ts'
export { buildCapture, ENV_FILES, sha256Of } from './capture.ts'
export type { HashedFile, NotebookCapture } from './capture.ts'
export { renderCardMarkdown, renderSarif } from './report.ts'
export { NbError, NotebookRuntime } from './runtime.ts'
export type { CaptureValue, EvidencePort, NbErrorCode, NbRuntimeOptions } from './runtime.ts'
export { makeNbAnalyzeTool } from './tools/nb-analyze.ts'
export { makeNbCaptureTool } from './tools/nb-capture.ts'
export { makeNbCardTool } from './tools/nb-card.ts'

/**
 * Mount the three tools.
 * @param ctx - the plugin context (host).
 * @param config - raw plugin config.
 */
export function apply(ctx: Context, config: ConfigShape): void {
  const resolved = resolveConfig(config)
  const logger = ctx.logger('notebook-capture')
  if (!resolved.enabled) {
    logger.info('disabled: enabled is false — no tools are mounted')
    return
  }
  const service = ctx.get('researchEvidence') as EvidencePort | undefined
  const runtime = new NotebookRuntime({ config: resolved, ...(service === undefined ? {} : { service }) })
  if (service === undefined) {
    logger.info(`ctx.researchEvidence is not mounted; using a local core store under ${resolved.root}`)
  }
  ctx.effect(() => ctx.tools.register(makeNbAnalyzeTool(runtime)), 'notebook-capture: nb_analyze tool')
  ctx.effect(() => ctx.tools.register(makeNbCaptureTool(runtime)), 'notebook-capture: nb_capture tool')
  ctx.effect(() => ctx.tools.register(makeNbCardTool()), 'notebook-capture: nb_card tool')
}
