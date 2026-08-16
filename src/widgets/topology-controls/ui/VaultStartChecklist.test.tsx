import { cleanup, fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";
import { VaultStartChecklist } from "./VaultStartChecklist";

vi.mock("next-intl", () => ({
  useTranslations: () => (key: string, values?: Record<string, unknown>) =>
    values ? `${key}:${JSON.stringify(values)}` : key,
}));

vi.mock("@/shared/lib/use-copy-feedback", () => ({
  useCopyFeedback: () => ({ state: "idle", copy: vi.fn() }),
}));

function renderChecklist(over: Partial<Parameters<typeof VaultStartChecklist>[0]> = {}) {
  return render(
    <VaultStartChecklist
      projectCount={0}
      relationCount={0}
      agentConnected={false}
      onCreateNode={vi.fn()}
      onOpenAgentConnect={vi.fn()}
      analyzePrompt="분석해줘"
      {...over}
    />,
  );
}

describe("VaultStartChecklist (에이전트-우선, 2026-07-24 소유자 지시)", () => {
  it("renders agent-first steps: connect → analyze → manual", () => {
    renderChecklist();
    const steps = screen.getAllByTestId(/checklist-step-/);
    expect(steps.map((el) => el.getAttribute("data-testid"))).toEqual([
      "checklist-step-agent",
      "checklist-step-analyze",
      "checklist-step-manual",
    ]);
    expect(steps.every((el) => el.getAttribute("data-done") === "false")).toBe(true);
  });

  it("routes the agent step to the connect sheet", () => {
    const onOpenAgentConnect = vi.fn();
    renderChecklist({ onOpenAgentConnect });
    fireEvent.click(screen.getByTestId("checklist-cta-agent"));
    expect(onOpenAgentConnect).toHaveBeenCalledTimes(1);
  });

  it("marks the agent step done from the heartbeat signal", () => {
    renderChecklist({ agentConnected: true });
    expect(screen.getByTestId("checklist-step-agent")).toHaveAttribute("data-done", "true");
    // 완료된 행은 CTA 를 감춘다 — 다음 미완료 행이 시선 승자.
    expect(screen.queryByTestId("checklist-cta-agent")).not.toBeInTheDocument();
  });

  /*
   * 2026-08-16 소유자 실보고 — 앱이 Claude Code 를 찾아 대화까지 되는 상태인데
   * 이 단은 빈 동그라미였고 버튼은 「연결 안내 열기」였다. 눌렀더니 채팅이
   * 떠서 *"뭐지?"* 가 됐다. 화면이 약속한 것과 한 일이 달랐던 것이다.
   */
  it("앱 안에서 부를 수 있는 실행기가 있으면 그것이 곧 연결이다", () => {
    renderChecklist({ acpRuntimeLabel: "Claude Code" });
    expect(screen.getByTestId("checklist-step-agent")).toHaveAttribute("data-done", "true");
    // 완료여도 대화로 들어가는 문은 남는다 — 그 문이 곧 완료의 내용이다.
    expect(screen.getByTestId("checklist-cta-agent")).toBeInTheDocument();
    // 붙여넣을 곳이 없다는 안내는 사라진다 — 이미 있다.
    expect(screen.queryByTestId("checklist-analyze-needs-agent")).not.toBeInTheDocument();
  });

  it("찾은 것이 없으면 그 단은 미완료로 남는다", () => {
    renderChecklist({ acpRuntimeLabel: null });
    expect(screen.getByTestId("checklist-step-agent")).toHaveAttribute("data-done", "false");
    expect(screen.getByTestId("checklist-analyze-needs-agent")).toBeInTheDocument();
  });

  it("derives analyze/manual progress from live counts", () => {
    renderChecklist({ relationCount: 2, projectCount: 1 });
    expect(screen.getByTestId("checklist-step-analyze")).toHaveAttribute("data-done", "true");
    expect(screen.getByTestId("checklist-step-manual")).toHaveAttribute("data-done", "true");
  });

  it("routes the manual step to the project composer", () => {
    const onCreateNode = vi.fn();
    renderChecklist({ onCreateNode });
    fireEvent.click(screen.getByTestId("checklist-cta-project"));
    expect(onCreateNode).toHaveBeenCalledWith("project");
  });

  it("offers the analysis prompt copy on the analyze step", () => {
    renderChecklist();
    expect(screen.getByTestId("checklist-cta-analyze")).toBeInTheDocument();
  });

  // C9 — the hint must reflect the REAL `.mcp.json` state, not assert it is
  // "already prepared" regardless of whether the file exists.
  it("shows the pending hint when .mcp.json is not present", () => {
    // 이 안내는 「시작 문서 만들기」 버튼을 이름으로 부르므로 그 버튼이 있는
    // 갈래에서만 뜬다 — 아래 「안내는 화면에 있는 것만 가리킨다」 참조.
    renderChecklist({ mcpConfigReady: false, onScaffoldStarter: vi.fn() });
    expect(screen.getByText("agentHintPending")).toBeInTheDocument();
    expect(screen.queryByText("agentHintReady")).not.toBeInTheDocument();
  });

  it("shows the ready hint only when .mcp.json actually exists", () => {
    renderChecklist({ mcpConfigReady: true });
    expect(screen.getByText("agentHintReady")).toBeInTheDocument();
    expect(screen.queryByText("agentHintPending")).not.toBeInTheDocument();
  });
});

// 빈 폴더 스타터 버튼 (2026-07-24) — '기존 폴더 선택'으로 빈 폴더를 연
// 사용자에게 '빈 폴더로 새로 시작' 과 같은 스캐폴드를 버튼으로 제공한다.
describe("VaultStartChecklist — 빈 폴더 스타터 버튼", () => {
  it("onScaffoldStarter 가 있으면 세 번째 단계가 스캐폴드 CTA 로 바뀐다", () => {
    const onScaffoldStarter = vi.fn();
    renderChecklist({ onScaffoldStarter });
    expect(screen.queryByTestId("checklist-cta-project")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("checklist-cta-scaffold"));
    expect(onScaffoldStarter).toHaveBeenCalledTimes(1);
  });

  it("스캐폴드 중에는 버튼이 잠긴다", () => {
    renderChecklist({ onScaffoldStarter: vi.fn(), scaffolding: true });
    expect(screen.getByTestId("checklist-cta-scaffold")).toBeDisabled();
  });

  it("문서가 이미 있는 vault(콜백 미전달)에서는 직접 만들기 CTA 를 유지한다", () => {
    renderChecklist();
    expect(screen.getByTestId("checklist-cta-project")).toBeInTheDocument();
    expect(screen.queryByTestId("checklist-cta-scaffold")).not.toBeInTheDocument();
  });
});

describe("VaultStartChecklist — 문서가 있는 저장소 (2026-08-03 게이트 확장)", () => {
  /*
   * 종전엔 `HomePage` 가 **진짜 빈 폴더에만** 이 체크리스트를 세웠다. 문서가
   * 한 장이라도 있으면 「내 문서로 지도 만들기」만 주는 빈 상태로 갔고, 그
   * 화면은 에이전트 이야기를 한 마디도 안 한다 — 개발 저장소를 연 사람,
   * 정확히 이 흐름이 도우려던 그 사람이 연결 경로를 못 봤다.
   */
  it("문서가 있으면 1단이 부트스트랩이고, 에이전트 단은 그대로 남는다", () => {
    const onStartFromDocs = vi.fn();
    renderChecklist({ docsFoundCount: 12, onStartFromDocs });

    const docs = screen.getByTestId("checklist-cta-docs");
    fireEvent.click(docs);
    expect(onStartFromDocs).toHaveBeenCalledTimes(1);

    // 부트스트랩이 에이전트를 **대체하지 않는다** — 그게 종전 결함이었다.
    expect(screen.getByTestId("checklist-cta-agent")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-cta-analyze")).toBeInTheDocument();
  });

  it("빈 폴더면 부트스트랩 단이 아예 없다 — 없는 문서를 권하지 않는다", () => {
    renderChecklist({ docsFoundCount: 0 });
    expect(screen.queryByTestId("checklist-cta-docs")).toBeNull();
  });

  it("관계가 이미 있어도 「지시 복사」로 가는 문이 남는다", () => {
    /*
     * 완료 판정이 `relationCount > 0` 이라 손으로 관계 하나만 만들어도 참이
     * 되는데, 종전엔 그 순간 복사 CTA 가 영구히 사라졌다 — 사용자가 한 번도
     * 안 눌렀는데도.
     */
    renderChecklist({ relationCount: 5 });
    expect(screen.getByTestId("checklist-cta-analyze")).toBeInTheDocument();
  });

  it("연결 전에는 붙여넣을 곳이 없다는 순서를 말한다 — 막지는 않는다", () => {
    renderChecklist({ agentConnected: false });
    expect(screen.getByTestId("checklist-analyze-needs-agent")).toBeInTheDocument();
    expect(screen.getByTestId("checklist-cta-analyze")).toBeEnabled();

    cleanup();
    renderChecklist({ agentConnected: true });
    expect(screen.queryByTestId("checklist-analyze-needs-agent")).toBeNull();
  });
});

describe("VaultStartChecklist — 안내는 화면에 있는 것만 가리킨다", () => {
  it("「시작 문서 만들기」가 없는 갈래에서는 그 버튼을 부르는 안내도 없다", () => {
    /*
     * `agentHintPending` 은 버튼 이름을 문장 안에서 부른다. 그 버튼은 빈
     * 폴더에만 있으므로, 문서가 있는 갈래에 그대로 두면 사용자는 화면에 없는
     * 것을 찾게 된다.
     */
    renderChecklist({ docsFoundCount: 3, onStartFromDocs: vi.fn(), mcpConfigReady: false });
    expect(screen.queryByText("agentHintPending")).toBeNull();

    cleanup();
    renderChecklist({ onScaffoldStarter: vi.fn(), mcpConfigReady: false });
    expect(screen.getByText("agentHintPending")).toBeInTheDocument();
  });
});

describe("VaultStartChecklist — 카드는 INDEX 가 가린 폭을 빼고 가운데를 잡는다", () => {
  /*
   * 2026-08-16 소유자 실보고: INDEX 를 펼친 상태에서 카드가 왼쪽으로 치우쳐
   * INDEX 오른쪽 가장자리와 겹쳐 보였다.
   *
   * 원인은 좌우 패널이 지도 칼럼을 좁히는 **방식이 다른** 것이다 — 오른쪽
   * 에이전트 패널은 flex 형제라 칼럼 폭을 실제로 줄이므로 `justify-center` 에
   * 저절로 반영되는데, 왼쪽 INDEX 는 `position:absolute` 로 칼럼 위에 뜬다.
   * 그래서 INDEX 만 중앙 계산에서 빠진다.
   *
   * 이 검사가 없으면 다음 사람이 "왜 패딩이 붙어 있지" 하고 지우고, 그때
   * 화면은 조용히 예전으로 돌아간다 — 겹침은 스냅샷에도 타입에도 안 남는다.
   */
  const RESERVE = "md:pl-[calc(var(--topology-index-inset)+var(--topology-index-width)+1rem)]";

  function reserveHost() {
    return document.querySelector("[data-index-reserved]");
  }

  it("INDEX 가 펼쳐져 있으면 그 폭만큼 ≥md 에서 비워 둔다", () => {
    renderChecklist({ indexExpanded: true });
    const host = reserveHost();
    expect(host?.getAttribute("data-index-reserved")).toBe("true");
    expect(host?.className).toContain(RESERVE);
  });

  it("INDEX 가 접혀 있으면 아무것도 비우지 않는다 (지도 전폭 기준 중앙)", () => {
    renderChecklist({ indexExpanded: false });
    const host = reserveHost();
    expect(host?.getAttribute("data-index-reserved")).toBe("false");
    expect(host?.className).not.toContain("md:pl-[");
  });

  it("기본값은 「비우지 않음」 — prop 을 안 넘긴 호출자가 화면을 바꾸지 않는다", () => {
    renderChecklist();
    expect(reserveHost()?.getAttribute("data-index-reserved")).toBe("false");
  });

  it("보정은 ≥md 에서만 건다 — 767px 이하에서 INDEX 는 전폭 시트다", () => {
    /*
     * `app/globals.css` 의 `@media (max-width: 767px)` 가
     * `--topology-index-width` 를 `calc(100vw - 2 * inset)` 로 바꾼다. 그
     * 폭을 좁은 화면에서도 빼면 카드가 화면 밖으로 밀린다. 그래서 예약
     * 클래스는 반드시 `md:` 접두사를 달고 있어야 한다.
     */
    renderChecklist({ indexExpanded: true });
    const reserved = (reserveHost()?.className ?? "")
      .split(/\s+/)
      .filter((c) => c.includes("--topology-index-width"));
    expect(reserved.length).toBeGreaterThan(0);
    expect(reserved.every((c) => c.startsWith("md:"))).toBe(true);
  });
});
