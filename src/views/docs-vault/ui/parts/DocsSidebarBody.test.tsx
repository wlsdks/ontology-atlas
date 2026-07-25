import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import type { VaultDoc, VaultManifest } from "@/entities/docs-vault";
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
  overrides: { canCreateNewDoc?: boolean; agentFiles?: AgentFilesUiModel | null } = {},
) {
  const manifest = makeManifest(docs);
  const onSelect = vi.fn();
  const onCreateNewDoc = vi.fn();
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <DocsSidebarBody
        pinnedSlugs={[]}
        recentSlugs={[]}
        selectedSlug={null}
        docsBySlug={new Map(docs.map((d) => [d.slug, d]))}
        activeTag={null}
        manifest={manifest}
        collection="guides"
        collectionCounts={{ all: docs.length, guides: docs.length, ontology: 0 }}
        visibleDocSlugs={new Set(docs.map((d) => d.slug))}
        onSelect={onSelect}
        onCollectionChange={() => {}}
        onTogglePin={() => {}}
        onTagSelect={() => {}}
        onCreateNewDoc={onCreateNewDoc}
        canCreateNewDoc={overrides.canCreateNewDoc ?? true}
        agentFiles={overrides.agentFiles ?? null}
      />
    </NextIntlClientProvider>,
  );
  return { onSelect, onCreateNewDoc };
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

  it("renders the new-doc button disabled (not hidden) in read-only sample mode", () => {
    renderSidebar([], { canCreateNewDoc: false });
    const button = screen.getByTestId("docs-sidebar-new-doc");
    expect(button).toBeInTheDocument();
    expect(button).toBeDisabled();
  });
});
