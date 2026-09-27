import { useState } from "react";
import { act, fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { afterEach, beforeAll, beforeEach, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import enMessages from "../../../../messages/en.json";
import { GlobalSearch } from "./GlobalSearch";

/** The search field's accessible name, read from the catalogue rather than pinned as prose. */
const COMMAND_LABEL = enMessages.searchWidgets.globalSearch.commandLabel;

// cmdk and @tanstack/react-virtual need ResizeObserver, which jsdom lacks.
beforeAll(() => {
  class ResizeObserverStub {
    observe() {}
    unobserve() {}
    disconnect() {}
  }
  // eslint-disable-next-line @typescript-eslint/no-explicit-any -- test-only jsdom polyfill
  (globalThis as any).ResizeObserver = ResizeObserverStub;
// Used by cmdk to scroll the active item into view — unimplemented in jsdom.
  window.HTMLElement.prototype.scrollIntoView = () => {};
});

function render(ui: React.ReactElement) {
  return rtlRender(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      {ui}
    </NextIntlClientProvider>,
  );
}

const APPROVED_AT = new Date("2026-04-27T00:00:00Z");

function node(input: Partial<KnowledgeGraphNode> & { id: string; title: string }): KnowledgeGraphNode {
  return {
    kind: "capability",
    projectIds: [],
    evidenceIds: [],
    lastApprovedAt: APPROVED_AT,
    lastApprovedBy: "test",
    ...input,
  };
}

function project(input: Partial<Project> & { slug: string; name: string }): Project {
  return {
    category: "frontend",
    status: "active",
    description: "",
    tags: [],
    stack: [],
    links: [],
    dependencies: [],
    isHub: false,
    screenshots: [],
    timeline: { start: undefined, end: undefined } as Project["timeline"],
    position: { x: 0, y: 0 } as Project["position"],
    createdAt: new Date(),
    updatedAt: new Date("2026-04-20T00:00:00Z"),
    ...input,
  } as Project;
}

/** cmdk options are marked `data-value="ontology:<id>"`. Match highlighting (<mark>)
 *  splits the title text across several elements and breaks getByText matching, so
 *  options are found by this stable data attribute rather than by RTL text matching. */
function findOntologyOption(nodeId: string): HTMLElement | null {
  return document.querySelector<HTMLElement>(
    `[cmdk-item][data-value="ontology:${nodeId}"]`,
  );
}

/**
 * Pins the two contracts behind choosing a node without leaving the map: onSelectNode gets the
 * right node, and the kind chips really narrow the results.
 */
describe("GlobalSearch", () => {
  const nodes: KnowledgeGraphNode[] = [
    node({ id: "capability:mcp-server", title: "MCP Server", kind: "capability" }),
    node({ id: "capability:mcp-conflict-guard", title: "MCP Conflict Guard", kind: "capability" }),
    node({ id: "element:mcp-index", title: "mcp/src/index.js", kind: "element" }),
    node({ id: "domain:ai-agent-partner", title: "AI Agent Partner", kind: "domain" }),
  ];
  const projects: Project[] = [project({ slug: "ontology-atlas", name: "ontology-atlas" })];

  it('includes ontology nodes in the results', () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
      target: { value: "mcp server" },
    });

    expect(findOntologyOption("capability:mcp-server")).not.toBeNull();
  });

  it('calls onSelectNode with the exact node when a node result is chosen', () => {
    const onSelectNode = vi.fn();
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={onSelectNode}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
      target: { value: "mcp server" },
    });
    const option = findOntologyOption("capability:mcp-server");
    expect(option).not.toBeNull();
    fireEvent.click(option!);

    expect(onSelectNode).toHaveBeenCalledTimes(1);
    expect(onSelectNode.mock.calls[0][0]).toMatchObject({ id: "capability:mcp-server" });
  });

  it('narrows results with a kind filter chip', () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
      target: { value: "mcp" },
    });
    // Without a filter, all 2 capabilities and 1 element are visible.
    expect(findOntologyOption("capability:mcp-server")).not.toBeNull();
    expect(findOntologyOption("capability:mcp-conflict-guard")).not.toBeNull();
    expect(findOntologyOption("element:mcp-index")).not.toBeNull();

    fireEvent.click(screen.getByRole("button", { name: "Element" }));

    // After activating the ELEMENT chip, the capability results disappear and only the element remains.
    expect(findOntologyOption("capability:mcp-server")).toBeNull();
    expect(findOntologyOption("capability:mcp-conflict-guard")).toBeNull();
    expect(findOntologyOption("element:mcp-index")).not.toBeNull();
  });

  // cmdk's root turns Enter anywhere into "open the highlighted row" with preventDefault, which
  // swallowed Enter on a focused chip or close button.
  describe('Enter belongs to the focused control', () => {
    const openPalette = (onSelectNode = vi.fn()) => {
      render(
        <GlobalSearch
          open
          onOpenChange={() => {}}
          nodes={nodes}
          onSelectNode={onSelectNode}
          projects={projects}
          onSelectProject={() => {}}
        />,
      );
      return onSelectNode;
    };

    it('does not open a result on Enter over a filter chip', () => {
      const onSelectNode = openPalette();
      fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
        target: { value: "mcp" },
      });
      const chip = screen.getByRole("button", { name: "Element" });
      chip.focus();
      fireEvent.keyDown(chip, { key: "Enter" });
      expect(onSelectNode).not.toHaveBeenCalled();
    });

    it('does not open a result on Enter over the close button', () => {
      const onSelectNode = openPalette();
      fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
        target: { value: "mcp" },
      });
      const close = screen.getByTestId("global-search-close");
      close.focus();
      fireEvent.keyDown(close, { key: "Enter" });
      expect(onSelectNode).not.toHaveBeenCalled();
    });

    it('opens the result on Enter in the search input', () => {
      // From the search field, Enter still opens the highlighted row.
      const onSelectNode = openPalette();
      const field = screen.getByRole("combobox", { name: COMMAND_LABEL });
      fireEvent.change(field, { target: { value: "mcp server" } });
      fireEvent.keyDown(field, { key: "Enter" });
      expect(onSelectNode).toHaveBeenCalledTimes(1);
    });
  });

  it('demotes a file-path-shaped element title to mono quaternary and keeps ordinary titles primary', () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
      target: { value: "mcp" },
    });

    const pathLikeRow = findOntologyOption("element:mcp-index");
    expect(pathLikeRow?.querySelector('[data-search-result-path-like="true"]')).not.toBeNull();

    const plainRow = findOntologyOption("capability:mcp-server");
    expect(plainRow?.querySelector('[data-search-result-path-like="true"]')).toBeNull();
  });

  /**
   * GlobalSearch is controlled, so Escape and trigger focus return are pinned here rather than
   * trusted to Radix.
   */
  function Harness() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          open trigger
        </button>
        <GlobalSearch
          open={open}
          onOpenChange={setOpen}
          nodes={nodes}
          onSelectNode={() => {}}
          projects={projects}
          onSelectProject={() => {}}
        />
      </>
    );
  }

  it('closes on Escape through onOpenChange(false)', () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /**
   * The first Escape closes and clears. The app's global Escape handlers look
   * for `[role="dialog"][aria-modal="true"]`, which Radix does not set.
   */
  it('declares itself modal with aria-modal while open', () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    expect(
      document.querySelector('[role="dialog"][aria-modal="true"]'),
    ).not.toBeNull();
  });

  it('closes and clears the input on the first Escape even with a global capture handler that yields to modals', () => {
    // Imitates the first-run card's window-capture handler that yields while a modal is open.
    const guardFired = vi.fn();
    const guard = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      if (document.querySelector('[role="dialog"][aria-modal="true"]') !== null) return;
      event.preventDefault();
      guardFired();
    };
    window.addEventListener("keydown", guard, { capture: true });

    try {
      render(<Harness />);
      const trigger = screen.getByRole("button", { name: "open trigger" });
      trigger.focus();
      fireEvent.click(trigger);

      const input = screen.getByRole("combobox");
      fireEvent.change(input, { target: { value: "core" } });
      expect((input as HTMLInputElement).value).toBe("core");

      fireEvent.keyDown(document, { key: "Escape" });

      expect(guardFired).not.toHaveBeenCalled();
      expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

      // Reopening does not carry the previous input.
      fireEvent.click(screen.getByRole("button", { name: "open trigger" }));
      expect((screen.getByRole("combobox") as HTMLInputElement).value).toBe("");
    } finally {
      window.removeEventListener("keydown", guard, { capture: true });
    }
  });

  it('returns focus to the trigger when closed', async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it('marks the scrim and panel with data-overlay-spring', () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={projects}
        onSelectProject={() => {}}
      />,
    );

    expect(
      document.querySelectorAll('[data-overlay-spring="true"]').length,
    ).toBeGreaterThanOrEqual(2);
  });
});

