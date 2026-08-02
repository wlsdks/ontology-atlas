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
