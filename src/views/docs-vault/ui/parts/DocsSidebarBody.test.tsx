import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import type { DocsTreeGroup, DocsTreeSort } from "@/widgets/docs-vault/lib/tree-order";
import type { DocsVaultCollection } from "../../lib/docs-vault-collection";
import type { AgentFilesUiModel } from "@/entities/agent-files";
import { DOCS_HEAD_LABEL_MIN_PX, DocsSidebarBody } from "./DocsSidebarBody";

function makeDoc(
  slug: string,
  title: string,
  updatedAt: string,
  frontmatter: Record<string, unknown> = {},
): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter,
    headings: [],
    excerpt: "",
    wordCount: 0,
    updatedAt,
    linksOut: [],
  };
}

function makeManifest(docs: VaultDoc[]): VaultManifest {
  return {
    version: "1",
    generatedAt: new Date().toISOString(),
    docs,
    backlinksDetail: {},
    tags: {},
    tree: { name: "root", path: "", type: "dir" },
  };
}

function renderSidebar(
  docs: VaultDoc[],
  overrides: {
    canCreateNewDoc?: boolean;
    agentFiles?: AgentFilesUiModel | null;
    sort?: DocsTreeSort;
    group?: DocsTreeGroup;
    tree?: VaultManifest["tree"];
    collection?: DocsVaultCollection;
    collectionCounts?: Record<DocsVaultCollection, number>;
    showCollectionChooser?: boolean;
    showCreateDocument?: boolean;
  } = {},
) {
  const manifest = makeManifest(docs);
  if (overrides.tree) manifest.tree = overrides.tree;
  const onSelect = vi.fn();
  const onCreateNewDoc = vi.fn();
  const onSortChange = vi.fn();
  const onGroupChange = vi.fn();
  const view = render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <DocsSidebarBody
        reviewQueue={[]}
        pinnedSlugs={[]}
        recentSlugs={[]}
        selectedSlug={null}
        docsBySlug={new Map(docs.map((d) => [d.slug, d]))}
        activeTag={null}
        manifest={manifest}
        collection={overrides.collection ?? "guides"}
        collectionCounts={
          overrides.collectionCounts ?? {
            all: docs.length,
            guides: docs.length,
            ontology: 0,
          }
        }
        showCollectionChooser={overrides.showCollectionChooser}
        showCreateDocument={overrides.showCreateDocument}
        visibleDocSlugs={new Set(docs.map((d) => d.slug))}
        onSelect={onSelect}
        onCollectionChange={() => {}}
        onTogglePin={() => {}}
        onTagSelect={() => {}}
        onCreateNewDoc={onCreateNewDoc}
        canCreateNewDoc={overrides.canCreateNewDoc ?? true}
        sort={overrides.sort ?? "name"}
        group={overrides.group ?? "folders"}
        onSortChange={onSortChange}
        onGroupChange={onGroupChange}
        agentFiles={overrides.agentFiles ?? null}
      />
    </NextIntlClientProvider>,
  );
  return { ...view, onSelect, onCreateNewDoc, onSortChange, onGroupChange };
}

