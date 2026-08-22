// **How the CLI names itself** — so a command printed on screen actually runs.
//
// **Why** (dogfooding, measured 2026-07-28): `init`'s "Next steps" told the user
// to run `ontology-atlas list`, which pasted verbatim gives `command not found`
// (exit 127). That name is **not in any registry and never will be**
// (`docs/DECISIONS.md` 2026-07-27 「앱이 MCP 를 품는다 … npm 발행 계획 폐기」 —
// the app carries the MCP server; publishing to npm was abandoned). The two live
// channels are the app bundle and a source checkout.
//
// Stranger still, **the README the same `init` writes was correct**
// (`node <checkout>/cli/src/index.mjs …`). The generated artifact and the
// generating tool's own guidance followed different rules.
//
// **The discipline.** Strings printed on screen come in two kinds:
//
// - **Meant to be copied and run** (the cyan command lines, "Next steps", the
//   "next" hints) — these must pass through this function, or they do not run.
// - **Prose naming a command** (usage synopses, "did you mean" in error text,
//   comments) — left alone. There `ontology-atlas add` is the name of a
//   subcommand, not a value to execute, and splicing an absolute path in only
//   makes it harder to read.
//
// Same principle as the label-decoration gate deciding an arrow by its
// **position** rather than its glyph: the same string means different things in
// different places.

import path from 'node:path';

/**
 * The real command that started this process. `process.argv[1]` is this script's
 * path, so it points at whichever checkout the user invoked.
 *
 * **Always absolute.** The `init` guidance tells the user to `cd <vault>` first,
 * so a relative path would break on the very next line.
 *
 * @param {{ argv?: string[], cwd?: string }} [io] injection point for tests.
 */
export function cliInvocation(io = {}) {
  const argv = io.argv ?? process.argv;
  const entry = argv[1];
  if (!entry) return 'node cli/src/index.mjs';
  return `node ${shellQuoteIfNeeded(path.resolve(entry))}`;
}

/** Quotes only paths containing whitespace or quotes — quoting an ordinary path just makes it harder to read. */
export function shellQuoteIfNeeded(value) {
  return /[\s"'$`\\]/.test(value) ? `'${value.replace(/'/g, `'\\''`)}'` : value;
}

/**
 * One command line to copy and run. `cmd('list')` → `node /abs/cli/src/index.mjs list`.
 *
 * @param {...string} parts subcommand and arguments.
 */
export function cliCommand(...parts) {
  return [cliInvocation(), ...parts.filter(Boolean)].join(' ');
}
