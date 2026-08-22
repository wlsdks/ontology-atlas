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
     * 2026-08-15 — the basis for hiding changed **from width to hover capability**.
     * The old `sm:opacity-0` guessed "narrow means touch", which the touch contract
     * forbids precisely (`design.md`: *"화면 폭으로 터치인지 짐작하지 말 것"* — do not
     * guess touch from viewport width). The real defect was on **wide touch devices**
     * (tablets, touch laptops), where this anchor stays invisible until a hover that
     * never happens.
     *
     * `[@media(hover:hover)]:opacity-0` hides it only on devices that really hover.
     * Behaviour on narrow screens is unchanged (they mostly lack hover too).
     */
    expect(anchor.className).not.toContain("sm:opacity-0");
    expect(anchor.className).toContain("[@media(hover:hover)]:opacity-0");
    expect(anchor.className).toContain("group-hover:opacity-100");
    // The keyboard does not stop on an invisible cell.
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
    // `../mcp/README.md` in docs/README.md — outside the vault (docs/). It used to be
    // handed to app routing and died as a /mcp/README.md 404.
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
    // Without repoBlobBase (a local vault) no GitHub URL can be built. Rendered as
    // non-routing text (no href) rather than a dead 404.
    renderViewer("See [MCP docs](../mcp/README.md) for setup.");

    const label = await screen.findByText("MCP docs");
    expect(label.tagName).toBe("SPAN");
    expect(screen.queryByRole("link", { name: /MCP docs/ })).toBeNull();
  });

  // Landing defect (P1 review) — the contract that a highlightQuery arriving from the
  // palette produces exactly one mark plus scrollIntoView *after* the body content
  // loads asynchronously. No mark can exist before the content arrives, so this test
  // uses an async fetcher (awaiting findByText for load completion) to measure that timing.
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

    // Reproducing a measured regression: it must land even in a real vault document
    // whose body wraps at ~80 characters so a newline falls inside the matched phrase
    // (the AGENTS.md convention).
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
