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
 * 카드 크롬을 뺀 쪽으로 합치면 3단이 되고, 「2단계가 내용 한 줄인데 카드 크롬을
 * 다 갖는다」도 함께 사라진다 — 보더/배경이 없으면 「내용 0줄 카드」라는 사고
 * 자체가 성립하지 않는다.
 *
 * ## 이 게이트가 잠그는 것
 *
 * lint 는 이걸 못 본다. 갈라진 두 컴포넌트는 **양쪽 다 정당한 토큰**만 쓰므로
 * 어떤 값 규칙도 위반하지 않는다 — 결함이 「값」이 아니라 「두 이름」이다.
 * 판정에 두 파일의 관계가 필요하니 계약 테스트의 일이다.
 */

const PANEL = "src/widgets/app-settings-menu/ui/VaultAgentSetupPanel.tsx";
const SHEET = "src/widgets/agent-connect/ui/AgentConnectSheet.tsx";
const PROMOTED = "src/features/docs-vault-local/ui/StepRow.tsx";

const read = (path: string) => readFileSync(path, "utf8");

describe("StepCard 는 은퇴했다 — 3단계 문법은 StepRow 하나다", () => {
  it("the settings panel no longer declares its own step component", () => {
    const source = read(PANEL);
    expect(source).not.toMatch(/function\s+StepCard\b/);
    expect(source).not.toMatch(/<StepCard\b/);
  });

  it("both surfaces import the promoted StepRow instead of redeclaring it", () => {
    for (const path of [PANEL, SHEET]) {
      const source = read(path);
      expect(source, `${path} 가 StepRow 를 다시 선언한다`).not.toMatch(
        /function\s+StepRow\b/,
      );
      expect(source, `${path} 가 StepRow 를 import 하지 않는다`).toMatch(
        /StepRow,?\n/,
      );
      expect(source).toMatch(/<StepRow\b/);
    }
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
});
