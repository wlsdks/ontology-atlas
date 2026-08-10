import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

import { PAGE_FRAME, PAGE_HEADER_ROW, PAGE_TITLE_ROW, PAGE_FRAME_FORM, PAGE_TOP_PAD } from "@/shared/ui/page-frame";

/**
 * **페이지 틀은 한 곳에서 정의된다.**
 *
 * ## 무엇이 났나 (2026-08-09, 소유자 지적)
 *
 * > *"인사이트, 프로젝트, 스킬 모두 상단 공백이 동일해야하는데 … 디자인 시스템
 * > 있는거 아녔나? 왜 다 다르지?"*
 *
 * 실측: 제목까지 **32 / 48 / 20px**. 그리고 어긋난 축이 상단만이 아니었다 —
 * 좌우 인셋(40/40/32)과 최대 폭(1600/1600/**1400**)까지 셋이 달랐고, 같은 1600 이
 * CSS 토큰(`--page-max`)과 JS 상수(`PAGE_MAX_WIDTH`) **두 곳에** 적혀 있었다.
 *
 * ## 왜 e2e 만으로는 부족한가
 *
 * `page-frame.spec.ts` 는 **셋이 서로 같은지**를 실측한다. 그래서 한 화면이 틀을
 * 벗어나면 잡지만(프로브 확인: 스킬만 20px 로 되돌리니 빨강), **공유 값을 통째로
 * 바꾸면 셋이 여전히 같으므로 통과한다**(프로브 확인: 48→32 로 바꿔도 초록).
 *
 * 그 구멍을 여기서 막는다 — 규격 문자열 자체를 장부로 못박는다. 값은 자유롭게
 * 바꿀 수 있고 대신 **이 파일도 같이 고쳐야 해서 그 판단이 diff 에 남는다**
 * (지도 패널 잉크 장부가 쓰는 방식과 같다).
 */

const REPO_ROOT = join(import.meta.dirname, "..", "..");

/** 이 틀을 입는 화면 — 「셸 스크롤 슬롯의 `mx-auto` 문서 컬럼 + `h1` 이 첫 내용」. */
/**
 * 폼·편집 컬럼을 쓰는 화면 (2026-08-11) — 목록형과 **상단 여백이 같고 폭만 좁다**.
 */
const FORM_MEMBERS = ["src/views/project-editor/ui/ProjectEditorPage.tsx"] as const;

/** 가로 인셋을 자기가 소유해야 하는(safe-area) 화면 — 상단 여백만 규격을 쓴다. */
const TOP_PAD_MEMBERS = ["src/views/project-detail/ui/ProjectDetailPage.tsx"] as const;

const MEMBERS = [
  "src/views/project-selector/ui/ProjectSelectorPage.tsx",
  "src/views/ontology-insights/ui/OntologyInsightsPage.tsx",
  "src/views/agent-skills/ui/AgentSkillsPage.tsx",
] as const;

const read = (relative: string) => readFileSync(join(REPO_ROOT, relative), "utf8");

