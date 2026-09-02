import assert from 'node:assert/strict';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { describe, it } from 'node:test';

import { runDevChecksCheck } from '../check-dev-checks.mjs';
import { FIELDS, TEMPLATE, checkDevChecks, checkEntry, parseDevChecks } from './dev-checks-template.mjs';

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
