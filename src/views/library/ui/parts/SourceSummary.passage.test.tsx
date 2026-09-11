import { act, render, screen } from "@testing-library/react";
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

  /**
   * **Atlas's own sentence may not wear the voice of the file's words** (guardian
   * decision, 2026-09-11 council).
   *
   * Measured on the built export, the unresolved sentence was byte-identical to the
   * verbatim quote — 14px · 23.8px · rgb(247,248,248) · 500.391px — which is the pair
   * this section reserves for text it read out of the file. The other seat's remedy,
   * `text-label` with secondary ink, is byte-identical to the facts `dd` (11px · 16px ·
   * rgb(208,214,224)), so it hides the answer to the press among the metadata. The
   * decided value collides with neither, and the assertion is that relationship rather
   * than a class string: what may never drift is that Atlas's sentence and the file's
   * words differ in type, leading and ink at once.
   */
  it("keeps the unresolved sentence out of both the quote's voice and the facts' voice", () => {
    const quote = renderPane(
      passageState({
        state: "resolved",
        cited: [{ anchor: "l14", kind: "line", text: "A weekend or public holiday does not count" }],
      }),
    );
    const citedClasses = new Set(screen.getByTestId("library-source-passage-cited").className.split(/\s+/));
    quote.unmount();

    renderPane(passageState({ state: "unresolved", anchor: "l28" }));
    const missing = screen.getByTestId("library-source-passage-missing");
    const missingClasses = new Set(missing.className.split(/\s+/));

    // Not the quote's step, not the quote's leading, not a quotation's card.
    expect(citedClasses.has("text-body-lg")).toBe(true);
    expect(missingClasses.has("text-body-lg")).toBe(false);
    expect(missingClasses.has("leading-prose")).toBe(false);
    // Not the facts' step or ink either: the answer to the press is the pane's winner.
    expect(missingClasses.has("text-label")).toBe(false);
    expect(missingClasses.has("text-body")).toBe(true);
    expect(missingClasses.has("leading-body")).toBe(true);
    expect(missingClasses.has("text-[color:var(--color-text-primary)]")).toBe(true);
    /*
     * Ink is shared with the quote on purpose — primary is what makes this the answer to
     * the press rather than another metadata row — so the separation is carried by the
     * type pair and by the card the quote sits in and this sentence does not. Neither
     * ramp step may be the quote's.
     */
    const rampOf = (classes: Set<string>) =>
      [...classes].filter((one) => /^(text-(caption|label|body|body-lg|title)|leading-)/.test(one)).sort();
    expect(rampOf(citedClasses)).toEqual(["leading-prose", "text-body-lg"]);
    expect(rampOf(missingClasses)).toEqual(["leading-body", "text-body"]);
    expect(rampOf(missingClasses).some((one) => citedClasses.has(one))).toBe(false);
    // And no card: a card here would read as a quotation, and there is nothing to quote.
    expect(missing.parentElement?.className ?? "").not.toContain("rounded-card");
  });

  /**
   * **The address Atlas prints is not an address Atlas chose.** `keep-all` on its own
   * left a 40-syllable unspaced Korean slug with no break opportunity: `scrollWidth 387`
   * against `clientWidth 342` at 390 and `272` at 320, which made the reading pane
   * scroll sideways (design-responsive, 2026-09-11). Every sentence here that
   * interpolates a string from the file or the reader carries the same pair
   * `PassageLine` does.
   */
  it("gives every interpolated address a break of last resort", () => {
    const cases: Array<[string, CitedPassageState]> = [
      ["library-source-passage-missing", passageState({ state: "unresolved", anchor: "l28" })],
      [
        "library-source-passage-ambiguous",
        passageState({ state: "unresolved", anchor: "h:scope", candidates: ["h:scope-1", "h:scope-3"] }),
      ],
      [
        "library-source-passage-no-text",
        passageState({ state: "no-text", anchor: "p2", format: "pdf", label: { kind: "page", number: 2 } }),
      ],
      [
        "library-source-passage-unreadable",
        { path: ROW.path, anchor: "l14", phase: "failed", passage: null, error: "EPERM", hash: null },
      ],
    ];
    for (const [testId, state] of cases) {
      const view = renderPane(state);
      const classes = screen.getByTestId(testId).className;
      expect(classes, testId).toContain("[word-break:keep-all]");
      expect(classes, testId).toContain("[overflow-wrap:break-word]");
      view.unmount();
    }
  });

  /**
   * **The landing waits for the answer, and is an event when it arrives.**
   *
   * Keyed on the citation alone the effect ran while the phase was still `reading`,
   * against a one-line placeholder with nothing to scroll: 0 of 26/79/362/490/589
   * available pixels travelled at five widths. Focus also sat on the section's 35×14px
   * caption heading, and a second citation into an open pane refocused the same node,
   * which fires no `focusin` at all. So: nothing is focused while reading; the section
   * itself receives focus once the read settles; and a different citation is a different
   * node, which is what makes the change audible.
   */
  it("lands on the section only once there is a passage to land on", () => {
    const reading: CitedPassageState = {
      path: ROW.path,
      anchor: "l14",
      phase: "reading",
      passage: null,
      error: null,
      hash: null,
    };
    const view = renderPane(reading);
    const section = screen.getByTestId("library-source-passage");
    expect(section.getAttribute("data-state")).toBe("reading");
    expect(section.tabIndex).toBe(-1);
    expect(section.getAttribute("aria-labelledby")).toBe("library-source-passage-heading");
    // Nothing to read yet, so nothing takes focus.
    expect(document.activeElement).not.toBe(section);

    act(() => {
      view.rerender(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <Harness
            passage={passageState({
              state: "resolved",
              cited: [{ anchor: "l14", kind: "line", text: "A weekend or public holiday does not count" }],
            })}
          />
        </NextIntlClientProvider>,
      );
    });
    const settled = screen.getByTestId("library-source-passage");
    expect(settled.getAttribute("data-state")).toBe("resolved");
    expect(document.activeElement).toBe(settled);
    // The heading names the region rather than being the thing focused.
    expect(document.getElementById("library-source-passage-heading")).not.toBe(document.activeElement);

    // A second citation is a new node, so assistive tech gets an event rather than silence.
    const first = settled;
    act(() => {
      view.rerender(
        <NextIntlClientProvider locale="en" messages={enMessages}>
          <Harness
            passage={passageState({
              state: "resolved",
              anchor: "l6",
              cited: [{ anchor: "l6", kind: "line", text: "Settlement runs on business days." }],
            })}
          />
        </NextIntlClientProvider>,
      );
    });
    const second = screen.getByTestId("library-source-passage");
    expect(second).not.toBe(first);
    expect(document.activeElement).toBe(second);
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