describe("DocsSidebarBody recently changed docs section", () => {
  const now = Date.now();
  const recentIso = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
  const oldIso = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days ago

  it("is collapsed by default and shows only recent docs when opened", () => {
    renderSidebar([makeDoc("a", "Recent Doc", recentIso), makeDoc("b", "Old Doc", oldIso)]);

    expect(screen.queryByTestId("docs-sidebar-recently-changed-list")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("docs-sidebar-recently-changed-toggle"));
    expect(screen.getByTestId("docs-sidebar-recently-changed-list")).toBeInTheDocument();
    expect(screen.getByText("Recent Doc")).toBeInTheDocument();
    expect(screen.queryByText("Old Doc")).not.toBeInTheDocument();
  });

  it("hides the strip entirely when nothing changed in the last 7 days", () => {
    renderSidebar([makeDoc("b", "Old Doc", oldIso)]);
    expect(screen.queryByTestId("docs-sidebar-recently-changed-toggle")).not.toBeInTheDocument();
  });

  it("toggling the header expands and re-collapses the list", () => {
    renderSidebar([makeDoc("a", "Recent Doc", recentIso)]);
    const toggle = screen.getByTestId("docs-sidebar-recently-changed-toggle");
    expect(screen.queryByTestId("docs-sidebar-recently-changed-list")).not.toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.getByTestId("docs-sidebar-recently-changed-list")).toBeInTheDocument();

    fireEvent.click(toggle);
    expect(screen.queryByTestId("docs-sidebar-recently-changed-list")).not.toBeInTheDocument();
  });

  it("clicking a doc in the strip calls onSelect with its slug", () => {
    const { onSelect } = renderSidebar([makeDoc("a", "Recent Doc", recentIso)]);
    fireEvent.click(screen.getByTestId("docs-sidebar-recently-changed-toggle"));
    fireEvent.click(screen.getByText("Recent Doc"));
    expect(onSelect).toHaveBeenCalledWith("a");
  });
});

