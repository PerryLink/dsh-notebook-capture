# dsh-notebook-capture

**能在你机器上跑的 notebook 还不等于可复现。先记录保存下来的文件到底说了什么。**

*只读 `.ipynb` JSON、不执行：内核、执行顺序、import、运行时安装、seed、绝对路径、输出状态，以及 notebook 与环境声明文件的哈希——落为 REP 证据与 Markdown 卡片。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 它做什么

- **`nb_analyze`** — parses the notebook and reports: kernel/language/version, code vs markdown cells, execution counts (`out-of-order` and `never run`), imports (Python and R), runtime installs (`!pip install`, `%conda install`, `install.packages`), seed literals, absolute paths, and whether outputs were saved.
- **`nb_capture`** — hashes the notebook and every environment declaration next to it (`requirements.txt`, `environment.yml`, `pyproject.toml`, `renv.lock`, `Pipfile`, `Dockerfile`, …), stores the notebook as immutable REP evidence, and writes a record whose artifacts are the notebook and environment hashes.
- **`nb_card`** — Markdown card + SARIF 2.1.0.

## 它做什么 not do

- **No execution.** Nothing is run; the card is about the saved file.
- **No guarantee of reproducibility.** A clean card means the file is self-describing, not that the results can be regenerated.
- **No dependency resolution.** It records environment files; it does not check they are complete or installable.
- **No hidden-state detection.** Kernel memory that a cell relied on but never recorded is invisible here.
- **No HTML/`.py` conversion.** `.ipynb` only; use `jupyter nbconvert` first if needed.

## 结构检查

| Code | Severity | Meaning |
|---|---|---|
| `out_of_order` | warning | execution counts are not increasing |
| `unexecuted_cells` | warning | code cells without an execution count |
| `runtime_install` | warning | packages installed inside the notebook |
| `no_seed` | warning | code cells but no seed literal |
| `absolute_paths` | warning | `/home/…`, `/Users/…`, `C:\…` literals |
| `outputs_missing` | info | no cell carries saved output |
| `no_kernel` | warning | metadata has no kernel/language |
| `no_imports` | info | no import statement found |
| missing env declaration | warning | reported in the capture's warnings |

## 工具

### `nb_analyze`

`{ text? | path? }` → `{ ok, analysis }`.

### `nb_capture`

`{ path, persist? }` → `{ ok, capture, evidenceId?, recordPath? }`.

### `nb_card`

`{ capture }` → `{ ok, markdown, sarif }`.

### Error codes

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `NOT_NOTEBOOK` · `INVALID_JSON` · `STORE_ERROR`

## 兼容性与安装

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`** (verified 2026-11-08); peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0` (tested `24.22.1`), ESM only |
| Peers | `@perrylink/dsh-research-core ^0.1.0`, `@deepseek-ai/cordis ^4.0.5-alpha.1`, `@deepseek-ai/dsh-tools`, `@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| Runtime dependencies | **zero** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-notebook-capture
dsh --profile <name> --dump-config | grep dsh-notebook-capture
```

## 配置

| Key | Default | Meaning |
|---|---|---|
| `enabled` | `true` | `false` mounts nothing |
| `root` | `.notebook-capture` | store/record root |
| `workspaceRoot` | `process.cwd()` | notebook paths must resolve inside it |
| `maxBytes` | `10485760` | notebook cap (fails, never truncates) |
| `persist` | `true` | store notebook as REP evidence + record |

## 安全边界

- Read-only on the notebook; writes only under `root`.
- `realpath` containment; symlink escapes rejected.
- Size cap fails loudly; malformed JSON is refused with a stable code.
- Notebook JSON is treated as data; cell source is never executed.

## 评测

**19 tests**: source-array joining, invalid JSON/non-notebook rejection, cell counting, out-of-order detection, never-run cells, imports/installs/seeds/absolute paths, kernel metadata, capture with environment hash + valid REP record (notebook + env artifacts), analyze from text and file, traversal/invalid/oversize rejection, tool schemas, analyze→capture→card end-to-end, failure branches, package contract.

No benchmark is claimed: these are structural checks on a file format, pinned by fixtures; there is no labelled corpus of reproducibility outcomes.

## 已知限制（v0.1）

- Import/seed/path detection is regex-based over cell source; unusual code shapes can be missed.
- Environment files are only looked for next to the notebook (not the repo root).
- Execution order uses saved `execution_count`; a notebook cleared of counts looks like "never run".
- The card cannot know whether a figure came from the saved code at all.

## 许可

Apache-2.0. No third-party runtime code.
