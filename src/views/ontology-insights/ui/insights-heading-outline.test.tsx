import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";

import { InsightsSectionTitle } from "./parts/InsightsSectionTitle";

/**
 * **보이는 위계가 문서 위계이기도 해야 한다.**
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29 도그푸딩)
 *
 * 인사이트 보드 전체의 heading 요소가 **`<h1>` 하나**였다. 「에이전트 준비도」·
 * 「수리 큐」·「여러 곳에서 참조돼요」는 전부 `text-body-lg` + 서명 무게를 입힌
 * `<span>` 이라, 눈에는 세 단 위계가 보이는데 문서에는 한 단도 없었다.
 *
 * 이 화면의 일은 **훑어서 다음 할 일을 고르는 것**이다. 제목으로 훑을 수 없으면
 * 그 일 자체가 안 된다.
 *
 * ## 왜 태그만 바꾸지 않고 컴포넌트를 두나
 *
 * 같은 클래스 문자열이 다섯 파일에 열두 번 복제돼 있었다. 태그만 갈아끼우면
 * 복제본이 남아 다음 사람이 열세 번째 `<span>` 을 만든다. 이 테스트는 그
 * 컴포넌트가 **실제로 heading 을 내는지**와 **시각 규격을 그대로 통과시키는지**
 * 를 함께 고정한다 — 둘 중 하나만 지키면 바꾼 의미가 없다.
 */
describe("InsightsSectionTitle", () => {
  it("level 2 는 h2, level 3 은 h3 을 낸다", () => {
    render(
      <>
        <InsightsSectionTitle level={2}>수리 큐</InsightsSectionTitle>
        <InsightsSectionTitle level={3}>여러 곳에서 참조돼요</InsightsSectionTitle>
      </>,
    );
    expect(screen.getByRole("heading", { level: 2, name: "수리 큐" })).toBeInTheDocument();
    expect(
      screen.getByRole("heading", { level: 3, name: "여러 곳에서 참조돼요" }),
    ).toBeInTheDocument();
  });

  /**
   * 시각 변화 0 이 이 교체의 전제다. Tailwind preflight 가 heading 의
   * font-size/weight 를 `inherit` 로 리셋하므로 크기·굵기는 넘긴 클래스가
   * 그대로 정한다 — 클래스가 유실되면 제목이 브라우저 기본 h2 크기로 튄다.
   */
  it("넘긴 클래스를 그대로 싣는다 — 램프 클래스가 유실되면 크기가 튄다", () => {
    render(
      <InsightsSectionTitle
        level={2}
        className="text-body-lg font-[var(--font-weight-signature)] tracking-[-0.01em] text-[color:var(--color-text-primary)]"
      >
        에이전트 준비도
      </InsightsSectionTitle>,
    );
    const el = screen.getByRole("heading", { level: 2 });
    expect(el.className).toContain("text-body-lg");
    expect(el.className).toContain("font-[var(--font-weight-signature)]");
  });

  /**
   * **제목은 눌리지 않는다** (2026-07-29 좁은 폭 실측 회귀 가드).
   *
   * 834px 에서 「수리 큐」가 이름 가운데서 접혀 「수리 / 큐」가 됐다. 제목이
   * 든 flex 행에서 옆의 수치 칩 묶음이 `min-w-0` 없이 폭을 다 가져가는 바람에
   * 제목 칸이 30px 로 눌린 것이다. 바로 옆 카드는 같은 상황에서 멀쩡했다 —
   * **같은 역할의 두 제목이 서로 다른 규칙 아래 있었다.**
   *
   * 호출부마다 고치면 세 번째 카드에서 다시 난다. 규칙을 역할에 붙였고,
   * 이 검사가 그걸 붙들어 둔다. 눌려야 하는 쪽은 언제나 옆의 수치·칩이다.
   */
  it("flex 행에서 제목이 먼저 눌리지 않는다 — shrink-0 을 싣는다", () => {
    render(<InsightsSectionTitle level={2}>수리 큐</InsightsSectionTitle>);
    expect(screen.getByRole("heading", { level: 2 }).className).toContain("shrink-0");
  });

  it("호출부 클래스와 함께 실려도 shrink-0 이 살아남는다", () => {
    render(
      <InsightsSectionTitle level={3} className="text-body font-[var(--font-weight-signature)]">
        여러 곳에서 참조돼요
      </InsightsSectionTitle>,
    );
    const el = screen.getByRole("heading", { level: 3 });
    expect(el.className).toContain("shrink-0");
    expect(el.className).toContain("text-body");
  });

  it("data-* 같은 속성을 통과시킨다", () => {
    render(
      <InsightsSectionTitle level={3} data-testid="probe">
        경계
      </InsightsSectionTitle>,
    );
    expect(screen.getByTestId("probe").tagName).toBe("H3");
  });
});

/**
 * **구획 제목이 `<span>` 으로 되돌아가는 것을 막는 탐지기.**
 *
 * 위 단위 테스트는 컴포넌트만 본다 — 다음 사람이 컴포넌트를 안 쓰고 예전
 * `<span className="text-body-lg font-[var(--font-weight-signature)] …">` 을 다시
 * 쓰면 통과한다.
 * 그래서 소스를 직접 센다. 클래스 문자열이 곧 역할 선언이기 때문에 이 검사가
 * 성립한다.
 */
describe("인사이트 소스 — 구획 제목 클래스가 span 으로 남아 있지 않다", async () => {
  const { readFileSync, readdirSync, statSync } = await import("node:fs");
  const { join } = await import("node:path");

  const ROOT = "src/views/ontology-insights/ui";
  /*
   * ⚠️ **이 문자열은 규격이 아니라 «그때의 글자 모양»이다.** 무게 축이 램프로
   * 올라가면서(2026-08-05) `font-medium` → `font-[var(--font-weight-signature)]`
   * 로 바뀌었고, 그때 이 목록을 같이 안 고쳤으면 이 게이트는 **존재하지 않는
   * 문자열을 찾느라 영원히 통과**했을 것이다 — 빨개질 수 없는 게이트는 게이트가
   * 아니다(`/gate-probe`). 램프를 또 옮기면 여기도 같이 옮긴다.
   */
  const TITLE_CLASSES = [
    'text-body-lg font-[var(--font-weight-signature)] tracking-[-0.01em] text-[color:var(--color-text-primary)]',
    'text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]',
  ];

  function walk(dir: string): string[] {
    return readdirSync(dir).flatMap((name) => {
      const full = join(dir, name);
      if (statSync(full).isDirectory()) return walk(full);
      return full.endsWith(".tsx") && !full.endsWith(".test.tsx") ? [full] : [];
    });
  }

  const files = walk(ROOT);

  it("probe: 실제로 파일을 읽고 있다", () => {
    expect(files.length).toBeGreaterThan(5);
  });

  it.each(TITLE_CLASSES)("`%s` 를 span 이 쓰지 않는다", (cls) => {
    const offenders = files.filter((f) => readFileSync(f, "utf8").includes(`<span className="${cls}"`));
    expect(
      offenders,
      `구획 제목은 <InsightsSectionTitle> 로 낸다 — 그래야 화면의 위계가 문서에도 남는다.\n` +
        `위반: ${offenders.join(", ")}`,
    ).toEqual([]);
  });
});
