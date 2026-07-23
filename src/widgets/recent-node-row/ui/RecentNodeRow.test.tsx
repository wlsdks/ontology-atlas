import { render, screen } from "@testing-library/react";
import type { ReactNode } from "react";
import { describe, expect, it, vi } from "vitest";
import { RecentNodeRow } from "./RecentNodeRow";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: { href: string; children: ReactNode }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

describe("RecentNodeRow", () => {
  it("stacks title over subtitle and shows trailing metadata", () => {
    render(
      <RecentNodeRow
        kind="capability"
        title="MCP Server"
        subtitle="Capability · Views"
        trailing="2d ago"
        testId="row"
      />,
    );
    const row = screen.getByTestId("row");
    expect(row.tagName).toBe("DIV");
    expect(screen.getByText("MCP Server")).toBeInTheDocument();
    expect(screen.getByText("Capability · Views")).toBeInTheDocument();
    expect(screen.getByText("2d ago")).toBeInTheDocument();
  });

  it("renders as a link when href is provided", () => {
    render(
      <RecentNodeRow
        kind="element"
        title="CLI"
        subtitle="Element"
        trailing="Today"
        href="/ontology/?node=element%3Acli"
        ariaLabel="CLI — view on the map"
        testId="row"
      />,
    );
    const row = screen.getByTestId("row");
    expect(row.tagName).toBe("A");
    expect(row).toHaveAttribute("href", "/ontology/?node=element%3Acli");
    expect(row).toHaveAttribute("aria-label", "CLI — view on the map");
  });

  it("renders an optional secondary trailing line without disturbing the primary date", () => {
    render(
      <RecentNodeRow
        kind="capability"
        title="MCP Server"
        subtitle="Views · write 도구로 확장"
        trailing="Today"
        trailingSecondary="capabilities/mcp-server"
        testId="row"
      />,
    );
    expect(screen.getByText("Today")).toBeInTheDocument();
    expect(screen.getByText("capabilities/mcp-server")).toBeInTheDocument();
  });
});
