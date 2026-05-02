"use client";

import { useEffect, useState, useSyncExternalStore } from "react";
import { useSearchParams } from "next/navigation";
import { useTranslations } from "next-intl";
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
 *
 * Round 4 polish: firebase Auth 의 localStorage 흔적이 없으면 spinner 가
 * 의미 0 — 첫 방문자가 무조건 2.5s 대기하던 회귀 (eval Perf agent finding).
 * synchronous heuristic 으로 단축. firebase token 이 있으면 fully resolve
 * 되도록 기존 loading 분기 보존.
 */
const FIREBASE_AUTH_LS_PREFIX = 'firebase:authUser:';

function hasAnyFirebaseAuthArtifact(): boolean {
  if (typeof window === 'undefined') return false;
  try {
    for (let i = 0; i < window.localStorage.length; i += 1) {
      const key = window.localStorage.key(i);
      if (key && key.startsWith(FIREBASE_AUTH_LS_PREFIX)) return true;
    }
  } catch {
    // private mode — assume artifact may exist; let normal loading run.
    return true;
  }
  return false;
}

function useHasFirebaseAuthArtifact(): boolean {
  // SSR 평가 시 항상 true 로 fallback (loading spinner 정상 표시) → 클라이언트
  // hydration 후 동기 검사 결과로 update. mismatch 없는 useSyncExternalStore
  // 패턴.
  return useSyncExternalStore(
    () => () => {},
    () => hasAnyFirebaseAuthArtifact(),
    () => true,
  );
}

export function RootEntryPage() {
  const searchParams = useSearchParams();
  const next = searchParams.get("next");
  const userAuth = useUserAuth();
  const globalAdmin = useGlobalAdmin();
  const hasArtifact = useHasFirebaseAuthArtifact();

  // First-visit short-circuit: no firebase auth artifact in localStorage means
  // the eventual answer is `unauthenticated` regardless of how long Firebase
  // SDK init takes. Render LandingPage immediately. Existing users with a
  // saved session still hit the proper loading state.
  const definitelyUnauthenticated =
    !hasArtifact &&
    userAuth.status === "loading" &&
    globalAdmin.status !== "authenticated";

  if (
    !definitelyUnauthenticated &&
    (userAuth.status === "loading" || globalAdmin.status === "loading")
  ) {
    return <AuthLoadingSpinner />;
  }
  if (
    definitelyUnauthenticated ||
    (userAuth.status === "unauthenticated" && globalAdmin.status !== "authenticated")
  ) {
    return <LandingPage next={next} />;
  }
  return <OntologyViewPage />;
}

function AuthLoadingSpinner() {
  const t = useTranslations('featuresMisc.authLoading');
  // Show the spinner only after a short delay so first-paint isn't
  // flashed for users whose auth resolves in <100ms (cached session).
  const [showSpinner, setShowSpinner] = useState(false);
  useEffect(() => {
    const handle = window.setTimeout(() => setShowSpinner(true), 120);
    return () => window.clearTimeout(handle);
  }, []);
  if (!showSpinner) return null;
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
          {t('label')}
        </span>
      </div>
    </div>
  );
}
