import { useState } from "react";
import type React from "react";
import { describe, expect, it, vi } from "vitest";
import { fireEvent, render, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../messages/ko.json";
import { BuilderCanvasEntryRail } from "./OntologyEditPage";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a">) => (
    <a href={String(href)} {...props}>
      {children}
    </a>
  ),
}));

const anchors = [
  {
    id: "ontology/project",
    label: "oh-my-ontology",
    kind: "project",
    degree: 6,
  },
  {
    id: "ontology/capabilities/mcp-server",
    label: "MCP Server",
    kind: "capability",
    degree: 4,
  },
];

function RailHarness() {
  const [expanded, setExpanded] = useState(false);
  return (
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <BuilderCanvasEntryRail
        anchors={anchors}
        nodeCount={64}
        relationCount={363}
        selectedAnchorId="ontology/project"
        expanded={expanded}
        onToggleExpanded={() => setExpanded((open) => !open)}
        onFocusAnchor={() => {}}
        onOpenAnchors={() => {}}
      />
    </NextIntlClientProvider>
  );
}

describe("BuilderCanvasEntryRail", () => {
  it("기본 상태에서는 캔버스 위 anchor strip 을 compact 버튼으로 접는다", () => {
    render(<RailHarness />);

    expect(screen.getByRole("button", { name: /그래프 앵커/ })).toHaveAttribute(
      "aria-expanded",
      "false",
    );
    expect(screen.getByText("ontology/project")).toBeInTheDocument();
    expect(screen.queryByText("저장 slug 먼저")).toBeNull();
  });

  it("사용자가 열 때만 전체 anchor strip 을 보여준다", () => {
    render(<RailHarness />);

    fireEvent.click(screen.getByRole("button", { name: /그래프 앵커/ }));

    expect(screen.getByRole("region", { name: /저장 graph anchor/ })).toBeInTheDocument();
    expect(screen.getByText("저장 slug 먼저")).toBeInTheDocument();
    expect(screen.getByRole("button", { name: /oh-my-ontology/ })).toHaveAttribute(
      "aria-pressed",
      "true",
    );
  });
});
