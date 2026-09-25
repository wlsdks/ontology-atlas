import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import type { VaultDoc } from "@/entities/docs-vault";
import { DocsVaultViewer } from "./DocsVaultViewer";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/shared/lib/use-prefers-reduced-motion', () => ({
  usePrefersReducedMotion: () => motion.reduced,
}));

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

beforeEach(() => {
  motion.reduced = false;
});

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
     * forbids precisely (`design.md`: *"Do not guess touch from viewport width"* — do not
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

  /**
   * A document under `docs/` is read here and on GitHub, and the two rules for a
   * heading id disagree on half of this repository's headings — an em dash
   * between spaces leaves GitHub two hyphens and this viewer one. Measured
   * consequence before this: the generated contents list in
   * `docs/DESIGN-SYSTEM.md` resolved on exactly one of the two surfaces,
   * whichever rule wrote it.
   */
  it("answers to GitHub's heading id as well as its own, so a link written for either surface lands", async () => {
    const { container } = renderViewer("## Library index — readable page titles\n\nBody.");

    expect(
      await screen.findByRole("heading", { name: /Library index/ }),
    ).toBeInTheDocument();
    expect(container.querySelector("#library-index-readable-page-titles")).not.toBeNull();
    expect(container.querySelector("#library-index--readable-page-titles")).not.toBeNull();
  });

  it("adds no second anchor when the two rules already agree", async () => {
    const { container } = renderViewer("## Section One\n\nBody.");
    await screen.findByRole("heading", { name: "Section One" });

    expect(container.querySelectorAll("#section-one")).toHaveLength(1);
    expect(container.querySelectorAll("[aria-hidden][id]")).toHaveLength(0);
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

  it("renders a known source citation as an operable control that preserves its path and anchor", async () => {
    const onSourceNavigate = vi.fn();
    renderViewer("A measured fact [[src:sources/storage.md#l1]]", {
      knownOriginalPaths: new Set(["sources/storage.md"]),
      onSourceNavigate,
    });

    const citation = await screen.findByRole("button", {
      name: "Open original source sources/storage.md · line 1",
    });
    expect(citation).toHaveTextContent("storage.md · line 1");
    expect(citation).toHaveAttribute("data-source-path", "sources/storage.md");
    expect(citation).toHaveAttribute("data-source-anchor", "l1");

    fireEvent.click(citation);
    expect(onSourceNavigate).toHaveBeenCalledWith("sources/storage.md", "l1");
  });

  it("keeps an unknown source citation visibly missing and non-navigable", async () => {
    const onSourceNavigate = vi.fn();
    renderViewer("A fact [[src:sources/missing.md#l1]]", {
      knownOriginalPaths: new Set(["sources/storage.md"]),
      onSourceNavigate,
    });

    const citation = await screen.findByText("missing.md · line 1");
    expect(citation.tagName).toBe("SPAN");
    expect(citation).toHaveAttribute(
      "title",
      "Original source not in this folder: sources/missing.md",
    );
    expect(screen.queryByRole("button")).toBeNull();
    expect(onSourceNavigate).not.toHaveBeenCalled();
  });

  it("does not call an unavailable source citation missing", async () => {
    renderViewer("A fact [[src:sources/storage.md#l1]]", {
      onSourceNavigate: vi.fn(),
    });

    const citation = await screen.findByText("storage.md · line 1");
    expect(citation.tagName).toBe("SPAN");
    expect(citation).toHaveAttribute(
      "title",
      "Source navigation is unavailable: sources/storage.md",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not call a known source citation missing when its navigator is unavailable", async () => {
    renderViewer("A fact [[src:sources/storage.md#l1]]", {
      knownOriginalPaths: new Set(["sources/storage.md"]),
    });

    const citation = await screen.findByText("storage.md · line 1");
    expect(citation.tagName).toBe("SPAN");
    expect(citation).toHaveAttribute(
      "title",
      "Source navigation is unavailable: sources/storage.md",
    );
    expect(screen.queryByRole("button")).toBeNull();
  });

  it("does not turn traversal-shaped source citations into navigation callbacks", async () => {
    const onSourceNavigate = vi.fn();
    renderViewer("A fact [[src:sources/../private.md#l1]]", {
      knownOriginalPaths: new Set(["sources/../private.md"]),
      onSourceNavigate,
    });

    const citation = await screen.findByText("private.md · line 1");
    expect(citation.tagName).toBe("SPAN");
    expect(screen.queryByRole("button")).toBeNull();
    expect(onSourceNavigate).not.toHaveBeenCalled();
  });

  it("decodes percent-encoded Unicode source paths before navigating", async () => {
    const onSourceNavigate = vi.fn();
    renderViewer("확인할 곳 [[src:sources/%EC%84%A4%EA%B3%84.md#l2|원문]]", {
      knownOriginalPaths: new Set(["sources/설계.md"]),
      onSourceNavigate,
    });

    const citation = await screen.findByRole("button", {
      name: "Open original source sources/설계.md · line 2",
    });
    // A label the author wrote is the author's words, kept as written.
    expect(citation).toHaveTextContent(/^원문$/);
    fireEvent.click(citation);
    expect(onSourceNavigate).toHaveBeenCalledWith("sources/설계.md", "l2");
  });

  /*
   * **A compiled page's citations read as places, not addresses** (2026-09-25). The compile
   * path writes `[[src:<file>#l<n>]]` with no label, and the page printed the target itself —
   * `src:sources/budget.md#l5` on every fact — while the Source pane said "line 5".
   */
  it("says where an unlabelled citation points, in words, and names the file only when the header does not", async () => {
    const onSourceNavigate = vi.fn();
    renderViewer(
      [
        "- The budget is 120,000 USD [[src:sources/budget.md#l5]]",
        "- Hosting was quoted separately [[src:sources/vendor-call-notes.txt#l3]]",
        "- The plan names the freeze [[src:sources/plan.md]]",
      ].join("\n"),
      {
        knownOriginalPaths: new Set(["sources/budget.md", "sources/vendor-call-notes.txt", "sources/plan.md"]),
        onSourceNavigate,
        namedSourcePath: "sources/budget.md",
      },
    );

    const named = await screen.findByRole("button", { name: "Open original source sources/budget.md · line 5" });
    expect(named).toHaveTextContent(/^line 5$/);
    const other = screen.getByRole("button", { name: "Open original source sources/vendor-call-notes.txt · line 3" });
    expect(other).toHaveTextContent(/^vendor-call-notes\.txt · line 3$/);
    // No anchor: the whole file is the place.
    const whole = screen.getByRole("button", { name: "Open original source sources/plan.md" });
    expect(whole).toHaveTextContent(/^plan\.md$/);
    expect(screen.queryByText(/src:/)).toBeNull();

    fireEvent.click(named);
    expect(onSourceNavigate).toHaveBeenCalledWith("sources/budget.md", "l5");
  });

  it("keeps an unlabelled ordinary wikilink routable once the unlabelled mark is stripped", async () => {
    const onNavigate = vi.fn();
    renderViewer("Read [[README]]", {
      onNavigate,
      getDocHref: (slug, hash) => `/docs/${slug}${hash ? `#${hash}` : ""}`,
    });

    const link = await screen.findByRole("link", { name: "README" });
    expect(link).toHaveAttribute("href", "/docs/README");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("README");
  });

  it("keeps an ordinary wikilink on the existing in-vault navigation path", async () => {
    const onNavigate = vi.fn();
    renderViewer("Read [[README#section-one|README]]", {
      onNavigate,
      getDocHref: (slug, hash) => `/docs/${slug}${hash ? `#${hash}` : ""}`,
    });

    const link = await screen.findByRole("link", { name: "README" });
    expect(link).toHaveAttribute("href", "/docs/README#section-one");
    fireEvent.click(link);
    expect(onNavigate).toHaveBeenCalledWith("README");
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
      expect(scrollSpy).toHaveBeenLastCalledWith({ behavior: 'smooth', block: 'center' });
    });

    it('reduced motion lands on the same match without JavaScript smooth scrolling', async () => {
      motion.reduced = true;
      const scrollSpy = vi.fn();
      Element.prototype.scrollIntoView = scrollSpy;
      renderViewer('Intro line.\n\nThe deterministic compile phrase lives here.', {
        highlightQuery: 'deterministic compile',
      });

      await screen.findByText('deterministic compile', { selector: 'mark.docs-match' });
      await vi.waitFor(() => expect(scrollSpy).toHaveBeenCalled());
      expect(scrollSpy).toHaveBeenLastCalledWith({ behavior: 'auto', block: 'center' });
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


/**
 * ⚠️ **A wikilink means the same thing here as everywhere else in the vault.**
 *
 * This lookup used to match the typed slug straight against the vault's slug set, making
 * it a third answer to "what does `[[x]]` mean in this document" — disagreeing with
 * `extractOutLinksWithContext` (backlinks, the Library graph) and with
 * `validateWikiFolder` (the folder check). Measured 2026-09-09: `[[budget]]` inside
 * `wiki/handover.md` rendered as plain text with no anchor, while the folder check
 * reported the very same link as perfectly resolved.
 */
describe("DocsVaultViewer — a wikilink resolves against the document that wrote it", () => {
  const wikiDoc: VaultDoc = { ...doc, slug: "wiki/handover", path: "wiki/handover.md" };

  it("links a bare [[slug]] written inside wiki/ to the page in wiki/", async () => {
    renderViewer("Pointing at [[budget]].", {
      doc: wikiDoc,
      vaultSlugs: new Set([wikiDoc.slug, "wiki/budget"]),
    });
    const link = await screen.findByRole("link", { name: "budget" });
    expect(link).toBeInTheDocument();
  });

  it("still marks a bare slug unresolved when that page is not in the folder", async () => {
    renderViewer("Pointing at [[nowhere]].", {
      doc: wikiDoc,
      vaultSlugs: new Set([wikiDoc.slug]),
    });
    await screen.findByText("Pointing at", { exact: false });
    expect(screen.queryByRole("link", { name: "nowhere" })).toBeNull();
  });

  it("leaves a target carrying a slash addressed at the vault root", async () => {
    renderViewer("Pointing at [[capabilities/checkout]].", {
      doc: wikiDoc,
      vaultSlugs: new Set([wikiDoc.slug, "capabilities/checkout"]),
    });
    expect(
      await screen.findByRole("link", { name: "capabilities/checkout" }),
    ).toBeInTheDocument();
  });

  it("keeps a bare slug at the vault root for a document outside wiki/", async () => {
    renderViewer("See [[FEATURES]].", {
      vaultSlugs: new Set([doc.slug, "FEATURES"]),
    });
    expect(await screen.findByRole("link", { name: "FEATURES" })).toBeInTheDocument();
  });
});
