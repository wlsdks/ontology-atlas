import { readFileSync } from 'node:fs';
import { execFileSync } from 'node:child_process';
import { describe, expect, it } from 'vitest';

/**
 * ⚠️ **A table row whose cell count disagrees with its header is always a bug**, and it is one a
 * reader cannot see: Markdown pads the row out, so the content simply lands in the wrong column or
 * a column silently disappears. It has no false positives, which is why it is worth a gate and the
 * other table smells found alongside it are not.
 *
 * Three live instances on 2026-08-28, none of them noticed by anyone reading the rendered page:
 *
 * | File | What it did |
 * |---|---|
 * | `docs/TECH-STACK.md` | a rationale rendered in the verdict column, leaving the rationale empty |
 * | `docs/DEVELOPMENT-CHECKS.md` | six rows of a two-column table pasted into a three-column one, one of them an empty duplicate, and one row that had swallowed a whole separate check into its last cell |
 * | `docs/DESIGN-SYSTEM.md` | two rows whose "do not" half was pressed into the "do" cell, ending in "are forbidden" because prose had to stand in for the missing column |
 *
 * This checks structure, never wording: `.claude/rules/documentation.md` forbids pinning a
 * sentence a person wrote, and nothing here reads what a cell says.
 */

const TRACKED = execFileSync('git', ['ls-files', '*.md'], { encoding: 'utf8' })
  .split('\n')
  .filter(Boolean)
  .filter(
    (path) =>
      /* Generated mirrors are rebuilt from the sources above, and history is not ours to edit. */
      !path.startsWith('public/docs-vault/') &&
      !path.startsWith('src/entities/docs-vault/') &&
      !path.includes('/archive/') &&
      !path.includes('/benchmark/') &&
      !path.endsWith('CHANGELOG.md'),
  );

interface Row {
  readonly line: number;
  readonly cells: number;
}

/** Cell count per row, with fenced code skipped and pipes inside inline code neutralised. */
function tablesIn(source: string): { header: Row; body: Row[] }[] {
  const tables: { header: Row; body: Row[] }[] = [];
  let fenced = false;
  let header: Row | null = null;
  let separated = false;
  let body: Row[] = [];

  const close = () => {
    if (header && separated && body.length > 0) tables.push({ header, body });
    header = null;
    separated = false;
    body = [];
  };

  source.split('\n').forEach((raw, index) => {
    const line = raw.trim();
    if (line.startsWith('```') || line.startsWith('~~~')) {
      fenced = !fenced;
      close();
      return;
    }
    if (fenced) return;
    if (!line.startsWith('|')) {
      close();
      return;
    }
    /* Two pipes are not separators: one inside inline code, and one escaped as `\|` — which is
       how a table cell writes a union type. Neutralise both before counting. */
    const safe = line
      .replace(/`([^`]*)`/g, (_all, code: string) => code.replace(/\|/g, '!'))
      .replace(/\\\|/g, '!');
    const cells = safe.replace(/^\||\|$/g, '').split('|').length;
    if (/^\|[\s:|-]+\|$/.test(line)) {
      separated = header !== null;
      return;
    }
    if (header === null) header = { line: index + 1, cells };
    else if (separated) body.push({ line: index + 1, cells });
    else close();
  });
  close();
  return tables;
}

describe('markdown tables keep their shape', () => {
  it('scans a real corpus, so a green run means something', () => {
    /* Anti-idle: an empty file list would pass this suite while checking nothing. */
    expect(TRACKED.length).toBeGreaterThan(100);
    const rows = TRACKED.reduce(
      (total, path) =>
        total + tablesIn(readFileSync(path, 'utf8')).reduce((n, t) => n + t.body.length, 0),
      0,
    );
    expect(rows).toBeGreaterThan(500);
  });

  it('gives every row the same number of cells as its header', () => {
    const wrong: string[] = [];
    for (const path of TRACKED) {
      for (const table of tablesIn(readFileSync(path, 'utf8'))) {
        for (const row of table.body) {
          if (row.cells !== table.header.cells) {
            wrong.push(
              `${path}:${row.line} has ${row.cells} cells; its header on line ${table.header.line} has ${table.header.cells}`,
            );
          }
        }
      }
    }
    expect(wrong, wrong.join('\n')).toEqual([]);
  });
});
