import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LiveActivityBadge } from "./LiveActivityIndicator";

const labels = {
  live: "LIVE",
  changedTitle: "3 changed since baseline",
  summaryTitle: "Live change baseline",
  summaryBody: "Live means changed ontology nodes.",
  summaryZero: "No ontology nodes changed.",
  summaryCount: "3 ontology nodes changed.",
  summaryAction: "Open the meaning map change panel.",
  agentTitle: "Agent heartbeat",
  agentMissing: "No fresh agent heartbeat.",
  agentInvalid: "Agent heartbeat is invalid",
  agentStale: "Stale",
  agentCurrent: "Current",
  agentFocusFallback: "No focus summary.",
  agentSlug: "slug ·",
  agentFiles: "files ·",
  agentPlan: "next ·",
  statePlanning: "planning",
  stateEditing: "editing",
  stateVerifying: "verifying",
  stateBlocked: "blocked",
  stateComplete: "complete",
};

describe("LiveActivityBadge", () => {
  it("변경 0 — LIVE 만, 카운트 없음", () => {
    render(<LiveActivityBadge changedCount={0} labels={labels} />);
    expect(screen.getByTestId("live-activity-badge")).toHaveTextContent("LIVE");
    expect(screen.queryByTestId("live-activity-count")).not.toBeInTheDocument();
  });

  it("변경 N>0 — LIVE + 카운트", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);
    expect(screen.getByTestId("live-activity-count")).toHaveTextContent("3");
  });

  it("title 은 변경 있을 때 changedTitle, 없을 때 live", () => {
    const { rerender } = render(<LiveActivityBadge changedCount={0} labels={labels} />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "LIVE");
    rerender(<LiveActivityBadge changedCount={3} labels={labels} />);
    expect(screen.getByRole("button")).toHaveAttribute("title", "3 changed since baseline");
  });

  it("클릭하면 Live 숫자의 의미를 설명한다", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByText("Live change baseline")).toBeVisible();
    expect(screen.getByText("Live means changed ontology nodes.")).toBeVisible();
    expect(screen.getByText("3 ontology nodes changed.")).toBeVisible();
  });

  it("heartbeat가 없으면 agent 상태를 과장하지 않는다", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);

    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByTestId("live-agent-activity")).toHaveTextContent(
      "No fresh agent heartbeat.",
    );
  });

  it("fresh heartbeat가 있으면 agent, 상태, 초점, slug, 파일, 다음 계획을 보여준다", () => {
    render(
      <LiveActivityBadge
        changedCount={3}
        labels={labels}
        agentActivityStatus={{
          exists: true,
          valid: true,
          stale: false,
          errorMessage: null,
          heartbeat: {
            agent: "codex",
            state: "editing",
            focus: {
              summary: "Wire heartbeat into Live popover",
              ontologySlug: "capabilities/agent-live-activity-contract",
              files: [
                "src/features/vault-ontology/ui/LiveActivityIndicator.tsx",
                "messages/en.json",
                "messages/ko.json",
              ],
            },
            plan: ["run focused tests", "sync ontology"],
            evidence: {
              mcp: ["validate_vault"],
              codegraph: ["codegraph_context LiveActivityIndicator"],
              verification: ["pnpm exec vitest run ..."],
            },
            updatedAt: "2026-06-06T10:00:00.000Z",
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    const activity = screen.getByTestId("live-agent-activity");
    expect(activity).toHaveTextContent("Current");
    expect(activity).toHaveTextContent("codex · editing");
    expect(activity).toHaveTextContent("Wire heartbeat into Live popover");
    expect(activity).toHaveTextContent("capabilities/agent-live-activity-contract");
    expect(activity).toHaveTextContent("LiveActivityIndicator.tsx");
    expect(activity).toHaveTextContent("+1");
    expect(activity).toHaveTextContent("next · run focused tests");
    expect(activity).toHaveTextContent("evidence · 3");
  });

  it("stale heartbeat는 현재 작업처럼 보이지 않게 표시한다", () => {
    render(
      <LiveActivityBadge
        changedCount={1}
        labels={labels}
        agentActivityStatus={{
          exists: true,
          valid: true,
          stale: true,
          errorMessage: null,
          heartbeat: {
            agent: "claude-code",
            state: "verifying",
            focus: {
              summary: null,
              ontologySlug: null,
              files: [],
            },
            plan: [],
            evidence: { mcp: [], codegraph: [], verification: [] },
            updatedAt: "2026-06-06T09:00:00.000Z",
          },
        }}
      />,
    );

    fireEvent.click(screen.getByRole("button"));

    const activity = screen.getByTestId("live-agent-activity");
    expect(activity).toHaveTextContent("Stale");
    expect(activity).toHaveTextContent("claude-code · verifying");
    expect(activity).toHaveTextContent("No focus summary.");
  });
});
