import { describe, expect, it } from "vitest";
import koMessages from "../../../../messages/ko.json";
import enMessages from "../../../../messages/en.json";

// 빌더 소형 UX 큐 #1 — 빈 캔버스 첫 진입 안내가 "왼쪽에서 종류를 고르세요"
// 같은 조작 지시뿐이라 이 화면이 *무엇을 위한 캔버스인지*(개념 카드를
// 만들고 연결하는 곳) 는 안 알려줬다. 카피가 캔버스 성격을 먼저 설명하고
// 조작 지시로 이어지는지를 잠금(회귀 방지) — 정확한 문구가 아니라 "카드"
// 개념 프레이밍이 남아있는지만 검사해 향후 문구 다듬기는 자유롭게 둔다.
describe("OntologyEditCanvas emptyHint copy — 캔버스 성격 프레이밍", () => {
  it("ko: 카드를 만들고 연결하는 캔버스라는 성격을 설명한다", () => {
    const hint = koMessages.ontologyPages.edit.canvas.emptyHint;
    expect(hint).toContain("카드");
    expect(hint).toContain("연결");
  });

  it("en: describes the canvas as a place to create and connect concept cards", () => {
    const hint = enMessages.ontologyPages.edit.canvas.emptyHint;
    expect(hint.toLowerCase()).toContain("card");
    expect(hint.toLowerCase()).toContain("connect");
  });
});
