import { existsSync, readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

// 게이트 스크립트와 **같은 모듈**을 부른다. 사본을 만들면 계약이 검사하는
// 대상이 게이트가 아니라 사본이 된다.
import {
  censusFor,
  diffCensus,
  parseTriggerFiles,
  SPEC_RULE_DOC,
  SPEC_RULE_SECTION,
} from "../../scripts/lib/design-spec-census.mjs";

/**
 * 「규격을 바꾸려면 「체계」를 부른다」를 **문서에만 있는 규칙**으로 되돌리지
 * 않기 위한 계약.
 *
 * ## 배경 (2026-08-03 규칙 감사 실측)
 *
 * `docs/DESIGN-SYSTEM.md` 의 「시스템을 늘리는 규칙」 3번과 그 트리거 목록
 * (`.claude/rules/design.md`)은 존재했지만 **강제가 없었다.** 값 층 램프를
 * 넓힌 최근 커밋 다섯 중 자기 원장 기록이 있는 것은 하나뿐이었고,
 * `pnpm decisions:check` 는 라우트와 MCP/CLI 계약만 봐서 규격 변경은 그냥
 * 통과했다.
 *
 * 이 계약이 지키는 것은 넷이다:
 *
 * 1. 트리거 목록이 **정본 문서 한 곳**에만 있고, 게이트가 그것을 읽는다
 * 2. 목록의 모든 경로가 **실재한다** — 없는 파일을 가리키는 목록은 조용히
 *    사라진 규칙이다(이 저장소는 글롭이 0개를 매칭해 규칙이 증발한 전례가 있다)
 * 3. 탐지기가 **빈 집합 위에서 놀지 않는다** — 각 트리거 파일이 오늘 실제로
 *    규격 항목을 갖는다
 * 4. **오탐을 억제한다** — 주석·공백만 바뀐 diff 는 규격 변경이 아니다
 */

const TRIGGER_SECTION_DOC = SPEC_RULE_DOC as string;

function readDoc() {
  return readFileSync(TRIGGER_SECTION_DOC, "utf8");
}

describe("디자인 규격 → 원장 게이트", () => {
  it("트리거 목록은 정본 문서에서 유도된다 (코드에 복제본이 없다)", () => {
    const gate = readFileSync("scripts/check-decision-record.mjs", "utf8");
    expect(gate).toContain("design-spec-census.mjs");
    expect(gate).toContain("parseTriggerFiles");
    // 게이트가 자기 목록을 들고 있으면 두 벌이 되고, 어긋나는 쪽이 기본값이 된다.
    for (const path of parseTriggerFiles(readDoc()) as string[]) {
      expect(
        gate.includes(`"${path}"`) || gate.includes(`'${path}'`),
        `${path} 가 게이트 스크립트에 하드코딩돼 있다 — 목록은 ${TRIGGER_SECTION_DOC} 한 곳에만.`,
      ).toBe(false);
    }
  });

  it("목록의 모든 경로가 실재한다", () => {
    const files = parseTriggerFiles(readDoc()) as string[];
    expect(files.length).toBeGreaterThan(0);
    for (const path of files) {
      expect(existsSync(path), `${TRIGGER_SECTION_DOC} 가 없는 파일을 가리킨다: ${path}`).toBe(
        true,
      );
    }
  });

  it("각 트리거 파일이 오늘 실제로 규격 항목을 낸다 (탐지기가 공회전하지 않는다)", () => {
    for (const path of parseTriggerFiles(readDoc()) as string[]) {
      const census = censusFor(path, readFileSync(path, "utf8")) as Map<string, string>;
      expect(
        census.size,
        `${path} 의 센서스가 비었다 — 파일이 옮겨졌거나 추출 규칙이 낡았다. ` +
          `빈 센서스는 «아무것도 안 잡는 게이트» 와 구별되지 않는다.`,
      ).toBeGreaterThan(0);
    }
  });

  it("절 제목이 살아 있다 (파서가 조용히 빈손이 되지 않는다)", () => {
    expect(readDoc()).toContain(SPEC_RULE_SECTION as string);
  });

  describe("무엇을 규격 변경으로 보는가", () => {
    const css = "app/globals.css";
    const control = "src/shared/ui/control-class.ts";

    it("램프 토큰의 추가·삭제·값 변경을 잡는다", () => {
      const before = censusFor(css, ":root { --text-body: 12.5px; --radius-chip: 6px; }");
      const added = censusFor(
        css,
        ":root { --text-body: 12.5px; --radius-chip: 6px; --text-mega: 40px; }",
      );
      const changed = censusFor(css, ":root { --text-body: 13px; --radius-chip: 6px; }");
      const removed = censusFor(css, ":root { --text-body: 12.5px; }");

      expect(diffCensus(before, added)).toHaveLength(1);
      expect(diffCensus(before, changed)).toHaveLength(1);
      expect(diffCensus(before, removed)).toHaveLength(1);
    });

    it("주석·공백·선언 순서만 바뀐 CSS 는 규격 변경이 아니다", () => {
      const before = censusFor(css, ":root { --text-body: 12.5px; --radius-chip: 6px; }");
      const after = censusFor(
        css,
        ":root {\n  /* 기본 본문 — 설명을 고쳤다 */\n  --radius-chip:   6px;\n  --text-body: 12.5px;\n}",
      );
      expect(diffCensus(before, after)).toEqual([]);
    });

    it("표면 전용 색 토큰은 램프가 아니다 (오탐 억제)", () => {
      const before = censusFor(css, ":root { --color-indigo-a08: rgba(1,2,3,0.08); }");
      const after = censusFor(css, ":root { --color-indigo-a08: rgba(1,2,3,0.09); }");
      expect(before.size).toBe(0);
      expect(diffCensus(before, after)).toEqual([]);
    });

    it("팔레트의 뿌리가 움직이면 규격 변경이다", () => {
      const before = censusFor(css, ":root { --color-indigo-brand: #5e6ad2; }");
      const after = censusFor(css, ":root { --color-indigo-brand: #6070e0; }");
      expect(diffCensus(before, after)).toHaveLength(1);
    });

    it("cva 축·선택지·기본값의 증감을 잡는다", () => {
      const base = `const c = cva('', { variants: { shape: { chip: 'a', icon: 'b' } }, defaultVariants: { shape: 'chip' } });`;
      const newOption = `const c = cva('', { variants: { shape: { chip: 'a', icon: 'b', tile: 'c' } }, defaultVariants: { shape: 'chip' } });`;
      const newAxis = `const c = cva('', { variants: { shape: { chip: 'a', icon: 'b' }, scope: { app: '', panel: '' } }, defaultVariants: { shape: 'chip' } });`;
      const newDefault = `const c = cva('', { variants: { shape: { chip: 'a', icon: 'b' } }, defaultVariants: { shape: 'icon' } });`;

      expect(diffCensus(censusFor(control, base), censusFor(control, newOption))).toHaveLength(1);
      expect(diffCensus(censusFor(control, base), censusFor(control, newAxis))).toHaveLength(1);
      expect(diffCensus(censusFor(control, base), censusFor(control, newDefault))).toHaveLength(1);
    });

    it("선택지가 내는 클래스 문자열만 바뀐 것은 규격 변경이 아니다", () => {
      const before = `const c = cva('', { variants: { shape: { chip: 'gap-1.5 rounded-chip' } } });`;
      const after = `const c = cva('', { variants: { shape: { chip: 'gap-2 rounded-chip' } } });`;
      expect(diffCensus(censusFor(control, before), censusFor(control, after))).toEqual([]);
    });

    it("주석 안의 예시 코드를 규격으로 세지 않는다 (TS 파서를 쓰는 이유)", () => {
      const withComment = `/** 예: variants: { ghost: { on: 'x' } } — 쓰지 말 것 */\nconst c = cva('', { variants: { shape: { chip: 'a' } } });`;
      const census = censusFor(control, withComment) as Map<string, string>;
      expect([...census.keys()]).toEqual(["axis shape"]);
    });
  });
});
