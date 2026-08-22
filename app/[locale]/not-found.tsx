"use client";

import { useEffect } from "react";
import { useTranslations } from "next-intl";
import { ArrowLeft, Compass, Search } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link, useRouter } from "@/i18n/navigation";
import { Button, buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";

/**
 * A 404 inside a locale segment. `NextIntlClientProvider` is mounted in layout.tsx, so
 * `useTranslations` works here. The root `not-found.tsx` stays as the last-resort English fallback
 * for routes outside `[locale]`.
 *
 * The router is the locale-aware one from `@/i18n/navigation` — `router.push('/')` preserves the
 * current locale prefix, so a Korean user routes to `/ko/` rather than `/`. The raw router from
 * `next/navigation` is used only for deliberately cross-locale moves such as the locale switch
 * (`.claude/rules/architecture.md`).
 */
export default function LocaleNotFound() {
  const router = useRouter();
  const t = useTranslations("notFound");

  // With the mobile BottomTabBar visible at the same time, the card's three exits lose their clarity.
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
            <Compass size={ICON_SIZE.lg} />
          </span>
          <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)]">
            {t("label")}
          </p>
        </div>
        <h1 className="mt-4 text-display tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h1>
        {/*
         * `break-keep` — the same paragraph and the same prescription as the root not-found
         * (measured 2026-08-12: 「바뀌었|을」 at a real width of 382px). The two 404s are twins, so
         * fixing one alone makes them diverge.
         */}
        <p className="mt-3 break-keep text-body leading-body text-[color:var(--color-text-secondary)]">
          {t("body")}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {/* Three exits = three variants of the standard button (primary/outline/ghost). The
              hand-written rounded-full dialect used `--color-text-primary` on filled indigo
              (composite 4.42:1, below AA) and an opacity dialect for hover — normalized onto the
              `<Button>` grammar the gateway already uses (2026-08-04). */}
          <Button type="button" variant="primary" onClick={openSearchOnHome}>
            <Search size={ICON_SIZE.md} />
            {t("findByProject")}
          </Button>
          {/* Raw `buttonVariants` leaves both the base `border-transparent` and the variant's border,
              and CSS source order lets transparent win (measured) — merge through `cn` as the Button
              component does. */}
          <Link href="/" className={cn(buttonVariants({ variant: "outline" }))}>
            {t("home")}
          </Link>
          <Button type="button" variant="ghost" onClick={goBack}>
            <ArrowLeft size={ICON_SIZE.md} />
            {t("previous")}
          </Button>
        </div>
      </div>
    </main>
  );
}
