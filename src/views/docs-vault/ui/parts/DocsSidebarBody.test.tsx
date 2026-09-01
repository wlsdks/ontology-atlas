import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
import type { DocsTreeGroup, DocsTreeSort } from "@/widgets/docs-vault/lib/tree-order";
import type { DocsVaultCollection } from "../../lib/docs-vault-collection";
import type { AgentFilesUiModel } from "../../lib/agent-files";
import { DocsSidebarBody } from "./DocsSidebarBody";

function makeDoc(slug: string, title: string, updatedAt: string): VaultDoc {
  return {
    slug,
    path: `${slug}.md`,
    title,
    tags: [],
    frontmatter: {},
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

describe("DocsSidebarBody — 최근 바뀐 문서 (목록 안 조용한 섹션, 기본 접힘)", () => {
  const now = Date.now();
  const recentIso = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2 days ago
  const oldIso = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90 days ago

  it("기본 접힘 — 토글을 열면 최근 변경 문서만 보인다", () => {
    renderSidebar([makeDoc("a", "Recent Doc", recentIso), makeDoc("b", "Old Doc", oldIso)]);

    // Collapsed by default, so the list is hidden at first.
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

describe("DocsSidebarBody — #22 아이콘 행: 검색 토글 + 카운트", () => {
  it("검색은 토글로 열고, 열면 입력이 나타나 매칭 수를 카운트 줄에 반영한다", () => {
    renderSidebar([
      makeDoc("payment", "결제 문서", new Date().toISOString()),
      makeDoc("order", "주문 문서", new Date().toISOString()),
      makeDoc("ship", "배송 문서", new Date().toISOString()),
    ]);
    // No search box by default (density).
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

  it("세 컬렉션(전체/가이드/지도 문서) 아이콘을 노출하고 클릭이 전환을 호출한다", () => {
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

  /**
   * **The property held is the same; only where it is stated moved** (2026-08-08).
   *
   * The three icons used to keep their labels in tooltips only, so «which filter is this
   * list under» was answered instead by the grey caption line below. These tests exist to
   * stop the regression, reproduced in the installed app, where that line was the constant
   * "all documents".
   *
   * Now **the active chip states its own name** — the information moved inside the control,
   * so the caption line is left only for values a control cannot hold, such as search and
   * tags. So the tests look for the name **on the chip**. The regression they were written
   * for (choosing "map documents" while the screen says "all documents") is still caught.
   */
  it("켜진 보기가 자기 이름을 화면에 말한다", () => {
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
    // Exclusive single selection, hence radiogroup + aria-checked.
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(active).toHaveAttribute("role", "radio");
    // An unselected view states no name — only the active one speaks, so «now» is readable.
    expect(screen.getByTestId("docs-sidebar-collection-all")).toHaveTextContent("");
    expect(screen.queryByText("전체 문서")).not.toBeInTheDocument();
  });

  it("전체 보기를 고르면 그 이름이 켜진 칩에 있다", () => {
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
    // Exclusive single selection, hence radiogroup + aria-checked.
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(active).toHaveAttribute("role", "radio");
    // The count stays in the tooltip (the accessible name), so the chip label does not eat width.
    expect(active.getAttribute("aria-label")).toContain("3");
  });

  /**
   * The caption line appears only for **values a control cannot hold**. An empty line left
   * behind when there is no state at all is just a placeholder for information that is gone.
   */
  it("검색어도 태그도 없으면 캡션 줄 자체가 없다", () => {
    renderSidebar([makeDoc("a", "A", new Date().toISOString())], {
      collection: "all",
      collectionCounts: { all: 1, guides: 0, ontology: 1 },
    });
    expect(screen.queryByText(/개$/)).not.toBeInTheDocument();
  });
});

describe("DocsSidebarBody — 에이전트 파일 그룹 (읽기 전용 감지)", () => {
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

describe("DocsSidebarBody — [D-4] 새 문서 진입점", () => {
  it("calls onCreateNewDoc when the tree-header new-doc button is enabled and clicked", () => {
    const { onCreateNewDoc } = renderSidebar([], { canCreateNewDoc: true });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    expect(button).not.toBeDisabled();
    fireEvent.click(button);
    expect(onCreateNewDoc).toHaveBeenCalledTimes(1);
  });

  /**
   * It is **pressable even in the read-only sample** (owner report from real use, 2026-07-28).
   *
   * The old contract was "disabled plus a tooltip hint", and this test enforced it. But a
   * **hover-only** explanation on a 40%-opacity icon never arrived — to the owner that screen
   * read as "there is no create-document feature", and a keyboard user was dropped from the
   * Tab order entirely by `disabled`, so could not even learn it existed.
   *
   * The charter's degradation grammar is "why it is unavailable **and where to go**". So
   * pressing it now goes to what makes it possible: open my folder. The label says so in
   * advance, so nothing is surprising.
   */
  it("keeps the new-doc button reachable in read-only sample mode — it routes to what unblocks it", () => {
    const { onCreateNewDoc } = renderSidebar([], { canCreateNewDoc: false });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    expect(button).toBeInTheDocument();
    // Not a dead affordance — it presses, and it stays in the keyboard Tab order.
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCreateNewDoc).toHaveBeenCalledTimes(1);
    // The label states the why and the where in advance.
    expect(button.getAttribute("aria-label")).toMatch(/폴더/);
  });
});

describe("DocsSidebarBody — 목록 순서 메뉴", () => {
  // A miniature of the dogfood top-level folder. With folders and documents mixed into one
  // alphabetical run, folders get buried among documents (measured: the 96-document ontology
  // folder landed 23rd of 36 rows).
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

  /** Labels of top-level tree rows only — inside collapsed folders is not inspected. */
  function treeLabels() {
    const nav = screen.getByRole("navigation", {
      name: koMessages.vaultWidgets.tree.navAria,
    });
    return [...nav.children].map(
      (row) => row.querySelector("span.truncate")?.textContent?.trim() ?? "",
    );
  }

  it("기본은 폴더 먼저 — 폴더가 문서 사이에 흩어지지 않는다", () => {
    renderSidebar(docs, { tree });
    expect(treeLabels().slice(0, 2)).toEqual(["archive", "benchmark"]);
  });

  it("문서 먼저를 고르면 문서가 앞으로 온다", () => {
    renderSidebar(docs, { tree, group: "docs" });
    expect(treeLabels().slice(0, 2)).toEqual(["Architecture", "Backlog"]);
  });

  it("메뉴는 접혀 있고, 열면 두 축을 따로 보여준다", () => {
    renderSidebar(docs, { tree });
    expect(screen.queryByTestId("docs-sidebar-order-menu")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("docs-sidebar-order-toggle"));
    expect(screen.getByTestId("docs-sidebar-order-menu")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-order-sort-recent")).toBeInTheDocument();
    expect(screen.getByTestId("docs-sidebar-order-group-docs")).toBeInTheDocument();
  });

  it("고른 값에 체크가 붙는다 — 지금 무슨 순서인지 메뉴가 답한다", () => {
    renderSidebar(docs, { tree, sort: "recent", group: "docs" });
    fireEvent.click(screen.getByTestId("docs-sidebar-order-toggle"));
    expect(screen.getByTestId("docs-sidebar-order-sort-recent")).toHaveAttribute("aria-checked", "true");
    expect(screen.getByTestId("docs-sidebar-order-sort-name")).toHaveAttribute("aria-checked", "false");
    expect(screen.getByTestId("docs-sidebar-order-group-docs")).toHaveAttribute("aria-checked", "true");
  });

  it("한 줄을 고르면 그 축만 바뀌고 메뉴가 닫힌다", () => {
    const { onSortChange, onGroupChange } = renderSidebar(docs, { tree });
    fireEvent.click(screen.getByTestId("docs-sidebar-order-toggle"));
    fireEvent.click(screen.getByTestId("docs-sidebar-order-sort-recent"));
    expect(onSortChange).toHaveBeenCalledWith("recent");
    expect(onGroupChange).not.toHaveBeenCalled();
    // "Closed" is not an immediate unmount (2026-08-04) — this menu lives on `Surface`, so it
    // remains for the exit window (≈140ms) and is `inert` throughout, accepting no input.
    // An assertion demanding immediate removal is demanding a hard cut.
    const menu = screen.getByTestId("docs-sidebar-order-menu");
    expect(menu).toHaveAttribute("data-surface-state", "exiting");
    expect(menu).toHaveAttribute("inert");
  });
});

/**
 * **Which state a rail button reports** — the three consumers are three different things
 * (2026-08-15).
 *
 * The defect survived because these tests did not exist. The twenty above checked only
 * «does it press» and «what opens», and **never once** looked at what reaches the
 * accessibility tree. Meanwhile `RailIconButton` attached `aria-pressed={active}`
 * unconditionally — the automatic pairing `Chip`'s header in `controls.tsx` already forbids.
 *
 * Neither lint nor axe can see this: an absent attribute cannot be caught by a selector, and
 * `button[aria-pressed]` is perfectly valid markup to axe. Whether a button really is a
 * toggle depends on **what its handler does**, and that has to be measured.
 */
describe("DocsSidebarBody — 레일 버튼의 상태 어휘", () => {
  const orderTree: VaultManifest["tree"] = {
    name: "root",
    path: "",
    type: "dir",
    children: [
      { name: "architecture", path: "architecture.md", type: "doc", slug: "architecture", title: "Architecture" },
    ],
  };
  const orderDocs = [makeDoc("architecture", "Architecture", new Date().toISOString())];

  it("새 문서는 행동이다 — 눌림 상태를 낭독하지 않는다", () => {
    renderSidebar([], { canCreateNewDoc: true });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    // It used to keep announcing aria-pressed="false". This button has no pressed state —
    // pressing it opens a dialog or routes to open-folder.
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).not.toHaveAttribute("aria-expanded");
  });

  it("거르기는 토글이다 — 켜고 끄는 상태를 낭독한다", () => {
    renderSidebar([]);
    const button = screen.getByTestId("docs-sidebar-search-toggle");
    expect(button).toHaveAttribute("aria-pressed", "false");
    fireEvent.click(button);
    expect(screen.getByTestId("docs-sidebar-search-toggle")).toHaveAttribute("aria-pressed", "true");
  });

  it("정렬은 메뉴를 여는 버튼이다 — expanded/haspopup 이지 pressed 가 아니다", () => {
    renderSidebar(orderDocs, { tree: orderTree });
    const button = screen.getByTestId("docs-sidebar-order-toggle");
    expect(button).not.toHaveAttribute("aria-pressed");
    expect(button).toHaveAttribute("aria-haspopup", "menu");
    expect(button).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(button);
    expect(screen.getByTestId("docs-sidebar-order-toggle")).toHaveAttribute("aria-expanded", "true");
  });

  /**
   * This test is the core of the round — **the visible state and the spoken state really do
   * separate.** It used to be `aria-pressed={orderMenuOpen || !orderIsDefault}`, mixing the
   * two into one value, so closing the menu left "pressed" behind whenever the order was not
   * the default.
   */
  it("정렬이 기본이 아니면 인디고는 켜지고, 그래도 메뉴는 닫혀 있다고 말한다", () => {
    /*
     * No specific class name is pinned — a value-layer ramp change would turn this red while
     * the content is still correct (`.claude/rules/documentation.md`: do not pin a string a
     * human wrote). What is locked here is the property that **the two facts separated**: the
     * visible one follows the order, the spoken one follows only the menu state.
     */
    const { unmount } = renderSidebar(orderDocs, { tree: orderTree });
    const atDefault = screen.getByTestId("docs-sidebar-order-toggle");
    const defaultClass = atDefault.className;
    expect(atDefault).toHaveAttribute("aria-expanded", "false");
    unmount();

    renderSidebar(orderDocs, { tree: orderTree, sort: "recent" });
    const atRecent = screen.getByTestId("docs-sidebar-order-toggle");
    // The visible state changed — the indigo says the order is not the default.
    expect(atRecent.className).not.toBe(defaultClass);
    // The spoken state is unchanged — the menu is still closed. This used to flip to
    // aria-pressed="true" and read as a pressed button.
    expect(atRecent).toHaveAttribute("aria-expanded", "false");
  });
});
