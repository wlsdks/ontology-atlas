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
});
