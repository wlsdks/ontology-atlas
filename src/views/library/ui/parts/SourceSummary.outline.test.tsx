import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

import enMessages from "../../../../../messages/en.json";
import type { LibrarySourceRow } from "@/entities/docs-vault";
import type { SourceOutline } from "@/shared/lib/source-passage";
import type { SourceOutlineState } from "../../lib/use-source-outline";
import { SourceSummary } from "./SourceSummary";

/**
 * **The outline section — and the number it may never print.**
 *
 * Slice U2's second decision gives the source pane the one thing it could always have
 * shown and never did: what the document is made of. The failure that would matter is not
 * an absent section — it is a **count for a file whose shape the reader did not read**,
 * because a number on this pane reads as a fact about the person's own document. "0 parts"
 * for a PDF is the shape of that lie, and so is a heading list for a Markdown file whose
 * `##` lines this reader never promoted to headings.
 *
 * The other thing pinned here is the sentence above the facts. U1 taught the pane to stop
 * claiming a file was never opened once a citation had opened it; this section reads every
 * source pane, so the same correction has to hold for it — a list of a document's own
 * headings above the words "Atlas has never opened this file" is a pane contradicting
 * itself in one viewport.
 */

const ROW = {
  path: "sources/dispute-metrics.xlsx",
  name: "dispute-metrics.xlsx",
  format: "xlsx",
  bytes: 4096,
  mtime: 1,
  state: "not-compiled",
  citedBy: [],
} as unknown as LibrarySourceRow;

const outlineState = (outline: Partial<SourceOutline> | null, phase: SourceOutlineState["phase"] = "ready"): SourceOutlineState => ({
  path: ROW.path,
  phase,
  outline: outline
    ? { format: "xlsx", unitCount: 0, headings: [], sheets: [], unreadable: false, ...outline }
    : null,
});

function renderPane(outline: SourceOutlineState | null) {
  function Harness() {
    const t = useTranslations("library");
    return (
      <SourceSummary
        row={ROW}
        hash={null}
        passage={null}
        outline={outline}
        canReveal={false}
        writeUps={[]}
        onOpen={() => {}}
        onOpenWiki={() => {}}
        onCompile={() => {}}
        compileNote={null}
        compileBlocked={false}
        agentDoor={false}
        busy={false}
        t={t}
      />
    );
  }
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages} timeZone="UTC">
      <Harness />
    </NextIntlClientProvider>,
  );
}

describe("the source pane's outline section", () => {
  it("names each sheet with its row count", () => {
    renderPane(
      outlineState({
        unitCount: 9,
        sheets: [
          { sheet: "Quarterly", rows: 4 },
          { sheet: "Reason codes", rows: 5 },
        ],
      }),
    );
    const list = screen.getByTestId("library-source-outline-list");
    expect(list).toHaveTextContent("Sheet Quarterly · 4 rows");
    expect(list).toHaveTextContent("Sheet Reason codes · 5 rows");
  });

  it("lists a document's headings, and counts the paragraphs under them", () => {
    renderPane(
      outlineState({
        format: "docx",
        unitCount: 8,
        headings: [
          { anchor: "h:response-window", title: "Response window" },
          { anchor: "h:records", title: "Records" },
        ],
      }),
    );
    const list = screen.getByTestId("library-source-outline-list");
    expect(list).toHaveTextContent("Response window");
    expect(list).toHaveTextContent("Records");
    // Headings alone would describe a document of eight units as one of two.
    expect(list).toHaveTextContent("6 paragraphs");
  });

  it("says it cannot read the shape instead of printing zero parts", () => {
    renderPane(outlineState({ format: "pdf", unitCount: 0, unreadable: true }));
    expect(screen.getByTestId("library-source-outline-unreadable")).toHaveTextContent(
      "does not read the structure of this format",
    );
    expect(screen.queryByTestId("library-source-outline-list")).toBeNull();
    // The one number that must not appear anywhere in this section.
    expect(screen.getByTestId("library-source-outline")).not.toHaveTextContent("0");
  });

  it("says the file could not be read, rather than showing an empty shape", () => {
    renderPane(outlineState(null, "failed"));
    expect(screen.getByTestId("library-source-outline-failed")).toHaveTextContent(
      "could not be read",
    );
    expect(screen.queryByTestId("library-source-outline-list")).toBeNull();
  });

  it("is absent, not empty, when no read was wanted", () => {
    renderPane(null);
    expect(screen.queryByTestId("library-source-outline")).toBeNull();
    // And with no read, the pane's old sentence is still the true one.
    expect(screen.getByTestId("library-source-opened-state")).toHaveTextContent(
      "has never opened this file",
    );
  });

  it("stops claiming the file was never opened once it has read its shape", () => {
    renderPane(outlineState({ unitCount: 9, sheets: [{ sheet: "Quarterly", rows: 4 }] }));
    const sentence = screen.getByTestId("library-source-opened-state");
    expect(sentence).not.toHaveTextContent("has never opened this file");
    expect(sentence).toHaveTextContent("read this file once");
  });

  it("still says nothing about having read it while the read is in flight", () => {
    renderPane(outlineState(null, "reading"));
    expect(screen.getByTestId("library-source-opened-state")).toHaveTextContent(
      "has never opened this file",
    );
    expect(screen.getByTestId("library-source-outline")).toHaveTextContent(
      "Reading this file's structure",
    );
  });
});
