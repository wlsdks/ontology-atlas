import { fireEvent, render, screen, waitFor } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../../messages/en.json";
import type { LibraryWikiPage } from "@/entities/docs-vault";
import { WIKI_INDEX_FULL_LIMIT } from "../../../lib/wiki/wiki-index";
import { WikiIndex, type WikiIndexProps } from "./WikiIndex";

const ONE_SOURCE = WIKI_INDEX_FULL_LIMIT + 20;

function pages(): LibraryWikiPage[] {
  const out: LibraryWikiPage[] = Array.from({ length: ONE_SOURCE }, (_, i) => ({
    slug: `wiki/p${i}`,
    title: `Page ${i}`,
    sourcePaths: [`sources/p${i}.md`],
    createdBy: null,
    compiledAt: new Date(Date.now() - (i + 1) * 60_000 * 10).toISOString(),
  }));
  for (let i = 0; i < 7; i += 1) out.push({ slug: `wiki/bad${i}`, title: `Bad ${i}`, sourcePaths: [], createdBy: null, compiledAt: null });
  return out;
}

function renderIndex(over: Partial<WikiIndexProps> = {}) {
  const wikiPages = pages();
  const props: WikiIndexProps = {
    model: {
      wikiPages,
      sources: [],
      verdicts: new Map(wikiPages.filter((p) => p.slug.startsWith("wiki/bad")).map((p) => [p.slug, { problems: [{ code: "uncited-fact" }] }])),
      pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
    } as unknown as WikiIndexProps["model"],
    findings: [],
    vaultScope: "test",
    selectedSlug: null,
    onOpenPage: vi.fn(),
    onOpenCheckResults: vi.fn(),
    onEmptyPress: vi.fn(),
    readingCount: null,
    ...over,
  };
  render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <WikiIndex {...props} />
    </NextIntlClientProvider>,
  );
  return props;
}

const rowTitles = () => [...document.querySelectorAll("[data-index-row]")].map((row) => row.querySelector("span.text-body")?.textContent);

describe("the wiki index column", () => {
  it("shows a capped group alone under its chip, and Escape brings the whole index back", async () => {
    renderIndex();
    const showAll = await screen.findByRole("button", { name: `Show all ${ONE_SOURCE}` });
    showAll.focus();
    fireEvent.click(showAll);
    const chip = await screen.findByRole("button", { name: /Show the whole index/ });
    expect(screen.queryByRole("heading", { name: /Needs a look/ })).toBeNull();
    expect(rowTitles().slice(0, 3)).toEqual(["Page 0", "Page 1", "Page 2"]);
    await waitFor(() => expect(document.activeElement).toBe(chip));

    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.queryByRole("button", { name: /Show the whole index/ })).toBeNull();
    expect(screen.getByRole("heading", { name: /Needs a look/ })).toBeTruthy();
    await waitFor(() => expect(document.activeElement?.textContent).toBe(`Show all ${ONE_SOURCE}`));
  });

  it("sends the cut Needs a look group to Check results and a row to the reader", async () => {
    const props = renderIndex();
    fireEvent.click(await screen.findByRole("button", { name: "All 7 in Check results" }));
    expect(props.onOpenCheckResults).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: /^Bad 0 · No source backs this up/ })[0]!);
    expect(props.onOpenPage).toHaveBeenCalledWith("wiki/bad0");
  });

  it("offers Sources on the first day when sources wait", () => {
    const props = renderIndex({ model: { wikiPages: [], sources: [{}], verdicts: new Map(), pairing: { writeUpsBySource: new Map() } } as unknown as WikiIndexProps["model"] });
    fireEvent.click(screen.getByRole("button", { name: "Write wiki pages from Sources" }));
    expect(props.onEmptyPress).toHaveBeenCalledTimes(1);
  });
});
