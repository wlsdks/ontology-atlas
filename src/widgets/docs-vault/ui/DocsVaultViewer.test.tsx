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

function renderViewer(markdown: string) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <DocsVaultViewer
        doc={doc}
        vaultSlugs={new Set([doc.slug])}
        onNavigate={() => {}}
        getDocContent={() => Promise.resolve(markdown)}
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
    expect(anchor.className).toContain("sm:-left-6");
    expect(anchor.className).toContain("sm:opacity-0");
  });
});
