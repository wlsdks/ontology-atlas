"use client";

import { useCallback, useMemo, useState } from "react";
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
      ? ((insightNodes ?? []).find((n) => n.evidenceIds[0] === focusSlug || n.id === focusSlug)?.title ?? focusSlug)
      : null;
    return { kind: "connected", agentLabel: hb.agent ?? defaultAgentLabel, agoLabel: ago, focusTitle };
  }, [agentActivityStatus, insightNodes, nowMs, defaultAgentLabel]);

  const snippets = useMemo(() => {
    const vaultName = vaultHandle?.name ?? "my-vault";
    const desktopPath = vaultHandle ? (getTauriVaultRootPath(vaultHandle) ?? null) : null;
    return {
      mcpJson: buildMcpConfigJson(vaultName, desktopPath),
      replacementMcpJson: buildMcpConfigJson(vaultName, "."),
      codexCommand: buildCodexMcpAddCommandTemplate(vaultName, desktopPath),
      codexConfig: buildCodexConfigTomlTemplate(vaultName, "."),
      needsManualPath: desktopPath === null,
      cursorDeeplink: buildCursorMcpDeeplink(desktopPath),
      vscodeDeeplink: buildVsCodeMcpDeeplink(desktopPath),
    };
  }, [vaultHandle]);

  const domainTitles = useMemo(
    () => (insightNodes ?? []).filter((n) => n.kind === "domain").map((n) => n.title),
    [insightNodes],
  );

  return { open, openSheet, closeSheet, status, snippets, domainTitles };
}
