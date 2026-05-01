"use client";

import { useSearchParams } from "next/navigation";
import { useGlobalAdmin } from "@/features/permissions";
import { useUserAuth } from "@/features/user-auth";
import { OntologyViewPage } from "@/views/ontology-view";
import { LandingPage } from "@/views/landing";

/**
 * 루트 `/` 진입 분기.
 *
 * 이 서비스는 **온톨로지 워크벤치** — 인증 사용자의 첫 화면은 ontology hub
 * (트리 + ego graph + stub 처리). 토폴로지는 별도 `/topology` 라우트.
 *
 * - 비인증: LandingPage
 * - 인증 (또는 dev-bypass): OntologyViewPage
 *
 * 과거 `?account=X` 멀티-계정 scope 분기는 mission v2 single-user 전환으로
 * 폐기 — `accountId` 는 항상 null. ontology 데이터는 vault > 빌드타임 dogfood
 * > Firestore 우선순위 (`useOntologyInsight`) 로 결정되므로 라우팅 단계에서
 * 계정 분기 불필요.
 */
export function RootEntryPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const userAuth = useUserAuth();
  const globalAdmin = useGlobalAdmin();

  if (userAuth.status === "loading" || globalAdmin.status === "loading") {
    return <AuthLoadingSpinner />;
  }
  if (
    userAuth.status === "unauthenticated" &&
    globalAdmin.status !== "authenticated"
  ) {
    return <LandingPage next={next} />;
  }
  return <OntologyViewPage />;
}

function AuthLoadingSpinner() {
  return (
    <div
      className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)]"
      role="status"
      aria-live="polite"
    >
      <div className="flex items-center gap-3 rounded-full border border-[color:rgba(139,151,255,0.24)] bg-[color:var(--color-panel)] px-4 py-2 shadow-[0_10px_24px_rgba(0,0,0,0.35)]">
        <span className="flex gap-1" aria-hidden>
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:0ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:150ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:var(--color-indigo-accent)] [animation-delay:300ms]" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-tertiary)]">
          확인 중
        </span>
      </div>
    </div>
  );
}
