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
  it("상단 버튼은 조용히 두고, 클릭하면 중앙 설정 창과 좌측 섹션 탭으로 연결 proof를 보여준다", () => {
    render(packet());

    expect(screen.getByTestId("agent-status-trigger")).toHaveTextContent("연결 설정");
    expect(screen.getByTestId("agent-status-trigger")).toHaveTextContent("72");
    expect(screen.getByTestId("agent-status-trigger")).toHaveAccessibleName(
      "Claude Code와 Codex MCP 연결 설정 열기 — 관계 보강, 준비도 72점",
    );
    expect(screen.getByTestId("agent-status-trigger")).toHaveAttribute(
      "title",
      "MCP 연결 설정과 현재 agent에서 확인할 증거를 봅니다",
    );
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();

    fireEvent.click(screen.getByTestId("agent-status-trigger"));

    expect(screen.getByRole("dialog", { name: "AI agent 연결 설정" })).toBeInTheDocument();
    expect(screen.getByTestId("agent-settings-overlay")).toBeInTheDocument();
    expect(screen.getByTestId("agent-status-popover")).toHaveClass("overflow-hidden");
    expect(screen.getByTestId("agent-status-popover").className).toContain(
      "h-[min(42rem,calc(100vh-2rem))]",
    );
    expect(screen.getByTestId("agent-settings-scroll-area")).toHaveClass("overflow-y-auto");
    expect(screen.getByLabelText("앱 설정 섹션")).toBeInTheDocument();
    expect(screen.getByTestId("agent-settings-tab-connection")).toHaveTextContent("연결 확인");
    expect(screen.getByTestId("agent-settings-tab-connection")).toHaveAttribute(
      "aria-pressed",
      "true",
    );
    expect(screen.getByTestId("agent-settings-tab-handoff")).toHaveTextContent("인계 복사");
    expect(screen.getByTestId("agent-settings-tab-criteria")).toHaveTextContent("판단 기준");
    expect(screen.getByText("AI agent 연결 설정")).toBeInTheDocument();
    expect(
      screen.getByText("설정 파일, 현재 agent 세션 확인, 재시작/로그 점검을 한 곳에서 봅니다."),
    ).toBeInTheDocument();
    expect(
      screen.getByText(
        "Ontology Atlas가 agent 채팅을 직접 열지는 않습니다. 설정 파일을 준비한 뒤 Claude Code는 /mcp, Codex는 codex mcp list로 실제 연결을 확인합니다.",
      ),
    ).toBeInTheDocument();
    expect(screen.getByTestId("agent-connection-verdicts")).toHaveTextContent(
      "설정 준비됨",
    );
    expect(screen.getByTestId("agent-connection-verdicts")).toHaveTextContent(
      "현재 세션 확인 필요",
    );
    expect(screen.getByTestId("agent-connection-verdicts")).toHaveTextContent(
      "CLI fallback 가능",
    );
    expect(screen.getByTestId("agent-connection-verdicts")).toHaveTextContent(
      "연결됨은 Claude Code/Codex 안에서 tools/list와 첫 MCP 호출이 보일 때만 확정합니다.",
    );
    expect(screen.getByTestId("agent-connection-verdicts")).toHaveTextContent(
      "MCP namespace가 없거나 stale이면 agent-brief, workspace-brief, health CLI로 같은 그래프를 검증합니다.",
    );
    expect(screen.getByText("MCP 연결")).toBeInTheDocument();
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent("연결 증거");
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent(
      "설정 ≠ 현재 세션",
    );
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent("설정 파일");
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent("현재 세션");
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent("재시작/로그");
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent(
      ".mcp.json · .codex/config.toml",
    );
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent(
      "/mcp · codex mcp list · tools/list",
    );
    expect(screen.getByTestId("agent-connection-proof")).toHaveTextContent(
      "reload · restart · logs",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "현재 세션 proof 계약",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "Claude Code / Codex 안에서 ontology-atlas 서버가 보입니다.",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "tools/list가 24개 도구와 index_project를 포함합니다.",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "agent_brief, workspace_brief, health 첫 호출이 healthy로 돌아옵니다.",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "도구 캐시가 낡았을 때",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "도구 설명이 23개로 보이면 연결 proof가 아니라 client cache로 봅니다.",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "agent를 reload/restart 하거나 cached MCP tools를 reset/refresh 합니다.",
    );
    expect(screen.getByTestId("agent-session-proof-contract")).toHaveTextContent(
      "다시 tools/list와 pnpm cli:mcp-verify docs/ontology --timeout-ms 15000을 확인합니다.",
    );
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

    expect(screen.queryByText("에이전트 그래프 레일")).not.toBeInTheDocument();
    fireEvent.click(screen.getByTestId("agent-settings-tab-handoff"));
    expect(screen.getByText("에이전트 그래프 레일")).toBeInTheDocument();
    expect(screen.getByText("Graph DB pack")).toBeInTheDocument();
    expect(screen.getByText("Runtime gate")).toBeInTheDocument();
    expect(screen.getByText("Agent handoff")).toBeInTheDocument();
    expect(screen.getByText("에이전트 브리핑 복사")).toBeInTheDocument();
    expect(screen.getByText("첫 MCP 호출 복사")).toBeInTheDocument();
    expect(screen.getByTestId("agent-ontology-actions")).toHaveTextContent("온톨로지 작업 명령");
    expect(screen.getByTestId("agent-ontology-actions")).toHaveTextContent("전체 재분석");
    expect(screen.getByTestId("agent-ontology-actions")).toHaveTextContent("변경 업데이트");
    expect(screen.getByTestId("agent-ontology-actions")).toHaveTextContent("선택 개념 강화");

    fireEvent.click(screen.getByTestId("agent-settings-tab-criteria"));
    expect(screen.getByText("에이전트 판단 기준")).toBeInTheDocument();
    expect(screen.getByText("맥락")).toBeInTheDocument();
    expect(screen.getByText("도구 경계")).toBeInTheDocument();
    expect(screen.getByText("검증 증거")).toBeInTheDocument();
    expect(screen.getByText("기억 드리프트")).toBeInTheDocument();
    expect(screen.getByText("작업 루프")).toBeInTheDocument();
    expect(screen.getByText("점검: agent_brief 먼저")).toBeInTheDocument();
    expect(screen.getByText("점검: /mcp · codex mcp list")).toBeInTheDocument();
    expect(screen.getByText("점검: 복사 가능한 proof")).toBeInTheDocument();
    expect(screen.getByText("점검: health · maintenance")).toBeInTheDocument();
    expect(screen.getByText("점검: read-check-write-sync")).toBeInTheDocument();
    expect(screen.getByText("판단 기준 복사")).toBeInTheDocument();
    expect(screen.getByText("근거 문서")).toBeInTheDocument();
    expect(screen.getByLabelText("Agent practice research 근거 문서 열기")).toHaveAttribute(
      "href",
      "/docs/?slug=ontology%2Fdocuments%2Fagent-practice-research",
    );
    expect(screen.getByText(/앱 안에서 Claude Code나 Codex 채팅을 직접 열지 않습니다/)).toBeInTheDocument();

    fireEvent.click(screen.getByLabelText("설정 닫기"));
    expect(screen.queryByRole("dialog")).not.toBeInTheDocument();
  });

  it("브리핑 복사는 부모 핸들러로 위임하고 붙여넣기 피드백을 보여준다", async () => {
    const onCopyBriefing = vi.fn(async () => true);
    render(packet(), onCopyBriefing);

    fireEvent.click(screen.getByTestId("agent-status-trigger"));
    fireEvent.click(screen.getByTestId("agent-settings-tab-handoff"));
    fireEvent.click(screen.getByText("에이전트 브리핑 복사"));

    await waitFor(() => expect(onCopyBriefing).toHaveBeenCalledTimes(1));
    expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
      "에이전트 브리핑 복사됨",
    );
    expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
      "Claude Code 또는 Codex에 한 번 붙여넣어 온톨로지 메모리를 로드하세요.",
    );
  });

  it("설정 창이 열리면 배경 앱을 inert 처리하고 닫을 때 trigger focus를 복구한다", async () => {
    const view = render(packet());
    const appRoot = view.container;

    fireEvent.click(screen.getByTestId("agent-status-trigger"));

    expect(screen.getByRole("dialog", { name: "AI agent 연결 설정" })).toBeInTheDocument();
    expect(appRoot).toHaveAttribute("aria-hidden", "true");
    expect((appRoot as HTMLElement & { inert?: boolean }).inert).toBe(true);
    await waitFor(() => expect(screen.getByLabelText("설정 닫기")).toHaveFocus());

    fireEvent.keyDown(window, { key: "Escape" });

    await waitFor(() => expect(screen.queryByRole("dialog")).not.toBeInTheDocument());
    expect(appRoot).not.toHaveAttribute("aria-hidden");
    expect((appRoot as HTMLElement & { inert?: boolean }).inert).toBe(false);
    expect(screen.getByTestId("agent-status-trigger")).toHaveFocus();
  });

  it("Tab focus를 설정 창 내부에서 순환시킨다", async () => {
    render(packet());

    fireEvent.click(screen.getByTestId("agent-status-trigger"));
    await waitFor(() => expect(screen.getByLabelText("설정 닫기")).toHaveFocus());

    fireEvent.keyDown(window, { key: "Tab", shiftKey: true });
    expect(screen.getByTestId("agent-settings-tab-criteria")).toHaveFocus();

    fireEvent.keyDown(window, { key: "Tab" });
    expect(screen.getByLabelText("설정 닫기")).toHaveFocus();
  });

  it("첫 MCP 호출 묶음을 복사해 Claude/Codex 연결 직후 바로 검증하게 한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(packet());

    fireEvent.click(screen.getByTestId("agent-status-trigger"));
    fireEvent.click(screen.getByTestId("agent-settings-tab-handoff"));
    fireEvent.click(screen.getByText("첫 MCP 호출 복사"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("query_ontology({\"operation\":\"agent_brief\"})"),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("query_ontology({\"operation\":\"workspace_brief\"})"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("ontology-atlas agent-brief [vault] --verify-fallbacks --json"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Stale tool metadata recovery"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("still describes ontology-atlas as 23 tools"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("confirm 24 tools including index_project"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("pnpm cli:mcp-verify docs/ontology --timeout-ms 15000"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
        "첫 MCP 호출 복사됨",
      ),
    );
  });

  it("agent에게 전체 재분석, 업데이트, 선택 개념 강화 명령을 복사하게 한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(packet());

    fireEvent.click(screen.getByTestId("agent-status-trigger"));
    fireEvent.click(screen.getByTestId("agent-settings-tab-handoff"));
    fireEvent.click(screen.getByText("전체 재분석"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('index_project({"rootPath":"[codebase-root]"})'),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("## Kind classification gate"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Do not classify from the label alone"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("source path, symbol, route, command, or MCP tool evidence"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("why not the nearest adjacent kind"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("## Reanalysis evidence to report"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("plan.concepts"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("imports.reconciliationSummary"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("inCodeMissingEndpointAbsent"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("inVaultNotInCode"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Do not run --apply until the human reviews noisy endpoint gaps"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"growth_plan","nodeLimit":8})'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining(
        "node cli/src/index.mjs index [codebase-root] --vault docs/ontology --json --threshold 2",
      ),
    );
    expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
      "전체 재분석 명령 복사됨",
    );

    fireEvent.click(screen.getByText("변경 업데이트"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('list_concepts({"since": <lastMaxMtime>, "summary": true})'),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Do not classify from the label alone"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"recommend_relations","nodeLimit":8})'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("node cli/src/index.mjs orphans docs/ontology --json"),
    );
    expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
      "변경 업데이트 명령 복사됨",
    );

    fireEvent.click(screen.getByText("선택 개념 강화"));
    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining('get_concept({"slug":"<selected-slug>"})'),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Do not classify from the label alone"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining('query_ontology({"operation":"node_profile","slug":"<selected-slug>"})'),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("node cli/src/index.mjs neighbors docs/ontology <selected-slug> --json"),
    );
    expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
      "선택 개념 강화 명령 복사됨",
    );
  });

  it("agent 기능 판단 기준을 복사해 새 기능이 어떤 실패 모드를 줄이는지 검토하게 한다", async () => {
    const writeText = vi.fn().mockResolvedValue(undefined);
    Object.assign(navigator, {
      clipboard: { writeText },
    });

    render(packet());

    fireEvent.click(screen.getByTestId("agent-status-trigger"));
    fireEvent.click(screen.getByTestId("agent-settings-tab-criteria"));
    fireEvent.click(screen.getByText("판단 기준 복사"));

    await waitFor(() => {
      expect(writeText).toHaveBeenCalledWith(
        expect.stringContaining("# Ontology Atlas agent feature decision checklist"),
      );
    });
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Context reliability"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Gate: Claude Code /mcp or Codex codex mcp list confirms the live server."),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("Cognition: async agent work becomes unmanageable unless it returns end-to-end verification artifacts."),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("one small read-check-write-sync loop works"),
    );
    expect(writeText).toHaveBeenCalledWith(
      expect.stringContaining("query_ontology({\"operation\":\"health\"})"),
    );
    await waitFor(() =>
      expect(screen.getByTestId("agent-copy-feedback")).toHaveTextContent(
        "판단 기준 복사됨",
      ),
    );
  });
});
