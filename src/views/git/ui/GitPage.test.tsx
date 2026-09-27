import { describe, expect, it, vi } from "vitest";
import { render, screen } from "@testing-library/react";
import { GitPage } from "./GitPage";

const panelProps = vi.fn();

vi.mock("@/widgets/atlas-git-panel", () => ({
  AtlasGitPanel: (props: Record<string, unknown>) => {
    panelProps(props);
    return <div data-testid="stub-atlas-git-panel" />;
  },
  useAtlasGitContext: () => ({
    vaultPath: "/Users/someone/vault",
    changeset: { total: 3 },
    graph: { nodes: [], edges: [] },
  }),
}));

describe("GitPage", () => {
  it("hands the vault git context to the panel it composes", () => {
    panelProps.mockClear();
    render(<GitPage />);

    expect(screen.getByTestId("stub-atlas-git-panel")).toBeInTheDocument();
    expect(panelProps).toHaveBeenCalledTimes(1);
    const props = panelProps.mock.calls[0][0] as Record<string, unknown>;
    expect(props.vaultPath).toBe("/Users/someone/vault");
    expect(props.sessionChangeset).toEqual({ total: 3 });
    expect(props.graph).toEqual({ nodes: [], edges: [] });
  });

  it("takes the height the shell offers instead of collapsing to its content", () => {
    render(<GitPage />);

    const page = screen.getByTestId("git-page");
    expect(page.tagName).toBe("MAIN");
    expect(page.className).toContain("h-full");
    expect(page.className).not.toMatch(/(^|\s)flex-1(\s|$)/);
  });
});
