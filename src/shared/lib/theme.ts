"use client";

/**
 * 라이트/다크 테마 토글 헬퍼.
 *
 * - localStorage `aslan:theme` 에 'light' / 'dark' 저장.
 * - html element 의 `data-theme` 속성으로 globals.css 의 token override 적용.
 * - SSR 평가 시 항상 'dark' (정적 export 의 prerender 가 다크로 고정).
 *   첫 paint 직전에 app/layout.tsx 의 inline script 가 localStorage 를 읽어
 *   data-theme 을 미리 박아 줘 라이트 사용자도 flash 없이 첫 화면이 라이트.
 */

import { useEffect, useState } from "react";

export type Theme = "light" | "dark";

const STORAGE_KEY = "aslan:theme";

export function readStoredTheme(): Theme {
  if (typeof window === "undefined") return "dark";
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "light"
      ? "light"
      : "dark";
  } catch {
    return "dark";
  }
}

export function applyTheme(theme: Theme): void {
  if (typeof document === "undefined") return;
  if (theme === "light") {
    document.documentElement.setAttribute("data-theme", "light");
  } else {
    document.documentElement.removeAttribute("data-theme");
  }
}

export function persistTheme(theme: Theme): void {
  if (typeof window === "undefined") return;
  try {
    window.localStorage.setItem(STORAGE_KEY, theme);
  } catch {
    /* private 모드 등 — in-memory toggle 만 동작. */
  }
}

/**
 * 컴포넌트에서 쓸 hook. 마운트 시점에 localStorage 읽어 동기화.
 * setTheme 호출 시 dom + storage 둘 다 갱신.
 */
export function useTheme(): readonly [Theme, (next: Theme) => void] {
  const [theme, setThemeState] = useState<Theme>(() =>
    typeof window === "undefined" ? "dark" : readStoredTheme(),
  );

  useEffect(() => {
    const stored = readStoredTheme();
    setThemeState(stored);
    applyTheme(stored);
  }, []);

  const setTheme = (next: Theme) => {
    setThemeState(next);
    applyTheme(next);
    persistTheme(next);
  };

  return [theme, setTheme] as const;
}
