import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import enMessages from "../../../../../messages/en.json";
import type { LibrarySourceRow } from "@/entities/docs-vault";
import type { SourceOutline } from "@/shared/lib/library/source-passage";
import type { SourceOutlineState } from "../../lib/sources/use-source-outline";
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

function renderPane(
  outline: SourceOutlineState | null,
  extra: {
    onOpenPassage?: (anchor: string) => void;
    compileNote?: string | null;
    compileBlocked?: boolean;
    agentDoor?: boolean;
  } = {},
) {
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
        onOpenPassage={extra.onOpenPassage}
        onOpenWiki={() => {}}
        onCompile={() => {}}
        compileNote={extra.compileNote ?? null}
        compileBlocked={extra.compileBlocked ?? false}
        agentDoor={extra.agentDoor ?? false}
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
    expect(list).not.toHaveTextContent("6 paragraphs");
    expect(screen.getByTestId("library-source-outline-count")).toHaveTextContent("6 paragraphs");
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
  it("prints no line count for a format it cannot outline, and says so instead", () => {
    renderPane(outlineState({ format: "text", unitCount: 18 }));
    expect(screen.getByTestId("library-source-outline-unreadable")).toHaveTextContent(
      "does not read the structure of this format",
    );
    expect(screen.queryByTestId("library-source-outline-list")).toBeNull();
    expect(screen.getByTestId("library-source-outline")).not.toHaveTextContent("18");
    // The marker follows the sentence, so a proof cannot read this pane as an outline.
    expect(screen.getByTestId("library-source-outline")).toHaveAttribute("data-state", "unreadable");
  });

  it("makes a heading row open the passage it already names", () => {
    const onOpenPassage = vi.fn();
    renderPane(
      outlineState({
        format: "docx",
        unitCount: 8,
        headings: [
          { anchor: "h:response-window", title: "Response window" },
          { anchor: "h:records", title: "Records" },
        ],
      }),
      { onOpenPassage },
    );

    const row = screen.getByTestId("library-source-outline-row-h:records");
    expect(row).toHaveAttribute("data-anchor", "h:records");
    fireEvent.click(row);
    expect(onOpenPassage).toHaveBeenCalledWith("h:records");

    // A counted row is not an address and stays text.
    expect(screen.queryByTestId("library-source-outline-row-6 paragraphs")).toBeNull();
  });

  it("stands the forward press above the two blocks whose height the document decides", () => {
    /* Order pinned: facts, then the action, then variable-length blocks, so the door stays in view. */
    renderPane(
      outlineState({
        format: "docx",
        unitCount: 8,
        headings: [{ anchor: "h:records", title: "Records" }],
      }),
      { compileNote: "No verified coding agent is connected.", compileBlocked: true, agentDoor: true },
    );
    const availability = screen.getByTestId("library-source-writeups");
    const outline = screen.getByTestId("library-source-outline");
    expect(availability.compareDocumentPosition(outline) & Node.DOCUMENT_POSITION_FOLLOWING).toBeTruthy();
    expect(screen.getByTestId("library-source-compile-blocked-door")).toBeTruthy();
  });

  it("does not set the reason for a refused press two grades under its button", () => {
    renderPane(outlineState({ unitCount: 0, unreadable: true }), {
      compileNote: "No verified coding agent is connected.",
      compileBlocked: true,
      agentDoor: true,
    });
    const reason = screen.getByTestId("library-transfer");
    expect(reason).toHaveClass("text-label");
    expect(reason).not.toHaveClass("text-caption");
  });
});
