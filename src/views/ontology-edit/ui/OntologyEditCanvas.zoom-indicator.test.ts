import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "OntologyEditCanvas.tsx"), "utf8");

// 빌더 소형 UX 큐 #3 — 캔버스 줌 레벨을 알 방법이 없었다(마우스 휠로
// 확대/축소는 되지만 현재 몇 %인지 표시가 0). ReactFlow 는 dynamic import 로
// 마운트되어 RTL 렌더 대신 소스 계약을 문자열로 검증하는 이 디렉터리의 기존
// 패턴을 따른다 (c.f. OntologyEditCanvas.node-open.test.ts).
describe("OntologyEditCanvas zoom indicator", () => {
  it("useViewport 로 실시간 줌 값을 구독한다", () => {
    expect(source).toContain("useViewport");
    expect(source).toContain("const { zoom } = useViewport();");
  });

  it("줌 값을 % 정수로 반올림해 표시한다", () => {
    expect(source).toContain("Math.round(zoom * 100)");
  });

  it("헤더 census 와 같은 각인 모노 토큰(--engraved-numeral-*)을 재사용한다", () => {
    expect(source).toContain('data-token="engraved-numeral"');
    expect(source).toContain("var(--engraved-numeral-face)");
    expect(source).toContain("var(--engraved-numeral-text-shadow)");
  });

  it("MiniMap · trace 범례(우하단)와 겹치지 않게 반대편(좌하단)에 둔다", () => {
    expect(source).toContain("bottom-3 left-3");
  });

  it("<ReactFlow> 트리 안에 마운트되어 있다 (useViewport 는 provider 컨텍스트 필요)", () => {
    const reactFlowOpenIdx = source.indexOf("<ReactFlow");
    const reactFlowCloseIdx = source.indexOf("</ReactFlow>");
    const indicatorIdx = source.indexOf("<ZoomLevelIndicator />");
    expect(reactFlowOpenIdx).toBeGreaterThan(-1);
    expect(indicatorIdx).toBeGreaterThan(reactFlowOpenIdx);
    expect(indicatorIdx).toBeLessThan(reactFlowCloseIdx);
  });
});
