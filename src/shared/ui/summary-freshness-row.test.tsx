/**
 * The row's job is to say a domain owes a judgement **without** reading as an alarm.
 *
 * The underlying signal is `severity: info` — nothing is broken and nothing is blocked.
 * A row that drifts toward warning colour, or that grows a "fix it" affordance, would
 * misreport what the vault actually knows and would teach people to dismiss the mark. So
 * these tests pin the absence of an error channel and of any action, not just the text.
 */

import { render, screen } from "@testing-library/react";
import { describe, expect, it } from "vitest";

import { SummaryFreshnessRow } from "./summary-freshness-row";

const LABELS = {
  prefixLabel: "Description is behind what this holds",
  lagLabel: "21d",
  actionLabel: "re-judge",
};

describe("SummaryFreshnessRow", () => {
  it("states what is behind, by how much, and what is owed", () => {
    render(<SummaryFreshnessRow {...LABELS} />);
    const row = screen.getByTestId("summary-freshness-row");
    expect(row.textContent).toContain("Description is behind what this holds");
    expect(row.textContent).toContain("21d");
    expect(row.textContent).toContain("re-judge");
  });

  it("carries no alert semantics, because nothing here is an error", () => {
    render(<SummaryFreshnessRow {...LABELS} />);
    expect(screen.queryByRole("alert")).toBeNull();
    expect(screen.queryByRole("status")).toBeNull();
  });

  it("offers no control, because the fix is a person's judgement", () => {
    render(<SummaryFreshnessRow {...LABELS} />);
    expect(screen.queryByRole("button")).toBeNull();
    expect(screen.queryByRole("link")).toBeNull();
  });

  it("uses the tertiary ink of a plain fact rather than a signal tone", () => {
    render(<SummaryFreshnessRow {...LABELS} />);
    const className = screen.getByTestId("summary-freshness-row").className;
    expect(className).toContain("--color-text-tertiary");
    // Warning/error/success families would each announce a state change this row is not
    // reporting. Named here so a later "make it stand out" edit fails loudly.
    expect(className).not.toMatch(/warning|error|danger|success|amber|red|emerald/i);
  });

  it("keeps the lag on tabular numerals so stacked rows align", () => {
    render(<SummaryFreshnessRow {...LABELS} />);
    const lag = screen.getByText("21d");
    expect(lag.className).toContain("tabular-nums");
  });
});
