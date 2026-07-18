import { render } from "@testing-library/react";
import { describe, expect, it } from "vitest";
import { MiniDomainMap } from "./MiniDomainMap";

describe("MiniDomainMap", () => {
  it("renders one rect + one edge line per domain, plus the center project hexagon", () => {
    const { container } = render(
      <MiniDomainMap
        projectTitle="ontology-atlas"
        ariaLabel="mini domain map"
        domains={[
          { id: "domain:a", title: "A", total: 10 },
          { id: "domain:b", title: "B", total: 20 },
        ]}
      />,
    );

    expect(container.querySelectorAll("rect")).toHaveLength(2);
    expect(container.querySelectorAll("line")).toHaveLength(2);
    expect(container.querySelectorAll("polygon")).toHaveLength(1);
    expect(container.querySelector("svg")).toHaveAttribute("aria-label", "mini domain map");
  });

  it("renders just the aria-labelled svg (no rects) when there are no domains", () => {
    const { container } = render(
      <MiniDomainMap projectTitle="ontology-atlas" ariaLabel="mini domain map" domains={[]} />,
    );

    expect(container.querySelectorAll("rect")).toHaveLength(0);
    expect(container.querySelectorAll("polygon")).toHaveLength(1);
  });
});
