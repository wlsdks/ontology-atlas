import { render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { TopologyV2EdgePanel } from "./TopologyV2EdgePanel";

// `@/i18n/navigation`'s Link needs an IntlProvider this file doesn't stand up
// (established pattern) — mock to a plain anchor so href/render still work.
vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels = {
  kicker: "Relation",
  declaredByLabel: "Declared by",
  editRelation: "Edit relation",
  close: "Close",
  openDoc: "Open doc",
};

function renderPanel() {
  return render(
    <TopologyV2EdgePanel
      sentence="A depends on B"
      typeLabel="depends"
      fromId="a"
      toId="b"
      fromTitle="A"
      toTitle="B"
      why={null}
      declaredBy={null}
      updatedAtLabel={null}
      studioEditHref="/ontology/studio"
      labels={labels}
      onSelectNode={() => {}}
      onClose={() => {}}
    />,
  );
}

describe("TopologyV2EdgePanel — focus contract (H3 P1)", () => {
  it("moves focus into the dialog on open so role=dialog + aria-label is announced", () => {
    renderPanel();
    const dialog = screen.getByTestId("topology-v2-edge-panel");
    expect(dialog).toHaveAttribute("role", "dialog");
    expect(document.activeElement).toBe(dialog);
  });

  it("returns focus to the trigger element when the popover closes (no focus lost to body)", () => {
    // A real page opens this popover from a canvas click; model that trigger
    // as a focused button. On unmount (Esc ladder → setSelectedEdge(null)),
    // focus must return to it, not fall to <body>.
    const trigger = document.createElement("button");
    trigger.setAttribute("data-testid", "edge-trigger");
    document.body.appendChild(trigger);
    trigger.focus();
    expect(document.activeElement).toBe(trigger);

    const { unmount } = renderPanel();
    // opening the dialog took focus away from the trigger…
    expect(document.activeElement).not.toBe(trigger);

    unmount();
    // …and closing it hands focus back — the P1 regression was body here.
    expect(document.activeElement).toBe(trigger);

    trigger.remove();
  });
});
