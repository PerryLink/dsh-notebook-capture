/**
 * Capture structure: notebook hash, environment-file hashes, analysis.
 * @module dsh-notebook-capture/capture
 */

import { createHash } from 'node:crypto'
import { readdir, readFile, stat } from 'node:fs/promises'
import path from 'node:path'
import type { NotebookAnalysis } from './analyze.ts'

/** One hashed file. */
export interface HashedFile {
  readonly path: string
  readonly bytes: number
  readonly sha256: string
}

/** The reproducibility capture. */
export interface NotebookCapture {
  readonly notebook: HashedFile & { readonly nbformat?: number }
  readonly analysis: NotebookAnalysis
  readonly environment: readonly HashedFile[]
  readonly capturedAt: string
  readonly warnings: readonly string[]
}

/** Environment declarations recognized next to the notebook. */
export const ENV_FILES = [
  'requirements.txt',
  'environment.yml',
  'environment.yaml',
  'pyproject.toml',
  'Pipfile',
  'Pipfile.lock',
  'poetry.lock',
  'uv.lock',
  'renv.lock',
  'setup.py',
  'Dockerfile',
  '.python-version',
  '.nvmrc',
] as const

/** Hash bytes as sha256 hex. */
export function sha256Of(bytes: Uint8Array): string {
  return createHash('sha256').update(bytes).digest('hex')
}

/**
 * Hash the notebook and any environment declarations in its directory.
 * @param directory - notebook directory.
 * @param notebookPath - absolute notebook path.
 * @param analysis - notebook analysis.
 * @param capturedAt - ISO timestamp.
 * @param maxBytes - per-file hash cap for environment files.
 * @returns the capture.
 */
export async function buildCapture(
  directory: string,
  notebookPath: string,
  analysis: NotebookAnalysis,
  capturedAt: string,
  maxBytes = 8 * 1024 * 1024,
): Promise<NotebookCapture> {
  const notebookBytes = await readFile(notebookPath)
  const notebookInfo = await stat(notebookPath)
  const warnings: string[] = []
  let entries: string[] = []
  try {
    entries = await readdir(directory)
  } catch {
    warnings.push(`cannot list the notebook directory: ${directory}`)
  }
  const environment: HashedFile[] = []
  for (const name of ENV_FILES) {
    if (!entries.includes(name)) continue
    const absolute = path.join(directory, name)
    try {
      const info = await stat(absolute)
      if (!info.isFile()) continue
      if (info.size > maxBytes) {
        warnings.push(`not hashed (larger than ${maxBytes} bytes): ${name}`)
        continue
      }
      environment.push({ path: name, bytes: info.size, sha256: sha256Of(await readFile(absolute)) })
    } catch (error) {
      warnings.push(`cannot read ${name}: ${(error as Error).message}`)
    }
  }
  if (environment.length === 0) warnings.push('no environment declaration (requirements.txt, environment.yml, pyproject.toml, renv.lock …) was found next to the notebook')
  return {
    notebook: {
      path: path.basename(notebookPath),
      bytes: notebookInfo.size,
      sha256: sha256Of(notebookBytes),
      ...(analysis.nbformat === undefined ? {} : { nbformat: analysis.nbformat }),
    },
    analysis,
    environment,
    capturedAt,
    warnings,
  }
}
