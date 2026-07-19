import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";
import { fileURLToPath } from "node:url";
import { dirname, join } from "node:path";

const here = dirname(fileURLToPath(import.meta.url));
const source = readFileSync(join(here, "OntologyEditCanvas.tsx"), "utf8");

// persona QA (fix/persona-findings ①): "캔버스 ghost 노드 단일/더블클릭
// 무반응" 신고 — ReactFlow 는 노드 더블클릭을 별도 처리하지 않고, 이
// 컴포넌트는 이전엔 onNodeClick 만 연결해 더블클릭 전용 계약이 코드에
// 없었다. 단일 클릭과 동일하게 onNodeOpen 을 호출하는 명시적 핸들러를
// 추가해 회귀를 막는다 (ReactFlow 는 dynamic import 로 마운트되어 RTL
// 렌더 대신 소스 계약을 문자열로 검증하는 이 파일의 기존 패턴을 따른다,
// c.f. OntologyEditCanvas.edge-layer.test.ts).
describe("OntologyEditCanvas node-open wiring", () => {
  it("연결된 onNodeClick 이 onNodeOpen 을 호출한다", () => {
    expect(source).toContain("onNodeClick={(_, node) => onNodeOpen?.(node.id)}");
  });

  it("더블클릭도 명시적으로 같은 onNodeOpen 을 호출한다", () => {
    expect(source).toContain("onNodeDoubleClick={(_, node) => onNodeOpen?.(node.id)}");
  });

  it("더블클릭이 캔버스 확대(zoomOnDoubleClick)와 충돌하지 않는다", () => {
    // zoomOnDoubleClick=false 가 없으면 pane 확대와 상세 열기가 동시에
    // 발동해 사용자가 "아무 반응 없다"고 느낄 수 있다 (뷰가 확대되며
    // 다이얼로그 위치가 어긋나 보이는 혼란).
    expect(source).toContain("zoomOnDoubleClick={false}");
  });
});
