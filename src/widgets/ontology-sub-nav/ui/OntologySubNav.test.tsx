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

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({
    insight: {
      nodes: [
        { id: "project:ontology-atlas", kind: "project" },
        { id: "domain:views", kind: "domain" },
        { id: "capability:tree", kind: "capability" },
      ],
      edges: [{ source: "project:ontology-atlas", target: "domain:views" }],
    },
  }),
}));

function renderSubNav() {
  return render(
    <NextIntlClientProvider locale="en" messages={enMessages}>
      <OntologySubNav />
    </NextIntlClientProvider>,
  );
}

describe("OntologySubNav", () => {
  it("keeps ontology surface links large enough for mobile touch", () => {
    renderSubNav();

    expect(screen.getByRole("link", { name: "Meaning map" }).className).toContain(
      "h-8",
    );
    expect(screen.getByRole("link", { name: "Save/edit" }).className).toContain(
      "h-8",
    );
    expect(screen.getByRole("link", { name: "Validate" }).className).toContain(
      "h-8",
    );
    expect(screen.getByText("2 source concepts")).toBeVisible();
  });
});
