import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { beforeEach, describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import type { VaultDoc } from "@/entities/docs-vault";
import { DocsVaultViewer } from "./DocsVaultViewer";

const motion = vi.hoisted(() => ({ reduced: false }));

vi.mock('@/shared/lib/render-timing/use-prefers-reduced-motion', () => ({
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

  it("shows the section copy anchor on hover and on keyboard focus", async () => {
    renderViewer("## Section One\n\nBody text.");

    const anchor = await screen.findByRole("button", {
      name: "Copy link to this section",
    });

    expect(anchor.className).toContain("[@media(hover:hover)]:opacity-0");
    expect(anchor.className).toContain("group-hover:opacity-100");
    // The keyboard does not stop on an invisible cell.
    expect(anchor.className).toContain("focus-visible:opacity-100");
  });

  /**
   * A `docs/` document is read here and on GitHub, whose heading-id rules differ (an em dash
   * between spaces), so `docs/DESIGN-SYSTEM.md` contents links must work on both.
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
    // `../mcp/README.md` in docs/README.md leaves the vault (docs/) and must not route into the
    // app.
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
    expect(link.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("opens a direct https link in a new tab without handing it the opener", async () => {
    renderViewer("Read [the site](https://example.com) first.");
    const link = await screen.findByRole("link", { name: /the site/ });
    expect(link).toHaveProperty("href", "https://example.com/");
    expect(link.getAttribute("target")).toBe("_blank");
    expect(link.getAttribute("rel")).toBe("noreferrer noopener");
  });

  it("renders a vault-external link as non-routing text when repo location is unknown (local vault)", async () => {
    // Without repoBlobBase (a local vault) the link renders as non-routing text, not a dead 404.
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
   * A compiled page's unlabelled citations read as places ("line 5"),
   * not `src:sources/budget.md#l5` addresses.
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

  it("loads no remote image, and names its host with a way to open it elsewhere", async () => {
    const { container } = renderViewer("![Diagram](https://tracker.example/pixel.png?reader=me)");
    const placeholder = await screen.findByTestId("docs-viewer-remote-image");
    expect(placeholder).toHaveTextContent("Diagram");
    expect(placeholder).toHaveTextContent("tracker.example");
    expect(container.querySelector('img[src*="tracker.example"]')).toBeNull();
    const open = within(placeholder).getByRole("link");
    expect(open).toHaveAttribute("href", "https://tracker.example/pixel.png?reader=me");
    expect(open).toHaveAttribute("target", "_blank");
    expect(open).toHaveAttribute("rel", "noopener noreferrer");
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

  // A highlightQuery from the palette yields one mark and scrollIntoView after the body loads
  // asynchronously.
  describe('highlightQuery landing marks and scrolls after the body loads', () => {
    it('wraps the match in mark and scrolls after the body loads', async () => {
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

    // A body wrapped at about 80 characters (the AGENTS.md convention) still lands when a newline
    // falls inside the phrase.
    it('marks and scrolls a phrase split by a line wrap', async () => {
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

    it('neither marks nor scrolls without highlightQuery', async () => {
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
 * A wikilink resolves here as everywhere else in the vault
 * (`extractOutLinkTargets`, `validateWikiFolder`).
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

describe("DocsVaultViewer in the Library reader", () => {
  const page: VaultDoc = { ...doc, slug: "wiki/returns", path: "wiki/returns.md", title: "Return policy" };
  const targets = new Map([
    ["wiki/returns", { title: "Return policy", kind: null }],
    ["wiki/settlement", { title: "Settlement reconciliation check", kind: null }],
    ["capabilities/refunds", { title: "Refund processing", kind: "capability" }],
  ]);
  const slugs = new Set(targets.keys());

  it("names a link by its target's title, a concept with its kind, and opens a concept elsewhere", async () => {
    const onNavigate = vi.fn();
    const onConceptNavigate = vi.fn();
    renderViewer("See [[wiki/settlement]], [[wiki/settlement|the check]] and [[capabilities/refunds]].", {
      doc: page, vaultSlugs: slugs, linkTargets: targets, onNavigate, onConceptNavigate,
    });
    const pageLink = await screen.findByRole("link", { name: "Settlement reconciliation check" });
    expect(screen.getByRole("link", { name: "the check" })).toBeInTheDocument();
    const concept = screen.getByRole("link", { name: "Refund processing" });
    expect(concept.querySelector("[data-kind-glyph]")).not.toBeNull();
    fireEvent.click(pageLink);
    expect(onNavigate).toHaveBeenCalledWith("wiki/settlement");
    fireEvent.click(concept);
    expect(onConceptNavigate).toHaveBeenCalledWith("capabilities/refunds");
    expect(onNavigate).toHaveBeenCalledTimes(1);
  });

  it("keeps a missing target's written path and describes it as missing", async () => {
    renderViewer("See [[wiki/nowhere]].", { doc: page, vaultSlugs: slugs, linkTargets: targets });
    const missing = await screen.findByText("wiki/nowhere");
    expect(missing).toHaveAttribute("tabindex", "0");
    expect(missing).toHaveAccessibleDescription("Nothing in this folder has this name.");
    expect(screen.queryByRole("link", { name: "wiki/nowhere" })).toBeNull();
  });

  it("draws a page's link to itself as plain text", async () => {
    renderViewer("This page is [[wiki/returns]].", { doc: page, vaultSlugs: slugs, linkTargets: targets });
    expect(await screen.findByText("Return policy")).not.toHaveAttribute("href");
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("hands a citation press to the reader instead of leaving the page, and keeps the allow-list", async () => {
    const onSourceNavigate = vi.fn();
    const onCitationPress = vi.fn();
    /* The listing names the traversed path itself, so only the segment rule can refuse it. */
    renderViewer("Fact. [[src:sources/a.md#l2]] [[src:sources/gone.md#l1]] [[src:sources/../secret.md#l1]]", {
      doc: page, vaultSlugs: slugs, knownOriginalPaths: new Set(["sources/a.md", "secret.md", "sources/../secret.md"]),
      onSourceNavigate, onCitationPress,
    });
    const known = await screen.findByRole("button", { name: /sources\/a\.md/u });
    fireEvent.click(known);
    expect(onCitationPress).toHaveBeenLastCalledWith({ path: "sources/a.md", rawPath: "sources/a.md", anchor: "l2" }, known);
    const gone = screen.getByRole("button", { name: /sources\/gone\.md/u });
    fireEvent.click(gone);
    expect(onCitationPress).toHaveBeenLastCalledWith({ path: null, rawPath: "sources/gone.md", anchor: "l1" }, gone);
    // A path that climbs out of sources/ is never allow-listed: the press carries no path.
    fireEvent.click(screen.getByRole("button", { name: /secret\.md/u }));
    expect(onCitationPress.mock.lastCall?.[0]).toMatchObject({ path: null });
    expect(onSourceNavigate).not.toHaveBeenCalled();
  });

  it("counts only the citations it drew: none from a comment or a code block", async () => {
    const onBodyPainted = vi.fn();
    renderViewer([
      "A fact. [[src:sources/a.md#l2]] [[src:sources/%ED%95%9C.md#l1]]",
      "",
      "<!-- [[src:sources/a.md#l9]] [[src:sources/hidden.md#l1]] -->",
      "",
      "```",
      "[[src:sources/a.md#l3]] [[src:sources/fenced.md#l1]]",
      "```",
    ].join("\n"), {
      doc: page, vaultSlugs: slugs, linkTargets: targets, knownOriginalPaths: new Set(["sources/a.md"]),
      onCitationPress: () => {}, onBodyPainted,
    });
    await screen.findByText("A fact.", { exact: false });
    expect(onBodyPainted.mock.lastCall?.[1]).toEqual(new Map([["sources/a.md", 1], ["sources/한.md", 1]]));
  });

  it("marks each block with the body line it starts on only when asked", async () => {
    const { unmount } = renderViewer("## Facts\n\n- one\n- two", { doc: page, vaultSlugs: slugs, markSourceLines: true });
    expect((await screen.findByText("two")).closest("li")).toHaveAttribute("data-line", "4");
    unmount();
    renderViewer("## Facts\n\n- one\n- two", { doc: page, vaultSlugs: slugs });
    expect((await screen.findByText("two")).closest("li")).not.toHaveAttribute("data-line");
  });

  const sources = new Set(["sources/a.md", "sources/b.md"]);
  const titled = new Map([
    ...targets,
    ["wiki/p1", { title: "Payment provider fee schedule: what it says", kind: null }],
    ["wiki/p2", { title: "Refund approval matrix", kind: null }],
  ]);
  const titledSlugs = new Set(titled.keys());
  const readerProps = (extra: Partial<React.ComponentProps<typeof DocsVaultViewer>> = {}) => ({
    doc: page, vaultSlugs: titledSlugs, linkTargets: titled, knownOriginalPaths: sources,
    onSourceNavigate: () => {}, onCitationPress: () => {}, ...extra,
  });

  it("puts a dot between links that only whitespace separates, and nowhere else", async () => {
    const { container } = renderViewer(
      "Related: [[wiki/settlement]] [[wiki/p1]] [[wiki/p2]] [[capabilities/refunds]] [[wiki/settlement|again]].\n\n" +
        "See [[wiki/p1]] and [[wiki/p2]].\n\nA fact [[wiki/p1]] [[src:sources/a.md#l2]] goes on.",
      readerProps(),
    );
    const [run, words, cited] = await Promise.all([0, 1, 2].map(async (index) => (await screen.findAllByText(/Related|See|A fact/u))[index]!.closest("p")!));
    const separators = run.querySelectorAll("[data-link-separator]");
    expect(separators).toHaveLength(4);
    for (const separator of separators) {
      expect(separator.textContent).toBe(" · ");
      expect(separator.closest("a")).toBeNull();
    }
    expect(words.querySelector("[data-link-separator]")).toBeNull();
    expect(cited.querySelector("[data-link-separator]")).toBeNull();
    expect(container.querySelectorAll("[data-link-separator]")).toHaveLength(4);
  });

  it("leaves the tree as it was on a surface without the reader's titles", async () => {
    const { container } = renderViewer(
      "Related: [[wiki/settlement]] [[wiki/p1]].\n\n- A fact. [[src:sources/a.md#l2]]",
      { doc: page, vaultSlugs: titledSlugs, knownOriginalPaths: sources, onSourceNavigate: () => {} },
    );
    await screen.findByText(/Related/u);
    expect(container.querySelector("[data-link-separator], [data-citation-run]")).toBeNull();
    expect(container.querySelector("p")!.textContent).toBe("Related: wiki/settlement wiki/p1.");
  });

  it("lowers a citation, or a run of them, that ends a fact and names its file", async () => {
    renderViewer(
      "- One cited fact. [[src:sources/a.md#l2]]\n- Two cited. [[src:sources/a.md#l3]] [[src:sources/b.md#l1]]\n" +
        "- Cited [[src:sources/b.md#l2]] in the middle.\n",
      readerProps(),
    );
    const items = (await screen.findAllByRole("listitem"));
    const runs = items.map((item) => item.querySelector("[data-citation-run]"));
    expect(runs[0]!.querySelectorAll("button")).toHaveLength(1);
    expect(runs[1]!.querySelectorAll("button")).toHaveLength(2);
    expect(runs[2]).toBeNull();
    expect(runs[0]!.className).toContain("block");
    expect(items[0]!.textContent).toMatch(/^One cited fact\./u);
  });

  it("keeps a one-source page's short citations inline", async () => {
    renderViewer("- One cited fact. [[src:sources/a.md#l2]]\n", readerProps({ namedSourcePath: "sources/a.md" }));
    const item = await screen.findByRole("listitem");
    expect(item.querySelector("[data-citation-run]")).toBeNull();
    expect(item.querySelector("button")).not.toBeNull();
  });

  it("keeps the body's nodes when its parent renders again with the same inputs", async () => {
    const props = {
      doc: page, vaultSlugs: slugs, knownOriginalPaths: new Set(["sources/a.md"]), linkTargets: targets,
      onNavigate: () => {}, onSourceNavigate: () => {}, onCitationPress: () => {},
      getDocContent: () => Promise.resolve("Fact. [[src:sources/a.md#l2]] and [[wiki/settlement]]."),
    };
    const view = render(
      <NextIntlClientProvider locale="en" messages={enMessages}><DocsVaultViewer {...props} /></NextIntlClientProvider>,
    );
    const citation = await screen.findByRole("button", { name: /sources\/a\.md/u });
    const link = screen.getByRole("link", { name: "Settlement reconciliation check" });
    view.rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}><DocsVaultViewer {...props} /></NextIntlClientProvider>,
    );
    expect(screen.getByRole("button", { name: /sources\/a\.md/u })).toBe(citation);
    expect(screen.getByRole("link", { name: "Settlement reconciliation check" })).toBe(link);
  });
});
