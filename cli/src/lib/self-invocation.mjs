// How the CLI names itself so a printed command runs: `ontology-atlas` is in no registry (`docs/DECISIONS.md`
// 2026-07-27). Strings meant to be copied and run go through this module; prose naming a command (usage,
// did-you-mean) keeps `ontology-atlas <sub>` for readability.

import path from 'node:path';

/**
 * The command that started this process (`process.argv[1]`, whichever checkout was invoked), always
 * absolute because `init` tells the user to `cd <vault>` first.
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
