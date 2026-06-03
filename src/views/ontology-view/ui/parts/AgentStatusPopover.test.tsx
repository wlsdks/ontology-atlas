import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen } from "@testing-library/react";
import { NextIntlClientProvider } from "next-intl";
import koMessages from "../../../../../messages/ko.json";
import { AgentStatusPopover } from "./AgentStatusPopover";
import type { AgentBriefingPacket } from "@/shared/lib/ontology-tree";

vi.mock("@/i18n/navigation", () => ({
  Link: ({ href, children, ...props }: React.ComponentProps<"a"> & { href: string }) => (
    <a href={href} {...props}>
      {children}
    </a>
  ),
}));

function render(packet: AgentBriefingPacket, onCopyBriefing = vi.fn()) {
  return rtlRender(
    <NextIntlClientProvider locale="ko" messages={koMessages}>
      <AgentStatusPopover packet={packet} onCopyBriefing={onCopyBriefing} />
    </NextIntlClientProvider>,
  );
}

function packet(): AgentBriefingPacket {
  return {
    briefing: "agent briefing",
    readiness: {
      status: "needs-links",
      score: 72,
      meaningfulNodes: 12,
      relationCount: 18,
      unknownNodes: 1,
      orphanCount: 2,
      hubCount: 3,
      averageDegree: 2.4,
      actionKeys: ["linkOrphans", "syncAfterChanges"],
    },
    entrypoints: [
      {
        slug: "capabilities/mcp-server",
        title: "MCP Server",
        kind: "capability",
        degree: 4,
      },
    ],
  };
}

describe("AgentStatusPopover", () => {
  it("상단에서는 readiness score 만 조용히 보이고, 상세는 팝업 안에 둔다", () => {
    render(packet());

    expect(screen.getByTestId("agent-status-trigger")).toHaveTextContent("MCP 설정");
    expect(screen.getByTestId("agent-status-trigger")).toHaveTextContent("72");
    expect(screen.getByText("Claude Code · Codex가 같은 vault를 보게 하기")).toBeInTheDocument();
    expect(screen.getByText("MCP 연결")).toBeInTheDocument();
    expect(screen.getByText("준비도")).toBeInTheDocument();
    expect(screen.getByText("개념")).toBeInTheDocument();
    expect(screen.getByText("시작점")).toBeInTheDocument();
    expect(screen.getByText("설정 점검 복사")).toBeInTheDocument();
    expect(screen.getByText(/설정 점검을 통해/)).toBeInTheDocument();
    expect(screen.queryByText(/setup gate/)).not.toBeInTheDocument();
    expect(screen.getByText("연결 상세 열기")).toHaveAttribute(
      "href",
      "/ontology/insights/",
    );
  });

  it("브리핑 복사는 부모 핸들러로 위임한다", () => {
    const onCopyBriefing = vi.fn();
    render(packet(), onCopyBriefing);

    fireEvent.click(screen.getByText("브리핑 복사"));

    expect(onCopyBriefing).toHaveBeenCalledTimes(1);
  });
});
