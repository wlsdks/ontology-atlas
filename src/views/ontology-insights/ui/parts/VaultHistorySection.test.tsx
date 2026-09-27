import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider, useTranslations } from "next-intl";
import { describe, expect, it } from "vitest";

import ko from "../../../../../messages/ko.json";
import type { VaultHistoryState } from "../../lib/use-vault-history";
import { VaultHistorySection } from "./VaultHistorySection";

/**
 * Four states and three draw no chart: the series is recomputed from Git and Atlas keeps no record, so each state
 * says whose limitation it is instead of drawing a flat line at zero.
 */

function Harness({ state }: { state: VaultHistoryState }) {
  const t = useTranslations("ontologyPages.insights");
  return <VaultHistorySection state={state} t={t} />;
}

/** The folder these tests describe, as it stands; every state carries it. */
const PRESENT = { concept: 71, writeUp: 0, module: 0, document: 11 };

const mount = (state: VaultHistoryState) =>
  render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <Harness state={state} />
    </NextIntlClientProvider>,
  );

/**
 * The series this repository's own folder produced, cross-checked against `git ls-tree` at each commit: a fall in
 * one layer beside a rise in another.
 */
const MEASURED = [
  { week: "2026-06-29", hash: "798a74a7", counts: { concept: 107, writeUp: 0, module: 0, document: 4 } },
  { week: "2026-07-13", hash: "33357ba7", counts: { concept: 102, writeUp: 0, module: 0, document: 6 } },
  { week: "2026-07-20", hash: "57cabd36", counts: { concept: 97, writeUp: 0, module: 0, document: 9 } },
  { week: "2026-07-27", hash: "9ad54554", counts: { concept: 71, writeUp: 0, module: 0, document: 11 } },
];

describe("VaultHistorySection — the states with no time axis", () => {
  // The folder needs no history to be counted, so the present is drawn in every state; only the tracks wait for Git.
  it.each(["unavailable", "none", "loading", "failed"] as const)(
    "draws the folder as it stands, even with no weeks to show (%s)",
    (status) => {
      mount({ status, present: PRESENT });
      expect(screen.getByTestId("vault-present-stack")).toBeInTheDocument();
      expect(screen.getByTestId("vault-present-tower-concept").textContent).toContain("71");
      // A layer at a true zero keeps its tower, so "none" never reads as "not measured".
      expect(screen.getByTestId("vault-present-tower-writeUp")).toBeInTheDocument();
      expect(screen.queryByTestId("vault-history-track-concept")).toBeNull();
    },
  );

  it("says the browser cannot reach the history, and does not call that empty", () => {
    mount({ status: "unavailable", present: PRESENT });
    const section = screen.getByTestId("vault-history");
    expect(section).toHaveAttribute("data-state", "unavailable");
    expect(section.textContent).toContain(
      ko.ontologyPages.insights.vaultHistory.unavailableTitle,
    );
    expect(screen.queryByTestId("vault-history-track-concept")).toBeNull();
  });

  // A folder with no commits has no series; zeroes would claim the folder was empty.
  it("says a folder with no commits has no history, rather than drawing zeroes", () => {
    mount({ status: "none", present: PRESENT });
    const section = screen.getByTestId("vault-history");
    expect(section).toHaveAttribute("data-state", "none");
    expect(section.textContent).toContain(ko.ontologyPages.insights.vaultHistory.noneTitle);
    expect(screen.queryByTestId("vault-history-track-concept")).toBeNull();
  });

  it("tells the two apart, because they are different limitations", () => {
    const { unmount } = mount({ status: "unavailable", present: PRESENT });
    const first = screen.getByTestId("vault-history").textContent;
    unmount();
    mount({ status: "none", present: PRESENT });
    expect(screen.getByTestId("vault-history").textContent).not.toBe(first);
  });

  it("says it is still reading rather than showing an empty chart while it waits", () => {
    mount({ status: "loading", present: PRESENT });
    expect(screen.getByTestId("vault-history")).toHaveAttribute("data-state", "loading");
    expect(screen.queryByTestId("vault-history-track-concept")).toBeNull();
  });
});

describe("VaultHistorySection — the chart", () => {
  const ready: VaultHistoryState = {
    status: "ready",
    present: PRESENT,
    weeks: MEASURED,
    peak: 107,
    rulesVersion: 1,
  };

  it("drops the present stack once the weeks can carry the same fact with a date", () => {
    mount(ready);
    expect(screen.queryByTestId("vault-present-stack")).toBeNull();
  });

  it("draws one track per layer, never a blended one", () => {
    mount(ready);
    for (const layer of ["concept", "module", "writeUp", "document"]) {
      expect(screen.getByTestId(`vault-history-track-${layer}`)).toBeInTheDocument();
    }
    // One track per layer; a further track would be a total.
    expect(document.querySelectorAll('[data-testid^="vault-history-track-"]')).toHaveLength(4);
  });

  it("ends each track on the count the folder holds now", () => {
    mount(ready);
    expect(screen.getByTestId("vault-history-track-concept").textContent).toContain("71");
    expect(screen.getByTestId("vault-history-track-document").textContent).toContain("11");
  });

  // The accessible name says in words that one layer fell while another rose, since the columns are `aria-hidden`.
  it("says the fall and the rise in words, not only in the marks", () => {
    mount(ready);
    const concept = screen.getByTestId("vault-history-track-concept");
    expect(concept.getAttribute("aria-label")).toContain("71");
    expect(concept.getAttribute("aria-label")).toContain("107");
    const document_ = screen.getByTestId("vault-history-track-document");
    expect(document_.getAttribute("aria-label")).toContain("11");
    expect(document_.getAttribute("aria-label")).toContain("4");
  });

  it("keeps a layer that is genuinely zero as a track rather than hiding it", () => {
    mount(ready);
    // A present track at zero reads as "measured, and none"; a missing one would read as "not measured".
    expect(screen.getByTestId("vault-history-track-writeUp")).toBeInTheDocument();
  });

  // The shared scale is the block, not the frame, so a track takes only the height its contents need.
  it("gives a track only as much height as its own contents need", () => {
    mount(ready);
    const heightOf = (layer: string) =>
      screen.getByTestId(`vault-history-track-${layer}`).querySelector("ol")?.style.height ?? "";
    expect(heightOf("writeUp")).toContain("0 *");
    expect(heightOf("concept")).not.toBe(heightOf("document"));
    expect(heightOf("concept")).not.toBe(heightOf("writeUp"));
  });

  it("states the scale, so a block is never mistaken for a file", () => {
    mount(ready);
    expect(screen.getByTestId("vault-history").textContent).toContain("블록 하나");
  });
});

describe("a failed read is not an empty folder", () => {
  // An error and an absence look different: a failed read must not claim the folder has no commits.
  it("says the read failed, and does not say the folder has no commits", () => {
    mount({ status: "failed", present: PRESENT });
    const section = screen.getByTestId("vault-history");
    expect(section).toHaveAttribute("data-state", "failed");
    expect(section.textContent).toContain(ko.ontologyPages.insights.vaultHistory.failedTitle);
    expect(section.textContent).not.toContain(ko.ontologyPages.insights.vaultHistory.noneTitle);
  });

  it("still draws the folder it can count without Git", () => {
    mount({ status: "failed", present: PRESENT });
    expect(screen.getByTestId("vault-present-tower-concept").textContent).toContain("71");
  });
});