describe("페이지 틀 규격", () => {
  it("값이 장부와 같다 — 바꾸려면 이 줄도 같이 고쳐라", () => {
    expect(PAGE_FRAME).toBe("mx-auto w-full max-w-[var(--page-max)] px-5 pt-6 md:px-10 md:pt-12");
    expect(PAGE_HEADER_ROW).toBe("flex flex-wrap items-start justify-between gap-x-4 gap-y-2");
    expect(PAGE_TITLE_ROW).toBe("flex flex-wrap items-baseline gap-x-3 gap-y-1");
  });

  it("최대 폭은 실재하는 토큰을 가리킨다 — 두 곳에 적지 않는다", () => {
    expect(PAGE_FRAME).toContain("max-w-[var(--page-max)]");
    const css = read("app/globals.css");
    expect(css, "`--page-max` 가 정의돼 있지 않다 — 틀이 없는 값을 가리킨다").toMatch(
      /--page-max:\s*\S+/,
    );
  });

  /**
   * **제목의 y 는 오른쪽 컨트롤에 밀리면 안 된다.**
   *
   * 처음 규격은 헤더 전체가 `items-end` 였다. 그러면 그 줄에서 가장 큰 것이
   * 제목의 y 를 정한다 — 실측 1280px: 프로젝트 56(버튼 36) / 인사이트 48(버튼 없음)
   * / 스킬 52(버튼 32). 같은 틀을 입혔는데 셋이 달랐던 진짜 이유가 그것이었다.
   */
  it("헤더는 위를 맞추고, 바닥선 정렬은 제목 블록 안으로 내린다", () => {
    expect(PAGE_HEADER_ROW).toContain("items-start");
    expect(PAGE_HEADER_ROW).not.toContain("items-end");
    expect(PAGE_TITLE_ROW).toContain("items-baseline");
  });

  it("멤버 세 화면이 전부 이 틀을 입는다", () => {
    expect(MEMBERS.length, "멤버가 비면 이 시험 전체가 공회전한다").toBeGreaterThan(2);
    for (const member of MEMBERS) {
      const source = read(member);
      expect(source, `${member} 가 PAGE_FRAME 을 안 쓴다`).toContain("PAGE_FRAME");
      expect(source, `${member} 가 PAGE_HEADER_ROW 를 안 쓴다`).toContain("PAGE_HEADER_ROW");
      expect(source, `${member} 가 PAGE_TITLE_ROW 를 안 쓴다`).toContain("PAGE_TITLE_ROW");
    }
  });

  /**
   * 지역 폭 상수가 다시 생기는 것을 막는다 — 이 결함의 시작이 그것이었다
   * (`PAGE_MAX_WIDTH = 1600` 이 `--page-max` 와 나란히 살아 있었다).
   */
  it("멤버 안에 폭을 다시 정하는 값이 없다", () => {
    for (const member of MEMBERS) {
      const source = read(member);
      expect(source, `${member} 에 지역 폭 상수가 있다`).not.toMatch(/PAGE_MAX_WIDTH/);
      // ⚠️ `max-w-[720px]` 같은 **글 폭**은 정당하다 — 프로젝트 설명 문단이 그렇다.
      // 막으려는 것은 **페이지 컬럼을 손으로 다시 만드는 것**이므로, `mx-auto` 와
      // 리터럴 최대 폭이 **같은 클래스 문자열에** 있을 때만 잡는다. 넓게 잡으면
      // 멀쩡한 글 폭이 걸리고, 그러면 다음 사람은 게이트 쪽을 지운다.
      const columnLike = [...source.matchAll(/className=\{?["`][^"`]*["`]/g)]
        .map((hit) => hit[0])
        .filter((chunk) => chunk.includes("mx-auto") && /max-w-\[\d+px\]/.test(chunk));
      expect(columnLike, `${member} 가 페이지 컬럼을 손으로 다시 만들었다`).toEqual([]);
    }
  });
});

describe("페이지 틀 — 둘째 컬럼과 상단 여백 (2026-08-11)", () => {
  /**
   * ⚠️ **이 성질이 이 확장의 전부다.** 폼 화면에 1600 을 씌우는 것은 답이 아니었다
   * (입력 줄이 늘어나면 읽기도 채우기도 나빠진다). 그래서 폭은 갈라 두고 **상단
   * 여백만 같게** 묶는다 — 라우트를 오가며 제목이 세로로 뛰는 것이 애초에 이 규격을
   * 만든 이유이고, 폭이 다르다고 제목 높이가 달라질 이유는 없다.
   */
  it("세 상수의 상단 여백이 같다 — 폭이 달라도 제목 y 는 같다", () => {
    const topPad = (spec: string) => spec.match(/\bpt-\S+|\bmd:pt-\S+/g)?.sort().join(" ") ?? "";
    expect(topPad(PAGE_FRAME)).toBe(topPad(PAGE_FRAME_FORM));
    expect(topPad(PAGE_FRAME)).toBe(topPad(`x ${PAGE_TOP_PAD}`));
    expect(topPad(PAGE_FRAME), "상단 여백을 못 읽었다 — 이 시험이 공회전한다").not.toBe("");
  });

  it("폼 컬럼은 좁고, 폭을 한 곳에서만 정한다", () => {
    expect(PAGE_FRAME_FORM).toContain("max-w-[960px]");
    expect(PAGE_FRAME_FORM).not.toContain("--page-max");
    for (const member of FORM_MEMBERS) {
      const source = read(member);
      expect(source, `${member} 가 PAGE_FRAME_FORM 을 안 쓴다`).toContain("PAGE_FRAME_FORM");
      expect(source, `${member} 가 폭을 다시 적었다`).not.toMatch(/max-w-\[9[0-9]{2}px\]/);
    }
  });

  it("safe-area 화면도 상단은 규격을 따른다 — 여기만 8px 아래였다", () => {
    expect(TOP_PAD_MEMBERS.length, "멤버가 비면 공회전이다").toBeGreaterThan(0);
    for (const member of TOP_PAD_MEMBERS) {
      const source = read(member).replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");
      expect(source, `${member} 가 아직 md:pt-14 다 — 제목이 8px 아래 있다`).not.toMatch(/md:pt-14\b/);
      expect(source, `${member} 의 md 상단이 규격(48px)이 아니다`).toMatch(/md:pt-12\b/);
    }
  });
});
