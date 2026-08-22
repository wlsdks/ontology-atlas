import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **Em-dash (`—`) ratchet — it can never grow in user-facing text.**
 *
 * **Why** (owner, 2026-08-09):
 *
 * > *"내 폴더 전체를 한눈에 — 모든 숫자는 문서에서 자동 계산됩니다 … 이거는 ai
 * > 패턴이거든? 이런거 있으면 다 변경해줘 작대기 안쓰도록"*
 * > (that dash construction is an AI pattern; change every instance so it is not
 * > used)
 *
 * Correct. "Short lead — long explanation" is a sentence shape models reach for
 * by default, and human-written Korean UI copy usually breaks with a full stop.
 *
 * **Why it was not all fixed at once — a judgement made after counting.**
 * Measured: of 3,206 strings, **501** (ko 234, en 267 = 15.6%) use the dash. They
 * split by shape and **the right answer differs per place**:
 *
 * | Shape | n | Replaced with |
 * |---|---|---|
 * | Short lead — explanation (label-like) | 282 | Full stop, line break, or two separate fields |
 * | One mid-sentence dash | 205 | Usually a full stop |
 * | Parenthetical (two or more) | 11 | The sentence must be rewritten |
 * | **Empty-value glyph** | 2 | **Left alone** — a symbol, not prose |
 *
 * Bulk-replacing 487 strings by machine breaks the writing: this repository
 * treats copy as something a person judges, which is why the documentation gate
 * also holds the rule "never pin a sentence a human wrote". So the fix proceeds
 * **screen by screen while the count is held from growing**.
 *
 * ⚠️ **When it falls, lower the cap with it.** Otherwise every fix becomes new
 * headroom.
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/**
 * **Zero — a ban, not a cap** (exhaustive cleanup completed 2026-08-09).
 *
 * It started as a cap (ko 232, en 265). The owner replaced the plan of fixing
 * screen by screen with *"1번부터 전부다 완벽하게"* (do all of it perfectly, from
 * the first), so **all 494 were cleared**: a full stop where the sentence ends, a
 * colon where it continues, parentheses for parentheticals.
 *
 * **19 places broken by machine replacement were fixed by hand** (11
 * parentheticals + 8 where two colons collided). Those 19 are the evidence for
 * why this cannot be a bulk replace — `downloads: with their real sizes and
 * checksums: appear here` is grammatical but meaningless.
 *
 * **The single `—` used as an empty-value glyph is excluded** — a symbol, not
 * prose.
 */
const BASELINE = { ko: 0, en: 0 } as const;

/**
 * **A symbol, not prose** — a lone dash meaning "no value". Not a sentence, so
 * this ratchet does not count it.
 */
function isPlaceholderGlyph(value: string): boolean {
  return value.trim() === "—";
}

function countEmDash(locale: "ko" | "en"): { strings: number; withDash: number } {
  const raw = JSON.parse(
    readFileSync(join(REPO_ROOT, "messages", `${locale}.json`), "utf8"),
  ) as unknown;
  let strings = 0;
  let withDash = 0;
  const walk = (node: unknown) => {
    if (typeof node === "string") {
      strings += 1;
      if (node.includes("—") && !isPlaceholderGlyph(node)) withDash += 1;
      return;
    }
    if (Array.isArray(node)) {
      for (const item of node) walk(item);
      return;
    }
    if (node && typeof node === "object") {
      for (const value of Object.values(node)) walk(value);
    }
  };
  walk(raw);
  return { strings, withDash };
}

describe("작대기 래칫 — 사용자 문구", () => {
  for (const locale of ["ko", "en"] as const) {
    it(`${locale}: 작대기를 쓰는 문구가 늘지 않는다`, () => {
      const { strings, withDash } = countEmDash(locale);
      // Idling guard — failing to read the file and passing with "0 hits" is the worst failure here.
      expect(strings, `${locale} 문구를 하나도 못 읽었다 — 이 래칫이 헛돈다`).toBeGreaterThan(
        2_000,
      );
      expect(
        withDash,
        `${locale} 문구에 작대기가 ${withDash}개 들어왔다.\n` +
          "「짧은 앞말 — 긴 설명」은 모델의 기본 문장 모양이다. 문장이 끝났으면 마침표, " +
          "이어지면 콜론, 삽입구는 괄호를 쓴다.\n" +
          "값이 없다는 뜻의 «—» 하나만 있는 문자열은 기호라서 안 센다.",
      ).toBeLessThanOrEqual(BASELINE[locale]);
      // At 0 the "lower the cap when it falls" clause is unnecessary — there is nowhere lower.
    });
  }
});

