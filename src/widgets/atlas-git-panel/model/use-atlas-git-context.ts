"use client";

import { useMemo } from "react";

import { useLocalVault } from "@/features/docs-vault-local";
import { useOntologyInsight } from "@/features/vault-ontology";
import { computeOntologyChangeset, useChangeBaseline } from "@/shared/lib/ontology-tree";
import { getTauriVaultRootPath } from "@/shared/lib/tauri-vault-fs";

/**
 * vault 경로 + 세션 changeset — 발자취 목적지와 레일 뱃지가 **같은 값**을 본다.
 *
 * 2026-07-25 이전에는 `src/app/providers/NavRailGitTile.tsx` 안에 있었는데,
 * 목적지(`src/views/git/`)가 이 값을 필요로 하면서 `views → app` 역방향 import
 * 가 되어버렸다(FSD 위반, ESLint 가 차단). 소비자가 둘이 됐으므로 둘 다 도달
 * 가능한 가장 낮은 레이어인 widget 으로 내린다.
 */
export function useAtlasGitContext() {
  const localVault = useLocalVault();
  const { insight } = useOntologyInsight();
  const changeBaseline = useChangeBaseline();

  const changeset = useMemo(
    () => computeOntologyChangeset(changeBaseline, insight?.nodes ?? [], insight?.edges ?? []),
    [changeBaseline, insight],
  );

  // Tauri 데스크톱이면 vault 절대 경로(브리지 활성), 웹 FSA 핸들이면 null →
  // 목적지가 세션 changeset 기반으로 정직하게 강등한다.
  const vaultPath = localVault.handle ? (getTauriVaultRootPath(localVault.handle) ?? null) : null;
  return { vaultPath, changeset };
}
