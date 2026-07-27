"use client";

import { useCallback, useMemo, useState } from "react";
import type { AgentServerAvailability } from "@/shared/config";
import type { AgentConnectState } from "@/widgets/agent-connect";
import type { KnowledgeGraphNode } from "@/entities/knowledge-graph";
import {
  buildCodexConfigTomlTemplate,
  buildCodexMcpAddCommandTemplate,
  buildCursorMcpDeeplink,
  buildMcpConfigJson,
  buildVsCodeMcpDeeplink,
} from "@/features/docs-vault-local";
import { formatActivityAge } from "@/features/vault-ontology";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";

/**
 * "AI 에이전트 연결" 시트의 데이터 조립 — HomePage 모듈화 2차.
 * heartbeat → 연결 상태, vault handle → 등록 스니펫, insight → 도메인
 * 미리보기. "N분 전" 기준 시각은 시트가 열린 순간의 스냅샷
 * (렌더 중 Date.now 금지 — 저장소 purity 관례).
 */

interface AgentHeartbeatStatus {
  valid?: boolean;
  stale?: boolean;
  heartbeat?: {
    updatedAt: string;
    agent?: string | null;
    focus: { ontologySlug: string | null };
  } | null;
}

export interface UseAgentConnectModelArgs {
  agentActivityStatus: AgentHeartbeatStatus | null;
  vaultHandle: FileSystemDirectoryHandle | null;
  insightNodes: readonly KnowledgeGraphNode[] | null;
  /** i18n — heartbeat 에 agent 이름이 없을 때의 기본 라벨. */
  defaultAgentLabel: string;
  /** 서버를 띄울 방법 — 설정 스니펫과 딥링크가 전부 여기서 갈린다. */
  serverAvailability: AgentServerAvailability;
}

export interface AgentConnectModel {
  open: boolean;
  /** 열기 — now 스냅샷을 함께 찍는다. */
  openSheet: () => void;
  closeSheet: () => void;
  status: AgentConnectState;
  snippets: {
    mcpJson: string;
    replacementMcpJson: string;
    codexCommand: string;
    codexConfig: string;
    needsManualPath: boolean;
    cursorDeeplink: string | null;
    vscodeDeeplink: string | null;
  };
  domainTitles: string[];
}

export function useAgentConnectModel({
  agentActivityStatus,
  vaultHandle,
  insightNodes,
  defaultAgentLabel,
  serverAvailability,
}: UseAgentConnectModelArgs): AgentConnectModel {
  const [open, setOpen] = useState(false);
  const [nowMs, setNowMs] = useState(0);

  const openSheet = useCallback(() => {
    setNowMs(Date.now());
    setOpen(true);
  }, []);
  const closeSheet = useCallback(() => setOpen(false), []);

  const status = useMemo<AgentConnectState>(() => {
    const hb = agentActivityStatus?.heartbeat ?? null;
    if (!hb || !agentActivityStatus?.valid) return { kind: "none" };
    const agoMs = nowMs - new Date(hb.updatedAt).getTime();
    const ago = formatActivityAge(agoMs);
    if (agentActivityStatus.stale) return { kind: "stale", agoLabel: ago };
    const focusSlug = hb.focus.ontologySlug;
    const focusTitle = focusSlug
      ? (() => {
          const node = (insightNodes ?? []).find(
            (n) => n.evidenceIds[0] === focusSlug || n.id === focusSlug,
          );
          // 화면 언어로 부르는 이름이 있으면 그것 — 지도·INDEX 와 같은 이름을
          // 써야 사용자가 두 화면을 같은 개념으로 읽는다.
          return node?.display ?? node?.title ?? focusSlug;
        })()
      : null;
    return { kind: "connected", agentLabel: hb.agent ?? defaultAgentLabel, agoLabel: ago, focusTitle };
  }, [agentActivityStatus, insightNodes, nowMs, defaultAgentLabel]);

  const snippets = useMemo(() => {
    const vaultName = vaultHandle?.name ?? "my-vault";
    const desktopPath = vaultHandle ? (getTauriVaultRootPath(vaultHandle) ?? null) : null;
    const launch = serverAvailability.launch;
    return {
      mcpJson: buildMcpConfigJson(vaultName, desktopPath, launch),
      replacementMcpJson: buildMcpConfigJson(vaultName, ".", launch),
      codexCommand: buildCodexMcpAddCommandTemplate(vaultName, desktopPath, launch),
      codexConfig: buildCodexConfigTomlTemplate(vaultName, ".", launch),
      needsManualPath: desktopPath === null,
      cursorDeeplink: buildCursorMcpDeeplink(desktopPath, launch),
      vscodeDeeplink: buildVsCodeMcpDeeplink(desktopPath, launch),
    };
  }, [vaultHandle, serverAvailability.launch]);

  const domainTitles = useMemo(
    () =>
      (insightNodes ?? [])
        .filter((n) => n.kind === "domain")
        // 한국어 화면에서 영문 canonical title 을 그대로 되말하면 "이 도구가
        // 내 로케일을 모른다" 로 읽힌다 — 지도와 같은 표시 이름을 쓴다.
        .map((n) => n.display ?? n.title),
    [insightNodes],
  );

  return { open, openSheet, closeSheet, status, snippets, domainTitles };
}