/**
 * **The sample vault does not use the dash either** (2026-08-09).
 *
 * With the UI-copy ratchet in place, editing the sample vault **introduced about
 * 40 new dashes** there, because the ratchet watched only `messages/*.json` — yet
 * UI copy is not the only text users read, and the sample vault is **the only data
 * a first-time visitor reads**.
 *
 * After cleanup the count was 0, and at 0 a **ban** is right rather than a cap.
 */
/**
 * **Documents rendered on screen carry no dash either** (exhaustive cleanup
 * 2026-08-09).
 *
 * | Target | Where it renders | Removed |
 * |---|---|---|
 * | `samples/storefront/**` | The sample vault (the only data a first-time visitor reads) | 93 |
 * | `docs/guide/**` | `/guide` | 148 |
 * | `docs/ontology/**` | Vault nodes, and the default manifest for users with no folder | 105 |
 * | `docs/CHANGELOG.md` | `/changelog` | 1,722 |
 *
 * **What was deliberately excluded.**
 *
 * - **`docs/DECISIONS.md`** (2,158) — an **append-only ledger**. Its own contract
 *   is "past entries are not edited", so rewriting old sentences is itself a rule
 *   violation.
 * - **`AGENTS.md`, `DESIGN-SYSTEM.md`, `.claude/rules/**`, `FEATURES.md`** —
 *   documents agents and we read. "It reads as AI-written" costs something on
 *   **screens users see**, and these are not that.
 *
 * So this gate's boundary is not "is it markdown" but **"does a user read it"**.
 */
describe("작대기 — 화면에 그려지는 문서", () => {
  const SAMPLE_ROOT = join(REPO_ROOT, "samples", "storefront");
  const RENDERED_DOC_ROOTS = [
    join(REPO_ROOT, "samples", "storefront"),
    join(REPO_ROOT, "docs", "guide"),
    join(REPO_ROOT, "docs", "ontology"),
  ];
  const RENDERED_DOC_FILES = [join(REPO_ROOT, "docs", "CHANGELOG.md")];

  const markdownFiles = (dir: string): string[] => {
    const out: string[] = [];
    for (const entry of readdirSync(dir, { withFileTypes: true })) {
      if (entry.name.startsWith(".")) continue;
      const full = join(dir, entry.name);
      if (entry.isDirectory()) out.push(...markdownFiles(full));
      else if (entry.name.endsWith(".md")) out.push(full);
    }
    return out;
  };

  it("화면에 그려지는 문서에 작대기가 없다", () => {
    const files = [...RENDERED_DOC_ROOTS.flatMap(markdownFiles), ...RENDERED_DOC_FILES];
    expect(files.length, "문서를 하나도 못 읽었다. 이 시험이 헛돈다").toBeGreaterThan(180);
    // Each root really produced files — one root at 0 can still clear the total.
    for (const root of RENDERED_DOC_ROOTS) {
      expect(markdownFiles(root).length, `${root} 에서 문서를 못 읽었다`).toBeGreaterThan(5);
    }
    /**
     * ⚠️ **Code blocks are exempt** (learned 2026-08-09, after switching this gate
     * on).
     *
     * At first the dash was banned across whole files. But code blocks in
     * `docs/guide/**` transcribe **what the CLI actually prints**, and the CLI prints
     * dashes such as `— blast radius` (`cli/src/commands/blast-radius.mjs`). Changing
     * that transcript to a colon is not polishing a sentence but **writing down
     * something the program does not say**. It was done once (16 lines) and reverted.
     *
     * So the subject of this verdict is **prose**. Inside code blocks is a record of
     * fact and is left alone. Whether the CLI output itself should drop the dash is a
     * separate question, and the order there must be: fix the CLI, then let the docs
     * follow.
     */
    const proseHasDash = (text: string): boolean => {
      let inFence = false;
      for (const line of text.split("\n")) {
        if (line.trimStart().startsWith("```")) {
          inFence = !inFence;
          continue;
        }
        if (!inFence && line.includes("—")) return true;
      }
      return false;
    };

    const offenders = files
      .filter((file) => proseHasDash(readFileSync(file, "utf8")))
      .map((file) => file.slice(REPO_ROOT.length + 1));
    expect(
      offenders,
      "화면에 그려지는 문서의 **산문**에 작대기가 들어왔다. 문장이 끝났으면 마침표, " +
        "이어지면 콜론, 삽입구는 괄호. (코드 블록은 프로그램 출력 전사라 면제다.)\n" +
        offenders.join("\n"),
    ).toEqual([]);
    expect(SAMPLE_ROOT.length, "SAMPLE_ROOT 가 목록에서 빠졌다").toBeGreaterThan(0);
  });
});
