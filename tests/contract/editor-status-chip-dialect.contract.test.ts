import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * The editor's top row: **the status chips share one spec** (measured
 * 2026-08-08).
 *
 * **What was there.** Measuring the fonts of the chips standing side by side in
 * `/ko/docs` edit mode (1440×900, local vault) found two specs mixed into one
 * row:
 *
 * | Chip | Measured |
 * |---|---|
 * | Save state — "No changes · Matches disk" | **9.5px** |
 * | "Auto backup · Last saved" | 11px |
 * | "Validation · Undo" | 11px |
 *
 * The parent row is `text-label` (11px), yet the first chip alone dropped a step
 * to `text-caption`. **Same type and same cause** as the defect caught in the
 * settings sheet on 2026-08-02 — nobody ever decided "this chip should be
 * smaller"; a value happened to diverge and stayed.
 *
 * **What this gate locks.** *Chips of the same kind standing in the same row use
 * the same type step.* This row's spec is `text-label` (11px). By the ramp's own
 * definition `text-caption` (9.5px) is the step for "micro labels, legends,
 * timestamps" (`app/globals.css`), and the only thing in this row that qualifies
 * is **the eyebrow** (`editorEyebrow` — "Edit · <slug>"). So this test does not
 * ban `text-caption` outright but **permits it at the eyebrow only** — an outright
 * ban blocks legitimate use, and unlimited permission returns to the state that
 * created the defect.
 *
 * **Why lint cannot do this.** `text-caption` is a legitimate ramp step, so a
 * value lint has nothing to catch. The violation is "was it used *here*", and
 * deciding that requires knowing **what the other chips in the same file use** —
 * beyond the reach of an AST selector that sees one node.
 *
 * **Reach — why «chips» rather than the whole file.** The first version counted
 * every `text-caption` in this file, and all three hits were **legitimate**: the
 * wikilink autocomplete popover's eyebrow, the per-row slug path, and the footer
 * hint. All three are the "micro label / path" the ramp definition describes.
 * Left that way it would have made someone edit correct code (the failure
 * `design-audit` warns about). The property being protected is not "this file
 * contains no 9.5px" but "chips standing together in a row do not diverge in
 * spec", so the target is narrowed to **the chip shape** — status indicators
 * using `rounded-micro` together with `tracking-caps-*`.
 */

const EDITOR = "src/widgets/docs-vault/ui/DocsVaultEditor.tsx";

/**
 * Source with comments removed. This gate counts **classes that reach the
 * screen**, not sentences describing them — without stripping, a comment
 * documenting the spec is itself caught as a violation, creating the inverted
 * incentive that writing down the spec turns the gate red.
 */
