/**
 * Notebook analysis for reproducibility capture.
 *
 * Reads `.ipynb` JSON only — nothing is executed. The analysis records what the
 * saved file says about its own reproducibility: kernel and language version,
 * cell execution order, imports, runtime installs, seeds, absolute paths, and
 * whether outputs were saved. Every finding is a statement about the file, not
 * about whether the analysis is correct.
 *
 * @module dsh-notebook-capture/analyze
 */

/** A parsed notebook. */
export interface Notebook {
  readonly nbformat?: number
  readonly cells: readonly NotebookCell[]
  readonly metadata: Record<string, unknown>
}

/** One cell. */
export interface NotebookCell {
  readonly cellType: 'code' | 'markdown' | 'raw' | string
  readonly source: string
  readonly executionCount?: number
  readonly outputs: number
}

/** A discovered import. */
export interface ImportFinding {
  readonly module: string
  readonly cell: number
}

/** A discovered seed. */
export interface SeedFinding {
  readonly pattern: string
  readonly value?: number
  readonly cell: number
}

/** A runtime install. */
export interface InstallFinding {
  readonly command: string
  readonly cell: number
}

/** An absolute path. */
export interface PathFinding {
  readonly path: string
  readonly cell: number
}

/** One issue. */
export interface NotebookIssue {
  readonly code: string
  readonly severity: 'info' | 'warning' | 'error'
  readonly detail: string
  readonly suggestion: string
}

/** Analysis result. */
export interface NotebookAnalysis {
  readonly nbformat?: number
  readonly kernel?: { name?: string; displayName?: string; language?: string; version?: string }
  readonly cells: number
  readonly codeCells: number
  readonly markdownCells: number
  readonly executedCells: number
  readonly executionOrder: readonly number[]
  readonly outOfOrder: boolean
  readonly imports: readonly ImportFinding[]
  readonly installs: readonly InstallFinding[]
  readonly seeds: readonly SeedFinding[]
  readonly paths: readonly PathFinding[]
  readonly outputsCleared: boolean
  readonly issues: readonly NotebookIssue[]
}

/** TypeError for malformed input. */
export class NotebookError extends Error {
  /** Stable code. */
  readonly code: 'INVALID_JSON' | 'NOT_NOTEBOOK'
  constructor(code: 'INVALID_JSON' | 'NOT_NOTEBOOK', message: string) {
    super(message)
    this.name = 'NotebookError'
    this.code = code
  }
}

/** Join a notebook source value (string or string[]). */
function sourceOf(value: unknown): string {
  if (typeof value === 'string') return value
  if (Array.isArray(value)) return value.map(part => String(part)).join('')
  return ''
}

/** Parse an .ipynb JSON string. */
export function parseNotebook(text: string): Notebook {
  let parsed: unknown
  try {
    parsed = JSON.parse(text)
  } catch (error) {
    throw new NotebookError('INVALID_JSON', `notebook is not valid JSON: ${(error as Error).message}`)
  }
  const record = parsed as { nbformat?: unknown; cells?: unknown; metadata?: unknown }
  if (typeof record !== 'object' || record === null || !Array.isArray(record.cells)) {
    throw new NotebookError('NOT_NOTEBOOK', 'the JSON has no cells array; this is not a Jupyter notebook')
  }
  const cells: NotebookCell[] = (record.cells as Array<Record<string, unknown>>).map(cell => ({
    cellType: typeof cell['cell_type'] === 'string' ? cell['cell_type'] : 'code',
    source: sourceOf(cell['source']),
    ...(typeof cell['execution_count'] === 'number' ? { executionCount: cell['execution_count'] } : {}),
    outputs: Array.isArray(cell['outputs']) ? cell['outputs'].length : 0,
  }))
  return {
    ...(typeof record.nbformat === 'number' ? { nbformat: record.nbformat } : {}),
    cells,
    metadata: (record.metadata ?? {}) as Record<string, unknown>,
  }
}

