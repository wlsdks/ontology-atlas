"use client";

import { useCallback, useMemo, useState } from "react";
import {
  deriveBootstrapPlan,
  executeBootstrapPlan,
  type BootstrapPlan,
  type BootstrapVaultWriter,
  type ExecuteBootstrapResult,
} from "@/features/docs-vault-local";

/**
 * "내 문서에서 온톨로지 시작하기" 흐름의 상태 조합 — HomePage 모듈화 1차.
 * 계획 파생(deriveBootstrapPlan) + 다이얼로그 open 상태 + 실행
 * (executeBootstrapPlan, features 레벨 batch 쓰기 계약) 만 소유하고,
 * 완료 후 연출(토스트·E1 리빌)은 onCompleted 콜백으로 호출자(HomePage)에
 * 남긴다 — 이 훅은 지도/토스트를 모른다.
 */
export interface UseBootstrapFlowArgs {
  vault: BootstrapVaultWriter & { handle?: { name: string } | null };
  onCompleted: (result: ExecuteBootstrapResult) => void;
}

export interface BootstrapFlow {
  bootstrapOpen: boolean;
  setBootstrapOpen: (open: boolean) => void;
  bootstrapPlan: BootstrapPlan | null;
  runBootstrap: (input: { projectTitle: string; acceptedDomains: ReadonlySet<string> }) => Promise<void>;
}

export function useBootstrapFlow({ vault, onCompleted }: UseBootstrapFlowArgs): BootstrapFlow {
  const [bootstrapOpen, setBootstrapOpen] = useState(false);

  const bootstrapPlan = useMemo(() => {
    if (!vault.manifest) return null;
    return deriveBootstrapPlan(
      vault.manifest.docs.map((d) => ({
        slug: d.slug,
        title: (d as { title?: string }).title ?? d.slug,
        frontmatter: d.frontmatter,
      })),
      vault.handle?.name ?? "my-project",
    );
  }, [vault.manifest, vault.handle]);

  const runBootstrap = useCallback(
    async (input: { projectTitle: string; acceptedDomains: ReadonlySet<string> }) => {
      if (!bootstrapPlan) return;
      const result = await executeBootstrapPlan(vault, bootstrapPlan, input);
      if (!result) return;
      setBootstrapOpen(false);
      onCompleted(result);
    },
    [bootstrapPlan, vault, onCompleted],
  );

  return { bootstrapOpen, setBootstrapOpen, bootstrapPlan, runBootstrap };
}
