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

function modelOf(wikiPages: LibraryWikiPage[], verdicts = badVerdicts(wikiPages), unmeasured: string[] = []): WikiIndexProps["model"] {
  return {
    wikiPages,
    sources: [],
    verdicts,
    pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
    structural: { unmeasured },
  } as unknown as WikiIndexProps["model"];
}

function badVerdicts(wikiPages: readonly LibraryWikiPage[]) {
  return new Map(wikiPages.filter((p) => p.slug.startsWith("wiki/bad")).map((p) => [p.slug, { problems: [{ code: "uncited-fact" }] }]));
}

function renderIndex(over: Partial<WikiIndexProps> = {}) {
  const props: WikiIndexProps = {
    model: modelOf(pages()),
    findings: [],
    vaultScope: "test",
    selectedSlug: null,
    onOpenPage: vi.fn(),
    onOpenCheckResults: vi.fn(),
    onEmptyPress: vi.fn(),
    readingCount: null,
    ...over,
  };
  const view = (next: WikiIndexProps) => (
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <WikiIndex {...next} />
    </NextIntlClientProvider>
  );
  const { rerender } = render(view(props));
  return { props, update: (next: Partial<WikiIndexProps>) => rerender(view({ ...props, ...next })) };
}

const CURRENT = "[data-index-frame][data-current]";
const rowTitles = () => [...document.querySelectorAll(`${CURRENT} [data-index-row]`)].map((row) => row.querySelector("span.text-body")?.textContent);

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

  it("goes back at once when Escape follows Show all before anything settles", async () => {
    renderIndex();
    const showAll = await screen.findByRole("button", { name: `Show all ${ONE_SOURCE}` });
    showAll.focus();
    fireEvent.click(showAll);
    fireEvent.keyDown(document.activeElement!, { key: "Escape" });
    expect(screen.getByTestId("wiki-index").dataset.state).toBe("index");
    await waitFor(() => expect(document.activeElement?.textContent).toBe(`Show all ${ONE_SOURCE}`));
  });

  it("returns to the whole index when the group shown alone empties, and stays there when it refills", async () => {
    const { update } = renderIndex();
    fireEvent.click(await screen.findByRole("button", { name: `Show all ${ONE_SOURCE}` }));
    expect(screen.getByTestId("wiki-index").dataset.state).toBe("alone");
    update({ model: modelOf(pages().filter((p) => p.slug.startsWith("wiki/bad"))) });
    await waitFor(() => expect(screen.getByTestId("wiki-index").dataset.state).toBe("index"));
    update({ model: modelOf(pages()) });
    await screen.findByRole("button", { name: `Show all ${ONE_SOURCE}` });
    expect(screen.getByTestId("wiki-index").dataset.state).toBe("index");
  });

  it("forgets the group shown alone when another folder opens", async () => {
    const { update } = renderIndex();
    fireEvent.click(await screen.findByRole("button", { name: `Show all ${ONE_SOURCE}` }));
    update({ vaultScope: "other" });
    await waitFor(() => expect(screen.getByTestId("wiki-index").dataset.state).toBe("index"));
    await screen.findByRole("heading", { name: /Needs a look/ });
  });

  it("draws nothing until the first check results arrive, then draws Needs a look first", async () => {
    const all = pages();
    const { update } = renderIndex({ model: modelOf(all, new Map(), all.map((p) => p.slug)), readingCount: 0 });
    await screen.findByText("Reading wiki pages · 0 so far");
    expect(document.querySelectorAll("[data-index-row]")).toHaveLength(0);
    update({ model: modelOf(all, badVerdicts(all), all.slice(0, 50).map((p) => p.slug)) });
    const headings = await screen.findAllByRole("heading");
    expect(headings[0]!.textContent).toMatch(/^Needs a look/);
  });

  it("keeps keyboard focus on a page that newer problems push out of Needs a look's five", async () => {
    const all = pages();
    const { update } = renderIndex();
    const bad0 = (await screen.findAllByRole("button", { name: /^Bad 0 · / }))[0]!;
    bad0.focus();
    fireEvent.focus(bad0);
    const newer = Array.from({ length: 5 }, (_, i) => ({ slug: `wiki/worse${i}`, title: `Worse ${i}`, sourcePaths: [`sources/worse${i}.md`], createdBy: null, compiledAt: new Date().toISOString() }));
    const next = [...all, ...newer];
    const verdicts = badVerdicts(all);
    for (const p of newer) verdicts.set(p.slug, { problems: [{ code: "uncited-fact" }] });
    update({ model: modelOf(next, verdicts) });
    await screen.findAllByRole("button", { name: /^Worse 0 · / });
    await waitFor(() => expect(document.activeElement?.getAttribute("aria-label")).toMatch(/^Bad 0 · /));
  });

  it("sends the cut Needs a look group to Check results and a row to the reader", async () => {
    const { props } = renderIndex();
    fireEvent.click(await screen.findByRole("button", { name: "All 7 in Check results" }));
    expect(props.onOpenCheckResults).toHaveBeenCalledTimes(1);
    fireEvent.click(screen.getAllByRole("button", { name: /^Bad 0 · No source backs this up/ })[0]!);
    expect(props.onOpenPage).toHaveBeenCalledWith("wiki/bad0");
  });

  it("offers Sources on the first day when sources wait", () => {
    const { props } = renderIndex({ model: { ...modelOf([]), sources: [{}] } as unknown as WikiIndexProps["model"] });
    fireEvent.click(screen.getByRole("button", { name: "Write wiki pages from Sources" }));
    expect(props.onEmptyPress).toHaveBeenCalledTimes(1);
  });
});