/** Extract imports from one cell. */
function importsOf(source: string, cell: number): ImportFinding[] {
  const found: ImportFinding[] = []
  for (const match of source.matchAll(/^\s*(?:import|from)\s+([A-Za-z_][\w.]*)/gmu)) found.push({ module: match[1]!, cell })
  for (const match of source.matchAll(/^\s*(?:library|require)\(\s*["']?([A-Za-z][\w.]*)/gmu)) found.push({ module: match[1]!, cell })
  return found
}

/** Extract runtime installs. */
function installsOf(source: string, cell: number): InstallFinding[] {
  const found: InstallFinding[] = []
  for (const match of source.matchAll(/^\s*[!%]\s*(?:pip|conda|mamba)\s+install\s+(.+)$/gmu)) found.push({ command: match[0]!.trim(), cell })
  for (const match of source.matchAll(/^\s*install\.packages\(\s*["']([^"']+)["']/gmu)) found.push({ command: `install.packages(${match[1]})`, cell })
  return found
}

/** Extract seeds. */
function seedsOf(source: string, cell: number): SeedFinding[] {
  const found: SeedFinding[] = []
  const patterns: Array<{ pattern: string; regex: RegExp }> = [
    { pattern: 'np.random.seed', regex: /np\.random\.seed\(\s*(\d+)/gu },
    { pattern: 'random.seed', regex: /\brandom\.seed\(\s*(\d+)/gu },
    { pattern: 'set.seed', regex: /\bset\.seed\(\s*(\d+)/gu },
    { pattern: 'torch.manual_seed', regex: /torch\.manual_seed\(\s*(\d+)/gu },
    { pattern: 'tf.random.set_seed', regex: /tf\.random\.set_seed\(\s*(\d+)/gu },
    { pattern: 'random_state', regex: /random_state\s*=\s*(\d+)/gu },
  ]
  for (const { pattern, regex } of patterns) {
    for (const match of source.matchAll(regex)) found.push({ pattern, value: Number(match[1]), cell })
  }
  return found
}

/** Extract absolute paths. */
function pathsOf(source: string, cell: number): PathFinding[] {
  const found: PathFinding[] = []
  for (const match of source.matchAll(/(?:["'])(\/(?:home|Users|mnt|data)\/[^"'\s]+|[A-Za-z]:[\\/][^"'\s]+)/gu)) found.push({ path: match[1]!, cell })
  return found
}

/**
 * Analyze a notebook.
 * @param notebook - the parsed notebook.
 * @returns counts, findings and issues.
 */
export function analyzeNotebook(notebook: Notebook): NotebookAnalysis {
  const numbered = notebook.cells.map((cell, index) => ({ cell, number: index + 1 }))
  const codeCells = numbered.filter(entry => entry.cell.cellType === 'code')
  const markdownCells = numbered.filter(entry => entry.cell.cellType === 'markdown')
  const executionOrder = codeCells.map(entry => entry.cell.executionCount).filter((count): count is number => count !== undefined)
  let outOfOrder = false
  for (let index = 1; index < executionOrder.length; index += 1) {
    if (executionOrder[index]! <= executionOrder[index - 1]!) outOfOrder = true
  }
  // `cell` in findings is the 1-based notebook cell index, which is what a
  // reader can locate in the UI.
  const imports = codeCells.flatMap(entry => importsOf(entry.cell.source, entry.number))
  const installs = codeCells.flatMap(entry => installsOf(entry.cell.source, entry.number))
  const seeds = codeCells.flatMap(entry => seedsOf(entry.cell.source, entry.number))
  const paths = codeCells.flatMap(entry => pathsOf(entry.cell.source, entry.number))
  const kernelSpec = notebook.metadata['kernelspec'] as { name?: string; display_name?: string; language?: string } | undefined
  const languageInfo = notebook.metadata['language_info'] as { name?: string; version?: string } | undefined
  const kernel = {
    ...(typeof kernelSpec?.name === 'string' ? { name: kernelSpec.name } : {}),
    ...(typeof kernelSpec?.display_name === 'string' ? { displayName: kernelSpec.display_name } : {}),
    ...(typeof languageInfo?.name === 'string' ? { language: languageInfo.name } : typeof kernelSpec?.language === 'string' ? { language: kernelSpec.language } : {}),
    ...(typeof languageInfo?.version === 'string' ? { version: languageInfo.version } : {}),
  }

  const issues: NotebookIssue[] = []
  if (Object.keys(kernel).length === 0) issues.push({ code: 'no_kernel', severity: 'warning', detail: 'the notebook metadata has no kernel or language information', suggestion: 'save with a kernelspec that names the environment' })
  if (outOfOrder) issues.push({ code: 'out_of_order', severity: 'warning', detail: `execution counts are not increasing: ${executionOrder.join(', ')}`, suggestion: 'restart the kernel and run all cells before saving a reproducibility copy' })
  const unexecuted = codeCells.length - executionOrder.length
  if (unexecuted > 0) issues.push({ code: 'unexecuted_cells', severity: 'warning', detail: `${unexecuted} code cell(s) have no execution count`, suggestion: 'run every cell, or remove never-run experiments' })
  if (codeCells.length > 0 && codeCells.every(entry => entry.cell.outputs === 0)) {
    issues.push({ code: 'outputs_missing', severity: 'info', detail: 'no code cell carries saved output', suggestion: 'save with outputs when the notebook is the figure/table record' })
  }
  if (installs.length > 0) issues.push({ code: 'runtime_install', severity: 'warning', detail: `${installs.length} cell(s) install packages at runtime`, suggestion: 'pin dependencies in requirements.txt/environment.yml and keep installs out of the analysis notebook' })
  if (codeCells.length > 0 && seeds.length === 0) issues.push({ code: 'no_seed', severity: 'warning', detail: 'no random seed literal was found', suggestion: 'set and record a seed for every stochastic step' })
  if (paths.length > 0) issues.push({ code: 'absolute_paths', severity: 'warning', detail: `${paths.length} absolute path literal(s) found`, suggestion: 'use paths relative to the project root' })
  if (imports.length === 0 && codeCells.length > 0) issues.push({ code: 'no_imports', severity: 'info', detail: 'no import statement was found in code cells', suggestion: 'confirm the notebook is self-describing' })

  return {
    ...(notebook.nbformat === undefined ? {} : { nbformat: notebook.nbformat }),
    ...(Object.keys(kernel).length === 0 ? {} : { kernel }),
    cells: notebook.cells.length,
    codeCells: codeCells.length,
    markdownCells: markdownCells.length,
    executedCells: executionOrder.length,
    executionOrder,
    outOfOrder,
    imports,
    installs,
    seeds,
    paths,
    outputsCleared: codeCells.length > 0 && codeCells.every(entry => entry.cell.outputs === 0),
    issues,
  }
}
