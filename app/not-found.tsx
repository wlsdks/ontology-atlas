"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { ArrowLeft, Compass, Search } from "lucide-react";

/**
 * 404 안내. 사용자가 잘못된 링크로 들어왔을 때 막다른 느낌 없이 3가지
 * 길을 즉시 안내한다.
 *   1) 뒤로가기 — 이전 맥락으로 복귀 (history 있을 때만)
 *   2) 홈으로   — 프로젝트 지도 초기 화면
 *   3) 검색 열기 — "혹시 이 프로젝트 찾으셨나요?" 명시적 탐색
 */
export default function NotFound() {
  const router = useRouter();

  // 404 surface 는 dead-end 카드만 노출. 모바일 BottomTabBar 가
  // 동시에 보이면 "어디 갈지" 가 두 군데에 분산되어 카드 안 3가지
  // 출구의 명확함이 흐려진다. body data 속성으로 BottomTabBar 가 자기
  // 자신을 숨기게 한다 (CSS rule 은 globals.css 에 정의).
  useEffect(() => {
    document.body.setAttribute("data-no-tabbar", "true");
    return () => {
      document.body.removeAttribute("data-no-tabbar");
    };
  }, []);

  const openSearchOnHome = () => {
    if (typeof window !== "undefined") {
      try {
        window.sessionStorage.setItem("aslan:open-search", "1");
      } catch {
        /* private mode */
      }
    }
    router.push("/");
  };

  const goBack = () => {
    if (typeof window !== "undefined" && window.history.length > 1) {
      router.back();
    } else {
      router.push("/");
    }
  };

  return (
    <main
      id="main"
      className="flex min-h-screen items-center justify-center bg-[color:var(--color-canvas)] px-6 py-10"
    >
      <div className="w-full max-w-[440px] rounded-[22px] border border-[color:rgba(255,255,255,0.08)] bg-[color:var(--color-panel)] p-7 shadow-[0_24px_48px_rgba(0,0,0,0.24)]">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:rgba(255,255,255,0.08)] text-[color:var(--color-text-tertiary)]">
            <Compass size={16} />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            404
          </p>
        </div>
        <h1 className="mt-4 text-[22px] leading-[1.18] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          길을 잃은 것 같아요.
        </h1>
        <p className="mt-3 text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
          존재하지 않는 페이지예요. 공유받은 링크가 오래됐거나 프로젝트 이름이
          바뀌었을 수 있어요. 아래 중 한 가지로 이어가세요.
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={openSearchOnHome}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[color:var(--color-indigo-brand)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          >
            <Search size={14} />
            프로젝트 검색으로 찾기
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[color:rgba(255,255,255,0.08)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            홈으로
          </Link>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <ArrowLeft size={13} />
            이전 화면으로
          </button>
        </div>
      </div>
    </main>
  );
}
