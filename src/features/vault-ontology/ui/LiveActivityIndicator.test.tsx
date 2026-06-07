import { describe, expect, it } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { LiveActivityBadge, shouldShowLiveActivityIndicator } from "./LiveActivityIndicator";

const labels = {
  live: "LIVE",
  triggerTitle: "Live: changed ontology nodes and agent heartbeat",
  changedCountLabel: "3 changed",
  changedTitle: "3 ontology nodes changed since the current baseline",
  summaryTitle: "Live change baseline",
  summaryBody: "Live means changed ontology nodes.",
  summaryZero: "No ontology nodes changed.",
  summaryCount: "3 ontology nodes changed.",
  summaryNotTracking: "No change baseline is active yet.",
  summaryAction: "Open the concept-selection change panel.",
  agentTitle: "Agent heartbeat",
  agentMissing: "No fresh agent heartbeat.",
  agentInvalid: "Agent heartbeat is invalid",
  agentStale: "Stale",
  agentCurrent: "Current",
  agentFocusFallback: "No focus summary.",
  agentSlug: "slug ·",
  agentFocusAction: "Open focus",
  agentFiles: "files ·",
  agentPlan: "next ·",
  agentEvidence: "Agent evidence sources",
  agentSource: "source ·",
  agentUpdated: "updated · {age} ago",
  agentChipTracking: "tracking",
  agentChipMissing: "no agent",
  agentChipInvalid: "invalid",
  agentChipStale: "stale",
  agentChipCurrent: "agent",
  agentMcp: "MCP",
  agentCodegraph: "CodeGraph",
  agentVerification: "Verify",
  agentProofTrail: "Proof trail",
  close: "Close live activity popover",
  statePlanning: "planning",
  stateEditing: "editing",
  stateVerifying: "verifying",
  stateBlocked: "blocked",
  stateComplete: "complete",
};
const liveTriggerName =
  "Live: changed ontology nodes and agent heartbeat — 3 ontology nodes changed since the current baseline";

