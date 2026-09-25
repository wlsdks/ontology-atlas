import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { clampContextMenuPosition, OntologyMapContextMenu } from "./OntologyMapContextMenu";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const labels = {
  actionDocument: "Document",
  actionMentionDocument: "Mentioned in",
  actionMentionDocumentTip: "No document of its own yet",
  actionEditRelations: "Edit relations",
  actionCopyHandoff: "Copy handoff",
  actionPath: "Path",
  openFullDetail: "Full detail →",
};

function renderMenu(overrides: {
  documentHref?: string | null;
  mentionDocumentHref?: string | null;
  onClose?: () => void;
  onCopyHandoff?: () => void;
  onSetPathSource?: () => void;
  onOpenFullDetail?: () => void;
} = {}) {
  render(
    <OntologyMapContextMenu
      open
      onExited={() => {}}
      position={{ x: 100, y: 200 }}
      documentHref={overrides.documentHref !== undefined ? overrides.documentHref : "/docs/domains/views"}
      mentionDocumentHref={overrides.mentionDocumentHref ?? null}
      meaningEditHref="/ontology/studio/?node=domains%2Fviews"
      labels={labels}
      onCopyHandoff={overrides.onCopyHandoff ?? (() => {})}
      onSetPathSource={overrides.onSetPathSource ?? (() => {})}
      onOpenFullDetail={overrides.onOpenFullDetail ?? (() => {})}
      onClose={overrides.onClose ?? (() => {})}
      ariaLabel="Actions for Views"
    />,
  );
}

describe("OntologyMapContextMenu", () => {
  it("renders all 5 actions: document, edit relations, copy handoff, path, full detail", () => {
    renderMenu();
    expect(screen.getByTestId("map-context-menu-document")).toBeInTheDocument();
    expect(screen.getByTestId("map-context-menu-edit")).toHaveAttribute(
      "href",
      expect.stringContaining("/ontology/studio/"),
    );
    expect(screen.getByTestId("map-context-menu-handoff")).toBeInTheDocument();
    expect(screen.getByTestId("map-context-menu-path")).toBeInTheDocument();
    expect(screen.getByTestId("map-context-menu-full-detail")).toBeInTheDocument();
  });

  it("disables the document item when the node has no backing doc", () => {
    renderMenu({ documentHref: null });
    const item = screen.getByTestId("map-context-menu-document");
    expect(item.tagName).not.toBe("A");
    expect(item).toHaveAttribute("aria-disabled", "true");
  });

  // D7 regression — a node with no document of its own opened someone else's
  // document under a "Document" label. The link stays (no information is
  // lost) but the label has to name its destination honestly.
  it("relabels the item when the node has no doc of its own but is mentioned in one", () => {
    renderMenu({
      documentHref: null,
      mentionDocumentHref: "/docs/?slug=ontology%2Fcapabilities%2Ffrontmatter-to-ontology",
    });

    expect(screen.queryByTestId("map-context-menu-document")).toBeNull();
    expect(screen.queryByText("Document")).toBeNull();

    const item = screen.getByTestId("map-context-menu-mention-document");
    expect(item.tagName).toBe("A");
    expect(item).toHaveAttribute(
      "href",
      "/docs/?slug=ontology%2Fcapabilities%2Ffrontmatter-to-ontology",
    );
    expect(item).toHaveTextContent("Mentioned in");
    expect(item).toHaveAttribute("title", "No document of its own yet");
  });

  it("calls onCopyHandoff / onSetPathSource / onOpenFullDetail when clicked", () => {
    const onCopyHandoff = vi.fn();
    const onSetPathSource = vi.fn();
    const onOpenFullDetail = vi.fn();
    renderMenu({ onCopyHandoff, onSetPathSource, onOpenFullDetail });

    fireEvent.click(screen.getByTestId("map-context-menu-handoff"));
    fireEvent.click(screen.getByTestId("map-context-menu-path"));
    fireEvent.click(screen.getByTestId("map-context-menu-full-detail"));

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
    fireEvent.pointerDown(screen.getByTestId("map-context-menu-path"));
    expect(onClose).not.toHaveBeenCalled();
  });

  it("names its node and takes focus on its first item, so the arrow keys are the menu's", async () => {
    renderMenu();
    const menu = screen.getByTestId("map-context-menu");
    expect(menu).toHaveAttribute("aria-label", "Actions for Views");
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("map-context-menu-document")));
  });

  it("walks its enabled items with ArrowUp/ArrowDown/Home/End, cyclically", async () => {
    renderMenu({ documentHref: null });
    // The disabled document item is skipped: focus starts on the next one.
    await waitFor(() => expect(document.activeElement).toBe(screen.getByTestId("map-context-menu-edit")));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("map-context-menu-handoff"));
    fireEvent.keyDown(document.activeElement!, { key: "End" });
    expect(document.activeElement).toBe(screen.getByTestId("map-context-menu-full-detail"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowDown" });
    expect(document.activeElement).toBe(screen.getByTestId("map-context-menu-edit"));
    fireEvent.keyDown(document.activeElement!, { key: "ArrowUp" });
    expect(document.activeElement).toBe(screen.getByTestId("map-context-menu-full-detail"));
    fireEvent.keyDown(document.activeElement!, { key: "Home" });
    expect(document.activeElement).toBe(screen.getByTestId("map-context-menu-edit"));
  });

  it("closes when Tab leaves it", async () => {
    const onClose = vi.fn();
    renderMenu({ onClose });
    await waitFor(() => expect(document.activeElement?.getAttribute("role")).toBe("menuitem"));
    fireEvent.keyDown(document.activeElement!, { key: "Tab" });
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it("anchors the menu at the given cursor position", () => {
    renderMenu();
    const menu = screen.getByTestId("map-context-menu");
    expect(menu).toHaveStyle({ left: "100px", top: "200px" });
  });
});

// Design Guardian nice-to-have (W2-B review) — a right-click near the
// viewport edge used to position the menu off-screen (raw clientX/clientY,
// no clamp).
describe("clampContextMenuPosition", () => {
  const viewport = { width: 1920, height: 1080 };

  it("leaves an interior position unchanged", () => {
    expect(clampContextMenuPosition({ x: 500, y: 300 }, viewport)).toEqual({
      x: 500,
      y: 300,
    });
  });

  it("pulls the anchor back in when it would overflow the right/bottom edge", () => {
    const clamped = clampContextMenuPosition({ x: 1919, y: 1079 }, viewport);
    expect(clamped.x).toBeLessThan(1919);
    expect(clamped.y).toBeLessThan(1079);
    expect(clamped.x).toBeGreaterThan(0);
    expect(clamped.y).toBeGreaterThan(0);
  });

  it("never clamps past the top/left edge for a near-zero position", () => {
    expect(clampContextMenuPosition({ x: 0, y: 0 }, viewport)).toEqual({
      x: 8,
      y: 8,
    });
  });
});