// A scrim click closes. Dialog.Content is itself a full-screen wrapper, so Radix sees no outside to
// click.
describe('GlobalSearch scrim click closes', () => {
  const nodes: KnowledgeGraphNode[] = [
    node({ id: "capability:mcp-server", title: "MCP Server", kind: "capability" }),
  ];

  function renderPalette(onOpenChange: (open: boolean) => void) {
    render(
      <GlobalSearch
        open
        onOpenChange={onOpenChange}
        nodes={nodes}
        onSelectNode={() => {}}
      />,
    );
  }

  it('closes when the wrapper scrim is clicked', () => {
    const onOpenChange = vi.fn();
    renderPalette(onOpenChange);

    fireEvent.pointerDown(screen.getByRole("dialog"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it('stays open when the panel interior is clicked', () => {
    const onOpenChange = vi.fn();
    renderPalette(onOpenChange);

    fireEvent.pointerDown(screen.getByRole("combobox", { name: COMMAND_LABEL }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

/** The footer names the searched scope beside the count in every state. */
describe("GlobalSearch — footer names the searched scope", () => {
  const nodes: KnowledgeGraphNode[] = [
    node({ id: "capability:mcp-server", title: "MCP Server", kind: "capability" }),
    node({ id: "capability:checkout", title: "Checkout", kind: "capability" }),
  ];

  function footerText(): string {
    // Three spans with a CSS gap, joined the way the eye reads them.
    return Array.from(screen.getByTestId("global-search-footer-count").children)
      .map((child) => child.textContent?.trim() ?? "")
      .join(" ");
  }

  it("names the single loaded project beside the indexed count", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={[project({ slug: "storefront", name: "Online Store" })]}
        onSelectProject={() => {}}
      />,
    );

    expect(footerText()).toBe("3 indexed · Online Store");
  });

  it("never breaks the number and lets only the scope name truncate", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={[project({ slug: "storefront", name: "Online Store" })]}
        onSelectProject={() => {}}
      />,
    );
    // Only the scope name yields in a narrow footer; the count and hints keep their width.
    const count = screen.getByTestId("global-search-footer-count");
    expect(count.className).toContain("min-w-0");
    expect(count.children[0]?.className).toContain("shrink-0");
    const scope = screen.getByTestId("global-search-footer-scope");
    expect(scope.className).toContain("truncate");
    expect(scope.className).toContain("min-w-0");
    expect(count.nextElementSibling?.className).toContain("shrink-0");
  });

  it("reads the scope name in the reader's locale, like the map label does", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={[
          ...nodes,
          node({
            id: "project:storefront",
            title: "Online Store",
            kind: "project",
            displayLocales: { en: "Online Store (EN)" },
          }),
        ]}
        onSelectNode={() => {}}
        projects={[project({ slug: "storefront", name: "Online Store" })]}
        onSelectProject={() => {}}
      />,
    );
    expect(footerText()).toBe("3 indexed · Online Store (EN)");
  });

  it("counts only what the map draws, so a starter README is not an indexed concept", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={[...nodes, node({ id: "vault-readme:README", title: "My ontology vault", kind: "vault-readme" })]}
        onSelectNode={() => {}}
        projects={[project({ slug: "storefront", name: "Online Store" })]}
        onSelectProject={() => {}}
      />,
    );
    expect(footerText()).toBe("3 indexed · Online Store");
  });

  it("keeps the name beside the match count once a query narrows the list", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={[project({ slug: "storefront", name: "Online Store" })]}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
      target: { value: "mcp server" },
    });

    expect(footerText()).toBe("1 matches · Online Store");
  });

  /* A project card and its `kind:project` node are one thing and count once in matches. */
  it("counts a project that also matched as a node once", () => {
    render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={[
          ...nodes,
          node({ id: "project:storefront", title: "Online Store", kind: "project" }),
        ]}
        onSelectNode={() => {}}
        projects={[project({ slug: "storefront", name: "Online Store" })]}
        onSelectProject={() => {}}
      />,
    );

    fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
      target: { value: "Online Store" },
    });

    expect(footerText()).toBe("1 matches · Online Store");
  });

  it("falls back to the folder, or on the map to the map, when no single project names the scope", () => {
    const twoProjects = [
      project({ slug: "storefront", name: "Online Store" }),
      project({ slug: "atlas", name: "Ontology Atlas" }),
    ];
    const copy = enMessages.searchWidgets.globalSearch;
    const { unmount } = render(
      <GlobalSearch
        open
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={twoProjects}
        onSelectProject={() => {}}
      />,
    );
    expect(footerText()).toBe(`4 indexed · ${copy.scopeFallback}`);
    unmount();

    render(
      <GlobalSearch
        open
        onMap
        onOpenChange={() => {}}
        nodes={nodes}
        onSelectNode={() => {}}
        projects={twoProjects}
        onSelectProject={() => {}}
      />,
    );
    expect(footerText()).toBe(`4 indexed · ${copy.onMap.scopeFallback}`);
  });
});

