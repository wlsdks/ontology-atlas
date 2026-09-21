import { fireEvent, render, screen } from "@testing-library/react";
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
type Unavailable = Exclude<Detail["availability"], "measured">;
type Measured = Extract<Detail, { availability: "measured" }>;
const GUIDES_HREF = "/architecture/?view=guides";

function detail(availability: Unavailable): Detail {
  return {
    availability,
    areas: [],
    drift: [],
    guideFiles: 0,
    checks: 0,
    everywhere: { told: 0, gated: 0, watched: 0 },
    evidence: null,
  };
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
      expect(hrefs(), "the panel cannot reach the screen it describes").toContain(GUIDES_HREF);
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
    expect(hrefs().indexOf(GUIDES_HREF)).toBeLessThan(hrefs().indexOf("/download/"));
  });

  it("never offers the app to a folder that simply has no repository bound", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <HarnessTab detail={detail("no-source")} />
      </NextIntlClientProvider>,
    );
    expect(hrefs(), "saying 'get the app' inside the app is the defect that sent this panel back").not.toContain("/download/");
  });

  it("keeps the example distinct and reveals one role's setup without changing destinations", () => {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <HarnessTab detail={detail("no-source")} />
      </NextIntlClientProvider>,
    );
    expect(screen.getByText("예시 · 내 폴더의 데이터가 아니에요")).toBeInTheDocument();
    expect(screen.getByText("코드 저장소를 확인해 주세요")).toBeInTheDocument();

    const instructions = screen.getByRole("button", { name: "작업 지침을 추가하는 방법" });
    const gates = screen.getByRole("button", { name: "차단 규칙을 연결하는 방법" });
    fireEvent.click(instructions);
    expect(instructions).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/AGENTS.md나 규칙 문서에 작업 지침을 적어 주세요/)).toBeVisible();

    fireEvent.click(gates);
    expect(instructions).toHaveAttribute("aria-expanded", "false");
    expect(gates).toHaveAttribute("aria-expanded", "true");
    expect(screen.getAllByRole("link", { name: "하네스에서 지침 보기" }).every((link) => link.getAttribute("href") === GUIDES_HREF)).toBe(true);

    fireEvent.click(gates);
    expect(gates).toHaveAttribute("aria-expanded", "false");
  });
});

it("hands measured evidence to the domain-role overview", () => {
  const measured: Measured = {
    availability: "measured",
    areas: [{ slug: "domains/guidance", title: "Guidance", told: 0, gated: 0, watched: 0 }],
    everywhere: { told: 0, gated: 0, watched: 0 },
    drift: [],
    guideFiles: 1,
    checks: 0,
    evidence: {
      areas: [{
        slug: "domains/guidance",
        title: "Guidance",
        purpose: "지침 범위를 설명해요.",
        capabilities: [],
        discoveredTests: 0,
        roles: {
          told: { column: "told", declarations: [] },
          gated: { column: "gated", declarations: [] },
          watched: { column: "watched", declarations: [] },
        },
      }],
      everywhere: { told: [], gated: [], watched: [] },
      outsideAreas: [],
      unreachedCapabilities: [],
    },
  };
  render(
    <NextIntlClientProvider locale="ko" messages={ko}>
      <HarnessTab detail={measured} />
    </NextIntlClientProvider>,
  );
  expect(screen.getByTestId("harness-coverage-overview")).toBeInTheDocument();
  expect(screen.queryByTestId("harness-coverage-table")).toBeNull();
});
