"use client";

import Link from "next/link";
import { Button, buttonVariants } from "@/shared/ui/button";
import { cn } from "@/shared/lib/cn";
import { useRouter } from "next/navigation";
import { useEffect, useSyncExternalStore } from "react";
import { ArrowLeft, Compass, Search } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import koMessages from "@/messages/ko.json";
import enMessages from "@/messages/en.json";

/**
 * The 404 page. When someone arrives from a bad link it offers three ways out immediately, so it
 * does not feel like a dead end.
 *
 * The root layout does not mount NextIntlClientProvider, so `useTranslations` does not work, and
 * under `output: 'export'` with Turbopack `[locale]/not-found.tsx` may not be triggered at all.
 * So this root not-found is the single entry point for every unresolved path.
 * The locale is detected client-side from the URL's first segment (`/ko/...` → ko), and the message
 * JSON is imported directly — bypassing `useTranslations` while keeping i18n consistent.
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

  // The 404 surface shows only the dead-end card. With the mobile BottomTabBar visible at the same
  // time, "where to go" is split across two places and the clarity of the card's three exits is
  // lost. A body data attribute lets BottomTabBar hide itself (the CSS rule is in globals.css).
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
            {t.label}
          </p>
        </div>
        <h1 className="mt-4 text-display tracking-[var(--tracking-section)] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t.title}
        </h1>
        {/*
         * `break-keep` — **Korean trips the reader when it breaks mid-word** (measured 2026-08-12).
         *
         * This paragraph broke as 「changed|to be」 in a 440px card (382px real width). Instrument: a
         * `Range` per character reveals the characters on either side of the line break — both
         * Korean with no space means mid-word. The cause is `word-break: normal`, and this
         * repository already used `break-keep` elsewhere.
         */}
        <p className="mt-3 break-keep text-body leading-body text-[color:var(--color-text-secondary)]">
          {t.body}
        </p>
        <div className="mt-5 flex flex-col gap-2">
          {/* Normalized the same way as [locale]/not-found — the three exits are three variants of
              the standard button. The old rounded-full dialect used ink below AA on filled indigo
              (4.42:1). Raw `buttonVariants` still conflicts with the base `border-transparent`, so
              it is merged through `cn`. */}
          <Button type="button" variant="primary" onClick={openSearchOnHome}>
            <Search size={ICON_SIZE.md} />
            {t.findByProject}
          </Button>
          <Link href={`/${locale}/`} className={cn(buttonVariants({ variant: "outline" }))}>
            {t.home}
          </Link>
          <Button type="button" variant="ghost" onClick={goBack}>
            <ArrowLeft size={ICON_SIZE.md} />
            {t.previous}
          </Button>
        </div>
      </div>
    </main>
  );
}
