"use client";

import { useMemo } from "react";
import { useLocalVault } from "@/features/docs-vault-local";
import { useDataSourceMode } from "@/features/data-source-mode";
import { useStaticVaultSource } from "@/features/vault-sample-source";
import type { VaultDoc } from "@/entities/docs-vault";

/**
 * Mode-aware vault doc list — the same `local` (user's disk) vs `static`
 * (번들 샘플 볼트) truth-source priority as `useOntologyInsight`
 * / `useProjects`, but exposing `VaultDoc[]` directly for callers that need
 * real per-file `updatedAt`/`mtime` (the /projects "recent activity" strip —
 * `KnowledgeGraphNode.lastApprovedAt` is a sentinel in vault mode and can't
 * rank recency, see `recent-activity.ts`).
 *
 * static 쪽 매니페스트는 반드시 `useStaticVaultSource()` 로 받는다 — dogfood
 * 매니페스트를 직접 import 하면 사용자의 "예시 비즈니스 보기" 선택이 이
 * 목록에서만 조용히 무시된다.
 */
export function useVaultDocs(): readonly VaultDoc[] {
  const mode = useDataSourceMode();
  const vault = useLocalVault();
  const { manifest: staticManifest } = useStaticVaultSource();

  return useMemo(() => {
    if (mode === "static") return staticManifest.docs;
    return vault.manifest?.docs ?? [];
  }, [mode, staticManifest, vault.manifest]);
}