/**
 * Map wording renders only on the map: each `onMap` string is swapped for a marker, and the test
 * drives every state that shows them, both on and off the map.
 */
describe("GlobalSearch — says \"map\" only on the map", () => {
  const MARK = "MAP-ONLY:";
  const mapOnlyKeys = Object.keys(enMessages.searchWidgets.globalSearch.onMap);

  function marked() {
    const messages = structuredClone(enMessages);
    const onMap: Record<string, string> = messages.searchWidgets.globalSearch.onMap;
    for (const key of mapOnlyKeys) onMap[key] = `${MARK}${key}`;
    return messages;
  }

  /** Every state that shows a placed string: the dialog chrome, a miss, and an empty folder. */
  function renderEveryState(onMap: boolean): string {
    const messages = marked();
    const nodes = [node({ id: "capability:checkout", title: "Checkout" })];
    const twoProjects = [
      project({ slug: "storefront", name: "Online Store" }),
      project({ slug: "atlas", name: "Ontology Atlas" }),
    ];
    const seen: string[] = [];
    const miss = rtlRender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GlobalSearch
          open
          onMap={onMap}
          onOpenChange={() => {}}
          nodes={nodes}
          onSelectNode={() => {}}
          projects={twoProjects}
          onSelectProject={() => {}}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.change(screen.getByRole("combobox"), { target: { value: "no-such-thing" } });
    seen.push(document.body.innerHTML);
    miss.unmount();

    const empty = rtlRender(
      <NextIntlClientProvider locale="en" messages={messages}>
        <GlobalSearch open onMap={onMap} onOpenChange={() => {}} nodes={[]} onSelectNode={() => {}} projects={[]} onSelectProject={() => {}} />
      </NextIntlClientProvider>,
    );
    seen.push(document.body.innerHTML);
    empty.unmount();
    return seen.join("\n");
  }

  it("renders no map-only string when it opens off the map", () => {
    const html = renderEveryState(false);
    expect(html).not.toContain(MARK);
  });

  it("renders every map-only string on the map, so the check above can fail", () => {
    const html = renderEveryState(true);
    for (const key of mapOnlyKeys) expect(html, key).toContain(`${MARK}${key}`);
  });
});

