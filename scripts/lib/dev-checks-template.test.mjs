import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { runDevChecksCheck } from '../check-dev-checks.mjs';
import {
  FIELDS,
  TEMPLATE,
  checkDevChecks,
  checkEntry,
  commandTableOrderItems,
  devChecksOrderItems,
  orderProblems,
  parseDevChecks,
  sortCommandTable,
  sortDevChecks,
} from './dev-checks-template.mjs';

const DOC = `# Development checks

Preamble prose that is not an entry.

## Checks

### Lint and style

**Run**: \`pnpm lint\`
**Proves**: every file passes ESLint at zero warnings.
**Escalate**: \`pnpm test:run\` when a lint rule guards runtime behavior.
**Fix**: change the code, not the rule, unless the rule is wrong.

### Vault integrity

**Run**: \`pnpm vault:validate\`
**Proves**: the dogfood vault compiles with no unresolved edge.
**Escalate**: none

## Appendix

### Not an entry
`;

const README = `# Project

| Command | What it answers |
|---|---|
| \`pnpm backlog\` · \`pnpm backlog:check\` | Task records |
| \`pnpm knip\` | Dead files |
| \`pnpm pr:land <n>\` | Landing |

After the table.
`;

const SCRIPTS = { lint: 'eslint', 'test:run': 'vitest run', 'vault:validate': 'node x' };

describe('development-checks entry template', () => {
  it('documents itself with the fields the check enforces', () => {
    assert.deepEqual([...TEMPLATE.matchAll(/^\*\*([^*]+)\*\*/gm)].map((m) => m[1]), FIELDS);
  });

  it('reads entries only under the Checks section', () => {
    const { hasSection, entries } = parseDevChecks(DOC);
    assert.equal(hasSection, true);
    assert.deepEqual(entries.map((e) => e.area), ['Lint and style', 'Vault integrity']);
  });

  it('accepts entries with the three required fields, Fix optional, escalation none', () => {
    const { entries, shape } = checkDevChecks(DOC, { scripts: SCRIPTS });
    assert.deepEqual(shape, []);
    assert.deepEqual(entries, []);
  });

  it('names a missing field, a field outside the template, a bare Run, and a script that does not exist', () => {
    const { entries } = parseDevChecks(
      DOC.replace('**Escalate**: none', '**Escalate**: none\n**Why**: history').replace('**Run**: `pnpm vault:validate`', '**Run**: pnpm vault:nope'),
    );
    const problems = checkEntry(entries[1], { scripts: SCRIPTS });
    assert.ok(problems.includes('field outside the template: Why'), problems.join('\n'));
    assert.ok(problems.includes('Run must start with a command in backticks'), problems.join('\n'));
    const missing = checkEntry({ area: 'x', line: 1, body: '**Run**: `pnpm lint`\n**Proves**: y.' }, { scripts: SCRIPTS });
    assert.ok(missing.includes('missing field: Escalate'), missing.join('\n'));
    const ghost = checkEntry({ area: 'x', line: 1, body: '**Run**: `pnpm ghost`\n**Proves**: y.\n**Escalate**: none' }, { scripts: SCRIPTS });
    assert.ok(ghost.includes('`pnpm ghost` is not a package.json script'), ghost.join('\n'));
    // Binaries and other packages are not root scripts and must not be flagged.
    const indirect = checkEntry({ area: 'x', line: 1, body: '**Run**: `pnpm exec tsc --noEmit`\n**Proves**: y.\n**Escalate**: `pnpm --dir mcp test` when needed, then `pnpm run lint`' }, { scripts: SCRIPTS });
    assert.deepEqual(indirect, []);
  });

  it('rejects a repeated area, a missing section, prose lines, and oversize bodies', () => {
    const twice = DOC.replace('## Appendix', '### Lint and style\n\n**Run**: `pnpm lint`\n**Proves**: a.\n**Escalate**: none\n\n## Appendix');
    assert.match(checkDevChecks(twice, { scripts: SCRIPTS }).shape.join('\n'), /appears twice/);
    assert.match(checkDevChecks('# nothing\n').shape[0], /no `## Checks` section/);
    const prose = checkEntry({ area: 'x', line: 1, body: '**Run**: `pnpm lint`\nA paragraph of history.\n**Proves**: y.\n**Escalate**: none' });
    assert.ok(prose.some((p) => p.startsWith('line outside the template')), prose.join('\n'));
    const heavy = checkEntry({ area: 'x', line: 1, body: `**Run**: \`pnpm lint\`\n**Proves**: ${'y'.repeat(700)}.\n**Escalate**: none` });
    assert.match(heavy.join('\n'), /bytes; the template allows/);
  });

  it('the gate passes a conforming document and names the broken entry in a failing one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dev-checks-'));
    const io = { logs: [], errors: [], log(l) { this.logs.push(l); }, error(l) { this.errors.push(l); } };
    try {
      mkdirSync(join(dir, 'docs'));
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: SCRIPTS }));
      writeFileSync(join(dir, 'README.md'), README);
      writeFileSync(join(dir, 'docs', 'DEVELOPMENT-CHECKS.md'), DOC);
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 0);
      assert.match(io.logs.join('\n'), /2 entries fit the template/);
      writeFileSync(join(dir, 'docs', 'DEVELOPMENT-CHECKS.md'), DOC.replace('**Escalate**: none', '- an old bullet'));
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 1);
      assert.match(io.errors.join('\n'), /Vault integrity[\s\S]*line outside the template[\s\S]*missing field: Escalate/);
      assert.equal(runDevChecksCheck(['--template'], io, { cwd: dir }), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});

