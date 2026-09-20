import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ko from "../../../../../messages/ko.json";
import { LibraryTab } from "./LibraryTab";
import type { InsightsBrief } from "../../lib/brief/use-insights-brief";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

type Detail = InsightsBrief["library"];

function detail(findings: Detail["findings"]): Detail {
  return {
    availability: "measured",
    pageCount: 12,
    sourceCount: 12,
    stalePages: [],
    unwrittenSources: [],
    findings,
    unmeasured: 0,
    passes: [],
  };
}

function finding(code: string): Detail["findings"][number] {
  return { code, advisory: false, count: 1, pages: [`wiki/${code}`] };
}

/**
 * **A cut list says it was cut.** The three sibling cards on this panel each carry a
 * `HiddenCountLine`; the check card sliced its findings to six and showed nothing, so a folder
 * with nine kinds of finding reported six and a reader had no sign the other three existed.
 */
describe("the check card's cut list", () => {
  function renderTab(codes: string[]) {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <LibraryTab detail={detail(codes.map(finding))} nowMs={Date.parse("2026-09-21T00:00:00Z")} />
      </NextIntlClientProvider>,
    );
  }

  it("says how many findings it did not draw", () => {
    renderTab(["a", "b", "c", "d", "e", "f", "g", "h", "i"]);
    const lines = screen.getAllByTestId("hidden-count-line");
    const check = lines.find((line) => line.dataset.hiddenCount === "3");
    expect(check).toBeDefined();
  });

  it("stays silent when every finding is on screen", () => {
    renderTab(["a", "b"]);
    expect(screen.queryAllByTestId("hidden-count-line")).toHaveLength(0);
  });
});