describe("DocsSidebarBody icon row search toggle and count", () => {
  it("opens search from the toggle and shows the match count", () => {
    renderSidebar([
      makeDoc("payment", "결제 문서", new Date().toISOString()),
      makeDoc("order", "주문 문서", new Date().toISOString()),
      makeDoc("ship", "배송 문서", new Date().toISOString()),
    ]);
    expect(
      screen.queryByPlaceholderText(
        koMessages.vaultWidgets.parts.sidebar.searchPlaceholder,
      ),
    ).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("docs-sidebar-search-toggle"));
    const search = screen.getByPlaceholderText(
      koMessages.vaultWidgets.parts.sidebar.searchPlaceholder,
    );
    fireEvent.change(search, { target: { value: "결제" } });
    expect(screen.getAllByText("검색 결과 1개").length).toBeGreaterThan(0);
  });

  it("matches the visible localized name and reports the same count", () => {
    renderSidebar([
      makeDoc(
        "capabilities/local-vault",
        "Local vault and data sources",
        new Date().toISOString(),
        { display_ko: "로컬 볼트 및 데이터소스 관리" },
      ),
      makeDoc("capabilities/checkout", "Checkout", new Date().toISOString()),
    ]);

    fireEvent.click(screen.getByTestId("docs-sidebar-search-toggle"));
    fireEvent.change(
      screen.getByPlaceholderText(koMessages.vaultWidgets.parts.sidebar.searchPlaceholder),
      { target: { value: "로컬" } },
    );

    expect(screen.getAllByText("검색 결과 1개").length).toBeGreaterThan(0);
  });

  it("shows the three collection icons and switches on click", () => {
    const onCollectionChange = vi.fn();
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocsSidebarBody
          reviewQueue={[]}
        pinnedSlugs={[]}
          recentSlugs={[]}
          selectedSlug={null}
          docsBySlug={new Map()}
          activeTag={null}
          manifest={makeManifest([])}
          collection="guides"
          collectionCounts={{ all: 0, guides: 0, ontology: 0 }}
          visibleDocSlugs={new Set()}
          onSelect={() => {}}
          onCollectionChange={onCollectionChange}
          onTogglePin={() => {}}
          onTagSelect={() => {}}
          onCreateNewDoc={() => {}}
          canCreateNewDoc
          sort="name"
          group="folders"
          onSortChange={() => {}}
          onGroupChange={() => {}}
          agentFiles={null}
        />
      </NextIntlClientProvider>,
    );
    expect(screen.getByTestId("docs-sidebar-collection-all")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-collection-guides")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-collection-ontology")).toBeInTheDocument();
    fireEvent.click(screen.getByTestId("docs-sidebar-collection-ontology"));
    expect(onCollectionChange).toHaveBeenCalledWith("ontology");
  });

  it("hides other collections in a fixed ontology scope", () => {
    renderSidebar([], { showCollectionChooser: false });

    expect(screen.queryByTestId("docs-sidebar-collection-all")).not.toBeInTheDocument();
    expect(screen.queryByTestId("docs-sidebar-collection-guides")).not.toBeInTheDocument();
    expect(screen.queryByTestId("docs-sidebar-collection-ontology")).not.toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-search-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-order-toggle")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-new-doc")).toBeInTheDocument();
  });

  /** The active chip states its own name, so the name is looked for on the chip. */
  it("shows the name of the active view", () => {
    const docs = [
      makeDoc("a", "A", new Date().toISOString()),
      makeDoc("b", "B", new Date().toISOString()),
      makeDoc("c", "C", new Date().toISOString()),
    ];
    renderSidebar(docs, {
      collection: "ontology",
      collectionCounts: { all: 3, guides: 1, ontology: 2 },
    });
    const active = screen.getByTestId("docs-sidebar-collection-ontology");
    expect(active).toHaveTextContent("지도 문서");
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(active).toHaveAttribute("role", "radio");
    // Only the active view speaks, so an unselected chip has no name.
    expect(screen.getByTestId("docs-sidebar-collection-all")).toHaveTextContent("");
    expect(screen.queryByText("전체 문서")).not.toBeInTheDocument();
  });

  it("shows the all-docs name on the active chip", () => {
    const docs = [
      makeDoc("a", "A", new Date().toISOString()),
      makeDoc("b", "B", new Date().toISOString()),
      makeDoc("c", "C", new Date().toISOString()),
    ];
    renderSidebar(docs, {
      collection: "all",
      collectionCounts: { all: 3, guides: 1, ontology: 2 },
    });
    const active = screen.getByTestId("docs-sidebar-collection-all");
    expect(active).toHaveTextContent("전체 문서");
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(active).toHaveAttribute("role", "radio");
    // The count stays in the accessible name so the label does not eat width.
    expect(active.getAttribute("aria-label")).toContain("3");
  });

  /**
   * Tailwind needs the `@min-[…px]/docs-head:` threshold written literally, so this checks it equals
   * the constant; jsdom has no container queries (`docs-sidebar-head.spec.ts` measures the render).
   */
  it("draws the active name only when the row is wide enough", () => {
    const docs = [makeDoc("a", "A", new Date().toISOString())];
    renderSidebar(docs, {
      collection: "all",
      collectionCounts: { all: 1, guides: 1, ontology: 0 },
    });
    const label = screen.getByText("전체 문서");
    expect(label.className).toContain("hidden");
    expect(label.className).toContain(`@min-[${DOCS_HEAD_LABEL_MIN_PX}px]/docs-head:inline`);
    // The row, not the window, is the container: the pane renders at several widths in one viewport.
    const row = screen.getByTestId("docs-sidebar-head-row");
    expect(row.className).toContain("@container/docs-head");
    expect(screen.getByTestId("docs-sidebar-new-doc").parentElement?.className).toContain(
      "flex-none",
    );
  });

  it("renders no caption row without a query or tag", () => {
    renderSidebar([makeDoc("a", "A", new Date().toISOString())], {
      collection: "all",
      collectionCounts: { all: 1, guides: 0, ontology: 1 },
    });
    expect(screen.queryByText(/개$/)).not.toBeInTheDocument();
  });
});

