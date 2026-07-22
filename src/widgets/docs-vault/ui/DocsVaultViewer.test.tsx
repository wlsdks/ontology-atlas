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
    expect(anchor.className).toContain("sm:opacity-0");
  });

  it("makes table links usable as source-record jump targets", async () => {
    renderViewer("| Document | Use it for |\n| --- | --- |\n| [README](README.md) | Start here |");

    const cell = await screen.findByRole("cell", { name: "README" });

    expect(cell.className).toContain("[&_a]:min-h-8");
    expect(cell.className).toContain("[&_a]:inline-flex");
    expect(cell.className).toContain("[&_a]:rounded-md");
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
});
