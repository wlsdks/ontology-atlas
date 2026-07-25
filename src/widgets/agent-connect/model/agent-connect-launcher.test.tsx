import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import {
  AGENT_CONNECT_ROUTE_HREF,
  AgentConnectLauncherProvider,
  consumeAgentConnectRouteIntent,
  useAgentConnectLauncher,
} from "./agent-connect-launcher";

function LauncherHarness() {
  const launcher = useAgentConnectLauncher();
  return (
    <>
      <button type="button" data-testid="app-nav-rail-agent-status">
        Agent status
      </button>
      {!launcher.wantOpen ? (
        <button key="open" type="button" onClick={launcher.open}>
          Open from another page
        </button>
      ) : (
        <button key="close" type="button" onClick={launcher.close}>
          Close sheet
        </button>
      )}
    </>
  );
}

function StableLauncherHarness() {
  const launcher = useAgentConnectLauncher();
  return (
    <>
      <button type="button" data-testid="app-nav-rail-agent-status">
        Agent status
      </button>
      <button type="button" onClick={launcher.open}>
        Open from checklist
      </button>
      {launcher.wantOpen ? (
        <button type="button" onClick={launcher.close}>
          Close checklist sheet
        </button>
      ) : null}
    </>
  );
}

function AutomaticLauncherHarness() {
  const launcher = useAgentConnectLauncher();
  return (
    <>
      <button type="button" data-testid="app-nav-rail-agent-status">
        Agent status
      </button>
      <button
        type="button"
        onClick={() => {
          document.body.focus();
          launcher.open();
        }}
      >
        Run automatic prompt
      </button>
      {launcher.wantOpen ? (
        <button type="button" onClick={launcher.close}>
          Close automatic sheet
        </button>
      ) : null}
    </>
  );
}

describe("AgentConnectLauncherProvider", () => {
  it("returns focus to the persistent agent tile when the original route trigger disappeared", async () => {
    render(
      <AgentConnectLauncherProvider>
        <LauncherHarness />
      </AgentConnectLauncherProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Open from another page" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(screen.getByRole("button", { name: "Close sheet" })).toBeInTheDocument();

    fireEvent.click(screen.getByRole("button", { name: "Close sheet" }));

    await waitFor(() => {
      expect(screen.getByTestId("app-nav-rail-agent-status")).toHaveFocus();
    });
  });

  it("returns focus to a still-mounted checklist trigger", async () => {
    render(
      <AgentConnectLauncherProvider>
        <StableLauncherHarness />
      </AgentConnectLauncherProvider>,
    );

    const trigger = screen.getByRole("button", { name: "Open from checklist" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.click(screen.getByRole("button", { name: "Close checklist sheet" }));

    await waitFor(() => expect(trigger).toHaveFocus());
  });

  it("uses the persistent agent tile as the safe return point for an automatic prompt", async () => {
    render(
      <AgentConnectLauncherProvider>
        <AutomaticLauncherHarness />
      </AgentConnectLauncherProvider>,
    );

    fireEvent.click(screen.getByRole("button", { name: "Run automatic prompt" }));
    fireEvent.click(screen.getByRole("button", { name: "Close automatic sheet" }));

    await waitFor(() => {
      expect(screen.getByTestId("app-nav-rail-agent-status")).toHaveFocus();
    });
  });
});

describe("agent connect route intent", () => {
  it("uses a durable cross-route marker and consumes only that marker", () => {
    expect(AGENT_CONNECT_ROUTE_HREF).toBe("/topology/?agentConnect=1");
    window.history.replaceState(
      {},
      "",
      "/ko/topology/?agentConnect=1&index=expanded#selected",
    );

    expect(consumeAgentConnectRouteIntent()).toBe(true);
    expect(window.location.pathname + window.location.search + window.location.hash).toBe(
      "/ko/topology/?index=expanded#selected",
    );
    expect(consumeAgentConnectRouteIntent()).toBe(false);
  });
});
