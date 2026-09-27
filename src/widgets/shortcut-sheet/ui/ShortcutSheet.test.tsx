import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, describe, expect, it, vi } from "vitest";

const route = vi.hoisted(() => ({ pathname: "/topology" }));
vi.mock("@/i18n/navigation", () => ({
  usePathname: () => route.pathname,
}));
import enMessages from "../../../../messages/en.json";
import { ShortcutSheet } from "./ShortcutSheet";

const glossary = enMessages.searchWidgets.shortcuts.glossary;
const rows = enMessages.searchWidgets.shortcuts.rows;
const sections = enMessages.searchWidgets.shortcuts.sections;

afterEach(() => {
  route.pathname = "/topology";
});

/** The sheet's section with this title, as the element holding its rows. */
function section(title: string): HTMLElement {
  const heading = screen.getByText(title, { selector: "p" });
  return heading.closest("section") as HTMLElement;
}

/** Each row of a section as "label: keys". */
function rowsOf(title: string): string[] {
  return Array.from(section(title).querySelectorAll("dl > div")).map((row) => {
    const label = row.querySelector("dt")?.textContent ?? "";
    const keys = Array.from(row.querySelectorAll("kbd")).map((kbd) => kbd.textContent).join(" ");
    return `${label}: ${keys}`;
  });
}

/** Every Navigation row must work on every screen the sheet opens on. */
describe("ShortcutSheet — the rows every screen shows", () => {
  it("teaches one search key, not two searches", () => {
    renderSheet();
    const navigation = rowsOf(sections.navigation);
    expect(navigation.filter((row) => row.endsWith("⌘ K"))).toEqual([`${rows.openSearchPalette}: ⌘ K`]);
    expect(navigation.some((row) => row.includes("⇧"))).toBe(false);
    expect(screen.queryByText("Search concepts, docs, and projects together")).toBeNull();
  });

  it("keeps D, which only the map binds, out of Navigation and in the map's own section", () => {
    renderSheet();
    expect(rowsOf(sections.navigation).some((row) => row.endsWith(": D"))).toBe(false);
    expect(rowsOf(sections.topology)).toContain(`${rows.toggleDocsDrawer}: D`);
  });

  it("does not offer D on a screen without the map", () => {
    route.pathname = "/ko/project/ontology-atlas/";
    renderSheet();
    expect(screen.queryByText(rows.toggleDocsDrawer)).toBeNull();
  });

  it("lists a key once on the map's own tab, not in Navigation and again under Map", () => {
    renderSheet();
    const all = [...rowsOf(sections.navigation), ...rowsOf(sections.topology)];
    expect(all.filter((row) => row === `${rows.openSearchPalette}: ⌘ K`)).toHaveLength(1);
    expect(all.filter((row) => row === `${rows.stepCloseOverlays}: Esc`)).toHaveLength(1);
  });
});

/** The topology section lists only interactions the canvas actually implements. */
function renderSheet() {
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <ShortcutSheet open onClose={() => {}} />
    </NextIntlClientProvider>,
  );
}

describe("ShortcutSheet — topology section", () => {
  it("describes Enter for every search result type, not projects only", () => {
    renderSheet();
    expect(screen.getByText("Open the selected result")).toBeInTheDocument();
    expect(screen.queryByText("Open the selected project")).toBeNull();
  });

  it("no longer lists the unimplemented double-click/shift-click/tab/slash/depth interactions", () => {
    renderSheet();
    expect(screen.queryByText(/Show only neighbors of the selected node/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Highlight the shortest path between two nodes/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Move to a neighbor of the selected node/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Focus the graph search input/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Clear the depth filter/i)).not.toBeInTheDocument();
    expect(screen.queryByText(/Limit to N hops/i)).not.toBeInTheDocument();
  });

  it("lists the real canvas interactions: click select, drag pan/move, wheel zoom, ⌘K search, Esc, right-click menu", () => {
    renderSheet();
    expect(screen.getByText("Select a node")).toBeInTheDocument();
    expect(
      screen.getByText("Pan the map (empty space) or move a node (spring rebound)"),
    ).toBeInTheDocument();
    expect(screen.getByText("Zoom in or out")).toBeInTheDocument();
    expect(
      screen.getByText(
        /Context menu.*edit relations.*copy handoff/,
      ),
    ).toBeInTheDocument();
  });
});

