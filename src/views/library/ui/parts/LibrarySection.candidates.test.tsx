import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import type { LintNodeCandidate } from "@/features/library";
import type { LibraryUiModel } from "../../lib/use-library-model";
import { LibrarySection } from "./LibrarySection";

const MODEL = {
  sources: [],
  wikiPages: [
    { slug: "wiki/a", title: "A", sourcePaths: [], createdBy: "agent:claude", compiledAt: null },
    { slug: "wiki/b", title: "B", sourcePaths: [], createdBy: "agent:claude", compiledAt: null },
  ],
  needsCompileCount: 0,
  notCompiledCount: 0,
  staleCount: 0,
  pathsNeedingHash: [],
  verdicts: new Map(),
  offTemplateCount: 0,
  hashes: new Map(),
  pageTexts: new Map(),
  log: { lastCompile: null, lastLint: null },
} as unknown as LibraryUiModel;

const CANDIDATES: LintNodeCandidate[] = [
  { name: "Export Worker", kind: "element", pages: ["wiki/a", "wiki/b"], why: "named on three pages" },
  { name: "Teodor Vasquez", kind: "person", pages: ["wiki/a"], why: "" },
];

function Harness({ onPropose, candidates = CANDIDATES }: { onPropose: ((c: LintNodeCandidate) => void) | null; candidates?: LintNodeCandidate[] }) {
  const t = useTranslations("library");
  return (
    <LibrarySection
      model={MODEL}
      selectedSlug={null}
      selectedSourcePath={null}
      onSelect={() => {}}
      onOpenSource={() => {}}
      onAddFiles={() => {}}
      onFindDocuments={() => {}}
      onImportFromService={() => {}}
      onCompile={() => {}}
      onLint={() => {}}
      candidates={candidates}
      onPropose={onPropose}
      /*
       * `transferNote` became `compileNote` and the drop hint left this column for the
       * empty-folder stage (2026-09-07 merge). The case is unchanged; it points at the
       * prop that carries the same fact.
       */
      compileNote={null}
      busy={false}
      t={t}
    />
  );
}

function mount(node: React.ReactNode) {
  return render(<NextIntlClientProvider locale="en" messages={enMessages}>{node}</NextIntlClientProvider>);
}

describe("names without a page become node candidates a person can propose", () => {
  it("lists each candidate with its kind and page count, and a Propose chip", () => {
    const onPropose = vi.fn();
    mount(<Harness onPropose={onPropose} />);
    const rows = screen.getAllByTestId("library-candidate");
    expect(rows).toHaveLength(2);
    expect(rows[0]!.textContent).toContain("Export Worker");
    expect(rows[0]!.textContent).toContain("element");
    expect(rows[0]!.textContent).toContain("on 2 pages");
    expect(rows[1]!.textContent).toContain("stays in the wiki");
    // One chip, not two: a person is a name the wiki keeps, never a node on the map.
    expect(screen.getAllByTestId("library-candidate-propose")).toHaveLength(1);
    fireEvent.click(screen.getAllByTestId("library-candidate-propose")[0]!);
    expect(onPropose).toHaveBeenCalledWith(CANDIDATES[0]);
  });

  it("shows no rows when the last check named nobody, and no chip where no agent can run", () => {
    mount(<Harness onPropose={null} candidates={[]} />);
    expect(screen.queryByTestId("library-candidates")).toBeNull();
  });

  it("keeps the names visible on the web, where the chip cannot be offered", () => {
    mount(<Harness onPropose={null} />);
    expect(screen.getAllByTestId("library-candidate")).toHaveLength(2);
    expect(screen.queryByTestId("library-candidate-propose")).toBeNull();
  });
});
