import { describe, expect, it } from "vitest";
import { render, screen } from "@testing-library/react";
import { SigmaNodeTooltip, type SigmaNodeTooltipData } from "./SigmaNodeTooltip";

function data(overrides: Partial<SigmaNodeTooltipData> = {}): SigmaNodeTooltipData {
  return {
    name: "MCP Server",
    domain: "",
    isHub: false,
    x: 10,
    y: 10,
    ...overrides,
  };
}

const labelProps = {
  hubLabel: "Hub",
  degreeTitle: "Total connections",
  degreeLabel: "8 links",
};

describe("SigmaNodeTooltip", () => {
  it("renders the node name", () => {
    render(<SigmaNodeTooltip data={data()} {...labelProps} />);
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
  });

  it("shows the kind label for ontology nodes (kind 분류 노출)", () => {
    render(
      <SigmaNodeTooltip
        data={data({ kind: "capability" })}
        {...labelProps}
        kindLabel="Capability"
      />,
    );
    expect(screen.getByText("Capability")).toBeInTheDocument();
  });

  it("does not render a garbage domain when domain is empty (ontology 노드)", () => {
    // 회귀 가드: ontology slug 는 extractDomainLabel 이 'capabilities/mcp' 같은
    // 조각을 만들었다 — 호출자가 domain='' 로 비우고 kind 로 대체한다.
    render(
      <SigmaNodeTooltip
        data={data({ domain: "", kind: "element" })}
        {...labelProps}
        kindLabel="Element"
      />,
    );
    expect(screen.queryByText(/capabilities\/|elements\//)).toBeNull();
    expect(screen.getByText("Element")).toBeInTheDocument();
  });

  it("shows the domain for project nodes (kindLabel 없음)", () => {
    render(<SigmaNodeTooltip data={data({ domain: "Source Vault" })} {...labelProps} />);
    expect(screen.getByText("Source Vault")).toBeInTheDocument();
  });
});
