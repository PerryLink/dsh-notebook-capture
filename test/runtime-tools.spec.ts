/**
 * Runtime and tool surface: REP record, artifacts, card, failure branches.
 * @module test/runtime-tools.spec
 */

import { mkdtemp, readFile, rm, symlink, writeFile } from 'node:fs/promises'
import { tmpdir } from 'node:os'
import path from 'node:path'
import { validateRep } from '@perrylink/dsh-research-core'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { resolveConfig } from '../src/config.ts'
import { NotebookRuntime } from '../src/runtime.ts'
import { makeNbAnalyzeTool } from '../src/tools/nb-analyze.ts'
import { makeNbCaptureTool } from '../src/tools/nb-capture.ts'
import { makeNbCardTool } from '../src/tools/nb-card.ts'
import { VERSION } from '../src/version.ts'
import { fixtureNotebook } from './fixtures.ts'

const AT = new Date('2026-11-02T09:00:00.000Z')
let workspace: string
let store: string

beforeEach(async () => {
  workspace = await mkdtemp(path.join(tmpdir(), 'nb-work-'))
  store = await mkdtemp(path.join(tmpdir(), 'nb-store-'))
  await writeFile(path.join(workspace, 'analysis.ipynb'), fixtureNotebook(), 'utf8')
  await writeFile(path.join(workspace, 'requirements.txt'), 'numpy==1.26.4\npandas==2.2.0\n', 'utf8')
})

afterEach(async () => {
  for (const directory of [workspace, store]) {
    if (directory.startsWith(tmpdir())) await rm(directory, { recursive: true, force: true })
  }
})

/** Build a runtime over the fixtures. */
function runtime(): NotebookRuntime {
  return new NotebookRuntime({ config: resolveConfig({ workspaceRoot: workspace, root: store }), now: () => AT })
}

const EXEC = {} as never

describe('runtime', () => {
  it('captures a notebook with environment hashes and a valid REP record', async () => {
    const result = await runtime().capture({ path: 'analysis.ipynb' })
    expect(result.capture.notebook.sha256).toMatch(/^[0-9a-f]{64}$/u)
    expect(result.capture.environment.map(file => file.path)).toEqual(['requirements.txt'])
    expect(result.evidenceId).toMatch(/^ev-/u)
    const record = JSON.parse(await readFile(result.recordPath!, 'utf8')) as { artifacts: Array<{ kind: string }> }
    expect(validateRep(record).ok).toBe(true)
    expect(record.artifacts.map(artifact => artifact.kind).sort()).toEqual(['env', 'notebook'])
  })

  it('analyzes from text and from file', async () => {
    const fromText = await runtime().analyze({ text: fixtureNotebook() })
    expect(fromText.outOfOrder).toBe(true)
    const fromFile = await runtime().analyze({ path: 'analysis.ipynb' })
    expect(fromFile.codeCells).toBe(4)
  })

  it('rejects traversal, invalid JSON, non-notebooks and oversize', async () => {
    await expect(runtime().capture({ path: '../escape.ipynb' })).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
    await writeFile(path.join(workspace, 'broken.ipynb'), '{oops', 'utf8')
    await expect(runtime().analyze({ path: 'broken.ipynb' })).rejects.toMatchObject({ code: 'INVALID_JSON' })
    await writeFile(path.join(workspace, 'other.ipynb'), '{"foo":1}', 'utf8')
    await expect(runtime().analyze({ path: 'other.ipynb' })).rejects.toMatchObject({ code: 'NOT_NOTEBOOK' })
    const tiny = new NotebookRuntime({ config: resolveConfig({ workspaceRoot: workspace, root: store, maxBytes: 10 }), now: () => AT })
    await expect(tiny.capture({ path: 'analysis.ipynb' })).rejects.toMatchObject({ code: 'TOO_LARGE' })
    await expect(tiny.analyze({ text: fixtureNotebook() })).rejects.toMatchObject({ code: 'TOO_LARGE' })
  })

  it.runIf(process.platform !== 'win32')('rejects a symlink that escapes the workspace', async () => {
    const outside = await mkdtemp(path.join(tmpdir(), 'nb-outside-'))
    try {
      await writeFile(path.join(outside, 'secret.ipynb'), fixtureNotebook(), 'utf8')
      await symlink(path.join(outside, 'secret.ipynb'), path.join(workspace, 'linked.ipynb'))
      await expect(runtime().capture({ path: 'linked.ipynb' })).rejects.toMatchObject({ code: 'PATH_ESCAPE' })
    } finally {
      if (outside.startsWith(tmpdir())) await rm(outside, { recursive: true, force: true })
    }
  })
})

describe('tools', () => {
  it('declares names and schemas', () => {
    for (const [tool, name] of [
      [makeNbAnalyzeTool(runtime()), 'nb_analyze'],
      [makeNbCaptureTool(runtime()), 'nb_capture'],
      [makeNbCardTool(), 'nb_card'],
    ] as const) {
      expect(tool.name).toBe(name)
      expect(Object.keys(tool.parameters).length).toBeGreaterThan(0)
      expect(tool.output.schema).toBeDefined()
    }
  })

  it('analyze → capture → card end to end', async () => {
    const analyzed = (await makeNbAnalyzeTool(runtime()).execute({ path: 'analysis.ipynb' }, EXEC)) as { ok: true; analysis: { outOfOrder: boolean } }
    expect(analyzed.analysis.outOfOrder).toBe(true)

    const captured = (await makeNbCaptureTool(runtime()).execute({ path: 'analysis.ipynb' }, EXEC)) as { ok: true; capture: unknown }
    const card = (await makeNbCardTool().execute({ capture: captured.capture }, EXEC)) as {
      ok: true
      markdown: string
      sarif: { version: string; runs: Array<{ results: unknown[] }> }
    }
    expect(card.markdown).toContain('Notebook capture card')
    expect(card.markdown).toContain('requirements.txt')
    expect(card.sarif.version).toBe('2.1.0')
    expect(card.sarif.runs[0]!.results.length).toBeGreaterThan(0)
  })

  it('failure branches carry stable codes', async () => {
    const value = (await makeNbAnalyzeTool(runtime()).execute({}, EXEC)) as { ok: false; error: { code: string } }
    expect(value.ok).toBe(false)
    expect(value.error.code).toBe('INVALID_INPUT')
    const noCapture = (await makeNbCardTool().execute({ capture: {} }, EXEC)) as { ok: false; error: { code: string } }
    expect(noCapture.error.code).toBe('INVALID_INPUT')
    const partialCapture = (await makeNbCardTool().execute({ capture: { analysis: {} } }, EXEC)) as { ok: false; error: { code: string } }
    expect(partialCapture.error.code).toBe('INVALID_INPUT')
  })
})

describe('package', () => {
  it('VERSION matches package.json and the manifest declares a bundle patch', async () => {
    const pkg = JSON.parse(await readFile(new URL('../package.json', import.meta.url), 'utf8')) as Record<string, unknown>
    expect(pkg['version']).toBe(VERSION)
    expect(pkg['dsh']).toEqual({ manifestVersion: 1, bundle: { patch: './cordis.patch.yml' } })
    expect(pkg['dependencies']).toEqual({})
  })
})
