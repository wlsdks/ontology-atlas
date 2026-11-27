/**
 * The program-size gate's judgement, kept apart from the measuring so a test can hold it: the Rust
 * MCP program may not be larger than the Bun program built in the same run, and two goals are
 * reported beside it without failing the run (spec `2026-11-27-mcp-server-in-rust.md`, Risk 3).
 */

const MIB = 1024 * 1024;

/** The size the program is aimed at, with and without the parser grammars. */
export const GOAL_MIB = Object.freeze({ withGrammars: 20, withoutGrammars: 10 });

/**
 * @param {{ rustBytes: number, bunBytes: number, grammarBytes: number | null }} sizes
 *   `grammarBytes` is what the grammars' compiled objects add to the Rust program, `null` when it
 *   could not be read on this machine.
 */
export function programSizeVerdict({ rustBytes, bunBytes, grammarBytes }) {
  const withoutGrammarsBytes = grammarBytes === null ? null : rustBytes - grammarBytes;
  return {
    passes: rustBytes <= bunBytes,
    rustMib: rustBytes / MIB,
    bunMib: bunBytes / MIB,
    withGrammarsGoalMet: rustBytes <= GOAL_MIB.withGrammars * MIB,
    withoutGrammarsMib: withoutGrammarsBytes === null ? null : withoutGrammarsBytes / MIB,
    withoutGrammarsGoalMet:
      withoutGrammarsBytes === null ? null : withoutGrammarsBytes <= GOAL_MIB.withoutGrammars * MIB,
  };
}

/** The `dec` column (total bytes) of each member line `size` prints for an archive, summed. */
export function sumSizeOutput(text) {
  let total = 0;
  for (const line of text.split('\n').slice(1)) {
    const columns = line.trim().split(/\s+/);
    const dec = Number(columns[4]);
    if (columns.length >= 5 && Number.isInteger(dec)) total += dec;
  }
  return total;
}
