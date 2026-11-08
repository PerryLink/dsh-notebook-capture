# dsh-notebook-capture

**能在你机器上跑通的 notebook，还不等于可复现。请记录保存下来的文件到底写了什么。**

*不执行、只读取 `.ipynb` JSON：内核、执行顺序、import、运行时安装、随机种子、绝对路径、输出状态，以及 notebook 及其环境声明文件的哈希——产出 REP 证据和 Markdown 卡片。*

[![License](https://img.shields.io/badge/license-Apache%202.0-blue.svg)](LICENSE)
[![Node](https://img.shields.io/badge/node-%5E22.19%20%7C%7C%20%3E%3D24.9-brightgreen.svg)]()

[English](README.md) · 简体中文

---

## 它做什么

- **`nb_analyze`** — 解析 notebook 并报告：内核/语言/版本、代码单元与 Markdown 单元、执行计数（`out-of-order` 与 `never run`）、import（Python 与 R）、运行时安装（`!pip install`、`%conda install`、`install.packages`）、种子字面量、绝对路径，以及是否保存了输出。
- **`nb_capture`** — 对 notebook 及其旁边的每个环境声明文件（`requirements.txt`、`environment.yml`、`pyproject.toml`、`renv.lock`、`Pipfile`、`Dockerfile` 等）计算哈希，把 notebook 存为不可变的 REP 证据，并写一条记录，其 artifacts 就是 notebook 与环境声明文件的哈希。
- **`nb_card`** — Markdown 卡片 + SARIF 2.1.0。

## 它不做什么

- **不执行。** 什么都不运行；卡片描述的是已保存的文件。
- **不保证可复现。** 卡片干净只说明文件是自描述的，不代表结果可以重新生成。
- **不解析依赖。** 只记录环境文件，不检查它们是否完整或可安装。
- **不检测隐藏状态。** 某个单元曾经依赖、但没有被记录下来的内核内存，在这里是看不见的。
- **不做 HTML/`.py` 转换。** 只支持 `.ipynb`；如需要，先用 `jupyter nbconvert` 转换。

## 结构检查

| 代码 | 严重级别 | 含义 |
|---|---|---|
| `out_of_order` | warning | 执行计数不是递增的 |
| `unexecuted_cells` | warning | 代码单元没有执行计数 |
| `runtime_install` | warning | 在 notebook 内部安装的包 |
| `no_seed` | warning | 有代码单元但没有种子字面量 |
| `absolute_paths` | warning | `/home/…`、`/Users/…`、`C:\…` 字面量 |
| `outputs_missing` | info | 没有任何单元带有已保存的输出 |
| `no_kernel` | warning | metadata 中没有内核/语言信息 |
| `no_imports` | info | 未发现 import 语句 |
| 缺少环境声明 | warning | 在 capture 的 warnings 中报告 |

## 工具

### `nb_analyze`

`{ text? | path? }` → `{ ok, analysis }`.

### `nb_capture`

`{ path, persist? }` → `{ ok, capture, evidenceId?, recordPath? }`.

### `nb_card`

`{ capture }` → `{ ok, markdown, sarif }`.

### 错误码

`INVALID_INPUT` · `NOT_FOUND` · `PATH_ESCAPE` · `NOT_A_FILE` · `TOO_LARGE` · `NOT_NOTEBOOK` · `INVALID_JSON` · `STORE_ERROR`

## 兼容性与安装

| | |
|---|---|
| DeepSeek Harness | **`dsh-v0.2.1-rc.5`**（2026-11-08 实测）；peer `>=0.2.1-0 <0.3.0 \|\| >=0.2.2-0 <0.3.0` |
| Node | `^22.19.0 \|\| >=24.9.0`（实测 `24.22.1`），仅 ESM |
| Peer 依赖 | `@perrylink/dsh-research-core ^0.1.0`、`@deepseek-ai/cordis ^4.0.5-alpha.1`、`@deepseek-ai/dsh-tools`、`@deepseek-ai/schemastery ^3.18.5-alpha.1` |
| 运行时依赖 | **零** |

```sh
dsh plugin --profile <name> add @perrylink/dsh-research-core dsh-notebook-capture
dsh --profile <name> --dump-config | grep dsh-notebook-capture
```

## 配置

| 键 | 默认值 | 含义 |
|---|---|---|
| `enabled` | `true` | `false` 时不挂载任何内容 |
| `root` | `.notebook-capture` | 存储/记录根目录 |
| `workspaceRoot` | `process.cwd()` | notebook 路径必须解析到该目录内 |
| `maxBytes` | `10485760` | notebook 文件或文本上限（超限即失败，绝不截断） |
| `persist` | `true` | 把 notebook 存为 REP 证据 + 记录 |

## 安全边界

- 对 notebook 只读；只在 `root` 下写入。
- `realpath` 包含性校验；拒绝符号链接逃逸。
- 超出大小上限时明确失败；畸形 JSON 会被拒绝并返回稳定的错误码。
- notebook JSON 视为数据；单元源码永远不会被执行。

## 评测

**16 个测试**：source 数组拼接、无效 JSON/非 notebook/畸形单元的拒绝、单元计数、乱序检测、从未运行的单元、import/安装/种子/绝对路径（每次调用只报一条种子发现）、内核元数据、带环境哈希的 capture 与有效 REP 记录（notebook + 环境 artifacts）、分别从文本和文件 analyze、文件/文本大小上限、路径穿越/符号链接/无效/超大文件拒绝、工具 schema、analyze→capture→card 端到端、畸形 capture 拒绝、失败分支、插件契约、包契约。合成 notebook fixture 位于 `test/fixtures.ts`，因此导入它不会重复注册另一个测试套件的用例。

不宣称任何基准成绩：这些是对一种文件格式的结构性检查，由 fixture 固定；没有可复现结果的人工标注语料。

## 已知限制（v0.1）

- import/种子/路径检测基于对单元源码的正则匹配；不常见的代码写法可能漏检。
- 只在 notebook 旁边查找环境文件（不在仓库根目录）。
- 执行顺序使用保存的 `execution_count`；被清空计数的 notebook 看起来就像“从未运行”。
- 卡片无法知道某个图是否真的来自保存的代码。

## 许可

Apache-2.0。运行时零第三方代码。
