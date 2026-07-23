import { fireEvent, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../../messages/en.json";
import koMessages from "../../../../../messages/ko.json";
import type { VaultDoc } from "@/entities/docs-vault";
import { DocFrontmatterBlock } from "./DocFrontmatterBlock";

const doc: VaultDoc = {
  slug: "capabilities/cli-developer-entry",
  path: "docs/ontology/capabilities/cli-developer-entry.md",
  title: "CLI Developer Entry",
  tags: [],
  frontmatter: {
    kind: "capability",
    slug: "capabilities/cli-developer-entry",
    title: "CLI Developer Entry",
    domain: "developer-experience",
    status: "active",
    depends_on: ["mcp-server"],
  },
  headings: [],
  excerpt: "",
  wordCount: 11114,
  updatedAt: "2026-05-04T00:00:00.000Z",
  linksOut: [],
};

function renderBlock(locale: "en" | "ko" = "ko") {
  const messages = locale === "ko" ? koMessages : enMessages;
  return render(
    <NextIntlClientProvider locale={locale} messages={messages}>
      <DocFrontmatterBlock doc={doc} />
    </NextIntlClientProvider>,
  );
}

describe("DocFrontmatterBlock", () => {
  it("starts collapsed with a plain summary of kind, slug, and field count", () => {
    renderBlock();
    const details = screen.getByTestId("doc-frontmatter-block").querySelector("details");
    expect(details).not.toBeNull();
    expect(details).not.toHaveAttribute("open");

    const summary = within(screen.getByTestId("doc-frontmatter-summary"));
    expect(summary.getByText("capability")).toBeInTheDocument();
    expect(summary.getByText("capabilities/cli-developer-entry")).toBeInTheDocument();
    expect(summary.getByText("속성 6개")).toBeInTheDocument();
  });

  it("reveals the full mono frontmatter block when expanded", () => {
    renderBlock();
    const summary = screen.getByTestId("doc-frontmatter-summary");
    fireEvent.click(summary);

    const details = screen.getByTestId("doc-frontmatter-block").querySelector("details");
    expect(details).toHaveAttribute("open");
    expect(
      screen.getByText("frontmatter 가 곧 그래프 — 이 블록이 topology 의 노드와 엣지가 됩니다."),
    ).toBeVisible();
  });

  it("never deletes the graph-source fields — only collapses them", () => {
    renderBlock();
    // domain / status / depends_on are still present in the DOM even while
    // collapsed (native <details> hides via UA stylesheet, not removal) —
    // frontmatter is the graph source, so hiding is fine but deleting is not.
    expect(screen.getByText("developer-experience")).toBeInTheDocument();
    expect(screen.getByText("active")).toBeInTheDocument();
  });

  it("renders the English collapsed summary copy", () => {
    renderBlock("en");
    const summary = within(screen.getByTestId("doc-frontmatter-summary"));
    expect(summary.getByText("6 fields")).toBeInTheDocument();
  });

  it("linkifies resolvable reference slugs and navigates on click, leaving unresolved ones plain", () => {
    const onNavigate = vi.fn();
    // domain(developer-experience)·depends_on(mcp-server) 은 vault 에 있고,
    // ghost-ref 는 없다고 가정.
    const resolveRef = (token: string) =>
      token === "developer-experience"
        ? "domains/developer-experience"
        : token === "mcp-server"
          ? "capabilities/mcp-server"
          : null;
    const docWithGhost: VaultDoc = {
      ...doc,
      frontmatter: { ...doc.frontmatter, depends_on: ["mcp-server", "ghost-ref"] },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={docWithGhost} onNavigate={onNavigate} resolveRef={resolveRef} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));

    const domainRef = screen.getByTestId("doc-frontmatter-ref-developer-experience");
    expect(domainRef.tagName).toBe("BUTTON");
    fireEvent.click(domainRef);
    expect(onNavigate).toHaveBeenCalledWith("domains/developer-experience");

    fireEvent.click(screen.getByTestId("doc-frontmatter-ref-mcp-server"));
    expect(onNavigate).toHaveBeenCalledWith("capabilities/mcp-server");

    // 미해소 참조는 버튼이 되지 않는다.
    expect(screen.queryByTestId("doc-frontmatter-ref-ghost-ref")).not.toBeInTheDocument();
    expect(screen.getByText("ghost-ref")).toBeInTheDocument();
  });

  it("keeps reference fields plain text when no resolveRef/onNavigate is supplied", () => {
    renderBlock();
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByTestId("doc-frontmatter-ref-developer-experience")).not.toBeInTheDocument();
    expect(screen.getByText("developer-experience")).toBeInTheDocument();
  });

  it("hides the quick-patch action when canEdit/onPatch are not supplied (read-only default)", () => {
    renderBlock();
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByText("kind / domain / title 수정")).not.toBeInTheDocument();
  });

  it("shows a quick-patch action for a writable local vault and saves kind/domain/title edits", async () => {
    const onPatch = vi.fn().mockResolvedValue(undefined);
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock
          doc={doc}
          canEdit
          domainOptions={[
            { slug: "developer-experience", title: "Developer Experience" },
            { slug: "graph-quality", title: "Graph Quality" },
          ]}
          onPatch={onPatch}
        />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    fireEvent.click(screen.getByText("kind / domain / title 수정"));

    fireEvent.change(screen.getByLabelText("Domain", { exact: false }), {
      target: { value: "graph-quality" },
    });
    fireEvent.click(screen.getByText("저장"));

    await vi.waitFor(() => {
      expect(onPatch).toHaveBeenCalledWith({ domain: "graph-quality" });
    });
  });

  it("does not offer the quick-patch action for a non-editable sentinel kind", () => {
    const readmeDoc: VaultDoc = {
      ...doc,
      frontmatter: { ...doc.frontmatter, kind: "vault-readme" },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={readmeDoc} canEdit onPatch={vi.fn()} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByText("kind / domain / title 수정")).not.toBeInTheDocument();
  });

  it("renders no validator-warnings row when the frontmatter is clean", () => {
    renderBlock();
    expect(screen.queryByTestId("doc-frontmatter-validator-warnings")).not.toBeInTheDocument();
  });

  it("surfaces a plain-language validator warning for a capability missing domain — no raw code exposed", () => {
    const noDomainDoc: VaultDoc = {
      ...doc,
      frontmatter: { kind: "capability", slug: doc.slug, title: doc.title },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={noDomainDoc} />
      </NextIntlClientProvider>,
    );
    const warnings = screen.getByTestId("doc-frontmatter-validator-warnings");
    expect(within(warnings).getByText(/domain/)).toBeInTheDocument();
    expect(within(warnings).queryByText("missing-expected-field")).not.toBeInTheDocument();
  });

  it("offers a collapsed spec-example disclosure for a known kind, derived from the shared new-doc starter", () => {
    renderBlock();
    expect(screen.queryByTestId("doc-frontmatter-example")).not.toBeInTheDocument();

    const toggle = screen.getByTestId("doc-frontmatter-example-toggle");
    expect(toggle).toHaveAttribute("aria-expanded", "false");
    fireEvent.click(toggle);

    expect(toggle).toHaveAttribute("aria-expanded", "true");
    const example = screen.getByTestId("doc-frontmatter-example");
    expect(within(example).getByText(/kind: capability/)).toBeInTheDocument();
    expect(within(example).getByText(/domain: example-domain/)).toBeInTheDocument();
  });

  it("hides the spec-example disclosure when the document has no recognizable kind", () => {
    const noKindDoc: VaultDoc = {
      ...doc,
      frontmatter: { status: "draft", slug: doc.slug, title: doc.title },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={noKindDoc} />
      </NextIntlClientProvider>,
    );
    expect(screen.queryByTestId("doc-frontmatter-example-toggle")).not.toBeInTheDocument();
    expect(screen.queryByTestId("doc-frontmatter-validator-warnings")).not.toBeInTheDocument();
  });
});

