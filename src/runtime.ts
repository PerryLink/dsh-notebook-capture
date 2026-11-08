/**
 * Runtime: workspace-safe notebook loading, capture with REP record, analysis.
 * @module dsh-notebook-capture/runtime
 */

import { mkdir, readFile, realpath, stat, writeFile } from 'node:fs/promises'
import path from 'node:path'
import {
  EvidenceStore,
  RepStoreError,
  sha256Hex,
  stableId,
  validateRep,
  type AddEvidenceInput,
  type Artifact,
  type CaptureInput,
  type CheckResult,
  type Evidence,
  type ResearchRecord,
  type Snapshot,
} from '@perrylink/dsh-research-core'
import type { ResolvedConfig } from './config.ts'
import { analyzeNotebook, NotebookError, parseNotebook, type NotebookAnalysis } from './analyze.ts'
import { buildCapture, type NotebookCapture } from './capture.ts'
import { VERSION } from './version.ts'

/** Stable error codes. */
export type NbErrorCode = 'INVALID_INPUT' | 'NOT_FOUND' | 'PATH_ESCAPE' | 'NOT_A_FILE' | 'TOO_LARGE' | 'NOT_NOTEBOOK' | 'INVALID_JSON' | 'STORE_ERROR'

/** A typed failure. */
export class NbError extends Error {
  /** Stable code. */
  readonly code: NbErrorCode

  constructor(code: NbErrorCode, message: string) {
    super(message)
    this.name = 'NbError'
    this.code = code
  }
}

/** The subset of the REP service used here. */
export interface EvidencePort {
  capture(input: CaptureInput): Promise<{ snapshot: Snapshot }>
  addEvidence(input: AddEvidenceInput): Promise<{ evidence: Evidence }>
  buildRecord(options?: { evidenceIds?: readonly string[]; artifacts?: readonly Artifact[] }): Promise<Omit<ResearchRecord, 'manifest'>>
}

/** Capture value with evidence. */
export interface CaptureValue {
  readonly capture: NotebookCapture
  readonly evidenceId?: string
  readonly recordPath?: string
}

/** Runtime options. */
export interface NbRuntimeOptions {
  readonly config: ResolvedConfig
  readonly service?: EvidencePort
  readonly now?: () => Date
}

/** True when `candidate` is inside `root`. */
function isInside(root: string, candidate: string): boolean {
  return candidate === root || candidate.startsWith(root.endsWith(path.sep) ? root : `${root}${path.sep}`)
}

/** The runtime. */
export class NotebookRuntime {
  readonly config: ResolvedConfig

  readonly #service: EvidencePort | undefined
  readonly #now: () => Date
  #store: EvidenceStore | undefined

  constructor(options: NbRuntimeOptions) {
    this.config = options.config
    this.#service = options.service
    this.#now = options.now ?? (() => new Date())
  }

  /** Current ISO timestamp. */
  iso(): string {
    return this.#now().toISOString()
  }

