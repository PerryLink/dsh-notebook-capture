/**
 * Markdown and SARIF for notebook captures.
 * @module dsh-notebook-capture/report
 */

import type { NotebookAnalysis } from './analyze.ts'
import type { NotebookCapture } from './capture.ts'

/** Render a capture card as Markdown. */
export function renderCardMarkdown(capture: NotebookCapture): string {
  const analysis = capture.analysis
  const lines = ['# Notebook capture card', '']
  lines.push(`**Notebook:** \`${capture.notebook.path}\` (${capture.notebook.bytes} bytes) · **sha256:** \`${capture.notebook.sha256}\``)
  lines.push('')
  lines.push(`**Cells:** ${analysis.cells} (${analysis.codeCells} code, ${analysis.markdownCells} markdown) · **executed:** ${analysis.executedCells} · **out of order:** ${analysis.outOfOrder ? 'yes' : 'no'}`)
  if (analysis.kernel !== undefined) lines.push(`**Kernel:** ${analysis.kernel.displayName ?? analysis.kernel.name ?? 'unknown'}${analysis.kernel.version === undefined ? '' : ` (${analysis.kernel.language ?? ''} ${analysis.kernel.version})`}`)
  lines.push('')
  lines.push('## Environment declarations')
  lines.push('')
  if (capture.environment.length === 0) {
    lines.push('None found next to the notebook.')
  } else {
    lines.push('| File | Bytes | sha256 |')
    lines.push('|---|---:|---|')
    for (const file of capture.environment) lines.push(`| ${file.path} | ${file.bytes} | \`${file.sha256.slice(0, 16)}…\` |`)
  }
  lines.push('')
  if (analysis.imports.length > 0) {
    lines.push('## Imports')
    lines.push('')
    lines.push([...new Set(analysis.imports.map(finding => finding.module))].sort().join(', '))
    lines.push('')
  }
  if (analysis.seeds.length > 0) {
    lines.push(`**Seeds recorded:** ${analysis.seeds.map(seed => `${seed.pattern}=${seed.value ?? '?'} (cell ${seed.cell})`).join('; ')}`)
    lines.push('')
  }
  lines.push('## Issues')
  lines.push('')
  if (analysis.issues.length === 0) lines.push('No issues were detected by the structural checks.')
  for (const issue of analysis.issues) lines.push(`- **${issue.severity}** ${issue.code}: ${issue.detail} — ${issue.suggestion}`)
  lines.push('')
  for (const warning of capture.warnings) lines.push(`- ${warning}`)
  lines.push('')
  lines.push('> This card records what the saved file says; it does not prove the notebook reproduces its outputs.')
  return `${lines.join('\n')}\n`
}

/** Render a card as SARIF 2.1.0 (issues only). */
export function renderSarif(analysis: NotebookAnalysis, version: string): Record<string, unknown> {
  const results = analysis.issues
    .filter(issue => issue.severity !== 'info')
    .map(issue => ({
      ruleId: `notebook-capture/${issue.code}`,
      level: issue.severity === 'error' ? ('error' as const) : ('warning' as const),
      message: { text: `${issue.detail} — ${issue.suggestion}` },
      properties: { code: issue.code },
    }))
  return {
    $schema: 'https://json.schemastore.org/sarif-2.1.0.json',
    version: '2.1.0',
    runs: [{ tool: { driver: { name: 'dsh-notebook-capture', version } }, results }],
  }
}
