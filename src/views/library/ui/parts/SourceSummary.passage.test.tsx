import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

import enMessages from "../../../../../messages/en.json";
import type { LibrarySourceRow } from "@/entities/docs-vault";
import type { CitedPassage } from "@/shared/lib/source-passage";
import type { CitedPassageState } from "../../lib/use-cited-passage";
import { SourceSummary } from "./SourceSummary";

/**
 * **The four answers a pressed citation may get, and the one that must never appear.**
 *
 * The whole value of this section is that a person can believe what it shows. The failure
 * that would destroy that is not an empty pane — it is a *passage shown for an address the
 * file no longer holds*, which reads as evidence and is not. `citedPassage` refuses to
 * guess (its own contract is pinned in `tests/contract/source-passage-parity.contract.test.ts`),
 * so what is left to pin here is the rendering: that the unresolved and text-less states
 * carry their sentence and **no** source text, and that the pane stops claiming the file
 * was never opened the moment it has been.
 */

const ROW: LibrarySourceRow = {
  path: "sources/settlement-policy.md",
  name: "settlement-policy.md",
  format: "md",
  bytes: 985,
  mtime: 1_727_000_000_000,
  state: "compiled",
} as unknown as LibrarySourceRow;

function passageState(passage: Partial<CitedPassage> & Pick<CitedPassage, "state">): CitedPassageState {
  return {
    path: ROW.path,
    anchor: passage.anchor ?? "l14",
    phase: "ready",
    error: null,
    hash: "60dba891e88d9c54fd05506ba05889f6a66c87cc68135dfeb0db92eaa9c423dc",
    passage: {
      path: ROW.path,
      anchor: passage.anchor ?? "l14",
      format: "text",
      cited: [],
      before: [],
      after: [],
      label: { kind: "line", number: 14 },
      unitCount: 18,
      candidates: [],
      ...passage,
    },
  };
}

function Harness({ passage }: { passage: CitedPassageState | null }) {
  const t = useTranslations("library");
  return (
    <SourceSummary
      row={ROW}
      hash={null}
      passage={passage}
      canReveal={false}
      writeUps={[]}
      onOpen={() => {}}
      onOpenWiki={() => {}}
      onCompile={() => {}}
      compileNote={null}
      compileBlocked={false}
      busy={false}
      t={t}
    />
  );
}

function renderPane(passage: CitedPassageState | null) {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <Harness passage={passage} />
    </NextIntlClientProvider>,
  );
}

describe("the passage a pressed citation shows", () => {
  it("says nothing about a read when nobody pressed a citation", () => {
    renderPane(null);
    expect(screen.queryByTestId("library-source-passage")).toBeNull();
    expect(screen.getByTestId("library-source-opened-state").textContent).toBe(
      enMessages.library.source.neverOpened,
    );
  });

  it("renders the cited unit, its context, and the address the page spells", () => {
    renderPane(
      passageState({
        state: "resolved",
        cited: [{ anchor: "l14", kind: "line", text: "A weekend or public holiday does not count" }],
        before: [{ anchor: "l11", kind: "line", text: "Card payments settle on T+2 business days." }],
        after: [{ anchor: "l15", kind: "line", text: "would land on a holiday moves to the next" }],
      }),
    );
    const section = screen.getByTestId("library-source-passage");
    expect(section.getAttribute("data-state")).toBe("resolved");
    expect(screen.getByTestId("library-source-citation").textContent).toBe("#l14 · line 14");
    expect(screen.getByTestId("library-source-passage-cited").textContent).toBe(
      "A weekend or public holiday does not count",
    );
    expect(
      screen.getAllByTestId("library-source-passage-context").map((node) => node.textContent),
    ).toEqual([
      "Card payments settle on T+2 business days.",
      "would land on a holiday moves to the next",
    ]);
    // The file has been opened, so the pane may not keep saying it never was.
    expect(screen.getByTestId("library-source-opened-state").textContent).toBe(
      enMessages.library.source.openedForCitation,
    );
    // And the hash row stops reading "not measured" once these bytes were hashed.
    expect(screen.getByTestId("library-source-summary").textContent).toContain("measured just now");
  });

  it("names every unit of a heading section, because the anchor names the section", () => {
    renderPane(
      passageState({
        state: "resolved",
        anchor: "h:records",
        label: { kind: "heading", title: "Records" },
        cited: [
          { anchor: "h:records", kind: "heading", heading: "Records", text: "Records" },
          { anchor: "h:records", kind: "paragraph", heading: "Records", text: "Held for five years." },
        ],
      }),
    );
    expect(screen.getByTestId("library-source-citation").textContent).toBe(
      "#h:records · heading: Records",
    );
    expect(
      screen.getAllByTestId("library-source-passage-cited").map((node) => node.textContent),
    ).toEqual(["Records", "Held for five years."]);
  });

  it("shows no text at all for an address the file no longer holds", () => {
    renderPane(passageState({ state: "unresolved", anchor: "l28", label: { kind: "line", number: 28 } }));
    expect(screen.getByTestId("library-source-passage").getAttribute("data-state")).toBe("unresolved");
    expect(screen.getByTestId("library-source-passage-missing").textContent).toContain("l28");
    // The one assertion this file exists for.
    expect(screen.queryByTestId("library-source-passage-cited")).toBeNull();
    expect(screen.queryByTestId("library-source-passage-context")).toBeNull();
    // The address alone; no label, because the reader never found the place to name.
    expect(screen.getByTestId("library-source-citation").textContent).toBe("#l28");
  });

  it("names the extractor's own alternatives for a heading it reported twice, and still shows no text", () => {
    renderPane(
      passageState({
        state: "unresolved",
        anchor: "h:scope",
        candidates: ["h:scope-1", "h:scope-3"],
        note: "Ambiguous legacy DOCX heading addresses: h:scope (2 occurrences).",
      }),
    );
    const ambiguous = screen.getByTestId("library-source-passage-ambiguous").textContent ?? "";
    expect(ambiguous).toContain("#h:scope-1");
    expect(ambiguous).toContain("#h:scope-3");
    expect(screen.queryByTestId("library-source-passage-cited")).toBeNull();
  });

  it("sends a PDF to the file itself instead of guessing its text", () => {
    renderPane(
      passageState({
        state: "no-text",
        anchor: "p2",
        format: "pdf",
        label: { kind: "page", number: 2 },
      }),
    );
    expect(screen.getByTestId("library-source-passage").getAttribute("data-state")).toBe("no-text");
    expect(screen.getByTestId("library-source-passage-no-text").textContent).toContain("page 2");
    expect(screen.queryByTestId("library-source-passage-cited")).toBeNull();
  });

  it("says the file could not be read rather than showing an empty passage", () => {
    renderPane({
      path: ROW.path,
      anchor: "l14",
      phase: "failed",
      passage: null,
      error: "zip entry word/document.xml failed its CRC-32 check",
      hash: null,
    });
    expect(screen.getByTestId("library-source-passage").getAttribute("data-state")).toBe("failed");
    expect(screen.getByTestId("library-source-passage-unreadable").textContent).toContain("CRC-32");
    expect(screen.queryByTestId("library-source-passage-cited")).toBeNull();
  });
});
