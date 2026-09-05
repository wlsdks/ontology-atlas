import { fireEvent, render, screen } from "@testing-library/react";
import { describe, expect, it, vi } from "vitest";

import { FlowTab, type FlowTabLabels } from "./FlowTab";

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
};

const REQUEST = "Read only this vault and explain this product's business flow.";

describe("FlowTab", () => {
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
