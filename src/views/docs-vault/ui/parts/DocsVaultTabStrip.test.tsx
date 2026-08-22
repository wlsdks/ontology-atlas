import { fireEvent, render } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { useState } from "react";
import { beforeAll, describe, expect, it, vi } from "vitest";
import koMessages from "../../../../../messages/ko.json";
import type { useTranslations } from "next-intl";
import { DocsVaultTabStrip } from "./DocsVaultTabStrip";
import type { DocTab } from "../../lib/doc-tabs";

// jsdom has no ResizeObserver — a minimal stub.
beforeAll(() => {
  if (!(globalThis as { ResizeObserver?: unknown }).ResizeObserver) {
    class ResizeObserverStub {
      observe() {}
      unobserve() {}
      disconnect() {}
    }
    (globalThis as { ResizeObserver?: unknown }).ResizeObserver = ResizeObserverStub;
  }
});

function makeTabs(n: number): DocTab[] {
  return Array.from({ length: n }, (_, i) => ({
    slug: `doc-${i}`,
    title: `문서 ${i}`,
    lastActivatedAt: i,
  }));
}

function renderStrip(tabs: DocTab[], activeSlug: string) {
  const t = ((key: string, values?: Record<string, unknown>) => {
    if (key === "tabs.closeAria") return `${values?.title} 닫기`;
    if (key === "tabs.stripAriaLabel") return "열린 문서";
    return key;
  }) as unknown as ReturnType<typeof useTranslations<"docsVault">>;
  return render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <DocsVaultTabStrip
        tabs={tabs}
        activeSlug={activeSlug}
        onActivate={vi.fn()}
        onClose={vi.fn()}
        t={t}
      />
    </NextIntlClientProvider>,
  );
}

// Sets the nav's scroll metrics — jsdom reports all zeros, so they are mocked directly.
function mockScrollMetrics(
  nav: HTMLElement,
  { scrollLeft, clientWidth, scrollWidth }: { scrollLeft: number; clientWidth: number; scrollWidth: number },
) {
  Object.defineProperty(nav, "clientWidth", { configurable: true, value: clientWidth });
  Object.defineProperty(nav, "scrollWidth", { configurable: true, value: scrollWidth });
  Object.defineProperty(nav, "scrollLeft", { configurable: true, writable: true, value: scrollLeft });
}

describe("DocsVaultTabStrip — 오버플로 엣지 페이드 신호", () => {
  it("탭이 안 넘치면 페이드 마스크가 없다", () => {
    const { container } = renderStrip(makeTabs(2), "doc-0");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 0, clientWidth: 800, scrollWidth: 300 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBeNull();
  });

  it("오른쪽에 숨은 탭이 있으면 오른쪽 페이드만 켠다", () => {
    const { container } = renderStrip(makeTabs(20), "doc-0");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 0, clientWidth: 300, scrollWidth: 2000 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBe("right");
    expect(nav.style.maskImage).toContain("transparent 100%");
  });

  it("가운데로 스크롤하면 양쪽 페이드를 켠다", () => {
    const { container } = renderStrip(makeTabs(20), "doc-10");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 500, clientWidth: 300, scrollWidth: 2000 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBe("both");
  });

  it("끝까지 스크롤하면 왼쪽 페이드만 켠다", () => {
    const { container } = renderStrip(makeTabs(20), "doc-19");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 1700, clientWidth: 300, scrollWidth: 2000 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBe("left");
  });
});

describe("DocsVaultTabStrip — 키보드 닫기 포커스", () => {
  it("활성 탭의 닫기 버튼이 사라지면 새 활성 이웃 탭으로 포커스를 넘긴다", () => {
    const t = ((key: string, values?: Record<string, unknown>) => {
      if (key === "tabs.closeAria") return `${values?.title} 닫기`;
      if (key === "tabs.stripAriaLabel") return "열린 문서";
      return key;
    }) as unknown as ReturnType<typeof useTranslations<"docsVault">>;

    function Harness() {
      const [tabs, setTabs] = useState(makeTabs(3));
      const [activeSlug, setActiveSlug] = useState("doc-2");
      return (
        <NextIntlClientProvider locale="ko" messages={koMessages}>
          <DocsVaultTabStrip
            tabs={tabs}
            activeSlug={activeSlug}
            onActivate={setActiveSlug}
            onClose={(slug) => {
              setTabs((current) => current.filter((tab) => tab.slug !== slug));
              if (slug === activeSlug) setActiveSlug("doc-1");
            }}
            t={t}
          />
        </NextIntlClientProvider>
      );
    }

    const { getByRole } = render(<Harness />);
    const closeButton = getByRole("button", { name: "문서 2 닫기" });
    closeButton.focus();

    fireEvent.click(closeButton, { detail: 0 });

    expect(getByRole("button", { name: "문서 1" })).toHaveFocus();
  });
});
