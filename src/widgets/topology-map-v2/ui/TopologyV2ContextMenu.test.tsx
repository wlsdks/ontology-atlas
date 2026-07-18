import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { TopologyV2ContextMenu } from "./TopologyV2ContextMenu";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels = {
  actionDocument: "Document",
  actionEditRelations: "Edit relations",
  actionCopyHandoff: "Copy handoff",
  actionPath: "Path",
  openFullDetail: "Full detail →",
};

function renderMenu(overrides: {
  documentHref?: string | null;
  onClose?: () => void;
  onCopyHandoff?: () => void;
  onSetPathSource?: () => void;
  onOpenFullDetail?: () => void;
} = {}) {
  render(
    <TopologyV2ContextMenu
      position={{ x: 100, y: 200 }}
      documentHref={overrides.documentHref !== undefined ? overrides.documentHref : "/docs/domains/views"}
      builderEditHref="/ontology/edit/?node=domains%2Fviews"
      labels={labels}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onSetPathSource={overrides.onSetPathSource ?? (() => {})}
      onOpenFullDetail={overrides.onOpenFullDetail ?? (() => {})}
      onClose={overrides.onClose ?? (() => {})}
    />,
  );
}

describe("TopologyV2ContextMenu", () => {
  it("renders all 5 actions: document, edit relations, copy handoff, path, full detail", () => {
    renderMenu();
    expect(screen.getByTestId("topology-v2-context-menu-document")).toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-context-menu-edit")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology/edit/"),
    );
    expect(screen.getByTestId("topology-v2-context-menu-handoff")).toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-context-menu-path")).toBeInTheDocument();
    expect(screen.getByTestId("topology-v2-context-menu-full-detail")).toBeInTheDocument();
  });

  it("disables the document item when the node has no backing doc", () => {
    renderMenu({ documentHref: null });
    const item = screen.getByTestId("topology-v2-context-menu-document");
    expect(item.tagName).not.toBe("A");
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  it("calls onCopyHandoff / onSetPathSource / onOpenFullDetail when clicked", () => {
    const onCopyHandoff = vi.fn();
    const onSetPathSource = vi.fn();
    const onOpenFullDetail = vi.fn();
    renderMenu({ onCopyHandoff, onSetPathSource, onOpenFullDetail });

    fireEvent.click(screen.getByTestId("topology-v2-context-menu-handoff"));
    fireEvent.click(screen.getByTestId("topology-v2-context-menu-path"));
    fireEvent.click(screen.getByTestId("topology-v2-context-menu-full-detail"));

    expect(onCopyHandoff).toHaveBeenCalledTimes(1);
    expect(onSetPathSource).toHaveBeenCalledTimes(1);
    expect(onOpenFullDetail).toHaveBeenCalledTimes(1);
  });

  it("calls onClose on an outside pointerdown", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.pointerDown(document.body);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("does not call onClose on a pointerdown inside the menu", () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    fireEvent.pointerDown(screen.getByTestId("topology-v2-context-menu-path"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("anchors the menu at the given cursor position", () => {
    renderMenu();
    const menu = screen.getByTestId("topology-v2-context-menu");
    expect(menu).toHaveStyle({ left: "100px", top: "200px" });
  });
});
