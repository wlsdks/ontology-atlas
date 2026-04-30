"use client";

import { Moon, Sun } from "lucide-react";
import { useTheme } from "@/shared/lib/theme";
import { cn } from "@/shared/lib/cn";

interface Props {
  className?: string;
}

/**
 * 라이트/다크 모드 토글 버튼. 한 글자짜리 icon 토글이라 상단 nav 의
 * "프로젝트 →" / "로그아웃" 옆에 자연스럽게 들어간다.
 */
export function ThemeToggle({ className }: Props) {
  const [theme, setTheme] = useTheme();
  const isLight = theme === "light";

  return (
    <button
      type="button"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
      title={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
      className={cn(
        "inline-flex h-8 w-8 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]",
        className,
      )}
    >
      {isLight ? <Moon size={14} aria-hidden /> : <Sun size={14} aria-hidden />}
    </button>
  );
}
