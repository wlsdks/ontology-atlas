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
  const recentIso = new Date(now - 2 * 24 * 60 * 60 * 1000).toISOString(); // 2일 전
  const oldIso = new Date(now - 90 * 24 * 60 * 60 * 1000).toISOString(); // 90일 전

  it("기본 접힘 — 토글을 열면 최근 변경 문서만 보인다", () => {
    renderSidebar([makeDoc("a", "Recent Doc", recentIso), makeDoc("b", "Old Doc", oldIso)]);

    // #22 — 기본 접힘이라 목록은 처음에 숨어 있다.
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
    // 기본은 검색창 없음 (밀도 축소)
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
   * **지키는 성질은 그대로, 말하는 자리만 옮겼다** (2026-08-08, 2안).
   *
   * 종전엔 아이콘 셋이 라벨을 툴팁에만 갖고 있어서 «지금 무엇으로 걸러진
   * 목록인가» 를 아래 회색 캡션 한 줄이 대신 말했다. 그 줄이 상수 "전체
   * 문서" 이던 시절의 회귀(설치 앱 재현)를 막으려고 이 시험들이 생겼다.
   *
   * 이제 **켜진 칩이 자기 이름을 직접 말한다** — 정보가 컨트롤 안으로
   * 들어왔으니 캡션 줄은 검색·태그처럼 컨트롤이 담을 수 없는 값에만 남는다.
   * 그래서 시험도 이름을 **칩에서** 찾는다. 원래 막으려던 회귀(「지도 문서」를
   * 골랐는데 화면이 "전체 문서" 라고 말함)는 그대로 잡힌다.
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
    // 2026-08-15 (8) — 배타 단일선택이라 radiogroup + aria-checked 다.
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(active).toHaveAttribute("role", "radio");
    // 안 고른 보기는 이름을 안 말한다 — 켜진 것 하나만 말해야 «지금» 이 읽힌다.
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
    // 2026-08-15 (8) — 배타 단일선택이라 radiogroup + aria-checked 다.
    expect(active).toHaveAttribute("aria-checked", "true");
    expect(active).toHaveAttribute("role", "radio");
    // 개수는 툴팁(접근성 이름)이 계속 갖는다 — 칩 라벨이 폭을 먹지 않게.
    expect(active.getAttribute("aria-label")).toContain("3");
  });

  /**
   * 캡션 줄은 **컨트롤이 담을 수 없는 값**일 때만 나온다. 아무 상태도 아닐
   * 때 빈 줄이 남아 있으면 그건 사라진 정보의 자리표시일 뿐이다.
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
   * 읽기 전용 샘플에서도 **누를 수 있다** (2026-07-28 소유자 실사용 제보).
   *
   * 종전 계약은 "비활성 + 툴팁 힌트" 였고 이 테스트가 그것을 지켰다. 그런데
   * 40% 불투명도 아이콘의 **호버 전용** 설명은 도달하지 않았다 — 소유자에게
   * 그 화면은 "새 문서 기능이 없다" 로 읽혔고, 키보드 사용자는 `disabled`
   * 때문에 Tab 순서에서 아예 빠져 존재조차 알 수 없었다.
   *
   * 헌장의 강등 문법은 "왜 안 되는지 + **어디로 가면 되는지**" 다. 그래서
   * 이제 누르면 그것을 가능하게 하는 곳(내 폴더 열기)으로 간다. 라벨이 그
   * 사실을 미리 말하므로 놀라지 않는다.
   */
  it("keeps the new-doc button reachable in read-only sample mode — it routes to what unblocks it", () => {
    const { onCreateNewDoc } = renderSidebar([], { canCreateNewDoc: false });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    expect(button).toBeInTheDocument();
    // 죽은 어포던스가 아니다 — 눌리고, 키보드 Tab 순서에도 남는다.
    expect(button).toBeEnabled();
    fireEvent.click(button);
    expect(onCreateNewDoc).toHaveBeenCalledTimes(1);
    // 라벨이 왜/어디로를 미리 말한다.
    expect(button.getAttribute("aria-label")).toMatch(/폴더/);
  });
});

