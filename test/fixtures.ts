/**
 * Shared synthetic notebook fixture (kept out of `*.spec.ts` so importing it
 * does not re-register another suite's tests).
 * @module test/fixtures
 */

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
