import { act, render, screen, within } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import en from "../../../../../../messages/en.json";
import { createPaintedBody, WikiPageFoot, type PaintedBody } from "./WikiPageFoot";

function Foot({ painted, onOpenSource }: { painted: PaintedBody; onOpenSource: (path: string) => void }) {
  const t = useTranslations("library");
  return (
    <WikiPageFoot painted={painted} isPresent={(path) => path === "sources/listed.md"}
      originals={[{ path: "sources/listed.md", name: "listed.md", state: "compiled" }, { path: "sources/gone.md", name: "gone.md", state: null }]}
      linkedFrom={[]} concepts={[]} onOpenSource={onOpenSource} onOpenPage={() => {}} onOpenConcept={() => {}} t={t} />
  );
}

describe("the page foot", () => {
  it("counts the citations the viewer drew, and gives a source the folder does not list no press", () => {
    const painted = createPaintedBody();
    const onOpenSource = vi.fn();
    render(<NextIntlClientProvider locale="en" messages={en}><Foot painted={painted} onOpenSource={onOpenSource} /></NextIntlClientProvider>);
    expect(screen.queryByTestId("wiki-page-foot")).toBeNull();
    act(() => painted.set(new Map([["sources/listed.md", 2], ["sources/gone.md", 1], ["sources/unlisted.md", 1]])));
    const rows = within(screen.getByTestId("wiki-foot-sources")).getAllByTestId("wiki-foot-row");
    expect(rows.map((row) => row.textContent)).toEqual(["listed.md2 citations", "gone.md1 citation", "unlisted.md1 citation"]);
    expect(within(rows[0]!).getByRole("button")).toBeInTheDocument();
    for (const row of rows.slice(1)) expect(within(row).queryByRole("button")).toBeNull();
  });
});
