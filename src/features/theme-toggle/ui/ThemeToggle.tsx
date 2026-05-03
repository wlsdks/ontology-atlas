"use client";

import { useEffect, useState } from "react";
import { Moon, Sun } from "lucide-react";
import { useTranslations } from "next-intl";
import { useTheme } from "@/shared/lib/theme";
import { cn } from "@/shared/lib/cn";

interface Props {
  className?: string;
}

/**
 * 라이트/다크 모드 토글 버튼. 한 글자짜리 icon 토글이라 상단 nav 의
 * locale switch / projects link 같은 보조 액션 옆에 자연스럽게 들어간다.
 *
 * SSR/CSR 시 \`useTheme\` 의 첫 paint 값이 다를 수 있어 (서버 = 'dark',
 * 클라이언트 = localStorage 값) icon / aria-label 의 hydration mismatch 가
 * 발생. mount 전에는 invisible placeholder 만 노출해 방지 — 첫 useEffect 후
 * theme 값으로 swap.
 */
export function ThemeToggle({ className }: Props) {
  const t = useTranslations("featuresMisc.themeToggle");
  const [theme, setTheme] = useTheme();
  const [mounted, setMounted] = useState(false);
  useEffect(() => {
    setMounted(true);
  }, []);
  const isLight = theme === "light";
  const switchLabel = isLight ? t("switchToDark") : t("switchToLight");

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={mounted ? switchLabel : t("fallbackLabel")}
      title={mounted ? switchLabel : undefined}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]",
        className,
      )}
    >
      {/* mount 전엔 invisible placeholder (sr-only) — SSR 출력과 동일 슬롯 */}
      {!mounted ? (
        <span className="h-3.5 w-3.5" aria-hidden />
      ) : isLight ? (
        <Moon size={14} aria-hidden />
      ) : (
        <Sun size={14} aria-hidden />
      )}
    </button>
  );
}
