"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { ArrowLeft, Compass, Search } from "lucide-react";
import koMessages from "@/messages/ko.json";
import enMessages from "@/messages/en.json";

/**
 * 404 안내. 사용자가 잘못된 링크로 들어왔을 때 막다른 느낌 없이 3가지
 * 길을 즉시 안내한다.
 *
 * Root layout 에는 NextIntlClientProvider 가 마운트되지 않아 useTranslations
 * 가 동작하지 않고, output:'export' + Turbopack 환경에서는 `[locale]/
 * not-found.tsx` 가 trigger 되지 않을 수 있다. 그래서 이 root not-found 가
 * 모든 미해결 경로의 단일 진입점이 된다.
 * locale 은 URL 첫 segment 로 client-side 감지 (`/ko/...` → ko).
 * messages JSON 을 직접 import — useTranslations 우회로 i18n 일관성 유지.
 */
const LOCALE_MESSAGES = { ko: koMessages, en: enMessages } as const;
type SupportedLocale = keyof typeof LOCALE_MESSAGES;
const subscribeStaticSnapshot = () => () => undefined;

function detectLocale(): SupportedLocale {
  if (typeof window === "undefined") return "en";
  const segment = window.location.pathname.split("/")[1];
  return segment === "ko" ? "ko" : "en";
}

export default function NotFound() {
  const router = useRouter();
  const locale = useSyncExternalStore<SupportedLocale>(
    subscribeStaticSnapshot,
    detectLocale,
    () => "en",
  );
  const t = LOCALE_MESSAGES[locale].notFound;

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
        window.sessionStorage.setItem("demo:open-search", "1");
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
      <div className="w-full max-w-[440px] rounded-[22px] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-7 shadow-[0_24px_48px_rgba(0,0,0,0.24)]">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
            <Compass size={16} />
          </span>
          <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t.label}
          </p>
        </div>
        <h1 className="mt-4 text-[22px] leading-[1.18] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t.title}
        </h1>
        <p className="mt-3 text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
          {t.body}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={openSearchOnHome}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[color:var(--color-indigo-brand)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          >
            <Search size={14} />
            {t.findByProject}
          </button>
          <Link
            href={`/${locale}/`}
            className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--color-divider)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t.home}
          </Link>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <ArrowLeft size={13} />
            {t.previous}
          </button>
        </div>
      </div>
    </main>
  );
}