describe("DocsSidebarBody agent files group", () => {
  const model: AgentFilesUiModel = {
    records: [
      { slug: "CLAUDE", path: "CLAUDE.md", kind: "instructions", tools: ["claude-code"], drift: ["missing-agents-import"] },
      { slug: "AGENTS", path: "AGENTS.md", kind: "instructions", tools: ["codex", "cursor", "gemini-cli"], drift: [] },
    ],
    driftCount: 1,
  };

  it("stays hidden when the vault does not include the repo root (agentFiles=null)", () => {
    renderSidebar([]);
    expect(screen.queryByTestId("docs-sidebar-agent-files")).not.toBeInTheDocument();
  });

  it("renders tool badges per file and an amber drift badge on drifted files", () => {
    renderSidebar([], { agentFiles: model });
    expect(screen.getByTestId("docs-sidebar-agent-files")).toBeInTheDocument();
    expect(screen.getByText("CLAUDE.md")).toBeInTheDocument();
    expect(screen.getByText("Claude Code")).toBeInTheDocument();
    expect(screen.getByText("Codex · Cursor · Gemini CLI")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-agent-file-drift-CLAUDE")).toBeInTheDocument();
    expect(screen.queryByTestId("docs-sidebar-agent-file-drift-AGENTS")).not.toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-agent-files-drift-count")).toBeInTheDocument();
  });

  it("clicking a file opens it through the existing editor path (onSelect)", () => {
    const { onSelect } = renderSidebar([], { agentFiles: model });
    fireEvent.click(screen.getByText("AGENTS.md"));
    expect(onSelect).toHaveBeenCalledWith("AGENTS");
  });

  it("hides the drift count pill when everything is in sync", () => {
    renderSidebar([], {
      agentFiles: {
        records: [
          { slug: "CLAUDE", path: "CLAUDE.md", kind: "instructions", tools: ["claude-code"], drift: [] },
        ],
        driftCount: 0,
      },
    });
    expect(screen.queryByTestId("docs-sidebar-agent-files-drift-count")).not.toBeInTheDocument();
  });
});

describe("DocsSidebarBody new doc entry point", () => {
  it("hides creation in the exact-document compatibility reader", () => {
    renderSidebar([], { showCreateDocument: false });
    expect(screen.queryByTestId("docs-sidebar-new-doc")).not.toBeInTheDocument();
  });

  it("calls onCreateNewDoc when the tree-header new-doc button is enabled and clicked", () => {
    const { onCreateNewDoc } = renderSidebar([], { canCreateNewDoc: true });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onCreateNewDoc).toHaveBeenCalledTimes(1);
  });

  /**
   * Pressable in the read-only sample, since `disabled` drops it from the Tab order; it leads to
   * opening a folder and says so in its label.
   */
  it("keeps the new-doc button reachable in read-only sample mode — it routes to what unblocks it", () => {
    const { onCreateNewDoc } = renderSidebar([], { canCreateNewDoc: false });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    expect(button).toBeInTheDocument();
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCreateNewDoc).toHaveBeenCalledTimes(1);
    expect(button.getAttribute("aria-label")).toMatch(/폴더/);
  });
});

