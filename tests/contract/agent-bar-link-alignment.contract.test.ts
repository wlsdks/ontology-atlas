import { describe, expect, it } from "vitest";

import { controlClass } from "@/shared/ui/control-class";

/**
 * **`truncate` 축은 flex 모양을 깨뜨린다** (2026-08-17 소유자 지적 → 실측).
 *
 * 하단 에이전트 바에서 대상 노드 링크(「예시 영역」)만 이웃 글자보다 위로 떠
 * 있었다. 실측(설치된 앱 스크린샷, 잉크 픽셀):
 *
 * ```
 *   codex-acp      윗선 18 · 아랫선 25
 *   마지막 작업…    윗선 17 · 아랫선 25
 *   예시 영역       윗선 14 · 아랫선 22   ← 3px 위
 * ```
 *
 * 원인은 `truncate: true` 가 내는 `block` 이다. tailwind-merge 가 그것으로
 * 모양의 `inline-flex` 를 밀어내고, 그러면 `items-center` 가 가운데 맞출 대상을
 * 잃어 글자가 `min-h-6`(24px) 상자의 **위에 붙는다**.
 *
 * 고친 뒤 실측: 아랫선이 25 로 이웃과 **정확히 일치**하고 중심 차이 0.5px.
 * 남은 1px 윗선 차이는 글자 모양 차이(`업` 대 `역`)라 정렬 문제가 아니다.
 *
 * ⚠️ 이 검사는 **함정을 못박는 것**이지 모든 소비처를 고치는 것이 아니다.
 * 같은 조합을 쓰는 자리가 오늘 7곳인데, 화면에서 결함을 실제로 잰 것은 이
 * 하나다. 근거 없이 나머지를 바꾸지 않는다.
 */
describe("truncate 축과 flex 모양", () => {
  it("**함정 재현** — truncate 를 켜면 모양의 flex 가 사라진다", () => {
    const withTruncate = controlClass({ shape: "link", truncate: true });
    expect(withTruncate).toContain("block");
    expect(withTruncate).not.toContain("inline-flex");
  });

  it("truncate 를 안 켜면 모양이 flex 를 지킨다", () => {
    expect(controlClass({ shape: "link" })).toContain("inline-flex");
  });

  it("가운데 정렬은 flex 가 있어야 뜻이 있다", () => {
    // `items-center` 는 두 경우 다 붙어 있다 — 그래서 클래스만 보면 멀쩡해
    // 보이고, 화면에서만 틀린다. 이 검사가 그 차이를 문서로 남긴다.
    expect(controlClass({ shape: "link", truncate: true })).toContain("items-center");
  });
});
