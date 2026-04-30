"use client";

import { useSearchParams } from "next/navigation";
import { useScopedAccountAccess } from "@/features/account-scope";
import { useGlobalAdmin } from "@/features/permissions";
import { useUserAuth } from "@/features/user-auth";
import { } from "@/shared/lib/account-scope";
import { useScopedAccountId } from "@/shared/lib/use-scoped-account-id";
import { HomePage } from "@/views/home";
import { LandingPage } from "@/views/landing";

/**
 * 루트 `/` 진입 분기.
 *
 * `?account=X` 가 있으면 그 공간의 scope 해석 필요 — membership 조회가
 * 끝날 때까지 "권한 확인 중" 스피너. 없으면 공개 홈이므로 Firebase Auth
 * 초기화만 기다리면 됨 (Firestore membership 조회 불필요). 네트워크가
 * Firestore 쪽에서 10초 이상 지연되더라도 홈·랜딩 은 정상 렌더된다.
 *
 * dev-bypass (로컬 개발 우회 로그인) 는 useUserAuth 의 firebase/demo/iam
 * 세 provider 어디에도 잡히지 않으므로 useGlobalAdmin 으로 별도 확인한다.
 */
export function RootEntryPage() {
  const searchParams = useSearchParams();
  const accountId = useScopedAccountId(searchParams.get("account"));
  const next = searchParams.get("next");
  const userAuth = useUserAuth();
  const globalAdmin = useGlobalAdmin();
  const scopedAccess = useScopedAccountAccess(accountId);

  // Account-scoped 방문만 membership-aware scope 로 판정.
  if (accountId) {
    if (scopedAccess.kind === "loading") {
      return <AuthLoadingSpinner />;
    }
    if (scopedAccess.kind === "guest") {
      return <LandingPage accountId={accountId} next={next} />;
    }
    return <HomePage />;
  }

  // 공개 홈 — Firebase Auth 초기화만 기다리면 충분.
  if (userAuth.status === "loading" || globalAdmin.status === "loading") {
    return <AuthLoadingSpinner />;
  }
  // dev-bypass 사용자도 인증된 사용자로 간주 → HomePage.
  if (
    userAuth.status === "unauthenticated" &&
    globalAdmin.status !== "authenticated"
  ) {
    return <LandingPage accountId={null} next={next} />;
  }
  return <HomePage />;
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
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:rgba(139,151,255,0.8)] [animation-delay:0ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:rgba(139,151,255,0.8)] [animation-delay:150ms]" />
          <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:rgba(139,151,255,0.8)] [animation-delay:300ms]" />
        </span>
        <span className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-tertiary)]">
          확인 중
        </span>
      </div>
    </div>
  );
}
