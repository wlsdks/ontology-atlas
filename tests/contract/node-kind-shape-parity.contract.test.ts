import { createElement } from "react";
import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { bodyPoints } from "@/widgets/topology-map-v2/render/node-shapes";
import { TopologyV2KindGlyph } from "@/shared/ui/topology-v2-kind-glyph";

/**
 * kind → 실루엣 매핑이 두 렌더 게이트웨이(캔버스 · DOM)에서 같은지 검증한다.
 *
 * ## 왜 계약 테스트인가
 *
 * `docs/DESIGN-SYSTEM.md` "노드 규격" 절은 "project=hex · domain=사각 ·
 * capability=원 · element=사각+via-hole" 을 **불변 규칙(하드)** 이라 적고,
 * 두 게이트웨이 — `render/node-shapes.ts`(캔버스) 와
 * `shared/ui/topology-v2-kind-glyph.tsx`(DOM) — 가 그 규칙을 "각자" 지킨다.
 * 그런데 각 파일의 자체 단위 테스트(`node-shapes.test.ts`,
 * `topology-v2-kind-glyph.test.tsx`)는 **자기 파일 안에서만** 일관성을
 * 본다 — 한쪽이 kind 매핑을 바꿔도 다른 쪽 테스트는 그 사실을 모른다.
 * lint 는 한 파일의 AST 셀렉터만 보므로 이 어긋남을 원리적으로 못 잡는다
 * (`.claude/rules/design.md` "규격은 lint 로 강제된다" 절의 분류 기준 —
 * 판정에 다른 파일의 값이 필요하면 계약 테스트).
 *
 * `.test.ts`(JSX 없이 `createElement`) 인 이유: `tests/contract/**` 의
 * vitest `include` 글롭이 `.test.ts` 만 잡고 `.tsx` 를 안 잡는다
 * (`vitest.config.ts`) — 이 한 파일 때문에 공유 글롭을 넓히는 대신 JSX 를
 * 피해 기존 계약을 그대로 둔다.
 *
 * 켜기 전 실측(2026-08-01): 이 파일을 만들기 전에는 두 게이트웨이의 매핑
 * 일치를 붙드는 테스트가 0개였다 — 우연히 일치하고 있었을 뿐, 계약이
 * 아니었다.
 */

type ShapeFamily = "hex6" | "rect4" | "circle";

const KINDS = ["project", "domain", "capability", "element"] as const;

/** 캔버스 게이트웨이 — `bodyPoints` 의 반환 형태로 실루엣 분류. */
function canvasShapeFamily(kind: (typeof KINDS)[number]): ShapeFamily {
  const points = bodyPoints(kind, 0, 0, 10);
  if (points === null) return "circle";
  if (points.length === 6) return "hex6";
  if (points.length === 4) return "rect4";
  throw new Error(`unexpected point count ${points.length} for kind=${kind}`);
}

/** DOM 게이트웨이 — 렌더된 실루엣 SVG 태그로 분류 (element 는 <rect> 바디 + via-hole <circle>). */
function domShapeFamily(kind: (typeof KINDS)[number]): ShapeFamily {
  const { container, unmount } = render(createElement(TopologyV2KindGlyph, { kind }));
  const svg = container.querySelector("svg")!;
  const tag = svg.querySelector("polygon, rect, circle")?.tagName.toLowerCase();
  unmount();
  if (tag === "polygon") return "hex6";
  if (tag === "rect") return "rect4";
  if (tag === "circle") return "circle";
  throw new Error(`no recognizable silhouette tag for kind=${kind}`);
}

describe("kind → 실루엣 매핑 — 캔버스 게이트웨이와 DOM 게이트웨이의 parity", () => {
  it.each(KINDS)("%s 는 두 게이트웨이에서 같은 도형 계열을 그린다", (kind) => {
    expect(domShapeFamily(kind)).toBe(canvasShapeFamily(kind));
  });

  it("project=hex · domain/element=사각 · capability=원 — 문서화된 불변 규칙 그대로", () => {
    expect(canvasShapeFamily("project")).toBe("hex6");
    expect(canvasShapeFamily("domain")).toBe("rect4");
    expect(canvasShapeFamily("capability")).toBe("circle");
    expect(canvasShapeFamily("element")).toBe("rect4");
  });
});
