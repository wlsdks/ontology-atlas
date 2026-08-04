import { readFileSync } from "node:fs";
import { describe, expect, it } from "vitest";

/**
 * 같은 개념은 한 이름으로 산다 (2026-08-02, 디자인 카운슬 S3 · 체계석).
 *
 * ## 무엇이 있었나
 *
 * 「연결 3단계」의 번호 배지 + 제목 + 설명 문법이 두 벌 있었다:
 * 지도 시트의 `StepRow`(보더 없음)와 설정 패널의 `StepCard`(카드 크롬 있음).
 * **번호 원 배지 클래스는 두 컴포넌트가 바이트 동일**했고, 다른 것은 `StepCard`
 * 가 `rounded-md border … bg-[…] px-2.5 py-2.5` 를 한 겹 더 두른 것뿐이다.
 *
 * 그 한 겹이 설정 패널에서 **보더 4단 중첩**을 만들었다(실측):
 *
 * ```
 * app-settings-popover       1px rgba(255,255,255,0.06)  r12
 *  └ section (인디고 패널)    1px rgba(139,151,255,0.22)  r6
 *     └ agent-setup-step-N   1px rgba(255,255,255,0.06)  r6   ← 이 겹
 *        └ agent-client-…    1px rgba(139,151,255,0.54)  r6
 * ```
 *
 * ════════════════════════════════════════════════════════════════════
 * ## 2026-08-04 — 갈래가 **하나 늘었다.** 왜 이게 회귀가 아닌가
 * ════════════════════════════════════════════════════════════════════
 *
 * 소유자 지시로 설정 탭이 **단계 진행형**(한 번에 한 단계만 펼침)이 됐다.
 * `StepRow` 는 **항상 펼쳐진** 문법이고 그건 지도 시트에서 맞다 — 거기서는
 * 세 단계가 화면의 전부다. 설정에서는 그 셋 뒤에 검증·수리·명령이 더 붙어서
 * 같은 문법이면 617px 창에 **2,581px(4.18장)** 이 쌓인다(실측).
 *
 * 그래서 `AgentSetupStep`(접히는 변형)이 위젯 옆에 생겼다. 이것이 «두 이름»의
 * 재발이 아닌 이유는 **행동이 실제로 다르기 때문**이다 — `StepCard` 는 크롬 한
 * 겹만 다르고 행동이 같아서 결함이었다. 다만 셋째가 생기면 그때는 다시 그
 * 결함이므로, 이 게이트는 이제 **step 문법이 정확히 둘**임을 잠근다.
 *
 * ### 그리고 이 라운드의 진짜 규격: **번호는 한 벌이다**
 *
 * 소유자 지적 1번이 *"번호가 세 벌이다 — 어느 게 지금 할 일인지 모른다"* 였고,
 * 실측은 그보다 나빴다. 이 한 파일에 번호 배지가 **네 벌** 있었다:
 *
 * | 벌 | 무엇 | 개수 |
 * |---|---|---|
 * | 단계 | `StepRow n={1..3}` | 3 |
 * | 흐름 | 「설정 흐름 보기」 `{index + 1}` | 6 |
 * | 증거 | 「첫 연결 증거 계약」 `{index + 1}` | 4 |
 * | 명령 | CLI 미리보기 `{index + 1}` | 6 |
 *
 * 켜기 전 전수: `index + 1` **3자리** → 치환 후 **0자리**. 남은 번호는 단계
 * 셋뿐이고, 그 셋만이 「지금 몇 번째인가」를 말한다. lint 는 이걸 못 본다 —
 * 넷 다 정당한 JSX 이고 어떤 값 규칙도 안 어긴다.
 */

const PANEL = "src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx";
const SHEET = "src/widgets/agent-connect/ui/AgentConnectSheet.tsx";
const PROMOTED = "src/features/docs-vault-local/ui/StepRow.tsx";
const COLLAPSIBLE = "src/widgets/app-settings-menu/ui/AgentSetupStep.tsx";

const read = (path: string) => readFileSync(path, "utf8");

