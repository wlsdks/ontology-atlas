import { describe, expect, it } from 'vitest';

import ja from '../../../messages/ja.json';
import ko from '../../../messages/ko.json';
import { column, sourceWordOffenders } from '../../../scripts/lib/i18n/locale-vocabulary.mjs';

/**
 * One word per thing in the strings people read: this gate bans second names and does not pin prose.
 * Inside code, CLI, MCP and docs `vault` stays as a filesystem and API name. The rule is in
 * `.claude/rules/design.md`, "One word per thing".
 */

function strings(catalog: unknown): Array<{ path: string; text: string }> {
  const out: Array<{ path: string; text: string }> = [];
  const walk = (node: unknown, path: string) => {
    if (typeof node === 'string') {
      out.push({ path, text: node });
      return;
    }
    if (!node || typeof node !== 'object') return;
    for (const [key, value] of Object.entries(node as Record<string, unknown>)) {
      walk(value, path ? `${path}.${key}` : key);
    }
  };
  walk(catalog, '');
  return out;
}

function korean(): Array<{ path: string; text: string }> {
  return strings(ko);
}

function hits(word: string): string[] {
  return korean()
    .filter((entry) => entry.text.includes(word))
    .map((entry) => entry.path);
}

describe('words the user reads — one thing, one name', () => {
  /*
   * The folder the person chose. Four names for it was the worst split found. The survivor is
   * the settled term — the domain's own term for what is actually in there, not a plainer word and
   * not another product's coinage.
   */
  it('does not call the ontology folder vault, "bol-teu" or workspace', () => {
    /*
     * ⚠️ `vault` survives where it is somebody's **actual name**, and it must: `pnpm vault:validate`
     * is a command a person types, and `validate_vault` is an MCP tool an agent calls. Renaming
     * either inside copy sends a person to a shell that answers "command not found", or tells an
     * agent to call a tool that does not exist. The ban is on a second word for the person's folder,
     * not on identifiers that happen to contain it.
     */
    const { words, identifier } = column('folderSecondNames', 'ko');
    for (const banned of words) {
      const offenders = korean()
        .filter((entry) => entry.text.includes(banned))
        .filter((entry) => !identifier.test(entry.text))
        .map((entry) => entry.path);
      expect(
        offenders,
        `"${banned}" is a second name for the same thing as the settled term`,
      ).toEqual([]);
    }
  });

  /*
   * `topology` is the renderer's name, an implementation detail that reached the screen once before
   * and was banned then. Keeping the ban here means one gate owns the whole vocabulary rather than
   * one screen's test owning one word.
   */
  it('topology does not appear on screen — it is a renderer name', () => {
    for (const word of column('rendererName', 'ko').words) expect(hits(word)).toEqual([]);
  });

  it('one node on the map is a concept in Korean copy', () => {
    const scanned = korean().length;
    expect(scanned, 'the Korean catalog read nothing').toBeGreaterThan(1000);
    for (const word of column('nodeWord', 'ko').banned) expect(hits(word)).toEqual([]);
  });

  it.each([
    ['ko', ko],
    ['ja', ja],
  ] as const)('a Library source keeps one everyday word in %s', (locale, catalog) => {
    const entries = strings(catalog);
    expect(entries.length, `the ${locale} catalog read nothing`).toBeGreaterThan(1000);
    const { word } = column('sourceWord', locale);
    expect(
      sourceWordOffenders(locale, entries),
      `A Library source is "${word}" on screen; another sense goes in the row's kept keys with a reason.`,
    ).toEqual([]);
  });

  it('the empty-map screen does not speak in kind names', () => {
    // The exact sentence that started this: it described the node count as a count of projects.
    const empty = (ko as { topology: { empty: Record<string, string> } }).topology.empty;
    const { word } = column('projectKindWord', 'ko');
    expect(empty.titleNoProjects).not.toContain(word);
    expect(empty.kicker).not.toContain(word);
  });
});
