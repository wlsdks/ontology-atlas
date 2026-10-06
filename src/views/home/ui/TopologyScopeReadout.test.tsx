import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it } from "vitest";
import en from "../../../../messages/en.json";
import ko from "../../../../messages/ko.json";
import { TopologyScopeReadout } from "./TopologyScopeReadout";

describe("map scope readout", () => {
  const view = (total: number | null, members: number | null, synthetic = false, locale = "en") => (
    <NextIntlClientProvider locale={locale} messages={locale === "ko" ? ko : en}>
      <TopologyScopeReadout total={total} members={members} synthetic={synthetic} />
    </NextIntlClientProvider>
  );

  it("reports model membership and updates when the scope changes", () => {
    const { rerender } = render(view(125, 125));
    expect(screen.getByTestId("topology-scope-readout")).toHaveAttribute("data-scope-concepts", "125");
    rerender(view(125, 24));
    expect(screen.getByTestId("topology-scope-readout")).toHaveAttribute("data-scope-concepts", "24");
    expect(screen.getByTestId("topology-scope-readout")).toHaveAttribute("data-total-concepts", "125");
    rerender(view(125, 125));
    expect(screen.getByTestId("topology-scope-readout")).toHaveAttribute("data-scope-concepts", "125");
  });

  it.each([[null, null], [0, 0], [125, null], [125, 0], [125, 126]] as const)(
    "does not make a scope claim for total=%s and members=%s", (total, members) => {
      render(view(total, members));
      expect(screen.queryByTestId("topology-scope-readout")).not.toBeInTheDocument();
    },
  );

  it.each(["en", "ko"])("identifies a synthetic fixture in %s without changing its count", locale => {
    render(view(10000, 10000, true, locale));
    const line = screen.getByTestId("topology-scope-readout");
    expect(line).toHaveAttribute("data-synthetic", "true");
    expect(line).toHaveAttribute("data-total-concepts", "10000");
    expect(line.textContent).toContain("10,000");
    expect(line).toHaveClass("pointer-events-none");
  });
});
