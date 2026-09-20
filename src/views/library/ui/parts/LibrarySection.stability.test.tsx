import { render } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import { writeLibraryIndexQuery } from "@/shared/lib/appearance-preferences";
import type { LibraryUiModel } from "@/features/library";
import { LibrarySection } from "./LibrarySection";

/**
 * **The list follows the open file once, not on every render.**
 *
 * `visibleSources` and `visiblePages` are derived arrays. Rebuilt on each render they were a
 * new identity every time, so the effect that scrolls the list to the open row re-ran on
 * renders that had nothing to do with the list — and on a long column that effect fights the
 * person's own scrolling. The claim here is identity: an unrelated prop change must not move
 * the list again.
 */

const onRowFocus = vi.fn();
vi.mock("@/shared/lib/use-roving-rows", () => ({
  useRovingRows: () => ({ focusIndex: 0, onKeyDown: () => {}, onRowFocus, tabIndexOf: () => -1 }),
}));

const MODEL = {
  sources: [
    { path: "sources/a.md", name: "a.md", format: "md", bytes: 10, mtime: 0, state: "compiled" as const, citedBy: [], reviewPages: [] },
    { path: "sources/b.md", name: "b.md", format: "md", bytes: 10, mtime: 0, state: "compiled" as const, citedBy: [], reviewPages: [] },
  ],
  wikiPages: [],
  needsCompileCount: 0,
  notCompiledCount: 0,
  staleCount: 0,
  pathsNeedingHash: [],
  verdicts: new Map(),
  offTemplateCount: 0,
  hashes: new Map(),
  pageTexts: new Map(),
  log: { lastCompile: null, lastLint: null },
  pairing: { originalsByWiki: new Map(), writeUpsBySource: new Map() },
} as unknown as LibraryUiModel;

function Harness({ busy }: { busy: boolean }) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={MODEL}
      selectedSlug={null}
      selectedSourcePath="sources/b.md"
      onSelect={() => {}}
      onOpenSource={() => {}}
      sourceHandles={new Map()}
      vaultScope="stability"
      onAddFiles={() => {}}
      onFindDocuments={() => {}}
      onImportFromService={() => {}}
      onCompile={() => {}}
      onLint={() => {}}
      onNewPage={null}
      report={null}
      segment="sources"
      actionsNote={null}
      inApp={false}
      busy={busy}
      t={t}
    />
  );
}

describe("the index list and the open row", () => {
  it("does not chase the selection again when something unrelated re-renders", () => {
    // Under a search the list is a filtered array — the case where a render used to hand the
    // effect a brand-new list with the same rows in it.
    writeLibraryIndexQuery("stability", "sources/b");
    const { rerender } = render(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Harness busy={false} />
      </NextIntlClientProvider>,
    );
    // The search settling is a real change of input and may move the list; what must not move
    // it again is a render that changed nothing the list is made of.
    expect(onRowFocus).toHaveBeenCalledWith(0);
    const settled = onRowFocus.mock.calls.length;

    rerender(
      <NextIntlClientProvider locale="en" messages={enMessages}>
        <Harness busy />
      </NextIntlClientProvider>,
    );
    expect(onRowFocus).toHaveBeenCalledTimes(settled);
  });
});
