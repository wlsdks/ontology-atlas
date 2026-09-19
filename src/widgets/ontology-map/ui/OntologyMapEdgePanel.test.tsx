import { fireEvent, render, screen } from "@testing-library/react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { OntologyMapEdgePanel } from "./OntologyMapEdgePanel";

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

function renderPanel(
  meaningEditHref: string | null = "/ontology/studio",
  declaredBy: { slug: string; href: string } | null = null,
) {
  return render(
    <OntologyMapEdgePanel
      sentence="A depends on B"
      typeLabel="depends"
      fromId="a"
      toId="b"
      fromTitle="A"
      toTitle="B"
      why={null}
      declaredBy={declaredBy}
      updatedAtLabel={null}
      meaningEditHref={meaningEditHref}
      labels={labels}
      onSelectNode={() => {}}
      onClose={() => {}}
    />,
  );
}

describe("OntologyMapEdgePanel — focus contract (H3 P1)", () => {
  it("moves focus into the dialog on open so role=dialog + aria-label is announced", () => {
    renderPanel();
    const dialog = screen.getByTestId("map-edge-panel");
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

describe("OntologyMapEdgePanel — the two end nodes wear their kind", () => {
  it("each endpoint row carries the kind glyph before the name, like the node panel's rows", () => {
    renderPanel();
    const rows = [screen.getByRole("button", { name: /^A$/ }), screen.getByRole("button", { name: /^B$/ })];
    for (const row of rows) {
      expect(row.querySelector("svg"), `${row.textContent} 행에 종류 글리프가 없다`).not.toBeNull();
      expect(row.querySelector("svg")!.compareDocumentPosition(row.querySelector("span")!) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    }
  });
});

describe("OntologyMapEdgePanel — 공방 편집 딥링크 (Slice 6)", () => {
  it("renders the '고치기' action pointing at the deep-link when editable", () => {
    renderPanel("/ontology/studio/?node=capability%3Aa&edit=dependsOn:capability%3Ab");
    const edit = screen.getByTestId("map-edge-edit");
    expect(edit).toHaveTextContent("Edit relation");
    expect(edit).toHaveAttribute(
      "href",
      "/ontology/studio/?node=capability%3Aa&edit=dependsOn:capability%3Ab",
    );
  });

  it("uses the contextual editor callback instead of leaving the map", () => {
    const onEditRelation = vi.fn();
    render(
      <OntologyMapEdgePanel
        sentence="A depends on B"
        typeLabel="depends"
        fromId="a"
        toId="b"
        fromTitle="A"
        toTitle="B"
        why={null}
        declaredBy={null}
        updatedAtLabel={null}
        meaningEditHref="/ontology/studio"
        labels={labels}
        onSelectNode={() => {}}
        onEditRelation={onEditRelation}
        onClose={() => {}}
      />,
    );
    const action = screen.getByTestId("map-edge-edit");
    expect(action.tagName).toBe("BUTTON");
    fireEvent.click(action);
    expect(onEditRelation).toHaveBeenCalledTimes(1);
  });

  it("omits the action for a non-editable edge (null href) — no dead affordance", () => {
    renderPanel(null);
    expect(screen.queryByTestId("map-edge-edit")).not.toBeInTheDocument();
    // the rest of the panel still renders.
    expect(screen.getByTestId("map-edge-sentence")).toBeInTheDocument();
  });
});

/**
 * **The link to the source document carries no arrow** (map round, 2026-09-20).
 *
 * It read `storefront.md → Open doc`: an arrow between a file name and an
 * action, inside a link that navigates **inside** the app. `forbidden.md` keeps
 * arrows only for path, order, causality or an external destination, and the
 * label-decoration gate says the same in its own words — the label says where it
 * goes and the control says it is pressable. The glyph sat in JSX between two
 * expressions, which is the one shape neither of that gate's two scans can see:
 * one wants the arrow followed by a tag, the other wants it alone in an element.
 * The action stays in the accessible name, so a reader still hears it.
 */
describe("OntologyMapEdgePanel — the source document link", () => {
  it("shows the document name and keeps the action in its accessible name", () => {
    renderPanel("/ontology/studio", { slug: "storefront", href: "/ko/docs/storefront" });
    const link = screen.getByTestId("map-edge-declared-by");

    expect(link.textContent).toBe("storefront.md");
    expect(link.textContent, "장식 화살표가 라벨에 남아 있다").not.toMatch(/[→↗➜⟶»]/);
    expect(link.getAttribute("aria-label")).toContain(labels.openDoc);
    expect(link.getAttribute("aria-label")).toContain("storefront.md");
    expect(link.getAttribute("href")).toBe("/ko/docs/storefront");
  });
});
