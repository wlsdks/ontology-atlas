import { readFileSync } from "node:fs";
import path from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **Do the tokens the design document cites actually exist?** (2026-08-15, ledger
 * entry 12.)
 *
 * **Why this check is needed — the document was citing things that do not exist.**
 * A gate audit during the hover round (2026-08-15, entry 10) pointed at this:
 * `docs/DESIGN-SYSTEM.md` lists **13** `--topology-*-hover-*` tokens as evidence
 * that *"hover is already backed by tokens"*, and **not one of them is in
 * `app/globals.css`.** Starting an audit from that premise creates its own blind
 * spot — and that round did lose its way once.
 *
 * An exhaustive count showed it was not only hover: of the **393 tokens this
 * document cites, 190 exist nowhere in the repository** (165 of them `--topology-*`).
 * The cause is **token lists left behind by deleted screens** — the
 * "Relief/Topology layout tokens" section is the clearest case.
 *
 * **Why `docs:links` did not catch it.** That check tests the existence of **file
 * paths**. A token name is a string rather than a path, so it was out of view. It
 * falls exactly under **"does the thing being pointed at exist"**, one of the three
 * kinds of check `documentation.md` permits — tokens were simply missing from that
 * kind.
 *
 * **Why a ratchet rather than 0.** Deleting the 190 requires deciding, section by
 * section, **which screens really disappeared**, and that is documentation cleanup
 * rather than a lint PR (the document is 258KB). So for now it is locked **only
 * against growth** — a newly written document citing a non-existent token is red from
 * the first case. Reducing the count lowers the floor with it.
 */

const ROOT = process.cwd();
const CSS = readFileSync(path.join(ROOT, "app/globals.css"), "utf8");
const DOC = readFileSync(path.join(ROOT, "docs/DESIGN-SYSTEM.md"), "utf8");

/** Measured today. Growing turns this red; shrinking turns the "lower the floor" check below red. */
/**
 * 190 → 191 (2026-08-18). **The number rose because a token was deleted.**
 *
 * `--gateway-plate-width` lost its consumers when the gateway's install section was
 * removed, and a token with only a definition left is misinformation rather than a
 * spec, so it was deleted (the property `unused-token-ratchet` guards). But the
 * decision ledger's **historical record** (2026-08-18, entry 70) cites that name as
 * a fact of the time. The ledger's contract is "append only — never edit a past
 * record", so editing that line to bring this number back down would be **erasing a
 * fact for the sake of a gate**.
 *
 * So the number goes up. What this ratchet guards is "a living spec document does
 * not cite non-existent tokens as evidence", not "no old name appears in a
 * historical record".
 */
const CEILING = 187;

/** Every name **defined** as `--x: value;`, including nested blocks and media queries. */
function definedTokens(): Set<string> {
  return new Set([...CSS.matchAll(/(--[a-z0-9-]+)\s*:/g)].map((m) => m[1]));
}

/**
 * Tokens the document **cites**. Only inside backticks and inside `var(...)` — an
 * open-ended prefix mixed into prose (like `--chrome-`) names **a family**, not a
 * token, and is excluded. Without that distinction a prefix is misread as a name,
 * the count inflates, and the ratchet guards a number nobody can trust (measured:
 * 262 → 190).
 */
