import { createRef } from "react";
import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";

import koMessages from "../../../../messages/ko.json";
import { DocReadingPane } from "./DocReadingPane";

/**
 * The scroll-end reserve owed to the back-to-top pill; the pixel proof is
 * `tests/e2e/scroll-end-gap.spec.ts`, and this covers the check-results page e2e cannot open.
 */
function renderPane(withBackToTop: boolean) {
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <DocReadingPane
        scrollRef={createRef<HTMLDivElement>()}
        outline={null}
        backToTop={withBackToTop ? { visible: true, scrollToTop: vi.fn() } : null}
      >
        <p>Body</p>
      </DocReadingPane>
    </NextIntlClientProvider>,
  );
}

function scrollContainer(): HTMLElement {
  const pane = screen.getByTestId("doc-reading-pane");
  const scroller = pane.querySelector<HTMLElement>(".overflow-auto");
  if (!scroller) throw new Error("스크롤 컨테이너를 못 찾았다 — 이 파일의 아래 단언은 전부 무의미하다");
  return scroller;
}

describe("DocReadingPane bottom reserve", () => {
  it("reserves the back-to-top clearance when the pill is drawn", () => {
    renderPane(true);
    expect(scrollContainer().className).toContain(
      "pb-[var(--doc-reading-back-to-top-clearance)]",
    );
  });

  it("drops the back-to-top clearance when there is no pill — the Docs editor", () => {
    renderPane(false);
    expect(scrollContainer().className).not.toContain("--doc-reading-back-to-top-clearance");
  });
});
