import { readFileSync } from "node:fs";
import { join } from "node:path";

import { describe, expect, it } from "vitest";

/**
 * **한 노드에 등장 램프는 하나다.**
 *
 * 배경(2026-07-31 실측): 칩 펼침으로 드러난 자식의 그려지는 알파가 **두 지수의
 * 곱**이었다 — 티어 관통 채널(`expandRevealById`)이 `effectiveAlphaById` 를 통해
 * `tierAlpha` 에 들어가고, 그룹 페이드(`nearestExpandedRevealMul`)가 `revealMul`
 * 로 또 곱해졌다.
 *
 * | 시점 | 칩(단일 램프) | 자식(곱) |
 * |---|---|---|
 * | 200ms | 69.2% | 41.4% |
 * | 320ms | 84.8% | 65.0% |
 * | 90% 도달 | 391ms | **621ms** |
 *
 * 칩이 "펼쳐졌다"고 말한 뒤 **230ms** 동안 자식이 아직 오는 중이었다 —
 * `design.md` 의 *"한 입력 = 한 사건 … 시작 시점 차가 120ms 를 넘으면 두
 * 사건으로 읽혀 결함"* 을 넘는다.
 *
 * **왜 이게 반복되는 실패인가**: 드로우에 이미 `batchAppear` 에 대한 "이중 페이드
 * 방지" 가드가 있었고 주석까지 달려 있었다. 다섯째 채널이 **나중에** 붙느라 그
 * 가드에 안 들어갔을 뿐이다. 여섯째가 붙으면 같은 일이 또 난다 — 그래서 재는
 * 것은 "오늘 곱이 아니다"가 아니라 **"곱을 만드는 경로가 구조적으로 막혀 있다"**
 * 다.
 *
 * ⚠️ 프레임 실측(실제 화면의 알파 곡선)은 design-motion 의 `/motion-verify`
 * 몫이다 — 녹화 없는 판정은 무효다. 이 테스트는 그 판정이 성립할 **구조 전제**만
 * 잠근다.
 */

const DRAW = join(process.cwd(), "src/widgets/topology-map-v2/ui/topology-frame-draw.ts");
const LOOP = join(process.cwd(), "src/widgets/topology-map-v2/ui/use-topology-loop.ts");

function read(path: string): string {
  return readFileSync(path, "utf8");
}

describe("등장 램프는 노드당 하나다", () => {
  it("소스를 실제로 읽는다 — 빈 스캔은 통과가 아니라 결함이다", () => {
    expect(read(DRAW).length).toBeGreaterThan(1000);
    expect(read(LOOP).length).toBeGreaterThan(1000);
  });

  it("`revealMul` 의 모든 갈래가 그룹 페이드를 **대체**한다 — 곱이 아니다", () => {
    const src = read(DRAW);
    const start = src.indexOf("const revealMul =");
    expect(start, "`revealMul` 계산을 못 찾았다 — 이름이 바뀌었으면 이 테스트도 갱신한다").toBeGreaterThan(0);
    const expr = src.slice(start, src.indexOf(";", start));

    // 삼항 사슬이어야 한다. `nearestExpandedRevealMul` 은 **마지막 fallback
    // 한 번만** 등장해야 하고, 곱셈(`*`)으로 다른 램프와 결합돼선 안 된다.
    const groupFadeUses = expr.split("nearestExpandedRevealMul").length - 1;
    expect(groupFadeUses, `그룹 페이드가 ${groupFadeUses}회 등장 — fallback 한 번이어야 한다`).toBe(1);
    expect(expr.includes("*"), "`revealMul` 안에 곱셈이 있다 — 램프를 곱하면 이중 페이드다").toBe(false);
  });

  it("**티어 관통 채널은 전부 `revealMul` 에서 대체 갈래를 갖는다**", () => {
    // 이 목록이 곧 사정거리다. 새 관통 채널을 만들면 여기에도 넣고, 그때
    // `revealMul` 에 대체 갈래가 있는지 이 테스트가 묻는다.
    const src = read(DRAW);
    const start = src.indexOf("const revealMul =");
    const expr = src.slice(start, src.indexOf(";", start));
    for (const channel of ["batchAppear", "chipExpandReveal"]) {
      expect(expr.includes(channel), `${channel} 이 revealMul 의 갈래에 없다 — 그룹 페이드와 곱해진다`).toBe(true);
    }
  });

  it("**칩 클릭이 실제로 타는 경로**(배치-공개)가 칩과 같은 tau 다", () => {
    // ⚠️ 이 테스트가 이 파일에서 가장 중요하다. 앞의 것들은 `revealMul` 표현식의
    // **모양**을 잠그는데, 프레임 실측(design-motion, 2026-07-31)이 그 모양이
    // 맞는 채로 화면은 구 동작이라는 것을 잡았다:
    //
    //   `revealMul` 삼항은 `batchAppear` 를 **먼저** 보고, 칩 클릭 자식은
    //   **전원** 그 배치 경로에 등록된다(`hidden.length===0` 이어도
    //   `visibleOrdered` 전량). 그래서 다섯째 채널의 갈래는 칩 클릭에서 한 번도
    //   안 탄다 — 표현식을 고쳐도 화면이 안 바뀐다.
    //
    // 그러니 재야 하는 것은 "갈래가 있는가"가 아니라 **"실제로 타는 갈래가 어느
    // tau 를 쓰는가"** 다. 배치-공개 스텝이 ego 의 tau 로 돌아가면 여기서 터진다.
    const src = read(LOOP);
    const anchor = src.indexOf("const appearMap = batchAppearRef.current;");
    expect(anchor, "배치-공개 스텝을 못 찾았다 — 이름이 바뀌었으면 이 테스트도 갱신한다").toBeGreaterThan(0);
    // 그 블록 안의 첫 `stepEmphasis` 호출까지만 본다.
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
    // 칩의 pill/badge 페이드와, 그 칩이 드러낸 자식의 램프는 같은 클릭이 낳는다.
    // 서로 다른 tau 를 쓰면 칩이 먼저 끝나고 자식이 뒤따라와 두 사건으로 읽힌다.
    const src = read(LOOP);
    // 정규식으로 `stepEmphasis(…)` 호출을 통째로 잡으려 하지 않는다 — 인자가
    // 여러 줄이고 `revealMap.get(id) ?? 0` 처럼 괄호가 중첩돼 균형을 못 맞춘다.
    // 세는 것은 참조 횟수로 충분하다: 램프 스텝 둘이 이 토큰을 읽어야 한다.
    const uses = src.split("tokens.clusterRevealTau").length - 1;
    expect(
      uses,
      "clusterRevealTau 참조가 둘 이상이어야 한다 — 칩 형태(chipRevealRef)와 그 자식(expandRevealRef)이 rise/decay 로 읽는다",
    ).toBeGreaterThanOrEqual(2);

    // 자식 램프가 ego 의 tau 를 다시 빌려 가지 않았는지 — 그건 다른 사건의 리듬이다.
    const expandBlock = src.slice(src.indexOf("const revealMap = expandRevealRef.current;"));
    const stepCall = expandBlock.slice(0, expandBlock.indexOf(";", expandBlock.indexOf("stepEmphasis(")));
    expect(
      stepCall.includes("egoRevealRiseTau"),
      "자식 램프가 egoRevealRiseTau 로 돌아갔다 — ego 클릭은 다른 사건이다",
    ).toBe(false);
  });
});
