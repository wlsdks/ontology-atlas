import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * One node gets one reveal ramp: the child alpha must not be the product of two exponentials.
 * This locks the structural premise; frame measurement belongs to `/ui-proof`.
 */

const DRAW = join(process.cwd(), "src/widgets/ontology-map/ui/frame-draw/paint-nodes.ts");
const REVEAL = join(process.cwd(), "src/widgets/ontology-map/ui/frame-loop/topology-reveal-frame-stage.ts");
const SCHEDULER = join(process.cwd(), "src/widgets/ontology-map/ui/frame-loop/use-topology-frame-loop.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("등장 램프는 노드당 하나다", () => {
  it("소스를 실제로 읽는다 — 빈 스캔은 통과가 아니라 결함이다", () => {
    expect(read(DRAW).length).toBeGreaterThan(1000);
    expect(read(REVEAL).length).toBeGreaterThan(1000);
    expect(read(SCHEDULER)).toContain("createRevealFrameStage(configuration.revealFrameStage)");
    expect(read(SCHEDULER)).toMatch(/runRevealFrameStage\(\s*now,\s*dt,/);
  });

  it("`revealMul` 의 모든 갈래가 그룹 페이드를 **대체**한다 — 곱이 아니다", () => {
    const src = read(DRAW);
    const start = src.indexOf("const revealMul =");
    expect(start, "`revealMul` 계산을 못 찾았다 — 이름이 바뀌었으면 이 테스트도 갱신한다").toBeGreaterThan(0);
    const expr = src.slice(start, src.indexOf(";", start));

    // It must be a ternary chain. `nearestExpandedRevealMul` may appear **only once,
    // as the final fallback**, and must never be combined with another ramp by
    // multiplication (`*`).
    const groupFadeUses = expr.split("nearestExpandedRevealMul").length - 1;
    expect(groupFadeUses, `그룹 페이드가 ${groupFadeUses}회 등장 — fallback 한 번이어야 한다`).toBe(1);
    expect(expr.includes("*"), "`revealMul` 안에 곱셈이 있다 — 램프를 곱하면 이중 페이드다").toBe(false);
  });

  it("**티어 관통 채널은 전부 `revealMul` 에서 대체 갈래를 갖는다**", () => {
    // This list is the reach. A new piercing channel goes in here too, and this test
    // then asks whether `revealMul` has an alternative branch for it.
    const src = read(DRAW);
    const start = src.indexOf("const revealMul =");
    const expr = src.slice(start, src.indexOf(";", start));
    for (const channel of ["batchAppear", "chipExpandReveal"]) {
      expect(expr.includes(channel), `${channel} 이 revealMul 의 갈래에 없다 — 그룹 페이드와 곱해진다`).toBe(true);
    }
  });

  it("**칩 클릭이 실제로 타는 경로**(배치-공개)가 칩과 같은 tau 다", () => {
    // Every child of a chip click is registered on the batch path, and the `revealMul` ternary checks
    // `batchAppear` first. So what is measured is which tau the branch actually taken uses.
    const src = read(REVEAL);
    const anchor = src.indexOf("const appearMap = batchAppearRef.current;");
    expect(anchor, "배치-공개 스텝을 못 찾았다 — 이름이 바뀌었으면 이 테스트도 갱신한다").toBeGreaterThan(0);
    // Only the first `stepEmphasis` call inside that block is inspected.
    const block = src.slice(anchor, anchor + 2500);
    const call = block.slice(block.indexOf("stepEmphasis("));
    const args = call.slice(0, call.indexOf("\n", call.indexOf("stepEmphasis(")) + 1);
    expect(
      args.includes("clusterRevealTau"),
      "배치-공개 램프가 clusterRevealTau 를 안 쓴다 — 칩과 다른 리듬으로 오른다",
    ).toBe(true);
    expect(
      args.includes("egoRevealRiseTau"),
      "배치-공개 램프가 ego 클릭의 tau 로 돌아갔다 — 다른 사건의 리듬이다",
    ).toBe(false);
  });

  it("칩과 그 자식이 **같은 tau** 로 움직인다 — 한 입력, 한 사건", () => {
    // The chip's pill/badge fade and the ramp of the children it reveals are born of
    // the same click. Different taus make the chip finish first with children
    // trailing, which reads as two events.
    const src = read(REVEAL);
    // No attempt is made to capture a whole `stepEmphasis(…)` call by regex — the
    // arguments span lines and nest parentheses such as `revealMap.get(id) ?? 0`, so
    // they cannot be balanced. Counting references is enough: two ramp steps must read
    // this token.
    const uses = src.split("tokens.clusterRevealTau").length - 1;
    expect(
      uses,
      "clusterRevealTau 참조가 둘 이상이어야 한다 — 칩 형태(chipRevealRef)와 그 자식(expandRevealRef)이 rise/decay 로 읽는다",
    ).toBeGreaterThanOrEqual(2);

    // Check the child ramp has not borrowed ego's tau again — that is another event's rhythm.
    const expandBlock = src.slice(src.indexOf("const revealMap = expandRevealRef.current;"));
    const stepCall = expandBlock.slice(0, expandBlock.indexOf(";", expandBlock.indexOf("stepEmphasis(")));
    expect(
      stepCall.includes("egoRevealRiseTau"),
      "자식 램프가 egoRevealRiseTau 로 돌아갔다 — ego 클릭은 다른 사건이다",
    ).toBe(false);
  });
});
