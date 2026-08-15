import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import type { VaultDoc } from "@/entities/docs-vault";
import { DocsVaultViewer } from "./DocsVaultViewer";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const doc: VaultDoc = {
  slug: "README",
  path: "README.md",
  title: "Readme",
  tags: [],
  frontmatter: {},
  headings: [{ depth: 2, text: "Section One", slug: "section-one" }],
  excerpt: "",
  wordCount: 3,
  updatedAt: "2026-06-01",
  linksOut: [],
};

function renderViewer(
  markdown: string,
  extraProps: Partial<React.ComponentProps<typeof DocsVaultViewer>> = {},
) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <DocsVaultViewer
        doc={doc}
        vaultSlugs={new Set([doc.slug])}
        onNavigate={() => {}}
        getDocContent={() => Promise.resolve(markdown)}
        {...extraProps}
      />
    </NextIntlClientProvider>,
  );
}

describe("DocsVaultViewer", () => {
  it("uses the parent-selected bundled content instead of re-reading another sample preference", async () => {
    renderViewer("ignored", {
      getDocContent: undefined,
      bundledContent: {
        README: "# Route-owned packaged workflow",
      },
    });

    expect(
      await screen.findByRole("heading", {
        name: "Route-owned packaged workflow",
      }),
    ).toBeInTheDocument();
  });

  it("keeps section copy anchors inside the mobile reading column", async () => {
    renderViewer("## Section One\n\nBody text.");

    const anchor = await screen.findByRole("button", {
      name: "Copy link to this section",
    });

    expect(anchor.className).toContain("right-0");
    expect(anchor.className).toContain("h-8");
    expect(anchor.className).toContain("w-8");
    expect(anchor.className).toContain("sm:-left-9");
    expect(anchor.className).not.toContain("sm:h-5");
    expect(anchor.className).not.toContain("sm:w-5");
    /*
     * 2026-08-15 — 숨김의 기준이 **폭에서 호버 능력으로** 바뀌었다.
     * 종전 `sm:opacity-0` 은 「좁으면 터치일 것」이라는 짐작이고, 터치 계약이
     * 정확히 그것을 금지한다(`design.md`: *"화면 폭으로 터치인지 짐작하지
     * 말 것"*). 실제 결함은 **넓은 터치 기기**(태블릿·터치 노트북)였다 —
     * 거기서는 이 앵커가 호버 전까지 안 보이는데 호버가 일어나지 않는다.
     *
     * `[@media(hover:hover)]:opacity-0` 은 호버가 실제로 되는 기기에서만
     * 숨긴다. 좁은 화면의 동작은 그대로다(거기도 대개 호버가 없다).
     */
    expect(anchor.className).not.toContain("sm:opacity-0");
    expect(anchor.className).toContain("[@media(hover:hover)]:opacity-0");
    expect(anchor.className).toContain("group-hover:opacity-100");
    // 키보드가 안 보이는 칸에 멈추지 않는다.
    expect(anchor.className).toContain("focus-visible:opacity-100");
  });

  it("makes table links usable as source-record jump targets", async () => {
    renderViewer("| Document | Use it for |\n| --- | --- |\n| [README](README.md) | Start here |");

    const cell = await screen.findByRole("cell", { name: "README" });

    expect(cell.className).toContain("[&_a]:min-h-8");
    expect(cell.className).toContain("[&_a]:inline-flex");
    expect(cell.className).toContain("[&_a]:rounded-chip");
  });

  it("routes a vault-external relative .md link to GitHub blob instead of a dead app 404", async () => {
    // docs/README.md 의 `../mcp/README.md` — vault(docs/) 밖. 예전엔 앱
    // 라우팅으로 넘겨 /mcp/README.md 404 로 죽었다.
    renderViewer("See [MCP docs](../mcp/README.md) for setup.", {
      repoBlobBase: "https://github.com/wlsdks/ontology-atlas/blob/main",
      vaultRepoRoot: "docs",
    });

    const link = await screen.findByRole("link", { name: /MCP docs/ });
    expect(link).toHaveProperty(
      "href",
      "https://github.com/wlsdks/ontology-atlas/blob/main/mcp/README.md",
    );
    expect(link.getAttribute("target")).toBe("_blank");
  });

  it("renders a vault-external link as non-routing text when repo location is unknown (local vault)", async () => {
    // repoBlobBase 미지정(로컬 vault) → GitHub URL 을 만들 수 없다. 죽은 404
    // 대신 라우팅하지 않는 텍스트로 렌더(href 없음).
    renderViewer("See [MCP docs](../mcp/README.md) for setup.");

    const label = await screen.findByText("MCP docs");
    expect(label.tagName).toBe("SPAN");
    expect(screen.queryByRole("link", { name: /MCP docs/ })).toBeNull();
  });

  // 착지 결함 (P1 검수) — 팔레트에서 넘어온 highlightQuery 로 본문 content
  // 가 비동기 로드된 *이후* 정확히 1회 mark+scrollIntoView 되는 계약.
  // 콘텐츠 도착 전에는 mark 자체가 존재할 수 없으므로, 이 test 는 async
  // fetcher (findByText 로 로드 완료를 기다림)를 써서 그 타이밍을 실측한다.
  describe("highlightQuery 착지 — 본문 로드 후 mark + scrollIntoView", () => {
    it("본문 로드 완료 후 매치어를 mark 로 감싸고 스크롤한다", async () => {
      const scrollSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollSpy;
      renderViewer("Intro line.\n\nThe deterministic compile phrase lives here.", {
        highlightQuery: "deterministic compile",
      });

      const mark = await screen.findByText("deterministic compile", {
        selector: "mark.docs-match",
      });
      expect(mark).toBeInTheDocument();
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    });

    // 실측 회귀 재현: 본문이 ~80자에서 줄바꿈돼 매치 구절 중간에 개행이
    // 끼어드는 실제 vault 문서 형태(AGENTS.md 컨벤션)에서도 착지돼야 한다.
    it("본문이 줄바꿈으로 쪼개진 구절(line-wrap)도 mark + 스크롤된다", async () => {
      const scrollSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollSpy;
      renderViewer(
        "Give it a local, git-backed\nmental model it can read, query, and maintain.",
        { highlightQuery: "git-backed mental model" },
      );

      await screen.findByText((_, node) => {
        if (node?.tagName !== "MARK") return false;
        return (node.textContent ?? "").replace(/\s+/g, " ") ===
          "git-backed mental model";
      });
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalled());
    });

    it("highlightQuery 없으면 mark 를 만들지 않고 스크롤도 안 한다", async () => {
      const scrollSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollSpy;
      renderViewer("Intro line.\n\nThe deterministic compile phrase lives here.");

      await screen.findByText(/deterministic compile phrase/);
      expect(document.querySelector("mark.docs-match")).toBeNull();
      expect(scrollSpy).not.toHaveBeenCalled();
    });
  });
});
