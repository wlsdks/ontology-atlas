import { render, screen } from "@testing-library/react";
import { afterEach, describe, expect, it, vi } from "vitest";
import { PendingDocumentPane, type ChangedDocument } from "./PendingDocumentPane";

const doc = (name: string): ChangedDocument => ({
  entry: { path: `domains/${name}.md`, status: "modified", kind: "domain", slug: `domains/${name}`, renamedFrom: null },
  label: name,
  kind: "domain",
});

function pane(documents: ChangedDocument[]) {
  return (
    <PendingDocumentPane
      t={(key) => key}
      vaultPath={null}
      documents={documents}
      others={[]}
      summary="summary"
      hunks={[]}
      hunksTooLarge={false}
      selectedPath={null}
      setSelectedPath={() => undefined}
      stagedOutsideCount={0}
      discard={() => null}
    />
  );
}

function stubMotion(reduced: boolean) {
  vi.stubGlobal("matchMedia", (query: string) => ({
    matches: reduced && query.includes("prefers-reduced-motion"),
    media: query,
    addEventListener: () => undefined,
    removeEventListener: () => undefined,
  }));
  vi.spyOn(Element.prototype, "getBoundingClientRect").mockImplementation(function (this: Element) {
    const withChips = this.querySelector('[data-testid="atlas-git-change-row"]') !== null;
    const height = this.getAttribute("data-testid") === "atlas-git-change-groups" ? (withChips ? 150 : 100) : 0;
    return { x: 0, y: 0, top: 0, left: 0, right: 0, bottom: height, width: 0, height, toJSON: () => ({}) };
  });
}

afterEach(() => {
  vi.restoreAllMocks();
  vi.unstubAllGlobals();
});

describe("PendingDocumentPane chip row", () => {
  it("hides the chips for one document and eases the header height when a second arrives", () => {
    stubMotion(false);
    const { rerender } = render(pane([doc("order")]));
    expect(screen.queryAllByTestId("atlas-git-change-row")).toHaveLength(0);
    rerender(pane([doc("order"), doc("billing")]));
    const header = screen.getByTestId("atlas-git-change-groups");
    expect(screen.getAllByTestId("atlas-git-change-row")).toHaveLength(2);
    expect(header.style.transition).toContain("height var(--motion-base)");
    expect(header.style.height).toBe("150px");
  });

  it("moves no height under reduced motion and fades the chips in", () => {
    stubMotion(true);
    const { rerender } = render(pane([doc("order")]));
    rerender(pane([doc("order"), doc("billing")]));
    const header = screen.getByTestId("atlas-git-change-groups");
    expect(header.style.height).toBe("");
    expect(header.style.transition).toBe("");
    expect(screen.getAllByTestId("atlas-git-change-row")[0].parentElement).toHaveClass("git-fade-in");
  });
});
