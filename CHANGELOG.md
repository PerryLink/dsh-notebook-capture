# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [Unreleased]

## [0.1.0] - 2026-11-08

First release: notebook reproducibility capture.

### Added

- `nb_analyze`: kernel/language, cell counts, execution order (out-of-order and
  never-run), imports, runtime installs, seeds, absolute paths and output state,
  with per-issue suggestions.
- `nb_capture`: sha256 of the notebook plus every environment declaration next
  to it; REP evidence with one check per issue; a record whose artifacts are the
  notebook and environment hashes.
- `nb_card`: Markdown capture card + SARIF 2.1.0.
- 19 tests.

### Notes

- Nothing is executed; findings describe the saved file.
- A clean card does not prove the notebook reproduces its outputs.
- Environment files are searched next to the notebook only.
