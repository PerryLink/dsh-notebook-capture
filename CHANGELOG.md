# Changelog

All notable changes to this project are documented here. The format follows
[Keep a Changelog](https://keepachangelog.com/en/1.1.0/), and this project
adheres to [Semantic Versioning](https://semver.org/spec/v2.0.0.html).

## [0.1.1] - 2026-11-08

### Changed

- Release-engineering refresh: CHANGELOG accuracy, package metadata and authors; no runtime changes.

## [0.1.0] - 2026-11-08

### Fixed

- `nb_analyze` text input now enforces the same byte cap as file input; the
  config cap previously applied to files only.
- A notebook whose `cells` array contains a non-object (e.g. `null`) or whose
  metadata is not an object is rejected as `NOT_NOTEBOOK`/ignored instead of
  throwing a raw `TypeError`.
- `nb_card` validates the capture payload and returns `INVALID_INPUT` for a
  partial or malformed object instead of throwing.
- `np.random.seed(…)` is no longer also reported as `random.seed`; the R/Python
  seed regexes overlap less.

### Changed

- Moved the synthetic notebook fixture out of `analyze.spec.ts` into
  `test/fixtures.ts`. `runtime-tools.spec.ts` imported the spec file, which
  re-registered all six analysis tests and inflated the reported count (19
  counted, 13 unique); the suite now reports its 16 real tests. Added text-cap,
  symlink, malformed-capture and plugin-mount regression tests.

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
