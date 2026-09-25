import { fireEvent, render as baseRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type { ReactElement, ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import { FlowTab, type FlowTabLabels } from "./FlowTab";

/* The request's copy button is the page's shared `CopyAgentTextButton`, which reads its failure
   line from the message catalogue. */
function Messages({ children }: { children: ReactNode }) {
  return <NextIntlClientProvider locale="en" messages={en}>{children}</NextIntlClientProvider>;
}
const render = (ui: ReactElement) => baseRender(ui, { wrapper: Messages });

/**
 * The tab's whole job is to hand over a request a person can check, so these
 * cover the two ways that fails: drawing a control that cannot finish, and
 * hiding the text the reader needs in order to disagree with the answer.
 */

const labels: FlowTabLabels = {
  title: "Business flow",
  lead: "lead",
  action: "Draw the business flow",
  actionHint: "hint",
  checking: "Checking the local agent",
  requestLabel: "The request that goes to the agent",
  unavailableTitle: "The app does this",
  unavailableBody: "A browser cannot start a process",
  copy: "Copy request",
  copied: "Copied",
  noVaultTitle: "Open a folder first",
  noVaultBody: "nothing to explain",
  writtenAt: ({ when, writer }) => `${when} · written by ${writer}`,
  standingCurrent: "the folder has not moved since",
  standingStale: "the folder moved after this was written",
  standingUnknown: "not checked against the folder",
  ungrounded: "the reads behind this answer could not be proven",
  changedTitle: "What changed since the last one",
  changeAdded: "new",
  changeRemoved: "gone",
  changeRewritten: "rewritten",
  noVersionTitle: "Nothing has been written yet",
  noVersionBody: "Ask an agent to read this folder once.",
  rewrite: "Write it again",
  versionsLabel: (count) => `${count} kept.`,
};

const REQUEST = "Read only this vault and explain this product's business flow.";

describe("FlowTab", () => {
  const version = (overrides: Partial<import("../../lib/flow-history").FlowVersion> = {}) => ({
    id: "run-2",
    createdAt: "2026-09-19T10:00:00Z",
    writer: "claude-acp",
    answer: "### 왜 있나\n이 제품은 의미를 지킵니다.\n\n### 어디가 책임지나\n주문 도메인.",
    standing: "current" as const,
    reasons: [],
    grounded: true,
    ...overrides,
  });

  it("puts the written explanation in the body and folds the request away", () => {
    render(
      <FlowTab
        labels={labels}
        request={REQUEST}
        versions={[version()]}
        hasGraph
        hasOwnFolder
        canLaunchAgent
        onPrefill={vi.fn()}
      />,
    );

    expect(screen.getByTestId("flow-answer")).toHaveTextContent("이 제품은 의미를 지킵니다");
    expect(screen.getByTestId("flow-version")).toHaveTextContent("written by claude-acp");
    expect(screen.getByTestId("flow-version")).toHaveTextContent(labels.standingCurrent);
    // The request is still reachable, but it is not what the tab shows first.
    const request = screen.getByTestId("flow-request-open").closest("details");
    expect(request?.open, "the request wall opens on demand, never on arrival").toBeFalsy();
    expect(screen.queryByTestId("flow-no-version")).not.toBeInTheDocument();
  });

  it("names the scenes that changed since the previous writing, and says when the folder moved", () => {
    render(
      <FlowTab
        labels={labels}
        request={REQUEST}
        versions={[
          version({ standing: "stale", reasons: ["graphHash_changed"] }),
          version({ id: "run-1", createdAt: "2026-09-18T10:00:00Z", answer: "### 왜 있나\n옛 설명.\n\n### 사라진 장면\n지워짐." }),
        ]}
        hasGraph
        hasOwnFolder
        canLaunchAgent
        onPrefill={vi.fn()}
      />,
    );

    expect(screen.getByTestId("flow-version")).toHaveTextContent(labels.standingStale);
    const changes = screen.getByTestId("flow-changes");
    expect(changes).toHaveTextContent("왜 있나");
    expect(changes).toHaveTextContent("어디가 책임지나");
    expect(changes).toHaveTextContent("사라진 장면");
    expect(screen.getByText(labels.rewrite)).toBeInTheDocument();
  });

  it("says there is nothing to explain when the graph is empty", () => {
    render(
      <FlowTab labels={labels} request={REQUEST} hasGraph={false} hasOwnFolder={false} canLaunchAgent onPrefill={vi.fn()} />,
    );

    expect(screen.getByText(labels.noVaultTitle)).toBeInTheDocument();
    expect(screen.queryByTestId("flow-prefill")).not.toBeInTheDocument();
    expect(
      screen.queryByText(REQUEST),
      "a request scoped to a folder that is not open would be a false sentence",
    ).not.toBeInTheDocument();
  });

  it("draws the control only where an agent can actually be launched", () => {
    const onPrefill = vi.fn();
    const { rerender } = render(
      <FlowTab labels={labels} request={REQUEST} hasGraph hasOwnFolder canLaunchAgent onPrefill={onPrefill} />,
    );
    expect(screen.getByTestId("flow-prefill")).toBeInTheDocument();

    rerender(
      <FlowTab labels={labels} request={REQUEST} hasGraph hasOwnFolder canLaunchAgent={false} onPrefill={onPrefill} />,
    );
    expect(
      screen.queryByTestId("flow-prefill"),
      "a browser cannot start a process, so a press here could never finish",
    ).not.toBeInTheDocument();
    expect(screen.getByText(labels.unavailableTitle)).toBeInTheDocument();
  });

  it("does not call an unavailable app path while runtime checks are still running", () => {
    render(
      <FlowTab
        labels={labels}
        request={REQUEST}
        hasGraph
        hasOwnFolder
        canLaunchAgent={false}
        agentChecking
        onPrefill={vi.fn()}
      />,
    );
    expect(screen.getByRole('status')).toHaveTextContent(labels.checking);
    expect(screen.queryByTestId('flow-prefill')).toBeNull();
    expect(screen.queryByText(labels.unavailableTitle)).toBeNull();
  });

  it("shows the request in both cases, because that is what a reader checks the answer against", () => {
    const { rerender } = render(
      <FlowTab labels={labels} request={REQUEST} hasGraph hasOwnFolder canLaunchAgent onPrefill={vi.fn()} />,
    );
    expect(screen.getByText(REQUEST)).toBeInTheDocument();
    expect(screen.getByTestId("flow-copy")).toBeInTheDocument();

    rerender(<FlowTab labels={labels} request={REQUEST} hasGraph hasOwnFolder canLaunchAgent={false} />);
    expect(
      screen.getByText(REQUEST),
      "the browser case is the one where copying the text is the whole point",
    ).toBeInTheDocument();
  });

  it("hands the exact request to the conversation, unedited", () => {
    const onPrefill = vi.fn();
    render(<FlowTab labels={labels} request={REQUEST} hasGraph hasOwnFolder canLaunchAgent onPrefill={onPrefill} />);

    fireEvent.click(screen.getByTestId("flow-prefill"));

    expect(onPrefill).toHaveBeenCalledWith(REQUEST);
  });
});

/*
 * The sample graph case. Refusing to draw the tab while the five sibling tabs
 * are full of counts from that same graph reads as a broken screen, so the tab
 * appears and only the launch waits for a folder of the person's own.
 */
describe("FlowTab on the built-in sample", () => {
  it("shows the request but not the launch", () => {
    render(
      <FlowTab
        labels={labels}
        request={REQUEST}
        hasGraph
        hasOwnFolder={false}
        canLaunchAgent
        onPrefill={vi.fn()}
      />,
    );

    expect(screen.getByText(REQUEST)).toBeInTheDocument();
    expect(
      screen.queryByTestId("flow-prefill"),
      "an agent needs a folder of its own to read",
    ).not.toBeInTheDocument();
    expect(screen.queryByText(labels.noVaultTitle)).not.toBeInTheDocument();
  });
});
