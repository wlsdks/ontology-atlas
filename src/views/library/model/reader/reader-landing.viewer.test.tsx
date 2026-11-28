import { render, screen } from "@testing-library/react";
import { IntlProvider } from "use-intl";
import type React from "react";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../messages/en.json";
import type { VaultDoc } from "@/entities/docs-vault";
import { deskPageClaims, findDeskClaims } from "@/features/library/lib/questions/desk-search";
import { DocsVaultViewer } from "@/widgets/docs-vault";
import { claimSentence } from "../../ui/questions/desk/DeskLeadRow";
import { findClaimBlock } from "./reader-landing";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => <a href={String(href)} {...props}>{children}</a>,
}));

const page: VaultDoc = {
  slug: "wiki/returns", path: "wiki/returns.md", title: "Returns", tags: [], frontmatter: {},
  updatedAt: "2026-11-20", linksOut: [],
};
const CLAIM_B = "Bravo: the return label is free for members. [[src:sources/returns.md#l5]]";

/** Renders the page as the reader does, then finds the block a desk row for its "free label" claim marks. */
async function pressedBlock(raw: string, pick: (lines: number[]) => number = (lines) => lines[0]!) {
  const { claims } = findDeskClaims("free return label members", [page], new Map([[page.slug, deskPageClaims(raw)]]));
  const line = pick(claims.map((one) => one.line));
  const claim = claims.find((each) => each.line === line)!;
  const { container } = render(
    <IntlProvider locale="en" messages={en}>
      <DocsVaultViewer doc={page} vaultSlugs={new Set([page.slug])} onNavigate={() => {}}
        getDocContent={() => Promise.resolve(raw)} markSourceLines linkTargets={new Map([[page.slug, { title: "Returns", kind: null }]])}
        knownOriginalPaths={new Set(["sources/returns.md"])} onCitationPress={() => {}} />
    </IntlProvider>,
  );
  await screen.findByText(/Alpha/u);
  return { claim, block: findClaimBlock(container, claim.line, claimSentence(claim.text)) };
}

const facts = ["## Facts", "", "- Alpha: shipping takes three days.", `- ${CLAIM_B}`, "- Charlie: refunds clear in a week.", "- Delta: exchanges are free."];

describe("a desk row lands on the claim it names", () => {
  it("on a CRLF page", async () => {
    const { claim, block } = await pressedBlock(["---", "title: Returns", "---", ...facts].join("\r\n"));
    expect(block?.textContent).toContain("Bravo");
    expect(block?.dataset.line).toBe(String(claim.line));
  });

  it("on a page with a BOM", async () => {
    const { claim, block } = await pressedBlock(`﻿${["---", "title: Returns", "---", ...facts].join("\n")}`);
    expect(block?.textContent).toContain("Bravo");
    expect(block?.dataset.line).toBe(String(claim.line));
  });

  it("below a wikilink that spans lines, where the line alone names a later block", async () => {
    const { claim, block } = await pressedBlock(["---", "title: Returns", "---", "See [[wiki/settlement-", "reconciliation-", "check|the check]] first.", "", ...facts].join("\n"));
    expect(block?.textContent).toContain("Bravo");
    expect(block?.dataset.line).not.toBe(String(claim.line));
  });

  it("on the hinted one of two identical sentences", async () => {
    const raw = ["---", "title: Returns", "---", ...facts, `- ${CLAIM_B}`].join("\n");
    const later = await pressedBlock(raw, (lines) => Math.max(...lines));
    expect(later.block?.dataset.line).toBe(String(later.claim.line));
    expect(Number(later.block?.dataset.line)).toBeGreaterThan(5);
  });
});
