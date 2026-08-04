"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Compass, Search } from "lucide-react";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

/**
 * 로케일 segment 안에서 404. NextIntlClientProvider 가 layout.tsx 에 마운트되어
 * 있으므로 useTranslations 사용 가능. root not-found.tsx 는 [locale] 외부 라우트
 * 진입 시 last-resort 영어 fallback 으로 남겨둔다.
 *
 * router 는 `@/i18n/navigation` 의 locale-aware 버전을 사용 — `router.push('/')`
 * 가 자동으로 현재 locale prefix 를 보존해 ko 사용자가 `/` 가 아닌 `/ko/` 로
 * 라우팅. `next/navigation` 의 raw router 는 cross-locale 이동 (locale-switch)
 * 처럼 의도적으로 prefix 를 무시할 때만 사용 (`.claude/rules/architecture.md`).
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
      <div className="w-full max-w-[440px] rounded-[var(--radius-panel)] border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-7 shadow-[var(--shadow-elevation-2)]">
        <div className="flex items-center gap-2">
          <span className="flex h-8 w-8 items-center justify-center rounded-[var(--radius-chip)] border border-[color:var(--color-divider)] text-[color:var(--color-text-tertiary)]">
            <Compass size={16} />
          </span>
          <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {t("label")}
          </p>
        </div>
        <h1 className="mt-4 text-display tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h1>
        <p className="mt-3 text-body leading-relaxed text-[color:var(--color-text-secondary)]">
          {t("body")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {/* 세 출구 = 표준 버튼의 3변형(primary/outline/ghost). 손으로 쓴
              rounded-full 방언은 채운 인디고 위 잉크가 `--color-text-primary`
              (합성 4.42:1, AA 미달)였고 호버가 opacity 방언이었다 — 관문이 이미
              쓰는 `<Button>` 문법으로 정규화 (2026-08-04 체계석). */}
          <Button type="button" variant="primary" onClick={openSearchOnHome}>
            <Search size={14} />
            {t("findByProject")}
          </Button>
          {/* raw buttonVariants 는 base 의 border-transparent 와 변형 보더가 둘 다 남아
              CSS 소스 순서가 투명을 이긴다(실측) — Button 컴포넌트처럼 cn 으로 병합한다. */}
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("home")}
          </Link>
          <Button type="button" variant="ghost" onClick={goBack}>
            <ArrowLeft size={13} />
            {t("previous")}
          </Button>
        </div>
      </div>
    </main>
  );
}
