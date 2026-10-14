import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * Chips of the same kind in the same row use the same type step: `text-label` here, with
 * `text-caption` permitted only at the eyebrow (`editorEyebrow`). Lint cannot see it, since it needs
 * what the other chips use. Targets the chip shape: `rounded-micro` with `tracking-caps-*`.
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
      "Chips in this row are text-label (11px). By the ramp's definition 9.5px is " +
        "the step for micro labels, legends and timestamps, and chips standing side by side are none of those: " +
        "one chip a step smaller creates a hierarchy nobody decided.",
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
 * In this whole file `text-caption` appears at the eyebrow only, the one micro label the ramp
 * describes. A new place that needs caption grows this list with the reason written down.
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

    // The eyebrow renders its own i18n key on the next line; that is how it is told apart.
    const offenders = captionLines.filter(
      ({ no }) => !lines.slice(no - 1, no + 2).join(" ").includes("editorEyebrow"),
    );
    expect(
      offenders.map(({ no, line }) => `${no}: ${line.slice(0, 100)}`),
      "By the ramp's definition 9.5px is the step for micro labels, legends and timestamps. In the editor " +
        "only the eyebrow qualifies; descriptions, hints and footers are text-label (11px).",
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
        `${locale}: two controls drawn on one screen share a name. ` +
          `The header tab switches between reading and editing; this one puts the result beside the source.`,
      ).not.toBe(headerTab.trim().toLowerCase());
    }
  });
});