/**
 * Focus leaves when the dialog closes, not after its exit motion. The content is given the
 * browser's animation names so Radix keeps it mounted until `animationend`, as on screen.
 */
describe("GlobalSearch — focus leaves with the dialog", () => {
  const nodes = [node({ id: "capability:checkout", title: "Checkout" })];

  beforeEach(() => {
    const original = window.getComputedStyle.bind(window);
    vi.spyOn(window, "getComputedStyle").mockImplementation((element, pseudo) => {
      const style = original(element, pseudo);
      if (!(element instanceof HTMLElement) || element.getAttribute("role") !== "dialog") return style;
      return new Proxy(style, {
        get(target, property) {
          if (property === "animationName") {
            return element.getAttribute("data-state") === "closed" ? "overlaySpringOut" : "overlaySpringIn";
          }
          const value = Reflect.get(target, property, target);
          return typeof value === "function" ? value.bind(target) : value;
        },
      });
    });
  });

  afterEach(() => {
    vi.restoreAllMocks();
  });

  function Opener() {
    const [open, setOpen] = useState(false);
    return (
      <>
        <button type="button" onClick={() => setOpen(true)}>
          open trigger
        </button>
        <button type="button">another sheet</button>
        <GlobalSearch open={open} onOpenChange={setOpen} nodes={nodes} onSelectNode={() => {}} />
      </>
    );
  }

  function openFromTrigger() {
    render(<Opener />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    expect(document.activeElement).toBe(screen.getByRole("combobox"));
    return trigger;
  }

  function finishExit(content: Element) {
    const end = new Event("animationend", { bubbles: true });
    Object.defineProperty(end, "animationName", { value: "overlaySpringOut" });
    act(() => {
      content.dispatchEvent(end);
    });
  }

  it("lets go of focus as soon as it closes, while its exit still plays", () => {
    openFromTrigger();
    fireEvent.keyDown(document, { key: "Escape" });
    const content = document.querySelector('[role="dialog"]');
    expect(content, "the exit should still be playing").toHaveAttribute("data-state", "closed");
    expect(content?.contains(document.activeElement), "focus stayed in the closed field").toBe(false);
  });

  it("still returns focus to the opener once the exit ends, when nothing else took it", async () => {
    const trigger = openFromTrigger();
    fireEvent.keyDown(document, { key: "Escape" });
    finishExit(document.querySelector('[role="dialog"]')!);
    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("leaves focus with a surface that took it during the exit", async () => {
    openFromTrigger();
    fireEvent.keyDown(document, { key: "Escape" });
    const sheet = screen.getByRole("button", { name: "another sheet", hidden: true });
    sheet.focus();
    finishExit(document.querySelector('[role="dialog"]')!);
    // `onCloseAutoFocus` decides synchronously on unmount, so no extra wait is needed.
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    expect(document.activeElement, "the closing search pulled focus back to its opener").toBe(sheet);
  });
});
