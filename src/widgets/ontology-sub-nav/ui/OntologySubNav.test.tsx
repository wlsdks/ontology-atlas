import { render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import enMessages from "../../../../messages/en.json";
import { OntologySubNav } from "./OntologySubNav";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
  usePathname: () => "/ontology",
}));

function renderSubNav() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <OntologySubNav />
    </NextIntlClientProvider>,
  );
}

describe("OntologySubNav", () => {
  it("keeps ontology surface links large enough for mobile touch without repeating graph counts", () => {
    renderSubNav();

    expect(screen.getByRole("link", { name: "Concept map" }).className).toContain(
      "h-8",
    );
    expect(screen.getByRole("link", { name: "Edit relations" }).className).toContain(
      "h-8",
    );
    expect(screen.getByRole("link", { name: "Verify graph" }).className).toContain(
      "h-8",
    );
    expect(screen.queryByText("2 source concepts")).not.toBeInTheDocument();
    expect(screen.queryByText("1 relation")).not.toBeInTheDocument();
  });
});
