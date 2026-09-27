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

describe("DocsVaultTabStrip overflow edge fades", () => {
  it("shows no fade without overflow", () => {
    const { container } = renderStrip(makeTabs(2), "doc-0");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 0, clientWidth: 800, scrollWidth: 300 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBeNull();
  });

  it("shows only the right fade when tabs hide on the right", () => {
    const { container } = renderStrip(makeTabs(20), "doc-0");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 0, clientWidth: 300, scrollWidth: 2000 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBe("right");
    expect(nav.style.maskImage).toContain("transparent 100%");
  });

  it("shows both fades when scrolled to the middle", () => {
    const { container } = renderStrip(makeTabs(20), "doc-10");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 500, clientWidth: 300, scrollWidth: 2000 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBe("both");
  });

  it("shows only the left fade when scrolled to the end", () => {
    const { container } = renderStrip(makeTabs(20), "doc-19");
    const nav = container.querySelector("nav")!;
    mockScrollMetrics(nav, { scrollLeft: 1700, clientWidth: 300, scrollWidth: 2000 });
    fireEvent.scroll(nav);
    expect(nav.getAttribute("data-edge-overflow")).toBe("left");
  });
});

describe("DocsVaultTabStrip keyboard close focus", () => {
  it("moves focus to the new active neighbour when the active tab closes", () => {
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
