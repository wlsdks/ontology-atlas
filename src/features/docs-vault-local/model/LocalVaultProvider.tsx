"use client";

import { createContext, useContext, type ReactNode } from "react";
import { useLocalVaultInternal } from "./use-local-vault";
import { VaultDiffToaster } from "./VaultDiffToaster";

type LocalVaultValue = ReturnType<typeof useLocalVaultInternal>;

/**
 * Round 8 cut R — Single source of truth 화.
 *
 * 이전엔 useLocalVault 가 8 곳 (RootEntryPage / OperationsNav /
 * OntologyEditPage / DocsVaultPage / useDataSourceMode / useProjects /
 * useProjectMutations / useVaultOntology) 에서 독립 호출 → 한 페이지
 * mount 시 2-3 인스턴스 동시 존재. 같은 IDB 키 N 번 rehydrate, 같은 폴더
 * N 번 buildLocalManifest (전체 FS walk). 18 노드 dogfood 에선 측정 안
 * 보이지만 100+ 파일 vault 에선 cold-load latency 가 비례 증가.
 *
 * Provider 가 layout 에서 1 회 mount → 단일 state. Consumer (8 callsite)
 * 는 시그니처 동일한 useLocalVault() 로 context 만 읽음 — 호출 코드 변경
 * 없음.
 */
const LocalVaultContext = createContext<LocalVaultValue | null>(null);

export function LocalVaultProvider({ children }: { children: ReactNode }) {
  const value = useLocalVaultInternal();
  return (
    <LocalVaultContext.Provider value={value}>
      <VaultDiffToaster />
      {children}
    </LocalVaultContext.Provider>
  );
}

/**
 * 로컬 vault state + actions 접근. LocalVaultProvider 안에서만 호출 가능.
 * Provider 외부 (예: 단위 테스트의 plain render) 에선 throw — 의도적으로
 * silent fallback 하지 않음 (vault 가 SSoT 인 앱에서 stub state 가 더
 * 위험).
 *
 * 시그니처는 이전 useLocalVault 와 동일 — 8 callsite 변경 없음.
 */
export function useLocalVault(): LocalVaultValue {
  const value = useContext(LocalVaultContext);
  if (value === null) {
    throw new Error(
      "useLocalVault must be called inside <LocalVaultProvider>. " +
        "Mount the provider in app/[locale]/layout.tsx (already done for " +
        "production paths). Tests rendering components that consume the " +
        "vault must wrap them in <LocalVaultProvider>.",
    );
  }
  return value;
}
