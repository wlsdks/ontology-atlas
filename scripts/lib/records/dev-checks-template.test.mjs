import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { runDevChecksCheck } from '../../records/check-dev-checks.mjs';
import {
  commandTableLines,
  commandTableOrderItems,
  missingScripts,
  numberedLines,
  orderProblems,
  sortCommandTable,
} from './dev-checks-template.mjs';

const DOC = `# Development checks

After \`pnpm install\`, start with \`pnpm lint\`, then \`pnpm exec tsc --noEmit\` or \`pnpm --dir mcp test\`.
`;

const README = `# Project

| Command | What it answers |
|---|---|
| \`pnpm backlog\` · \`pnpm backlog:check\` | Task records |
| \`pnpm knip\` | Dead files |
| \`pnpm pr:land <n>\` | Landing |

After the table, \`pnpm not-a-row\` is prose.
`;

const SCRIPTS = { lint: 'eslint', backlog: 'x', 'backlog:check': 'x', knip: 'knip', 'pr:land': 'x', 'agents:check': 'x' };

const recorder = () => ({ logs: [], errors: [], log(l) { this.logs.push(l); }, error(l) { this.errors.push(l); } });

function withRepo(files, run) {
  const dir = mkdtempSync(join(tmpdir(), 'dev-checks-'));
  try {
    mkdirSync(join(dir, 'docs'));
    writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: SCRIPTS }));
    writeFileSync(join(dir, 'README.md'), files.readme ?? README);
    writeFileSync(join(dir, 'docs', 'DEVELOPMENT-CHECKS.md'), files.doc ?? DOC);
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

describe('script references', () => {
  it('names a pnpm script that does not exist, with its line, and leaves binaries and other packages alone', () => {
    assert.deepEqual(missingScripts(numberedLines(DOC), SCRIPTS), []);
    assert.deepEqual(missingScripts(numberedLines(`${DOC}\nRun \`pnpm ghost\` and \`pnpm run lint\`.\n`), SCRIPTS), [{ line: 5, name: 'ghost' }]);
  });

  it('reads only the README command table rows, not the prose around it', () => {
    assert.deepEqual(commandTableLines(README).map((l) => l.line), [5, 6, 7]);
    assert.deepEqual(missingScripts(commandTableLines(README), SCRIPTS), []);
    assert.deepEqual(commandTableLines('# no table\n'), []);
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
    assert.deepEqual(commandTableOrderItems(README).map((i) => [i.key, i.line]), [
      ['pnpm backlog', 5],
      ['pnpm knip', 6],
      ['pnpm pr:land <n>', 7],
    ]);
    assert.equal(commandTableOrderItems('# no table\n'), null);
  });

  it('sorts without losing or changing a line', () => {
    const table = README.replace('| `pnpm knip` | Dead files |\n', '').replace('| `pnpm pr:land <n>` | Landing |\n', '| `pnpm pr:land <n>` | Landing |\n| `pnpm knip` | Dead files |\n');
    assert.equal(sortCommandTable(table), README);
  });
});

describe('dev-checks gate', () => {
  it('passes a sorted table whose commands all exist', () => {
    withRepo({}, (dir) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 0);
      assert.match(io.logs.join('\n'), /3 rows/);
    });
  });

  it('fails a missing script in either document, naming file and line', () => {
    withRepo({ readme: README.replace('`pnpm knip`', '`pnpm knop`'), doc: `${DOC}\n\`pnpm ghost\`\n` }, (dir) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 1);
      const errors = io.errors.join('\n');
      assert.match(errors, /README\.md:6 {2}`pnpm knop` is not a package\.json script/);
      assert.match(errors, /docs\/DEVELOPMENT-CHECKS\.md:5 {2}`pnpm ghost` is not a package\.json script/);
    });
  });

  it('fails an out-of-order row with the line to move, and --fix sorts it', () => {
    withRepo({ readme: README.replace('| `pnpm pr:land <n>` | Landing |', '| `pnpm pr:land <n>` | Landing |\n| `pnpm agents:check` | Instructions |') }, (dir) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 1);
      assert.match(io.errors.join('\n'), /README\.md:8 {2}"pnpm agents:check" is out of command order; move it above line 5 \("pnpm backlog"\)/);
      assert.equal(runDevChecksCheck(['--fix'], io, { cwd: dir }), 0);
      assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /\|---\|---\|\n\| `pnpm agents:check`/);
    });
  });

  it('fails a README without the command table', () => {
    withRepo({ readme: '# no table\n' }, (dir) => {
      const io = recorder();
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 1);
      assert.match(io.errors.join('\n'), /has no "\| Command \| What it answers \|" table/);
    });
  });
});