describe("DocsSidebarBody — 목록 순서 메뉴", () => {
  // dogfood 최상위 폴더의 축소판 — 폴더와 문서가 이름순 한 줄에 섞이면
  // 폴더가 문서 사이에 파묻힌다(실측: 96개짜리 ontology 폴더가 36행 중 23번째).
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

  /** 트리 최상위 행의 라벨만 — 접힌 폴더 안은 보지 않는다. */
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
    // ★ 「닫혔다」는 즉시 언마운트가 아니다 (2026-08-04) — 이 메뉴는 `Surface`
    //   위에 살아서 퇴장 창(≈140ms) 동안 남고, 그동안 `inert` 라 아무 입력도
    //   못 먹는다. 즉시 소멸을 요구하는 단언은 하드컷을 요구하는 것이다.
    const menu = screen.getByTestId("docs-sidebar-order-menu");
    expect(menu).toHaveAttribute("data-surface-state", "exiting");
    expect(menu).toHaveAttribute("inert");
  });
});

/**
 * 레일 버튼이 **무슨 상태를 말하나** — 세 소비처가 서로 다른 셋이다 (2026-08-15).
 *
 * 이 시험들이 없어서 결함이 살았다. 위의 20개는 «눌리나 · 무엇이 열리나»만
 * 봤고 접근성 트리에 무엇이 실리는지는 **한 번도 보지 않았다.** 그 사이
 * `RailIconButton` 은 `aria-pressed={active}` 를 무조건 붙이고 있었고,
 * `controls.tsx` 의 `Chip` 머리말이 이미 금지해 둔 그 자동 묶기였다.
 *
 * lint 도 axe 도 이걸 못 본다: 없는 속성은 셀렉터로 잡을 수 없고,
 * `button[aria-pressed]` 는 axe 에게 완벽히 유효한 마크업이다. 「이 버튼이
 * 정말 토글인가」는 **핸들러가 무엇을 하는지**에 달렸고, 그건 재야 안다.
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
    // 종전: aria-pressed="false" 를 계속 낭독했다. 이 버튼에는 눌림 상태가
    // 존재하지 않는다 — 누르면 다이얼로그가 열리거나 폴더 열기로 간다.
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
   * 이 시험이 이 라운드의 핵심이다 — **보이는 상태와 말해지는 상태가 실제로
   * 갈린다.** 종전엔 `aria-pressed={orderMenuOpen || !orderIsDefault}` 로 둘을
   * 한 값에 섞어서, 메뉴를 닫아도 정렬이 기본이 아니면 「눌림」이 남았다.
   */
  it("정렬이 기본이 아니면 인디고는 켜지고, 그래도 메뉴는 닫혀 있다고 말한다", () => {
    /*
     * 특정 클래스 이름을 못박지 않는다 — 값 층이 램프를 고치면 그 시험은
     * 내용이 맞는데도 빨개진다(`documentation.md`: 사람이 쓴 문자열을 핀으로
     * 박지 않는다). 여기서 잠그는 것은 **두 사실이 갈렸다**는 성질이다:
     * 보이는 것은 정렬에 따라 바뀌고, 말해지는 것은 메뉴 상태만 따른다.
     */
    const { unmount } = renderSidebar(orderDocs, { tree: orderTree });
    const atDefault = screen.getByTestId("docs-sidebar-order-toggle");
    const defaultClass = atDefault.className;
    expect(atDefault).toHaveAttribute("aria-expanded", "false");
    unmount();

    renderSidebar(orderDocs, { tree: orderTree, sort: "recent" });
    const atRecent = screen.getByTestId("docs-sidebar-order-toggle");
    // 보이는 상태는 바뀌었다 — 정렬이 기본이 아니라고 인디고가 말한다.
    expect(atRecent.className).not.toBe(defaultClass);
    // 말해지는 상태는 그대로다 — 메뉴는 여전히 닫혀 있다. 종전엔 여기가
    // aria-pressed="true" 로 뒤집혀 「눌린 버튼」이 됐다.
    expect(atRecent).toHaveAttribute("aria-expanded", "false");
  });
});
