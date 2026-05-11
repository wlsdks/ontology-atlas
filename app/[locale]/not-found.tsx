"use client";

import { useRouter } from "next/navigation";
import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Compass, Search } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * 로케일 segment 안에서 404. NextIntlClientProvider 가 layout.tsx 에 마운트되어
 * 있으므로 useTranslations 사용 가능. root not-found.tsx 는 [locale] 외부 라우트
 * 진입 시 last-resort 영어 fallback 으로 남겨둔다.
 */
export default function LocaleNotFound() {
  const router = useRouter();
  const t = useTranslations("notFound");

  // 모바일 BottomTabBar 가 동시에 보이면 카드의 3가지 출구가 흐려진다.
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
            {t("label")}
          </p>
        </div>
        <h1 className="mt-4 text-[22px] leading-[1.18] tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h1>
        <p className="mt-3 text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
          {t("body")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          <button
            type="button"
            onClick={openSearchOnHome}
            className="inline-flex h-10 items-center justify-center gap-2 rounded-full bg-[color:var(--color-indigo-brand)] px-4 text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-opacity hover:opacity-90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.5)]"
          >
            <Search size={14} />
            {t("findByProject")}
          </button>
          <Link
            href="/"
            className="inline-flex h-10 items-center justify-center rounded-full border border-[color:var(--color-divider)] px-4 text-[13px] text-[color:var(--color-text-secondary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            {t("home")}
          </Link>
          <button
            type="button"
            onClick={goBack}
            className="inline-flex h-10 items-center justify-center gap-1.5 rounded-full text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
          >
            <ArrowLeft size={13} />
            {t("previous")}
          </button>
        </div>
      </div>
    </main>
  );
}