function citedTokens(): Set<string> {
  const out = new Set<string>();
  const add = (s: string) => {
    for (const m of s.matchAll(/--[a-z][a-z0-9-]*/g)) {
      const t = m[0];
      if (!t.endsWith("-")) out.add(t);
    }
  };
  for (const m of DOC.matchAll(/`([^`\n]{0,200}?)`/g)) add(m[1]);
  for (const m of DOC.matchAll(/var\(([^)\n]*)\)/g)) add(m[1]);
  return out;
}

function missing(): string[] {
  const defined = definedTokens();
  return [...citedTokens()].filter((t) => !defined.has(t)).sort();
}

describe("디자인 문서의 토큰 참조 무결성", () => {
  const defined = definedTokens();
  const cited = citedTokens();
  const gone = missing();

  it("탐지기가 공회전하지 않는다 — 양쪽을 실제로 읽는다", () => {
    expect(defined.size, "globals.css 에서 토큰을 못 읽었다").toBeGreaterThan(400);
    expect(cited.size, "문서에서 인용을 못 읽었다").toBeGreaterThan(200);
    // Most citations must **exist** — otherwise the definition parsing is broken.
    expect(cited.size - gone.length, "실재하는 인용이 너무 적다 — 파서를 의심하라").toBeGreaterThan(150);
  });

  it("없는 토큰을 근거로 드는 자리가 늘지 않는다", () => {
    const byPrefix = new Map<string, number>();
    for (const t of gone) {
      const p = t.split("-").slice(0, 3).join("-");
      byPrefix.set(p, (byPrefix.get(p) ?? 0) + 1);
    }
    const top = [...byPrefix.entries()]
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([p, n]) => `  ${n} ${p}-…`)
      .join("\n");
    expect(
      gone.length,
      `문서가 인용한 토큰 중 실재하지 않는 것이 ${CEILING} → ${gone.length} 로 늘었다.\n` +
        "새 토큰을 문서에 적을 때는 `app/globals.css` 에 **먼저** 넣어라.\n" +
        "이미 없어진 화면의 토큰을 적고 있다면 그 절을 지우는 것이 답이다.\n" +
        top,
    ).toBeLessThanOrEqual(CEILING);
  });

  it("갚았으면 바닥도 내린다 — 여유를 무료로 두지 않는다", () => {
    expect(
      gone.length,
      `없는 토큰 인용이 줄었다(${gone.length}) — 위 CEILING 도 그 값으로 내려라.`,
    ).toBeGreaterThanOrEqual(CEILING);
  });

  it("접두사는 이름이 아니다 — 산문의 갈래 표기를 위반으로 세지 않는다", () => {
    /*
     * `/gate-probe`: without this distinction the count inflates and the ratchet
     * guards a number nobody can trust. Proven synthetically.
     */
    const probe = (s: string) => {
      const out = new Set<string>();
      for (const m of s.matchAll(/--[a-z][a-z0-9-]*/g)) if (!m[0].endsWith("-")) out.add(m[0]);
      return [...out];
    };
    expect(probe("`--color-indigo-a12`"), "완전한 이름을 못 읽는다").toEqual(["--color-indigo-a12"]);
    expect(probe("`--chrome-` 계열"), "대시로 끝나는 접두사를 이름으로 읽는다").toEqual([]);
    /*
     * ⚠️ **The limit is stated honestly.** A **prefix ending in a letter**, such as
     * `--color-danger-a`, cannot be told apart from a real name — a probe caught
     * that. So such cases **are counted** as missing tokens (erring high).
     *
     * Erring high is safe in a ratchet: the ceiling gets slightly generous but no new
     * violation is missed. Erring low would hide real violations under the ceiling.
     * "When in doubt, count it" is also this repository's default (the icon ratchet's
     * `SIZED_SLOT_OWNERS` made the same choice).
     */
    expect(
      probe("`--color-danger-a` 단들"),
      "글자로 끝나는 접두사는 구별 불가라 세인다 — 그 사실이 바뀌면 상한도 다시 재라",
    ).toEqual(["--color-danger-a"]);
  });

  it("탐지기가 심은 위반을 잡는다 — 없는 토큰 하나를 넣으면 늘어난다", () => {
    const defined2 = definedTokens();
    const fake = "--this-token-does-not-exist-anywhere";
    expect(defined2.has(fake), "프로브 토큰이 실재하면 안 된다").toBe(false);
    const cited2 = new Set([...cited, fake]);
    const gone2 = [...cited2].filter((t) => !defined2.has(t));
    expect(gone2.length, "심은 가짜 토큰이 안 세인다").toBe(gone.length + 1);
  });
});
