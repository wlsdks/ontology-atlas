import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 편집기 상단 줄의 **상태 칩 셋은 한 규격이다** (2026-08-08 실측).
 *
 * ## 무엇이 있었나
 *
 * `/ko/docs` 편집 모드 상단 줄(1440×900, 로컬 볼트)에서 나란히 선 칩 셋의
 * 폰트를 실측했더니 한 줄 안에 두 규격이 섞여 있었다:
 *
 * | 칩 | 실측 |
 * |---|---|
 * | 저장 상태 — 「변경 없음 · 디스크와 같음」 | **9.5px** |
 * | 「자동 백업 · 최종 저장」 | 11px |
 * | 「검증 · 되돌리기」 | 11px |
 *
 * 부모 줄 자체가 `text-label`(11px) 인데 첫 칩만 `text-caption` 으로 한 단
 * 내려가 있었다. 2026-08-02 설정 시트에서 잡은 결함과 **같은 유형이고 원인도
 * 같다** — 아무도 "이 칩만 작게" 라고 정한 적이 없다. 값이 우연히 갈린 것이
 * 계속 남아 있었을 뿐이다.
 *
 * ## 이 게이트가 잠그는 성질
 *
 * *같은 줄에 나란히 서는 같은 종류의 칩은 같은 타입 스텝을 쓴다.* 이 줄의
 * 규격은 `text-label`(11px) 이다. `text-caption`(9.5px) 은 램프 정의상
 * "마이크로 라벨·범례·타임스탬프" 의 단이고(`app/globals.css`), 이 줄에서
 * 그 자격이 있는 것은 **아이브로우 하나**(`editorEyebrow` — 「편집 · <slug>」)
 * 뿐이다. 그래서 이 시험은 `text-caption` 전면 금지가 아니라 **아이브로우
 * 한 곳만 허용**으로 잠근다 — 전면 금지는 정당한 쓰임까지 막고, 무제한
 * 허용은 애초에 이 결함을 만든 상태로 돌아간다.
 *
 * ## lint 가 못 하는 이유
 *
 * `text-caption` 자체는 램프의 정당한 칸이라 값 lint 로는 잡을 것이 없다.
 * 위반은 "이 자리에 쓰였는가" 이고, 그 판정에는 **같은 파일 안 다른 칩들이
 * 무엇을 쓰는지**가 필요하다 — 한 노드만 보는 AST 셀렉터의 사정거리 밖이다.
 *
 * ## 사정거리 — 왜 파일 전체가 아니라 «칩» 인가
 *
 * 첫 판에서는 이 파일의 `text-caption` 을 전부 세었는데, 걸린 셋이 전부
 * **정당한 쓰임**이었다: 위키링크 자동완성 팝오버의 아이브로우 · 행마다 붙는
 * 슬러그 경로 · 바닥 힌트. 셋 다 램프 정의가 말하는 "마이크로 라벨·경로"다.
 * 그대로 뒀으면 멀쩡한 코드를 고치게 했을 것이다(`design-audit` 이 경고하는
 * 그 실패). 지키려는 성질은 «이 파일에 9.5px 이 없다» 가 아니라 «한 줄에
 * 나란히 선 칩끼리 규격이 갈리지 않는다» 이므로, 대상을 **칩 모양**
 * (`rounded-micro` + `tracking-caps-*` 를 함께 쓰는 상태 표시)으로 좁힌다.
 */

const EDITOR = "src/widgets/docs-vault/ui/DocsVaultEditor.tsx";

/**
 * 주석을 뺀 소스. 이 게이트가 세는 것은 **화면에 나가는 클래스**이지 그것을
 * 설명하는 문장이 아니다 — 안 빼면 규격을 문서화한 주석 자체가 위반으로
 * 잡혀서, 규격을 적을수록 게이트가 빨개지는 뒤집힌 유인이 생긴다.
 */
function sourceWithoutComments(): string {
  return readFileSync(EDITOR, "utf8")
    .replace(/\/\*[\s\S]*?\*\//g, "")
    .replace(/\{\/\*[\s\S]*?\*\/\}/g, "")
    .replace(/^\s*\/\/.*$/gm, "");
}

/** 상태 칩의 서명 — 이 둘을 함께 쓰는 클래스 문자열이 이 줄의 칩이다. */
function statusChipClassStrings(source: string): string[] {
  return source
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.includes("rounded-micro") && line.includes("tracking-caps-"));
}

describe("편집기 상단 줄 — 상태 칩의 타입 방언은 하나다", () => {
  it("상태 칩 어디에도 `text-caption`(9.5px) 이 없다", () => {
    const chips = statusChipClassStrings(sourceWithoutComments());
    // 공회전 차단 — 칩을 하나도 못 찾으면 아래 «위반 0» 은 아무 뜻이 없다.
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
    // 세 칩 각각을 자기 i18n 키로 찾아, 그 칩을 여는 span 의 클래스를 본다.
    const chipKeys = ["saveContractAriaLabel", "saveWorkflowAriaLabel"] as const;
    for (const key of chipKeys) {
      const idx = source.indexOf(key);
      expect(idx, `${key} 를 못 찾았다 — 게이트가 낡았다`).toBeGreaterThan(0);
      const openTag = source.lastIndexOf("<span", idx);
      const chip = source.slice(openTag, idx);
      expect(chip, `${key} 칩이 text-label 을 잃었다`).toContain("text-label");
    }
    // 저장 상태 칩은 톤 분기 셋을 갖는다 — 셋 다 같은 스텝이어야 한다.
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
 * 「미리보기」가 한 화면에 둘이던 것도 같은 검수에서 나왔다 (2026-08-08).
 *
 * 문서 헤더의 「미리보기 | 편집」 탭(= 이 문서를 읽을까 고칠까)과, 편집기 안의
 * split view 토글(= 고치면서 결과를 옆에 볼까)이 **세로로 52px 떨어져 같은
 * 라벨**이었다. 둘 다 정당한 기능이지만 이름이 같으면 사용자는 같은 것의
 * 중복으로 읽는다. 뒤의 것을 「나란히 보기」로 바꿨다.
 */
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