describe("StepCard 는 은퇴했다 — 3단계 문법은 두 벌이고 그 이상은 아니다", () => {
  it("the settings panel no longer declares its own step component", () => {
    const source = read(PANEL);
    expect(source).not.toMatch(/function\s+StepCard\b/);
    expect(source).not.toMatch(/<StepCard\b/);
    expect(source).not.toMatch(/function\s+StepRow\b/);
    expect(source).not.toMatch(/function\s+AgentSetupStep\b/);
  });

  it("the map sheet keeps the promoted StepRow", () => {
    const source = read(SHEET);
    expect(source, `${SHEET} 가 StepRow 를 다시 선언한다`).not.toMatch(
      /function\s+StepRow\b/,
    );
    expect(source, `${SHEET} 가 StepRow 를 import 하지 않는다`).toMatch(/StepRow,?\n/);
    expect(source).toMatch(/<StepRow\b/);
  });

  it("the settings panel uses the collapsible variant, and the variant is the only third file", () => {
    expect(read(PANEL)).toMatch(/<AgentSetupStep\b/);
    // 접히는 변형은 항상 펼쳐진 것을 **다시 선언하지 않는다** — 둘의 차이는
    // 행동(접힘)이지 문법이 아니다.
    expect(read(COLLAPSIBLE)).not.toMatch(/function\s+StepRow\b/);
    // 접힘의 모션은 **목록 행 펼침 문법**이다 (2026-08-04 저녁 개정 — 같은 날
    // 아침 판은 Surface 를 요구했는데, 소유자가 설치 앱에서 결함을 잡았다:
    // 흐름 안 원소에 떠 있는 표면의 문법을 입히면 아래 형제가 두 번 튄다
    // (+254px/1프레임 → 140ms 뒤 −352px/1프레임, 프레임 실측). 행동 계약과
    // 프로브는 AgentSetupStep.test.tsx 가 진다 — 여기는 문법 소속만 잠근다.
    expect(read(COLLAPSIBLE)).toMatch(/useRowDisclosure/);
    expect(read(COLLAPSIBLE)).toMatch(/ai-row-disclosure/);
    expect(read(COLLAPSIBLE)).not.toMatch(/<Surface\b/);
  });

  it("the promoted component carries no card chrome of its own", () => {
    const source = read(PROMOTED);
    // 이 컴포넌트가 다시 보더/배경을 얻으면 4단 중첩이 그대로 돌아온다.
    expect(source).not.toMatch(/className="[^"]*\bborder\b/);
    expect(source).not.toMatch(/className="[^"]*\bbg-\[color:var\(--color-overlay/);
  });

  it("keeps each surface's own step marker — merging the names would silently repoint e2e and the installed-app verifier", () => {
    expect(read(PANEL)).toContain('testId="agent-setup-step-1"');
    expect(read(SHEET)).toMatch(/<StepRow\s+n=\{1\}/);
    expect(read(PROMOTED)).toContain("agent-connect-step-");
  });

  /**
   * ★ 이 라운드가 더한 규격. 켜기 전 전수 = 3자리(흐름 · 증거 · 명령), 지금 0.
   *
   * 「번호 배지」를 정규식으로 완벽히 판정할 수는 없지만 **이 앱에서 그것을
   * 만드는 관용구**는 하나다: `.map((x, index) =>` 안의 `{index + 1}`.
   * 세 벌 전부 그 모양이었고, 다시 생기면 그 모양으로 생긴다.
   */
  it("한 화면에 번호 체계는 한 벌 — 단계 셋 말고 번호를 새로 세는 목록이 없다", () => {
    const source = read(PANEL);
    const generated = source.match(/\{\s*index\s*\+\s*1\s*\}/g) ?? [];
    expect(
      generated,
      "목록이 자기 번호를 다시 매기고 있다. 이 화면의 번호는 3단계 하나뿐이고, " +
        "두 번째 번호는 「지금 몇 번째인가」를 가리키지 못하게 만든다 " +
        "(2026-08-04 소유자 지적 1번 — 켤 때 전수 3자리).",
    ).toEqual([]);

    // 단계 번호는 1·2·3 뿐이다 — 넷째가 생기면 3단계라는 약속이 깨진다.
    const stepNumbers = [...source.matchAll(/<AgentSetupStep\s+n=\{(\d+)\}/g)].map(
      (m) => m[1],
    );
    expect(stepNumbers).toEqual(["1", "2", "3"]);
  });

  /** 공회전 차단 — 탐지기가 실제로 무엇인가를 읽었는지 본다. */
  it("게이트가 빈 파일 위에서 돌지 않는다", () => {
    for (const path of [PANEL, SHEET, PROMOTED, COLLAPSIBLE]) {
      expect(read(path).length, `${path} 을 못 읽었다`).toBeGreaterThan(400);
    }
    // 탐지기가 살아 있다 — 같은 관용구를 넣은 문자열은 잡힌다.
    const probe = "{items.map((item, index) => <span>{index + 1}</span>)}";
    expect(probe.match(/\{\s*index\s*\+\s*1\s*\}/g)).toHaveLength(1);
  });
});
