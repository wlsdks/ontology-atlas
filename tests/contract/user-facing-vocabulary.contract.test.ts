import { describe, expect, it } from 'vitest';

import ko from '../../messages/ko.json';

/**
 * **One word per thing, in the strings people read.**
 *
 * ⚠️ **Why** (owner, 2026-08-25: *"make these terms consistent across the product and not strange.
 * You may use the word ontology."*, then *"proper domain terms are fine — do not mangle them into
 * something odd for non-developers. The universal technical term is what matters."*)
 *
 * The old rule banned the word ontology outside the brand and told authors to say map / concept /
 * workspace instead. Avoiding the accurate word did not produce plain language — it produced **four
 * words for one thing**. A measured inventory of `messages/ko.json` found the person's own folder
 * called by four different names across 41 strings.
 *
 * The first repair over-corrected in the opposite direction, flattening everything to a plainer folder word and
 * turning the word for validation into a vaguer one — replacing a real term with a folksier one, which is the mangling the owner
 * named. The settled answer is neither: **one correct term**, the settled term.
 *
 * `vault` was considered and rejected on the owner's own test. It is Obsidian's coinage rather than
 * a universal term — Logseq says graph, Foam and Zettlr say workspace, and knowledge engineering
 * does not use the word at all. Nothing forbids it; it simply is not the standard the owner asked
 * for. Inside the code, CLI, MCP and docs `vault` stays: there it is a filesystem and API name, and
 * renaming a public contract is a separate decision.
 *
 * The same round found the empty map saying "no projects to draw on the map" — a sentence built
 * out of `project`, a schema kind, describing a number that is actually the node count. The screen's
 * first sentence to a newcomer was written in this repository's private vocabulary.
 *
 * This gate counts synonyms; it does not pin anybody's prose, which `documentation.md` forbids. It
 * asserts that a thing is called one thing, not that a sentence says something.
 *
 * The rule it enforces lives in `.claude/rules/design.md`, "One word per thing".
 */

/** Every user-facing Korean string, flattened with its key path for a readable failure. */
function korean(): Array<{ path: string; text: string }> {
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
  walk(ko, '');
  return out;
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
    const identifier = /(?:pnpm\s+[a-z:-]*vault[a-z:-]*|[a-z_]*vault[a-z_]*\s*\(|validate_vault|workspace_brief)/i;
    for (const banned of ['볼트', '워크스페이스', 'vault']) {
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
    expect(hits('토폴로지')).toEqual([]);
  });

  /*
   * ⚠️ The hole this file was written around. `project` is one of the five authorable kinds, and it
   * is a fine word **where the kind is the point** — a node's type, a filter, a count of projects.
   * It is not a word for "anything on the map", which is what the empty state used it for.
   *
   * The ratchet counts rather than forbids: the kind legitimately appears, and a number that may
   * fall but never rise is the honest shape for a word that has both a right and a wrong use.
   */
  it('「프로젝트」 사용이 늘지 않는다 — 종류를 말할 때만 쓴다', () => {
    const PROJECT_BASELINE = 143;
    const current = hits('프로젝트').length;
    expect(
      current,
      `「프로젝트」가 ${PROJECT_BASELINE} → ${current} 로 늘었다. 종류가 요점이 아닌 자리라면 ` +
        `「개념」이나 그 화면이 실제로 가리키는 것을 써라 — 상한을 올리는 것은 래칫을 푸는 것이다.`,
    ).toBeLessThanOrEqual(PROJECT_BASELINE);
  });

  /*
   * ⚠️ The other half of the owner's correction, and the opposite failure from the one above (owner,
   * 2026-08-25: *"proper domain terms are fine — do not mangle them into something odd for
   * non-developers. The universal technical term is what matters."*).
   *
   * The five kinds have fixed names, and copy had been quietly translating two of
   * them into plainer Korean: domain became a vaguer word, capability another. That reads easier and teaches the
   * wrong word — somebody who then opens a file, the CLI or the MCP tools meets the real kind names and
   * has to learn the vocabulary a second time. A schema kind is a name, and a name is not translated
   * for comfort.
   *
   * A ratchet rather than a ban: both softened words are ordinary Korean with honest uses elsewhere.
   * What must not happen is their number growing back.
   */
  it('종류 이름을 쉬운 말로 바꿔 부르지 않는다 — 도메인은 a plainer word for domain이 아니다', () => {
    const SOFTENED_BASELINE = { 영역: 13, 기능: 6 } as const;
    for (const [softened, cap] of Object.entries(SOFTENED_BASELINE)) {
      const current = hits(softened).length;
      expect(
        current,
        `「${softened}」가 ${cap} → ${current} 로 늘었다. 종류를 가리키는 자리라면 그 종류의 실제 ` +
          `이름(the kinds' real names)을 써라 — 쉬운 말로 바꾸면 사람이 파일과 CLI 에서 다시 배워야 한다.`,
      ).toBeLessThanOrEqual(cap);
    }
  });

  it('빈 지도 화면은 종류 이름으로 말하지 않는다', () => {
    // The exact sentence that started this: it described the node count as a count of projects.
    const empty = (ko as { topology: { empty: Record<string, string> } }).topology.empty;
    expect(empty.titleNoProjects).not.toContain('프로젝트');
    expect(empty.kicker).not.toContain('프로젝트');
  });
});
