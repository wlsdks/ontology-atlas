import { describe, expect, it, vi } from "vitest";
import { fireEvent, render as rtlRender, screen, waitFor } from "@testing-library/react";
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

function render(packet: AgentBriefingPacket, onCopyBriefing = vi.fn(async () => true)) {
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
  it("상단에서는 Claude/Codex 연결 가이드와 readiness score 만 조용히 보이고, 상세는 팝업 안에 둔다", () => {
    render(packet());

    expect(screen.getByTestId("agent-status-trigger")).toHaveTextContent("Claude/Codex 연결");
    expect(screen.getByTestId("agent-status-trigger")).toHaveTextContent("72");
    expect(screen.getByTestId("agent-status-trigger")).toHaveAccessibleName(
      "Claude Code와 Codex MCP 연결 가이드 열기 — 관계 보강, 준비도 72점",
    );
    expect(screen.getByText("Claude Code · Codex가 같은 문서함을 보게 하기")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Context Atlas가 agent 채팅을 직접 열지는 않습니다. 설정 파일을 준비한 뒤 Claude Code는 /mcp, Codex는 codex mcp list로 실제 연결을 확인합니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByText("MCP 연결")).toBeInTheDocument();
    expect(screen.getByText("지원 방식")).toBeInTheDocument();
    expect(
      screen.getByText(
        "Claude Code는 .mcp.json 또는 /mcp로 MCP 서버를 확인하고, Codex는 .codex/config.toml 또는 codex mcp add/list로 연결합니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("agent-setup-lanes")).toHaveTextContent("Claude Code");
    expect(screen.getByTestId("agent-setup-lanes")).toHaveTextContent(".mcp.json · /mcp");
    expect(screen.getByTestId("agent-setup-lanes")).toHaveTextContent("Codex");
    expect(screen.getByTestId("agent-setup-lanes")).toHaveTextContent(
      ".codex/config.toml · codex mcp list",
    );
    expect(screen.getByText("준비도")).toBeInTheDocument();
    expect(screen.getByText("개념")).toBeInTheDocument();
    expect(screen.getByText("시작점")).toBeInTheDocument();
    expect(screen.getByText("에이전트 그래프 레일")).toBeInTheDocument();
    expect(screen.getByText("Graph DB pack")).toBeInTheDocument();
    expect(screen.getByText("Runtime gate")).toBeInTheDocument();
    expect(screen.getByText("Agent handoff")).toBeInTheDocument();
    expect(screen.getByText("graph DB gate 복사")).toBeInTheDocument();
    expect(screen.getByText(/앱 안에서 Claude Code나 Codex 채팅을 직접 열지 않습니다/)).toBeInTheDocument();
    expect(screen.getByText(/graph DB gate와 브리핑을 통해/)).toBeInTheDocument();
    expect(screen.getByText("쿼리 cockpit 열기")).toHaveAttribute(
      "href",
      "/ontology/insights/",
    );
  });

  it("브리핑 복사는 부모 핸들러로 위임하고 붙여넣기 피드백을 보여준다", async () => {
    const onCopyBriefing = vi.fn(async () => true);
    render(packet(), onCopyBriefing);

    fireEvent.click(screen.getByText("에이전트 브리핑 복사"));

    await waitFor(() => expect(onCopyBriefing).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
      "에이전트 브리핑 복사됨",
    );
    expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
      "Claude Code 또는 Codex에 한 번 붙여넣어 온톨로지 메모리를 로드하세요.",
    );
  });
});
