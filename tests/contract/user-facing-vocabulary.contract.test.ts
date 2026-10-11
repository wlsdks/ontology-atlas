import { describe, expect, it } from 'vitest';

import en from '../../messages/en.json';
import ko from '../../messages/ko.json';
import { column } from '../../scripts/lib/locale-vocabulary.mjs';

/**
 * One word per thing in the strings people read: this gate counts synonyms and does not pin prose.
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

describe('사용자가 읽는 말 — 한 가지는 한 이름으로', () => {
  /*
   * The folder the person chose. Four names for it was the worst split found. The survivor is
   * the settled term — the domain's own term for what is actually in there, not a plainer word and
   * not another product's coinage.
   */
  it('온톨로지 폴더를 vault·볼트·워크스페이스로 부르지 않는다', () => {
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
        `「${banned}」는 the settled term와 같은 것을 가리키는 두 번째 이름이다`,
      ).toEqual([]);
    }
  });

  /*
   * `topology` is the renderer's name, an implementation detail that reached the screen once before
   * and was banned then. Keeping the ban here means one gate owns the whole vocabulary rather than
   * one screen's test owning one word.
   */
  it('토폴로지는 화면에 나오지 않는다 — 렌더러 이름이다', () => {
    for (const word of column('rendererName', 'ko').words) expect(hits(word)).toEqual([]);
  });

  /*
   * ⚠️ The hole this file was written around. `project` is one of the five authorable kinds, and it
   * is a fine word **where the kind is the point** — a node's type, a filter, a count of projects.
   * It is not a word for "anything on the map", which is what the empty state used it for.
   *
   * The ratchet counts rather than forbids: the kind legitimately appears, and a number that may
   * fall but never rise is the honest shape for a word that has both a right and a wrong use.
   */
  /*
   * The coding agent connected to this folder has one name; "AI" is honest where it names the category.
   * A ratchet rather than a ban: the count must not climb back.
   */
  it('「AI」 사용이 늘지 않는다 — 이 폴더의 에이전트는 「에이전트」다', () => {
    /*
     * The baseline moves only with a measurement beside it; entries naming the category are the
     * use this ratchet allows.
     */
    const { word, baseline: AI_BASELINE } = column('aiWord', 'ko');
    const current = hits(word).length;
    expect(
      current,
      `"AI" grew from ${AI_BASELINE} to ${current}. If it means what is connected to this folder, ` +
        `use the agent word instead; raising the ceiling unlocks the ratchet.`,
    ).toBeLessThanOrEqual(AI_BASELINE);
  });

  it('「프로젝트」 사용이 늘지 않는다 — 종류를 말할 때만 쓴다', () => {
    /*
     * The count moves for a translation of a filter or a count of projects, never for a new sentence that
     * reaches for the kind name to mean anything on the map.
     */
    const { word, baseline: PROJECT_BASELINE } = column('projectKindWord', 'ko');
    const current = hits(word).length;
    expect(
      current,
      `The project-kind word grew from ${PROJECT_BASELINE} to ${current}. Where the kind is not the point, ` +
        `use the concept word or what the screen actually points at; raising the ceiling unlocks the ratchet.`,
    ).toBeLessThanOrEqual(PROJECT_BASELINE);
  });

  /*
   * The five kinds have fixed names; copy must not translate them into plainer words, because people
   * who then open a file, the CLI or MCP meet the real names. A ratchet: both words have honest uses.
   */
  it('종류 이름을 쉬운 말로 바꿔 부르지 않는다 — 도메인은 a plainer word for domain이 아니다', () => {
    /*
     * Counted uses of a softened word that name a view or an app feature rather than the kind are the
     * allowed ones; the baseline moves only for those.
     */
    for (const [softened, cap] of Object.entries(column('softenedKindNames', 'ko').baselines as Record<string, number>)) {
      const current = hits(softened).length;
      expect(
        current,
        `"${softened}" grew from ${cap} to ${current}. Where it names a kind, use that kind's real ` +
          `name; a plainer word makes people learn the vocabulary again in files and the CLI.`,
      ).toBeLessThanOrEqual(cap);
    }
  });

  it('one node on the map is a concept in Korean copy', () => {
    const scanned = korean().length;
    expect(scanned, 'the Korean catalog read nothing').toBeGreaterThan(1000);
    for (const word of column('nodeWord', 'ko').banned) expect(hits(word)).toEqual([]);
  });

  it('English copy does not grow the node word back', () => {
    const { pattern, ignore, baseline: NODE_BASELINE } = column('nodeWord', 'en');
    const survivors = strings(en)
      .filter((entry) => pattern.test(entry.text.replace(ignore, '')))
      .map((entry) => entry.path);
    expect(strings(en).length, 'the English catalog read nothing').toBeGreaterThan(1000);
    expect(
      survivors.length,
      `"node" grew from ${NODE_BASELINE} to ${survivors.length}: ${survivors.join(', ')}. ` +
        'Name the Node.js runtime or a CLI command only; a node on the map is a concept.',
    ).toBeLessThanOrEqual(NODE_BASELINE);
  });

  it('빈 지도 화면은 종류 이름으로 말하지 않는다', () => {
    // The exact sentence that started this: it described the node count as a count of projects.
    const empty = (ko as { topology: { empty: Record<string, string> } }).topology.empty;
    const { word } = column('projectKindWord', 'ko');
    expect(empty.titleNoProjects).not.toContain(word);
    expect(empty.kicker).not.toContain(word);
  });
});
