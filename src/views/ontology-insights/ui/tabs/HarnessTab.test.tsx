import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import ko from "../../../../../messages/ko.json";
import { HarnessTab } from "./HarnessTab";
import type { InsightsBrief } from "../../lib/brief/use-insights-brief";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

type Detail = InsightsBrief["harnessDetail"];

function detail(availability: Detail["availability"]): Detail {
  return {
    availability,
    areas: [],
    drift: [],
    guideFiles: 0,
    checks: 0,
    everywhere: { told: 0, gated: 0, watched: 0 },
  } as Detail;
}

function hrefs(): string[] {
  return [...screen.getByTestId("harness-tab").querySelectorAll("a")].map(
    (link) => link.getAttribute("href") ?? "",
  );
}

/**
 * **A panel that cannot count still has somewhere to send you.**
 *
 * In a browser this offered the app and nothing else, so a reader who wanted to know what guidance
 * coverage even is had one door and it left the product (walkthrough, 2026-09-20). The Harness
 * screen renders its approved structure, roles and rules in a browser perfectly well; only the
 * counts need the app.
 */
describe("the guidance panel's unmeasured states", () => {
  for (const availability of ["app-only", "no-source", "reading", "unreadable"] as const) {
    it(`reaches the screen it describes when the state is ${availability}`, () => {
      render(
        <NextIntlClientProvider locale="ko" messages={ko}>
          <HarnessTab detail={detail(availability)} />
        </NextIntlClientProvider>,
      );
      expect(hrefs(), "the panel cannot reach the screen it describes").toContain("/architecture/");
    });
  }

  it("offers the app only where the app is what is missing", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <HarnessTab detail={detail("app-only")} />
      </NextIntlClientProvider>,
    );
    expect(hrefs()).toContain("/download/");
    // The door that works right now is the first one a reader meets.
    expect(hrefs().indexOf("/architecture/")).toBeLessThan(hrefs().indexOf("/download/"));
  });

  it("never offers the app to a folder that simply has no repository bound", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <HarnessTab detail={detail("no-source")} />
      </NextIntlClientProvider>,
    );
    expect(hrefs(), "saying 'get the app' inside the app is the defect that sent this panel back").not.toContain("/download/");
  });
});