describe('order-keyed registries', () => {
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

  it('keys entries by area and rows by their first command', () => {
    assert.deepEqual(devChecksOrderItems(DOC).map((i) => i.key), ['lint and style', 'vault integrity']);
    assert.deepEqual(commandTableOrderItems(README).map((i) => [i.key, i.line]), [
      ['pnpm backlog', 5],
      ['pnpm knip', 6],
      ['pnpm pr:land <n>', 7],
    ]);
    assert.equal(commandTableOrderItems('# no table\n'), null);
  });

  it('sorts without losing or changing a line', () => {
    const swapped = DOC.replace(/### Lint and style[\s\S]*?(?=### Vault)/, '').replace('## Appendix', '### Lint and style\n\n**Run**: `pnpm lint`\n**Proves**: every file passes ESLint at zero warnings.\n**Escalate**: `pnpm test:run` when a lint rule guards runtime behavior.\n**Fix**: change the code, not the rule, unless the rule is wrong.\n\n## Appendix');
    assert.notEqual(orderProblems(devChecksOrderItems(swapped)).length, 0);
    assert.equal(sortDevChecks(swapped), DOC);
    const table = README.replace('| `pnpm knip` | Dead files |\n', '').replace('| `pnpm pr:land <n>` | Landing |\n', '| `pnpm pr:land <n>` | Landing |\n| `pnpm knip` | Dead files |\n');
    assert.equal(sortCommandTable(table), README);
  });

  it('the gate fails an out-of-order row with the line to move, and --fix sorts it', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dev-checks-order-'));
    const io = { logs: [], errors: [], log(l) { this.logs.push(l); }, error(l) { this.errors.push(l); } };
    try {
      mkdirSync(join(dir, 'docs'));
      writeFileSync(join(dir, 'package.json'), JSON.stringify({ scripts: SCRIPTS }));
      writeFileSync(join(dir, 'docs', 'DEVELOPMENT-CHECKS.md'), DOC);
      writeFileSync(join(dir, 'README.md'), README.replace('| `pnpm pr:land <n>` | Landing |', '| `pnpm pr:land <n>` | Landing |\n| `pnpm agents:check` | Instructions |'));
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 1);
      assert.match(io.errors.join('\n'), /README\.md:8 {2}"pnpm agents:check" is out of command order; move it above line 5 \("pnpm backlog"\)/);
      assert.equal(runDevChecksCheck(['--fix'], io, { cwd: dir }), 0);
      assert.match(readFileSync(join(dir, 'README.md'), 'utf8'), /\|---\|---\|\n\| `pnpm agents:check`/);
      writeFileSync(join(dir, 'README.md'), '# no table\n');
      assert.equal(runDevChecksCheck([], io, { cwd: dir }), 1);
      assert.match(io.errors.join('\n'), /has no "\| Command \| What it answers \|" table/);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