// R+ "코드 위치" (code location) — frontmatter `elements: [...]` is the vault's
// ONLY real code evidence, but it wasn't in `GRAPH_KEYS` above (not a
// single-line key:value fact) so it was invisible even when expanded. This
// adds a dedicated, distinguishable section: raw code paths (plain
// monospace) rather than the clickable `REFERENCE_KEYS` ref-token pattern.
describe("DocFrontmatterBlock — 코드 위치 (code location) section", () => {
  const docWithElements: VaultDoc = {
    ...doc,
    frontmatter: {
      ...doc.frontmatter,
      elements: ["mcp/src/index.js", "mcp/src/verify.mjs"],
    },
  };

  it("expanding the block reveals a code-location row for each frontmatter `elements` path", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={docWithElements} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    const section = screen.getByTestId("doc-frontmatter-code-locations");
    expect(within(section).getByText("mcp/src/index.js")).toBeInTheDocument();
    expect(within(section).getByText("mcp/src/verify.mjs")).toBeInTheDocument();
  });

  it("omits the section when the document has no `elements` frontmatter", () => {
    renderBlock();
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    expect(screen.queryByTestId("doc-frontmatter-code-locations")).not.toBeInTheDocument();
  });

  it("excludes `elements` entries that don't look like code paths (e.g. a stray vault-node ref)", () => {
    const mixedDoc: VaultDoc = {
      ...doc,
      frontmatter: {
        ...doc.frontmatter,
        elements: ["mcp/src/index.js", "capabilities/mcp-server"],
      },
    };
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={mixedDoc} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    const section = screen.getByTestId("doc-frontmatter-code-locations");
    expect(within(section).getByText("mcp/src/index.js")).toBeInTheDocument();
    expect(within(section).queryByText("capabilities/mcp-server")).not.toBeInTheDocument();
  });

  it("copies the path when the row's copy button is clicked", () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, { clipboard: { writeText } });
    render(
      <NextIntlClientProvider locale="ko" messages={koMessages}>
        <DocFrontmatterBlock doc={docWithElements} />
      </NextIntlClientProvider>,
    );
    fireEvent.click(screen.getByTestId("doc-frontmatter-summary"));
    const copyButtons = screen.getAllByTestId("doc-frontmatter-code-location-copy");
    fireEvent.click(copyButtons[0]);
    expect(writeText).toHaveBeenCalledWith("mcp/src/index.js");
  });
});
