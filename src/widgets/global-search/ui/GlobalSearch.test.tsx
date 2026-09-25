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

// cmdk (Command) plus @tanstack/react-virtual's project chip row require
// ResizeObserver, which jsdom lacks — a minimal stub is needed.
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
 * persona-P1 regression guard — the two contracts underlying the flow of finding
 * "MCP Server" and choosing it without leaving the map, pinned at component level:
 *
 * 1. The onSelectNode callback — HomePage overrides it with handleSelect(node.id) to
 *    stay on the map. That the callback is called with the right node is the
 *    precondition for the override to mean anything.
 * 2. The kind filter chips — the old header search (SearchPalette)'s ALL/HUB/NODE
 *    chips were on an axis that never touched ontology nodes, so they felt like a
 *    no-op. This pins that the unified palette's (GlobalSearch) kind chips really do
 *    narrow the results.
 */
describe("GlobalSearch", () => {
  const nodes: KnowledgeGraphNode[] = [
    node({ id: "capability:mcp-server", title: "MCP Server", kind: "capability" }),
    node({ id: "capability:mcp-conflict-guard", title: "MCP Conflict Guard", kind: "capability" }),
    node({ id: "element:mcp-index", title: "mcp/src/index.js", kind: "element" }),
    node({ id: "domain:ai-agent-partner", title: "AI Agent Partner", kind: "domain" }),
  ];
  const projects: Project[] = [project({ slug: "ontology-atlas", name: "ontology-atlas" })];

  it("검색 결과에 ontology 노드가 포함된다 (project/doc 만 있던 이전 헤더 팔레트와의 차이)", () => {
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

  it("ontology 노드 결과를 고르면 onSelectNode 가 정확한 노드로 호출된다", () => {
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

  it("kind 필터 칩이 실제로 결과를 좁힌다 (no-op 회귀 방지)", () => {
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

  // 2026-09-19 — cmdk's root listens for Enter across the whole palette and turns it
  // into "open the highlighted row", preventDefault included, so it swallowed Enter
  // pressed on a control. Measured live: tabbing to a kind chip and pressing Enter
  // left the chip aria-pressed="false" and instead closed the palette and flew the
  // map to whichever row happened to be highlighted. The close button did the same.
  describe("Enter 는 포커스된 컨트롤의 것이다", () => {
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

    it("필터 칩 위의 Enter 는 결과를 열지 않는다", () => {
      const onSelectNode = openPalette();
      fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
        target: { value: "mcp" },
      });
      const chip = screen.getByRole("button", { name: "Element" });
      chip.focus();
      fireEvent.keyDown(chip, { key: "Enter" });
      expect(onSelectNode).not.toHaveBeenCalled();
    });

    it("닫기 버튼 위의 Enter 도 결과를 열지 않는다", () => {
      const onSelectNode = openPalette();
      fireEvent.change(screen.getByRole("combobox", { name: COMMAND_LABEL }), {
        target: { value: "mcp" },
      });
      const close = screen.getByTestId("global-search-close");
      close.focus();
      fireEvent.keyDown(close, { key: "Enter" });
      expect(onSelectNode).not.toHaveBeenCalled();
    });

    it("검색칸 위의 Enter 는 그대로 결과를 연다", () => {
      // The behaviour the guard must not cost: from the field, Enter is exactly
      // "open the highlighted row".
      const onSelectNode = openPalette();
      const field = screen.getByRole("combobox", { name: COMMAND_LABEL });
      fireEvent.change(field, { target: { value: "mcp server" } });
      fireEvent.keyDown(field, { key: "Enter" });
      expect(onSelectNode).toHaveBeenCalledTimes(1);
    });
  });

  it("N12 — 파일 경로 형태 element title 은 mono/quaternary 로 강등되고, 일반 title 은 그대로 primary", () => {
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
   * rank2/18 (design council batch B1) — the overlay a11y backbone. Radix Dialog
   * provides ESC and trigger focus return by default, but GlobalSearch is controlled
   * (open/onOpenChange managed externally), so this has to be pinned as actually
   * working at component level.
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

  it("ESC 를 누르면 닫힌다 (onOpenChange(false))", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);

    expect(screen.getByRole("dialog")).toBeInTheDocument();

    fireEvent.keyDown(document, { key: "Escape" });

    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  /**
   * The Esc contract (measured regression, 2026-07-26) — the footer promises
   * "ESC Close", so **the first** Esc closes it and clears the input and filters.
   *
   * The real defect: Radix sets `aria-hidden` on siblings rather than adding
   * `aria-modal`, while this app's global Esc discipline (the first-run card's
   * window-capture handler, the auto-tour firing guard) decides "is a modal open"
   * with `[role="dialog"][aria-modal="true"]`. With no declaration those handlers
   * could not see the search window and intercepted Esc with preventDefault, so the
   * first press left both the dialog and the input untouched (only the second
   * closed it). The two tests below pin both axes.
   */
  it("열려 있으면 aria-modal 로 모달임을 선언한다 (전역 Esc 규율의 판정 근거)", () => {
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

  it("첫 Esc 한 번에 닫히고 입력값이 비워진다 — 모달에 양보하는 전역 캡처 핸들러가 있어도", () => {
    // Imitates the first-run card's (`use-first-run-starter`) real contract exactly:
    // window capture plus preventDefault, yielding while a modal is open.
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

  it("닫히면 트리거로 포커스가 복귀한다", async () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    await waitFor(() => expect(document.activeElement).toBe(trigger));
  });

  it("data-overlay-spring 검증마커가 스크림·패널에 있다", () => {
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

// Owner report (2026-07-25): "When clicking the search button ... clicking outside should close it
// but it doesn't — don't most close on x or an outside click?" (clicking outside should close
// it and doesn't — don't most close on x or an outside click?). Right — that is the
// de facto standard for command palettes (Linear · VS Code · Raycast · Spotlight),
// and this app's other overlays (the settings sheet, the docs drawer, the trail
// panel) already close on a scrim click. Only the search palette was out of step.
//
// Why it did not close: `Dialog.Content` itself is a `fixed inset-0` flex wrapper
// covering the whole screen, so the area that looks like a scrim is actually
// **inside** Content. As far as Radix's `onPointerDownOutside` was concerned, no
// "outside" existed.
describe("GlobalSearch — 스크림 클릭 닫기 계약", () => {
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

  it("래퍼(스크림) 를 누르면 닫힌다", () => {
    const onOpenChange = vi.fn();
    renderPalette(onOpenChange);

    fireEvent.pointerDown(screen.getByRole("dialog"));

    expect(onOpenChange).toHaveBeenCalledWith(false);
  });

  it("패널 내부를 누르면 닫히지 않는다 — 결과 클릭이 팔레트를 죽이면 안 된다", () => {
    const onOpenChange = vi.fn();
    renderPalette(onOpenChange);

    fireEvent.pointerDown(screen.getByRole("combobox", { name: COMMAND_LABEL }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});

/**
 * Footer scope contract (owner report, 2026-09-04).
 *
 * The dialog title is visually hidden for Radix, so before this the scope was named
 * only inside the zero-result sentence; "0 MATCHES" on a sample that simply lacks
 * the word read as a broken search. The footer is the one line present in every
 * state, so the corpus name rides along with the count there.
 */
describe("GlobalSearch — footer names the searched scope", () => {
  const nodes: KnowledgeGraphNode[] = [
    node({ id: "capability:mcp-server", title: "MCP Server", kind: "capability" }),
    node({ id: "capability:checkout", title: "Checkout", kind: "capability" }),
  ];

  function footerText(): string {
    // The count, the separator, and the scope are three spans with a CSS gap;
    // join them the way the eye reads them.
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
    // Measured 2026-09-04: "172.9px + 186.9px of hints" in a 346px footer wrapped
    // the proper noun mid-phrase on every phone width. The count keeps its width,
    // the hints keep theirs, the name is the one thing that yields.
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

  /*
   * The same double-count the indexed total already subtracts, now on the matches. A project
   * card and its `kind:project` node are one thing, so a query equal to the project's name
   * matched both and the footer said "2 matches" about one project.
   */
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
 * **The map's words stay on the map** (2026-09-26).
 *
 * The shell opens this dialog on Library, Git, Automations, Agents, the harness and Insights, and
 * a reviewer read `No matches for "…" in this map.` on the Library, under a dialog named "Search
 * this map". Every string that speaks of the map lives under `onMap`; here each of them is swapped
 * for a marker, and the dialog is driven through the states that show them. Off the map no marker
 * may render — in text or in an accessible name — and on the map every one of them must, so the
 * check cannot pass by rendering nothing.
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
 * **Focus leaves with the dialog, not after its exit motion** (2026-09-26).
 *
 * Measured against a real folder: after Esc the search stayed mounted for its exit animation with
 * focus still in its field, so `?` pressed at once was taken as typing and opened nothing; and
 * when focus came back at unmount it was pulled to the opener even if another sheet had opened.
 *
 * jsdom plays no CSS, so Radix would unmount at once and there would be no exit to observe. The
 * dialog content is given the animation names the browser reports (`overlaySpringOut` while
 * closed), so Radix keeps it mounted with `data-state="closed"` until `animationend`, as it does
 * on screen.
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
    await waitFor(() => expect(document.querySelector('[role="dialog"]')).toBeNull());
    await new Promise((resolve) => setTimeout(resolve, 10));
    expect(document.activeElement, "the closing search pulled focus back to its opener").toBe(sheet);
  });
});