/** The one-line kind glossary in the footer. */
describe("ShortcutSheet — kind glossary", () => {
  /** Ontology is defined here before the three kinds. */
  it("defines ontology first, before the three kinds", () => {
    renderSheet();
    expect(screen.getByText("Ontology")).toBeInTheDocument();
    expect(screen.getByText(glossary.ontologyDefinition)).toBeInTheDocument();

    const text = screen.getByText("Words used on the map").parentElement?.textContent ?? "";
    expect(text.indexOf("Ontology")).toBeGreaterThanOrEqual(0);
    expect(text.indexOf("Ontology")).toBeLessThan(text.indexOf("Domain"));
  });

  it("defines domain/capability/element in one line each", () => {
    renderSheet();
    expect(screen.getByText("Words used on the map")).toBeInTheDocument();
    for (const term of ['domain', 'capability', 'element'] as const) {
      const label = screen.getByText(glossary[`${term}Term`]);
      expect(label.parentElement).toHaveTextContent(glossary[`${term}Definition`]);
    }
  });
});

describe("ShortcutSheet — relation guide", () => {
  it("keeps the three real line encodings in pull-only help instead of the map corner", () => {
    renderSheet();
    const guide = screen.getByTestId("shortcut-sheet-relation-guide");
    expect(guide).toHaveTextContent("Contains");
    expect(guide).toHaveTextContent("Depends on");
    expect(guide).toHaveTextContent("Related to");
  });
});


// Classification, not hiding: the All tab keeps the full list.
describe('ShortcutSheet context tabs', () => {
  it('defaults to the current screen so the map hides the docs section', () => {
    renderSheet();

    expect(screen.getByTestId("shortcut-sheet-scope-current")).toHaveAttribute(
      "aria-selected",
      "true",
    );
    // The map surface plus global are visible.
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.topology, { selector: "p" })).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.navigation)).toBeInTheDocument();
    // The docs-vault-only sections are not on this tab.
    expect(
      screen.queryByText(enMessages.searchWidgets.shortcuts.sections.docsPalette),
    ).not.toBeInTheDocument();
  });

  it('restores every section on the all tab', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("shortcut-sheet-scope-all"));

    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsPalette)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsGraph)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.topology, { selector: "p" })).toBeInTheDocument();
  });

  it('keeps global shortcuts on the docs tab', () => {
    renderSheet();
    fireEvent.click(screen.getByTestId("shortcut-sheet-scope-docs"));

    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.navigation)).toBeInTheDocument();
    expect(screen.getByText(enMessages.searchWidgets.shortcuts.sections.docsPalette)).toBeInTheDocument();
    expect(
      screen.queryByText(enMessages.searchWidgets.shortcuts.sections.topology, { selector: "p" }),
    ).not.toBeInTheDocument();
  });

  it('keeps the tab bar and close button outside the scroll area', () => {
    renderSheet();
    const tabs = screen.getByTestId("shortcut-sheet-scope-tabs");
    const scroll = screen.getByTestId("shortcut-sheet-scroll");

    expect(scroll.contains(tabs)).toBe(false);
    expect(scroll.contains(screen.getByTestId("shortcut-sheet-close"))).toBe(false);
  });

  it('shows a bottom fade that signals more to scroll', () => {
    renderSheet();
    expect(screen.getByTestId("shortcut-sheet-scroll-fade")).toBeInTheDocument();
  });
});

// The scroll area must be genuinely constrained; jsdom has no layout, so the anchoring method is
// pinned.
describe('ShortcutSheet scroll area height contract', () => {
  it('pins the scroll area absolutely to the wrapper instead of relying on h-full', () => {
    renderSheet();
    const scroll = screen.getByTestId("shortcut-sheet-scroll");

    // Flex-constrained in flow: it takes the remaining space and scrolls the rest.
    expect(scroll.className).toContain("min-h-0");
    expect(scroll.className).toContain("flex-1");
    expect(scroll.className).toContain("overflow-y-auto");
    // `h-full` resolved against content height and killed the scroll; `absolute` collapsed the
    // dialog. Both forbidden.
    expect(scroll.className).not.toContain("h-full");
    expect(scroll.className).not.toContain("absolute");
  });

  it('makes the wrapper a relative flex column so children get the remaining height', () => {
    renderSheet();
    const wrapper = screen.getByTestId("shortcut-sheet-scroll").parentElement!;

    expect(wrapper.className).toContain("relative");
    expect(wrapper.className).toContain("min-h-0");
    expect(wrapper.className).toContain("flex-1");
    expect(wrapper.className).toContain("flex-col");
  });
});
