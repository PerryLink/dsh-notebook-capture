/**
 * Notebook parsing and structural analysis.
 * @module test/analyze.spec
 */

import { describe, expect, it } from 'vitest'
import { analyzeNotebook, NotebookError, parseNotebook } from '../src/analyze.ts'

/** A notebook with out-of-order execution, a runtime install, a seed and an absolute path. */
export function fixtureNotebook(): string {
  return JSON.stringify({
    nbformat: 4,
    nbformat_minor: 5,
    metadata: {
      kernelspec: { name: 'python3', display_name: 'Python 3', language: 'python' },
      language_info: { name: 'python', version: '3.11.5' },
    },
    cells: [
      { cell_type: 'markdown', source: ['# Analysis'] },
      { cell_type: 'code', execution_count: 1, outputs: [], source: ['import numpy as np\n', 'import pandas as pd\n'] },
      { cell_type: 'code', execution_count: 3, outputs: [], source: ['np.random.seed(42)\n', "df = pd.read_csv('/home/user/data.csv')\n"] },
      { cell_type: 'code', execution_count: 2, outputs: [], source: ['!pip install seaborn\n'] },
      { cell_type: 'code', execution_count: null, outputs: [], source: ['model = fit()\n'] },
    ],
  })
}

describe('parse', () => {
  it('joins source arrays and reads metadata', () => {
    const notebook = parseNotebook(fixtureNotebook())
    expect(notebook.cells).toHaveLength(5)
    expect(notebook.cells[1]!.source).toContain('import pandas')
    expect(notebook.nbformat).toBe(4)
  })

  it('rejects invalid JSON and non-notebooks', () => {
    expect(() => parseNotebook('{oops')).toThrow(NotebookError)
    expect(() => parseNotebook('{"foo":1}')).toThrow(/no cells/u)
  })
})

describe('analysis', () => {
  const analysis = analyzeNotebook(parseNotebook(fixtureNotebook()))

  it('counts cells and flags out-of-order execution', () => {
    expect(analysis.cells).toBe(5)
    expect(analysis.codeCells).toBe(4)
    expect(analysis.markdownCells).toBe(1)
    expect(analysis.executedCells).toBe(3)
    expect(analysis.executionOrder).toEqual([1, 3, 2])
    expect(analysis.outOfOrder).toBe(true)
    expect(analysis.issues.some(issue => issue.code === 'out_of_order')).toBe(true)
  })

  it('finds imports, installs, seeds and absolute paths', () => {
    expect(analysis.imports.map(finding => finding.module)).toEqual(['numpy', 'pandas'])
    expect(analysis.installs[0]!.command).toContain('pip install seaborn')
    expect(analysis.seeds[0]).toMatchObject({ pattern: 'np.random.seed', value: 42, cell: 3 })
    expect(analysis.paths[0]!.path).toBe('/home/user/data.csv')
    expect(analysis.issues.some(issue => issue.code === 'runtime_install')).toBe(true)
    expect(analysis.issues.some(issue => issue.code === 'absolute_paths')).toBe(true)
  })

  it('flags never-run cells and missing outputs', () => {
    expect(analysis.issues.some(issue => issue.code === 'unexecuted_cells')).toBe(true)
    expect(analysis.outputsCleared).toBe(true)
    expect(analysis.issues.some(issue => issue.code === 'outputs_missing')).toBe(true)
  })

  it('reports a kernel and language version', () => {
    expect(analysis.kernel).toMatchObject({ name: 'python3', language: 'python', version: '3.11.5' })
  })
})
