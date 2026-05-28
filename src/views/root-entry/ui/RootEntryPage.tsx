"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { useLocalVault } from "@/features/docs-vault-local";
import { useRouter } from "@/i18n/navigation";
import { isTauriVaultRuntime } from "@/shared/lib/tauri-vault-fs";
import { OntologyViewPage } from "@/views/ontology-view";
import { LandingPage } from "@/views/landing";

/**
 * 루트 `/` 진입 분기 — vault 선택 여부에 따라 두 surface 로 갈림:
 *
 * - web vault 미선택 → LandingPage (첫 인상 — "이게 뭔지" 5초 설명 + "내 폴더 열기" CTA)
 * - desktop vault 미선택 → `/docs/?intent=local` (앱은 홍보가 아니라 로컬 작업 진입)
 * - vault 선택됨 → OntologyViewPage (실제 hub — 트리 + ego graph + stub)
 *
 * vault picker 자체는 별도 `/docs` 라우트. LandingPage 의 "내 마크다운 폴더
 * 열기" 버튼이 그 곳으로 보낸다.
 *
 * 데스크톱 런타임에서는 restoreAttempted 이후 로드된 manifest 가 없을 때
 * LandingPage 를 렌더하지 않는다. 설치 앱의 `/` 는 홍보가 아니라 로컬 vault
 * picker 로 가는 작업 진입점이어야 한다. 저장된 handle 이 stale path 로
 * 복원되어 manifest build 가 실패한 경우도 여기서 picker 로 돌린다.
 *
 * **`/` vs `/ontology` 의도적 dual-surface (R3 결정)** — vault 선택 시
 * 둘 다 `OntologyViewPage` 를 렌더하지만 *역할이 다름*:
 *   - `/` = home / back-link target / error fallback (10 inbound). 사용자
 *     머릿속 "기본 자리".
 *   - `/ontology` = explicit deep-link namespace (19 inbound — landing
 *     CTA / project overview / hub rails / global search / 노드 deep
 *     link `/ontology/?node=<id>`).
 * Round 3 에서 redirect 통합 검토했으나 codex 어드바이저 + inbound 매핑
 * 결과 한쪽으로 합치면 다른 쪽 inbound 가 깨짐 → keep both, 의도 명시.
 */
export function RootEntryPage() {
  const vault = useLocalVault();
  const router = useRouter();
  const isDesktopRuntime = isTauriVaultRuntime();

  useEffect(() => {
    if (!vault.restoreAttempted) return;
    if (vault.manifest) return;
    if (!isDesktopRuntime) return;
    router.replace('/docs/?intent=local');
  }, [isDesktopRuntime, router, vault.manifest, vault.restoreAttempted]);

  if (vault.manifest) return <OntologyViewPage />;
  if (isDesktopRuntime && vault.restoreAttempted) return <DesktopVaultRedirect />;
  return <LandingPage />;
}

function DesktopVaultRedirect() {
  const t = useTranslations('rootEntry');

  return (
    <main
      id="main"
      aria-busy="true"
      className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6"
    >
      <p className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
        {t('openingLocalVaultPicker')}
      </p>
    </main>
  );
}
