import { fireEvent, render, screen } from "@testing-library/react";
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

describe("the Wiki setup example", () => {
  function renderPreview() {
    render(
      <NextIntlClientProvider locale="ko" messages={ko}>
        <LibraryTab detail={{ ...detail([]), availability: "no-data" }} nowMs={Date.parse("2026-09-21T00:00:00Z")} />
      </NextIntlClientProvider>,
    );
  }

  it("keeps the example distinct from the folder's empty state", () => {
    renderPreview();
    expect(screen.getByText("위키 분석을 시작해 보세요")).toBeInTheDocument();
    expect(screen.queryByText("이 판이 답하는 것")).not.toBeInTheDocument();
    expect(screen.getByText("예시 · 내 폴더의 데이터가 아니에요")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: "원문을 추가하는 방법" })).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole('button',{name:'원문을 추가하는 방법'})).toHaveAccessibleDescription(expect.stringContaining(ko.ontologyPages.insights.libraryTab.preview.sourceExcerpt));
  });

  it("reveals one stage's real prerequisite and uses the honest Library destination", () => {
    renderPreview();
    const source = screen.getByRole("button", { name: "원문을 추가하는 방법" });
    const page = screen.getByRole("button", { name: "위키 페이지를 만드는 방법" });

    fireEvent.click(source);
    expect(source).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText("자료실에 원문 파일을 추가하세요.")).toBeVisible();
    expect(screen.getByRole("link", { name: "자료실에서 시작하기" })).toHaveAttribute("href", "/library/");

    fireEvent.click(page);
    expect(source).toHaveAttribute("aria-expanded", "false");
    expect(page).toHaveAttribute("aria-expanded", "true");
    expect(screen.getByText(/추가한 원문으로 위키 페이지를 만들어 주세요/)).toBeVisible();

    fireEvent.click(page);
    expect(page).toHaveAttribute("aria-expanded", "false");
    expect(screen.getByRole("link", { name: "자료실에서 시작하기" })).toBeVisible();
    expect(screen.getAllByRole("link", { name: "자료실에서 시작하기" })).toHaveLength(1);
  });
});