  /** The evidence port. */
  port(): EvidencePort {
    if (this.#service !== undefined) return this.#service
    this.#store ??= new EvidenceStore(path.join(this.config.root, 'store'))
    return this.#store
  }

  /** Resolve a notebook file inside the workspace. */
  async resolve(input: string): Promise<{ absolute: string; id: string }> {
    if (typeof input !== 'string' || input.trim() === '') throw new NbError('INVALID_INPUT', 'path must be a non-empty string')
    let realRoot: string
    try {
      realRoot = await realpath(this.config.workspaceRoot)
    } catch {
      throw new NbError('NOT_FOUND', `workspace root does not exist: ${this.config.workspaceRoot}`)
    }
    const candidate = path.resolve(realRoot, input)
    if (!isInside(realRoot, candidate)) throw new NbError('PATH_ESCAPE', 'path resolves outside the workspace root')
    let real: string
    try {
      real = await realpath(candidate)
    } catch {
      throw new NbError('NOT_FOUND', `notebook not found: ${input}`)
    }
    if (!isInside(realRoot, real)) throw new NbError('PATH_ESCAPE', 'path escapes the workspace root through a symlink')
    const info = await stat(real)
    if (!info.isFile()) throw new NbError('NOT_A_FILE', `not a regular file: ${input}`)
    if (info.size > this.config.maxBytes) throw new NbError('TOO_LARGE', `notebook is ${info.size} bytes, the cap is ${this.config.maxBytes}`)
    return { absolute: real, id: path.relative(realRoot, real).split(path.sep).join('/') }
  }

  /**
   * Analyze notebook text or a file (no persistence).
   * @param request - text or path.
   * @returns the analysis.
   */
  async analyze(request: { text?: string; path?: string }): Promise<NotebookAnalysis> {
    if ((request.text === undefined) === (request.path === undefined)) throw new NbError('INVALID_INPUT', 'pass exactly one of text or path')
    let text: string
    if (request.text !== undefined) {
      if (typeof request.text !== 'string') throw new NbError('INVALID_INPUT', 'text must be a string')
      const bytes = Buffer.byteLength(request.text, 'utf8')
      if (bytes > this.config.maxBytes) throw new NbError('TOO_LARGE', `notebook text is ${bytes} bytes, the cap is ${this.config.maxBytes}`)
      text = request.text
    } else {
      const file = await this.resolve(request.path!)
      text = await readFile(file.absolute, 'utf8')
    }
    try {
      return analyzeNotebook(parseNotebook(text))
    } catch (error) {
      if (error instanceof NotebookError) throw new NbError(error.code, error.message)
      throw error
    }
  }

  /**
   * Capture a notebook file: hashes, environment, analysis, REP record.
   * @param request - path and persistence.
   * @returns the capture and evidence ids.
   */
  async capture(request: { path?: string; persist?: boolean }): Promise<CaptureValue> {
    if (typeof request.path !== 'string') throw new NbError('INVALID_INPUT', 'path is required')
    const file = await this.resolve(request.path)
    const text = await readFile(file.absolute, 'utf8')
    let analysis: NotebookAnalysis
    try {
      analysis = analyzeNotebook(parseNotebook(text))
    } catch (error) {
      if (error instanceof NotebookError) throw new NbError(error.code, error.message)
      throw error
    }
    const capture = await buildCapture(path.dirname(file.absolute), file.absolute, analysis, this.iso())
    const persist = request.persist ?? this.config.persist
    if (!persist) return { capture }
    const checks: CheckResult[] = analysis.issues.map((issue, index) => ({
      checkId: `chk-nb-${index + 1}`,
      check: 'other' as const,
      status: issue.severity === 'error' ? ('fail' as const) : issue.severity === 'warning' ? ('warn' as const) : ('pass' as const),
      severity: issue.severity === 'error' ? ('error' as const) : issue.severity === 'warning' ? ('warning' as const) : ('info' as const),
      detail: `${issue.code}: ${issue.detail}`,
      ...(issue.code === 'out_of_order' ? { actual: { executionOrder: analysis.executionOrder } } : {}),
    }))
    const artifacts: Artifact[] = [
      { artifactId: stableId('art', ['notebook', file.id]), kind: 'notebook', path: file.id, hash: `sha256:${capture.notebook.sha256}` as `sha256:${string}`, description: 'notebook file' },
      ...capture.environment.map(environment => ({
        artifactId: stableId('art', ['env', environment.path]),
        kind: 'env' as const,
        path: environment.path,
        hash: `sha256:${environment.sha256}` as `sha256:${string}`,
        description: 'environment declaration',
      })),
    ]
    const port = this.port()
    try {
      const captured = await port.capture({
        bytes: Buffer.from(text, 'utf8'),
        mediaType: 'application/json',
        sourceRef: { kind: 'file', id: file.id, retrievedAt: this.iso() },
        capturedAt: this.iso(),
      })
      const evidence = (
        await port.addEvidence({
          evidenceId: stableId('ev', ['notebook-capture', file.id, captured.snapshot.snapshotId]),
          title: `Notebook capture: ${file.id}`,
          sourceRef: { kind: 'file', id: file.id, retrievedAt: this.iso() },
          snapshotIds: [captured.snapshot.snapshotId],
          anchors: [{ snapshotId: captured.snapshot.snapshotId, kind: 'record', value: 'field:sha256', label: sha256Hex(text) }],
          provenance: { plugin: 'dsh-notebook-capture', version: VERSION, method: 'ipynb-structural', retrievedAt: this.iso() },
          checks,
          notes: `sha256:${capture.notebook.sha256}; env files: ${capture.environment.length}`,
        })
      ).evidence
      const record = await port.buildRecord({ evidenceIds: [evidence.evidenceId], artifacts })
      if (!validateRep(record).ok) throw new NbError('STORE_ERROR', 'refusing to write an invalid REP record')
      const directory = path.join(this.config.root, 'records')
      await mkdir(directory, { recursive: true })
      const recordPath = path.join(directory, `${evidence.evidenceId}.rep.json`)
      await writeFile(recordPath, `${JSON.stringify(record, null, 2)}\n`, 'utf8')
      return { capture, evidenceId: evidence.evidenceId, recordPath }
    } catch (error) {
      if (error instanceof NbError) throw error
      if (error instanceof RepStoreError) throw new NbError('STORE_ERROR', error.message)
      throw new NbError('STORE_ERROR', `could not store the capture: ${(error as Error).message}`)
    }
  }
}
