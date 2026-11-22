import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { runDevChecksCheck } from '../../records/check-dev-checks.mjs';
import {
  commandTableOrderItems,
  missingScripts,
  numberedLines,
  orderProblems,
  sortCommandTable,
} from './dev-checks-template.mjs';

const TABLE = `# Development checks

| Command | What it answers |
|---|---|
| \`pnpm backlog\` · \`pnpm backlog:check\` | Task records |
| \`pnpm knip\` | Dead files |
| \`pnpm pr:land <n>\` | Landing |

After \`pnpm install\`, start with \`pnpm lint\`, then \`pnpm exec tsc --noEmit\` or \`pnpm --dir mcp test\`.
`;

const SCRIPTS = { lint: 'eslint', backlog: 'x', 'backlog:check': 'x', knip: 'knip', 'pr:land': 'x', 'agents:check': 'x' };

const recorder = () => ({ logs: [], errors: [], log(l) { this.logs.push(l); }, error(l) { this.errors.push(l); } });

function withRepo(files, run) {
  const directory = mkdtempSync(join(tmpdir(), 'dev-checks-'));
  try {
    mkdirSync(join(directory, 'docs'));
    writeFileSync(join(directory, 'package.json'), JSON.stringify({ scripts: SCRIPTS }));
    writeFileSync(join(directory, 'docs', 'DEVELOPMENT-CHECKS.md'), files.doc ?? TABLE);
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
  }
}

describe('script references', () => {
  it('names a pnpm script that does not exist, with its line, and leaves binaries and other packages alone', () => {
    assert.deepEqual(missingScripts(numberedLines(TABLE), SCRIPTS), []);
    assert.deepEqual(missingScripts(numberedLines(`${TABLE}\nRun \`pnpm ghost\` and \`pnpm run lint\`.\n`), SCRIPTS), [{ line: 11, name: 'ghost' }]);
  });
});

describe('order-keyed command table', () => {
  const item = (key, line) => ({ key, line, label: key });

  it('names exactly the one misplaced item and the neighbour it belongs beside', () => {
    assert.deepEqual(orderProblems([item('a', 1), item('c', 2), item('d', 3)]), []);
    // Appended at the end, the old conflict shape: move it above its successor.
    assert.deepEqual(orderProblems([item('a', 1), item('c', 2), item('d', 3), item('b', 4)]), [
      { line: 4, label: 'b', where: 'above', anchor: 2, anchorLabel: 'c' },
    ]);
    // Inserted too early: the inserted item is named, not the correct one after it.
    assert.deepEqual(orderProblems([item('z', 1), item('a', 2), item('c', 3), item('d', 4)]), [
      { line: 1, label: 'z', where: 'below', anchor: 4, anchorLabel: 'd' },
    ]);
  });

  it('keys rows by their first command', () => {
    assert.deepEqual(commandTableOrderItems(TABLE).map((i) => [i.key, i.line]), [
      ['pnpm backlog', 5],
      ['pnpm knip', 6],
      ['pnpm pr:land <n>', 7],
    ]);
    assert.equal(commandTableOrderItems('# no table\n'), null);
  });

  it('sorts without losing or changing a line', () => {
    const table = TABLE.replace('| `pnpm knip` | Dead files |\n', '').replace('| `pnpm pr:land <n>` | Landing |\n', '| `pnpm pr:land <n>` | Landing |\n| `pnpm knip` | Dead files |\n');
    assert.equal(sortCommandTable(table), TABLE);
  });
});

describe('dev-checks gate', () => {
  it('passes a sorted table whose commands all exist', () => {
    withRepo({}, (directory) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: directory }), 0);
      assert.match(io.logs.join('\n'), /3 rows/);
    });
  });

  it('fails a missing script in a table row or the prose, naming file and line', () => {
    withRepo({ doc: `${TABLE.replace('`pnpm knip`', '`pnpm knop`')}\n\`pnpm ghost\`\n` }, (directory) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: directory }), 1);
      const errors = io.errors.join('\n');
      assert.match(errors, /docs\/DEVELOPMENT-CHECKS\.md:6 {2}`pnpm knop` is not a package\.json script/);
      assert.match(errors, /docs\/DEVELOPMENT-CHECKS\.md:11 {2}`pnpm ghost` is not a package\.json script/);
    });
  });

  it('fails an out-of-order row with the line to move, and --fix sorts it', () => {
    withRepo({ doc: TABLE.replace('| `pnpm pr:land <n>` | Landing |', '| `pnpm pr:land <n>` | Landing |\n| `pnpm agents:check` | Instructions |') }, (directory) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: directory }), 1);
      assert.match(io.errors.join('\n'), /docs\/DEVELOPMENT-CHECKS\.md:8 {2}"pnpm agents:check" is out of command order; move it above line 5 \("pnpm backlog"\)/);
      assert.equal(runDevChecksCheck(['--fix'], io, { cwd: directory }), 0);
      assert.match(readFileSync(join(directory, 'docs', 'DEVELOPMENT-CHECKS.md'), 'utf8'), /\|---\|---\|\n\| `pnpm agents:check`/);
    });
  });

  it('fails a document without the command table', () => {
    withRepo({ doc: '# no table\n' }, (directory) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: directory }), 1);
      assert.match(io.errors.join('\n'), /has no "\| Command \| What it answers \|" table/);
    });
  });
});
