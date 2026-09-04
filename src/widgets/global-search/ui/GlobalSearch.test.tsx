import { useState } from "react";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { beforeAll, describe, expect, it, vi } from "vitest";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import type { Project } from "@/entities/project";
import enMessages from "../../../../messages/en.json";
import { GlobalSearch } from "./GlobalSearch";

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

    fireEvent.change(screen.getByRole("combobox", { name: "Search this map" }), {
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

    fireEvent.change(screen.getByRole("combobox", { name: "Search this map" }), {
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

    fireEvent.change(screen.getByRole("combobox", { name: "Search this map" }), {
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

    fireEvent.change(screen.getByRole("combobox", { name: "Search this map" }), {
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

  it("닫히면 트리거로 포커스가 복귀한다", () => {
    render(<Harness />);
    const trigger = screen.getByRole("button", { name: "open trigger" });
    trigger.focus();
    fireEvent.click(trigger);
    fireEvent.keyDown(document, { key: "Escape" });

    expect(document.activeElement).toBe(trigger);
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

    fireEvent.pointerDown(screen.getByRole("combobox", { name: "Search this map" }));

    expect(onOpenChange).not.toHaveBeenCalled();
  });
});
