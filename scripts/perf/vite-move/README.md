# vite-move

The measuring tool for criterion 1 of `docs/specs/2026-11-27-ui-on-vite.md`: how long one build
tool takes to build, and to bring the map up under `pnpm dev`, cold and warm. Run it with
`pnpm perf:ui-move` (arguments in `docs/DEVELOPMENT-CHECKS.md`); the build and dev commands are
arguments, so the same probe measures any build tool (the Next baseline in the spec was taken with it).

Start at `measure-ui-move.mjs`, the command line. Everything else is named for what it exports.

| File | Owns |
|---|---|
| `measure-build.mjs` | One build: wall time and peak memory |
| `measure-dev-start.mjs` | One dev start, timed to a settled map; runs the browser probe |
| `sample-peak-memory.mjs` | The 100 ms sampling loop over a command's process tree |
| `read-process-table.mjs` | One snapshot of `pid ppid resident-kb`: `ps`, or PowerShell on Windows |
| `sum-process-tree.mjs` | The root and its descendants, summed from one snapshot |
| `start-command.mjs` | A shell command as the root of a tree that can be ended whole |
| `tcp-port.mjs` | Whether a port is open; waiting for it to close |
| `delete-cache-dirs.mjs` | What a cold run removes |
| `summarize-samples.mjs` | The median per measure; failed samples stay out of it |

The browser half is `tests/e2e/perf/time-to-map.probe.ts` with its own `playwright.config.ts`:
no server, no warm-up, and no `.spec.ts` name, so the e2e suite never runs it.

Limits worth knowing before reading a number:

- Peak memory is the sum of resident sets, so pages two processes share are counted twice.
  It is the spec's definition and the same on both sides of a comparison; it is not the
  physical footprint.
- A sample is one run on a machine that may be busy. Each carries the load average at its start
  and end; `maxSampleGapMs` says how far the 100 ms sampling stretched.
- The Windows table reader is documented but has not run on Windows; its parser is tested with
  the CRLF output PowerShell writes.