describe("DocsSidebarBody list order menu", () => {
  // A miniature of the dogfood top level, where alphabetical order buried folders among documents.
  const tree: VaultManifest["tree"] = {
    name: "root",
    path: "",
    type: "dir",
    children: [
      { name: "architecture", path: "architecture.md", type: "doc", slug: "architecture", title: "Architecture" },
      {
        name: "archive",
        path: "archive",
        type: "dir",
        children: [
          { name: "old", path: "archive/old.md", type: "doc", slug: "archive/old", title: "Old note" },
        ],
      },
      { name: "backlog", path: "backlog.md", type: "doc", slug: "backlog", title: "Backlog" },
      {
        name: "benchmark",
        path: "benchmark",
        type: "dir",
        children: [
          { name: "run", path: "benchmark/run.md", type: "doc", slug: "benchmark/run", title: "Run" },
        ],
      },
    ],
  };
  const iso = new Date().toISOString();
  const docs = [
    makeDoc("architecture", "Architecture", iso),
    makeDoc("backlog", "Backlog", iso),
    makeDoc("archive/old", "Old note", iso),
    makeDoc("benchmark/run", "Run", iso),
  ];

  /** Top-level rows only; collapsed folders are not inspected. */
  function treeLabels() {
    const nav = screen.getByRole("navigation", {
      name: koMessages.vaultWidgets.tree.navAria,
    });
    return [...nav.children].map(
      (row) => row.querySelector("span.truncate")?.textContent?.trim() ?? "",
    );
  }

  it("lists folders first by default", () => {
    renderSidebar(docs, { tree });
    expect(treeLabels().slice(0, 2)).toEqual(["archive", "benchmark"]);
  });

  it("lists docs first when chosen", () => {
    renderSidebar(docs, { tree, group: "docs" });
    expect(treeLabels().slice(0, 2)).toEqual(["Architecture", "Backlog"]);
  });

  it("starts closed and shows both axes when opened", () => {
    renderSidebar(docs, { tree });
    expect(screen.queryByTestId("docs-sidebar-order-menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("docs-sidebar-order-toggle"));
    expect(screen.getByTestId("docs-sidebar-order-menu")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-order-sort-recent")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-order-group-docs")).toBeInTheDocument();
  });

  it("checks the chosen value in each axis", () => {
    renderSidebar(docs, { tree, sort: "recent", group: "docs" });
    fireEvent.click(screen.getByTestId("docs-sidebar-order-toggle"));
    expect(screen.getByTestId("docs-sidebar-order-sort-recent")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("docs-sidebar-order-sort-name")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("docs-sidebar-order-group-docs")).toHaveAttribute("aria-checked", "true");
  });

  it("changes only the chosen axis and closes the menu", () => {
    const { onSortChange, onGroupChange } = renderSidebar(docs, { tree });
    fireEvent.click(screen.getByTestId("docs-sidebar-order-toggle"));
    fireEvent.click(screen.getByTestId("docs-sidebar-order-sort-recent"));
    expect(onSortChange).toHaveBeenCalledWith("recent");
    expect(onGroupChange).not.toHaveBeenCalled();
    // "Closed" means inert during the `Surface` exit window, not unmounted at once.
    const menu = screen.getByTestId("docs-sidebar-order-menu");
    expect(menu).toHaveAttribute("data-surface-state", "exiting");
    expect(menu).toHaveAttribute("inert");
  });
});

/**
 * Which state reaches the accessibility tree per rail button; lint and axe cannot see a missing
 * or wrongly paired attribute, so these tests do.
 */
describe("DocsSidebarBody rail button state semantics", () => {
  const orderTree: VaultManifest["tree"] = {
    name: "root",
    path: "",
    type: "dir",
    children: [
      { name: "architecture", path: "architecture.md", type: "doc", slug: "architecture", title: "Architecture" },
    ],
  };
  const orderDocs = [makeDoc("architecture", "Architecture", new Date().toISOString())];

  it("announces no pressed state for the new doc action", () => {
    renderSidebar([], { canCreateNewDoc: true });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    // An action has no pressed state.
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).not.toHaveAttribute("aria-expanded");
  });

  it("announces the pressed state for the filter toggle", () => {
    renderSidebar([]);
    const button = screen.getByTestId("docs-sidebar-search-toggle");
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(screen.getByTestId("docs-sidebar-search-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("marks the sort button with expanded and haspopup, not pressed", () => {
    renderSidebar(orderDocs, { tree: orderTree });
    const button = screen.getByTestId("docs-sidebar-order-toggle");
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getByTestId("docs-sidebar-order-toggle")).toHaveAttribute("aria-expanded", "true");
  });

  /** The visible state and the spoken state are separate facts. */
  it("highlights a non-default sort while reporting the menu closed", () => {
    // No class name is pinned (`.claude/rules/documentation.md`); only that the two facts separate.
    const { unmount } = renderSidebar(orderDocs, { tree: orderTree });
    const atDefault = screen.getByTestId("docs-sidebar-order-toggle");
    const defaultClass = atDefault.className;
    expect(atDefault).toHaveAttribute("aria-expanded", "false");
    unmount();

    renderSidebar(orderDocs, { tree: orderTree, sort: "recent" });
    const atRecent = screen.getByTestId("docs-sidebar-order-toggle");
    expect(atRecent.className).not.toBe(defaultClass);
    // The spoken state follows only the menu.
    expect(atRecent).toHaveAttribute("aria-expanded", "false");
  });
});