describe("LiveActivityBadge", () => {
  it("변경 0 — LIVE 만, 카운트 없음", () => {
    render(<LiveActivityBadge changedCount={0} labels={labels} />);
    expect(screen.getByTestId("live-activity-badge")).toHaveTextContent("LIVE");
    expect(screen.queryByTestId("live-activity-count")).not.toBeInTheDocument();
  });

  it("변경 N>0 — LIVE + 카운트", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);
    expect(screen.getByTestId("live-activity-count")).toHaveTextContent("3 changed");
  });

  it("title 은 열기 전부터 Live 숫자와 heartbeat 의미를 말한다", () => {
    const { rerender } = render(<LiveActivityBadge changedCount={0} labels={labels} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Live: changed ontology nodes and agent heartbeat",
    );
    rerender(<LiveActivityBadge changedCount={3} labels={labels} />);
    expect(screen.getByRole("button")).toHaveAttribute(
      "title",
      "Live: changed ontology nodes and agent heartbeat — 3 ontology nodes changed since the current baseline",
    );
    expect(screen.getByRole("button")).toHaveAccessibleName(
      "Live: changed ontology nodes and agent heartbeat — 3 ontology nodes changed since the current baseline",
    );
  });

  it("클릭하면 Live 숫자의 의미를 설명한다", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);

    const trigger = screen.getByRole("button", { name: liveTriggerName });
    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(trigger).not.toHaveAttribute("aria-controls");
    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "true");
    expect(trigger).toHaveAttribute("aria-controls");
    expect(screen.getByRole("dialog", { name: "Live change baseline" })).toBeVisible();
    expect(screen.getByRole("button", { name: "Close live activity popover" })).toBeVisible();
    expect(screen.getByText("Live change baseline")).toBeVisible();
    expect(screen.getByText("Live means changed ontology nodes.")).toBeVisible();
    expect(screen.getByText("3 ontology nodes changed.")).toBeVisible();

    fireEvent.click(trigger);

    expect(trigger).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByText("Live change baseline")).not.toBeInTheDocument();
  });

  it("명시적인 닫기 버튼으로 Live popover를 닫는다", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);

    fireEvent.click(screen.getByRole("button", { name: liveTriggerName }));
    expect(screen.getByRole("dialog", { name: "Live change baseline" })).toBeVisible();

    fireEvent.click(screen.getByRole("button", { name: "Close live activity popover" }));

    expect(screen.getByRole("button", { name: liveTriggerName })).toHaveAttribute("aria-expanded", "false");
    expect(screen.queryByRole("dialog", { name: "Live change baseline" })).not.toBeInTheDocument();
  });

  it("Escape와 바깥 클릭으로 Live popover를 닫는다", () => {
    render(
      <div>
        <button type="button">outside</button>
        <LiveActivityBadge changedCount={3} labels={labels} />
      </div>,
    );

    fireEvent.click(screen.getByRole("button", { name: liveTriggerName }));
    expect(screen.getByRole("dialog", { name: "Live change baseline" })).toBeVisible();

    fireEvent.keyDown(document, { key: "Escape" });
    expect(screen.queryByRole("dialog", { name: "Live change baseline" })).not.toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: liveTriggerName }));
    expect(screen.getByRole("dialog", { name: "Live change baseline" })).toBeVisible();

    fireEvent.pointerDown(screen.getByRole("button", { name: "outside" }));
    expect(screen.queryByRole("dialog", { name: "Live change baseline" })).not.toBeInTheDocument();
  });

  it("heartbeat가 없고 변경 기준만 있으면 agent 상태가 아니라 tracking 상태로 표시한다", () => {
    render(<LiveActivityBadge changedCount={3} labels={labels} />);

    expect(screen.getByTestId("live-agent-state-chip")).toHaveTextContent("tracking");
    fireEvent.click(screen.getByRole("button"));

    expect(screen.getByTestId("live-agent-activity")).toHaveTextContent(
      "No fresh agent heartbeat.",
    );
  });

  it("heartbeat sidecar는 있지만 heartbeat 본문이 없으면 no agent로 표시한다", () => {
    render(
      <LiveActivityBadge
        changedCount={0}
        labels={labels}
        trackingChanges={false}
        agentActivityStatus={{
          sourcePath: ".ontology-atlas/agent-activity.json",
          exists: true,
          valid: true,
          stale: false,
          ageMs: null,
          errorMessage: null,
          heartbeat: null,
        }}
      />,
    );

    expect(screen.getByTestId("live-agent-state-chip")).toHaveTextContent("no agent");
  });

  it("fresh heartbeat가 있으면 agent, 상태, 초점, slug, 파일, 다음 계획을 보여준다", () => {
    render(
      <LiveActivityBadge
        changedCount={3}
        labels={labels}
        agentActivityStatus={{
          sourcePath: ".ontology-atlas/agent-activity.json",
          exists: true,
          valid: true,
          stale: false,
          ageMs: 90_000,
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
              mcp: ["validate_vault", "query_ontology health"],
              codegraph: ["codegraph_context LiveActivityIndicator"],
              verification: ["pnpm exec vitest run ...", "pnpm desktop:verify-app"],
            },
            updatedAt: "2026-06-06T10:00:00.000Z",
          },
        }}
      />,
    );

    expect(screen.getByTestId("live-agent-state-chip")).toHaveTextContent("agent");
    fireEvent.click(screen.getByRole("button"));

    const trigger = screen.getByRole("button", {
      name: `${liveTriggerName} — CODEX · editing`,
    });
    expect(trigger).toHaveAccessibleName(`${liveTriggerName} — CODEX · editing`);
    expect(trigger).toHaveTextContent("CODEX · editing");
    expect(trigger).toHaveTextContent("Wire heartbeat into Live popover");
    const activity = screen.getByTestId("live-agent-activity");
    expect(activity).toHaveTextContent("Current");
    expect(activity).toHaveTextContent("codex · editing");
    expect(activity).toHaveTextContent("Wire heartbeat into Live popover");
    expect(activity).toHaveTextContent("source · .ontology-atlas/agent-activity.json");
    expect(activity).toHaveTextContent("updated · 1m ago");
    expect(activity).toHaveTextContent("capabilities/agent-live-activity-contract");
    expect(screen.getByRole("link", { name: "Open focus" })).toHaveAttribute(
      "href",
      "/ontology/?node=capabilities%2Fagent-live-activity-contract",
    );
    expect(activity).toHaveTextContent("LiveActivityIndicator.tsx");
    expect(activity).toHaveTextContent("+1");
    expect(activity).toHaveTextContent("next · run focused tests");
    expect(screen.getByLabelText("Agent evidence sources")).toHaveTextContent("MCP · 2");
    expect(screen.getByLabelText("Agent evidence sources")).toHaveTextContent("CodeGraph · 1");
    expect(screen.getByLabelText("Agent evidence sources")).toHaveTextContent("Verify · 2");
    const proofTrail = screen.getByLabelText("Proof trail");
    expect(proofTrail).toHaveTextContent("validate_vault +1");
    expect(proofTrail).toHaveTextContent("codegraph_context LiveActivityIndicator");
    expect(proofTrail).toHaveTextContent("pnpm exec vitest run ... +1");
  });

  it("변경 기준이 없어도 heartbeat가 있으면 agent 활동을 설명한다", () => {
    render(
      <LiveActivityBadge
        changedCount={0}
        labels={labels}
        trackingChanges={false}
        agentActivityStatus={{
          sourcePath: ".ontology-atlas/agent-activity.json",
          exists: true,
          valid: true,
          stale: false,
          ageMs: 12_000,
          errorMessage: null,
          heartbeat: {
            agent: "codex",
            state: "editing",
            focus: {
              summary: "Keep heartbeat visible without baseline",
              ontologySlug: "capabilities/agent-live-activity-contract",
              files: ["src/features/vault-ontology/ui/LiveActivityIndicator.tsx"],
            },
            plan: ["verify no-baseline heartbeat UI"],
            evidence: { mcp: ["validate_vault"], codegraph: [], verification: [] },
            updatedAt: "2026-06-06T10:00:00.000Z",
          },
        }}
      />,
    );

    expect(screen.getByTestId("live-agent-state-chip")).toHaveTextContent("agent");
    fireEvent.click(screen.getByRole("button"));

    expect(screen.queryByTestId("live-activity-count")).not.toBeInTheDocument();
    expect(screen.getByText("No change baseline is active yet.")).toBeVisible();
    expect(screen.getByTestId("live-agent-activity")).toHaveTextContent(
      "Keep heartbeat visible without baseline",
    );
  });

  it("stale heartbeat는 현재 작업처럼 보이지 않게 표시한다", () => {
    render(
      <LiveActivityBadge
        changedCount={1}
        labels={labels}
        agentActivityStatus={{
          sourcePath: ".ontology-atlas/agent-activity.json",
          exists: true,
          valid: true,
          stale: true,
          ageMs: 6 * 60 * 1000,
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

    expect(screen.getByTestId("live-agent-state-chip")).toHaveTextContent("stale");
    const trigger = screen.getByRole("button", {
      name: `${liveTriggerName} — CLAUDE-CODE · Stale`,
    });
    expect(trigger).toHaveTextContent("CLAUDE-CODE · Stale");
    expect(trigger).not.toHaveTextContent("CLAUDE-CODE · verifying");
    fireEvent.click(trigger);

    const activity = screen.getByTestId("live-agent-activity");
    expect(activity).toHaveTextContent("Stale");
    expect(activity).toHaveTextContent("claude-code · verifying");
    expect(activity).toHaveTextContent("updated · 6m ago");
    expect(activity).toHaveTextContent("No focus summary.");
  });

  it("invalid heartbeat sidecar는 현재 agent 연결처럼 보이지 않게 표시한다", () => {
    render(
      <LiveActivityBadge
        changedCount={0}
        labels={labels}
        trackingChanges={false}
        agentActivityStatus={{
          sourcePath: ".ontology-atlas/agent-activity.json",
          exists: true,
          valid: false,
          stale: false,
          ageMs: null,
          errorMessage: "state is invalid",
          heartbeat: null,
        }}
      />,
    );

    expect(screen.getByTestId("live-agent-state-chip")).toHaveTextContent("invalid");
    expect(screen.getByRole("button")).toHaveAccessibleName(
      "Live: changed ontology nodes and agent heartbeat",
    );

    fireEvent.click(screen.getByRole("button"));

    const activity = screen.getByTestId("live-agent-activity");
    expect(activity).toHaveTextContent("Agent heartbeat is invalid");
    expect(activity).toHaveTextContent("state is invalid");
  });
});

describe("shouldShowLiveActivityIndicator", () => {
  it("baseline 또는 heartbeat sidecar가 있을 때만 표시한다", () => {
    expect(shouldShowLiveActivityIndicator(null)).toBe(false);
    expect(shouldShowLiveActivityIndicator({ nodes: [], edges: [] })).toBe(true);
    expect(shouldShowLiveActivityIndicator(null, {
      exists: true,
      valid: true,
      stale: false,
      heartbeat: null,
      errorMessage: null,
    })).toBe(true);
  });
});
