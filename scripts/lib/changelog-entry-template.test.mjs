import assert from 'node:assert/strict';
import { describe, it } from 'node:test';

import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

import { runChangelogCheck } from '../check-changelog.mjs';
import { CATEGORIES, TEMPLATE, checkChangelogShape, checkEntryTemplate, parseChangelog } from './changelog-entry-template.mjs';

const GOOD = `## 2026-09-03 · v1.0.4: the harness proves its hooks on both runtimes

**Added**: \`pnpm harness:smoke\` drives one session per runtime and reads back which hooks fired.
**Fixed**: the Codex census hook no longer reports SessionStart Failed over a leading bracket.
`;

const entry = (text) => parseChangelog(text)[0];

describe('changelog entry template', () => {
  it('documents itself with the categories the check enforces', () => {
    assert.deepEqual([...TEMPLATE.matchAll(/^\*\*([^*]+)\*\*/gm)].map((m) => m[1]), CATEGORIES);
  });

  it('accepts a release entry with category lines in order', () => {
    assert.deepEqual(checkEntryTemplate(entry(GOOD)), []);
  });

  it('requires a version or Unreleased in the title from the versioning baseline on, and not before', () => {
    const late = entry(GOOD.replace('v1.0.4: ', ''));
    assert.match(checkEntryTemplate(late)[0], /title must start with/);
    const early = entry(GOOD.replace('2026-09-03', '2026-07-30').replace('v1.0.4: ', ''));
    assert.deepEqual(checkEntryTemplate(early), []);
    assert.deepEqual(checkEntryTemplate(entry(GOOD.replace('v1.0.4', 'v1.0.4-rc.2'))), []);
  });

  it('names a category outside the template, a repeat, an empty one, and a prose line', () => {
    const text = GOOD.replace(
      '**Fixed**: the Codex',
      '**Notes**: x\n**Added**: again\n**Fixed**:\n- a bullet from the old shape\n**Fixed**: the Codex',
    );
    const problems = checkEntryTemplate(entry(text));
    assert.ok(problems.includes('category outside the template: Notes'), problems.join('\n'));
    assert.ok(problems.includes('repeated category: Added'), problems.join('\n'));
    assert.ok(problems.includes('empty category: Fixed'), problems.join('\n'));
    assert.ok(problems.some((p) => p.startsWith('line outside the template: "- a bullet')), problems.join('\n'));
  });

  it('rejects categories out of order, sub-headings, em dashes, and oversize bodies', () => {
    const swapped = entry(GOOD.replace('**Added**', '**Tmp**').replace('**Fixed**', '**Added**').replace('**Tmp**', '**Fixed**'));
    assert.match(checkEntryTemplate(swapped).join('\n'), /categories out of order: Fixed · Added/);
    assert.match(checkEntryTemplate(entry(GOOD.replace('**Fixed**', '### Details\n\n**Fixed**'))).join('\n'), /sub-heading/);
    assert.match(checkEntryTemplate(entry(GOOD.replace('runtime and', 'runtime — and'))).join('\n'), /em dash in the body/);
    assert.match(checkEntryTemplate(entry(GOOD.replace('v1.0.4: the', 'v1.0.4: the — the'))).join('\n'), /em dash in the title/);
    const heavy = entry(GOOD.replace('drives one', `drives ${'x'.repeat(900)} one`));
    assert.match(checkEntryTemplate(heavy).join('\n'), /bytes; the template allows/);
  });

  it('keeps one Unreleased entry, only at the top', () => {
    const unreleased = (date) => `## ${date} · Unreleased: pending\n\n**Changed**: something.\n`;
    const release = (date) => `## ${date} · v1.0.4: done\n\n**Fixed**: something.\n`;
    assert.deepEqual(checkChangelogShape(parseChangelog(unreleased('2026-09-04') + release('2026-09-03'))), []);
    assert.match(checkChangelogShape(parseChangelog(release('2026-09-04') + unreleased('2026-09-03')))[0], /belongs at the top/);
    assert.match(checkChangelogShape(parseChangelog(unreleased('2026-09-04') + unreleased('2026-09-03')))[0], /2 Unreleased entries/);
  });

  it('the gate passes a conforming file and names the broken entry in a failing one', () => {
    const dir = mkdtempSync(join(tmpdir(), 'changelog-check-'));
    const io = { logs: [], errors: [], log(l) { this.logs.push(l); }, error(l) { this.errors.push(l); } };
    try {
      mkdirSync(join(dir, 'docs'));
      writeFileSync(join(dir, 'docs', 'CHANGELOG.md'), `# CHANGELOG\n\n${GOOD}`);
      assert.equal(runChangelogCheck([], io, { cwd: dir }), 0);
      assert.match(io.logs.join('\n'), /1 entries fit the template/);
      writeFileSync(join(dir, 'docs', 'CHANGELOG.md'), `# CHANGELOG\n\n${GOOD}\n## 2026-09-04 · Unreleased: late\n\n- an old-shape bullet\n`);
      assert.equal(runChangelogCheck([], io, { cwd: dir }), 1);
      assert.match(io.errors.join('\n'), /belongs at the top/);
      assert.match(io.errors.join('\n'), /line outside the template/);
      assert.equal(runChangelogCheck(['--template'], io, { cwd: dir }), 0);
    } finally {
      rmSync(dir, { recursive: true, force: true });
    }
  });
});
