import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { NextIntlClientProvider } from "next-intl";
import { describe, expect, it, vi } from "vitest";
import koMessages from "../../../../messages/ko.json";
import { getOntologyKindTone } from "@/entities/ontology-class";
import { ProjectOntologyOverview } from "./ProjectOntologyOverview";

vi.mock("@/i18n/navigation", () => ({
  Link: ({
    href,
    children,
    ...props
  }: {
    href: string;
    children: ReactNode;
  }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

vi.mock("@/features/vault-ontology", () => ({
  useOntologyInsight: () => ({
    insight: {
      nodes: [
        {
          id: "project:ontology-atlas",
          title: "project:ontology-atlas",
          kind: "project",
          projectIds: ["ontology-atlas"],
          evidenceIds: [],
          lastApprovedAt: new Date(0),
          lastApprovedBy: "test",
        },
        {
          id: "domain:views",
          title: "domain:views",
          kind: "domain",
          projectIds: ["ontology-atlas"],
          evidenceIds: [],
          lastApprovedAt: new Date(0),
          lastApprovedBy: "test",
        },
        {
          id: "capability:agent-graph-readiness",
          title: "capability:agent-graph-readiness",
          kind: "capability",
          projectIds: ["ontology-atlas"],
          evidenceIds: [],
          lastApprovedAt: new Date(0),
          lastApprovedBy: "test",
        },
        {
          id: "element:insights-query-cockpit",
          title: "element:insights-query-cockpit",
          kind: "element",
          projectIds: ["ontology-atlas"],
          evidenceIds: [],
          lastApprovedAt: new Date(0),
          lastApprovedBy: "test",
        },
      ],
    },
  }),
}));

function renderOverview() {
  render(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <ProjectOntologyOverview projectSlug="ontology-atlas" />
    </NextIntlClientProvider>,
  );
}

describe("ProjectOntologyOverview", () => {
  it("renders project ontology kinds with the shared categorical tone palette", () => {
    renderOverview();

    for (const kind of ["domain", "capability", "element"] as const) {
      const pill = document.querySelector(`[data-kind-tone="${kind}"]`);
      const tone = getOntologyKindTone(kind);

      expect(pill).toBeInTheDocument();
      expect(pill).toHaveStyle({
        backgroundColor: tone.chipBg,
        borderColor: tone.chipBorder,
        color: tone.chipText,
      });
    }
  });

  it("keeps kind labels visible next to the color swatches", () => {
    renderOverview();

    expect(screen.getByText("도메인 1")).toBeInTheDocument();
    expect(screen.getByText("역량 1")).toBeInTheDocument();
    expect(screen.getByText("요소 1")).toBeInTheDocument();
  });
});