function sourceWithoutComments(): string {
  return readFileSync(EDITOR, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** The status chip's signature — a class string using both of these is a chip in this row. */
function statusChipClassStrings(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("rounded-micro") && line.includes("tracking-caps-"));
}

describe("편집기 상단 줄 — 상태 칩의 타입 방언은 하나다", () => {
  it("상태 칩 어디에도 `text-caption`(9.5px) 이 없다", () => {
    const chips = statusChipClassStrings(sourceWithoutComments());
    // Idling guard — if no chip is found, the "0 violations" below means nothing.
    expect(
      chips.length,
      "상태 칩을 하나도 못 찾았다 — 서명(rounded-micro + tracking-caps)이 낡았다",
    ).toBeGreaterThanOrEqual(3);

    const offenders = chips.filter((chip) => chip.includes("text-caption"));
    expect(
      offenders.map((c) => c.slice(0, 100)),
      "이 줄의 칩 규격은 text-label(11px) 이다. 9.5px 은 램프 정의상 " +
        "마이크로 라벨·범례·타임스탬프의 단이고, 나란히 선 칩은 그 셋이 아니다 — " +
        "칩 하나만 한 단 작으면 아무도 정하지 않은 위계가 생긴다.",
    ).toEqual([]);
  });

  it("상태 칩 셋이 실제로 같은 스텝을 쓴다", () => {
    const source = sourceWithoutComments();
    // Find each chip by its own i18n key and read the class on the span that opens it.
    const chipKeys = ["saveContractAriaLabel", "saveWorkflowAriaLabel"] as const;
    for (const key of chipKeys) {
      const idx = source.indexOf(key);
      expect(idx, `${key} 를 못 찾았다 — 게이트가 낡았다`).toBeGreaterThan(0);
      const openTag = source.lastIndexOf("<span", idx);
      const chip = source.slice(openTag, idx);
      expect(chip, `${key} 칩이 text-label 을 잃었다`).toContain("text-label");
    }
    // The save-state chip has three tone branches — all three must use the same step.
    const toneBranches = source
      .split("\n")
      .filter((l) => l.includes("rounded-micro") && l.includes("tracking-caps-10"));
    expect(
      toneBranches.length,
      "저장 상태 칩의 톤 분기를 못 찾았다 — 게이트가 공회전한다",
    ).toBeGreaterThanOrEqual(3);
    for (const branch of toneBranches) {
      expect(branch, "톤 분기마다 스텝이 갈리면 상태에 따라 글자 크기가 변한다").toContain(
        "text-label",
      );
    }
  });
});

/**
 * Two "Preview" labels on one screen came out of the same review
 * (2026-08-08).
 *
 * The document header's 「Preview | Edit」 tab (read this or edit it) and the
 * editor's split-view toggle (see the result beside what I am editing) carried
 * **the same label 52px apart vertically**. Both are legitimate features, but
 * identical names read as a duplicate of one thing. The latter became
 * 「Side by Side」 (side by side).
 */
/**
 * **In this whole file, `text-caption` appears at the eyebrow only** (widened
 * 2026-08-08).
 *
 * The test above looked at «chips» alone (the `rounded-micro` + `tracking-caps`
 * signature). That narrow reach was breached twice in one day — building the `@`
 * mention menu put `text-caption` on the header hint row, and the gate stayed
 * silent because it was not a chip. **The same defect was created three times in
 * the same file in one day**, and that repetition is the signal to widen the
 * scope.
 *
 * What made widening possible: the rule could not previously cover the whole file
 * because the wikilink popover used caption for its slug and footer hints, and
 * when that popover became the `@` mention menu they all moved up to
 * `text-label`. The only legitimate caption left is **the eyebrow** — precisely
 * the "micro label" the ramp definition describes.
 *
 * So the verdict inverts: not "banned on chips" but **"permitted at the eyebrow
 * only"**. If a new place genuinely needs caption, this list grows with the
 * reason written down — stopping it growing quietly is this gate's job.
 */
describe("편집기의 9.5px 은 아이브로우 한 곳뿐이다", () => {
  it("`text-caption` 을 쓰는 자리가 아이브로우 외에 없다", () => {
    const source = sourceWithoutComments();
    const lines = source.split("\n");
    const captionLines = lines
      .map((line, index) => ({ line: line.trim(), no: index + 1 }))
      .filter(({ line }) => line.includes("text-caption"));

    // Idling guard — if the eyebrow itself disappears, this test reports "0
    // violations" forever. At least one occurrence must exist.
    expect(
      captionLines.length,
      "text-caption 이 한 곳도 없다 — 아이브로우가 사라졌거나 게이트가 낡았다",
    ).toBeGreaterThanOrEqual(1);

    // The eyebrow renders its own i18n key on the very next line — that is the signal used to separate it.
    const offenders = captionLines.filter(
      ({ no }) => !lines.slice(no - 1, no + 2).join(" ").includes("editorEyebrow"),
    );
    expect(
      offenders.map(({ no, line }) => `${no}: ${line.slice(0, 100)}`),
      "9.5px 은 램프 정의상 «마이크로 라벨·범례·타임스탬프» 의 단이다. 편집기에서 " +
        "그 자격이 있는 것은 아이브로우 하나뿐 — 설명·힌트·바닥글은 text-label(11px) 이다.",
    ).toEqual([]);
  });
});

describe("「미리보기」 라벨은 한 화면에 하나다", () => {
  it("편집기 split view 토글이 문서 헤더 탭과 같은 이름을 쓰지 않는다", () => {
    for (const locale of ["ko", "en"] as const) {
      const messages = JSON.parse(readFileSync(`messages/${locale}.json`, "utf8"));
      const headerTab: string = messages.docsVault.editorHeader.previewTab;
      const splitToggle: string = messages.vaultWidgets.editor.preview;
      expect(headerTab.length, `${locale}: 헤더 탭 라벨이 비었다`).toBeGreaterThan(0);
      expect(splitToggle.length, `${locale}: split 토글 라벨이 비었다`).toBeGreaterThan(0);
      expect(
        splitToggle.trim().toLowerCase(),
        `${locale}: 두 컨트롤이 한 화면에 같이 그려지는데 이름이 같다 — ` +
          `헤더 탭은 「읽기/고치기」, 이쪽은 「원문 옆에 결과를 나란히」다.`,
      ).not.toBe(headerTab.trim().toLowerCase());
    }
  });
});
