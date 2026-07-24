import { fireEvent, render, screen } from "@testing-library/react";
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
