"use client";

import Link from "next/link";
import { usePathname, useSearchParams } from "next/navigation";
import { useEffect, useMemo, useRef, useState } from "react";
import { BookOpen, ChevronDown, Compass, FolderKanban, LogOut, Moon, PlayCircle, Shield, Sun, UserRound } from "lucide-react";
import { useGlobalAdmin } from "@/features/permissions";
import { useScopedAccountAccess } from "@/features/account-scope";
import { buildServiceEntryHref, signInWithDemo, signOut } from "@/features/user-auth";
import { getDemoProjectsHref } from "@/shared/config/demo-space";
import { hasDemoSession } from "@/shared/lib/demo-session";
import { cn } from "@/shared/lib/cn";
import { useTheme } from "@/shared/lib/theme";

interface Props {
  accountId?: string | null;
  accountLabel?: string | null;
  className?: string;
  dismissToken?: number;
  onOpenChange?: (open: boolean) => void;
}

function resolveIdentityLabel(
  status: "loading" | "guest" | "active",
  user: {
    email?: string | null;
    displayName?: string | null;
  } | null,
) {
  if (status === "loading") return "확인 중";
  if (!user) return "내 정보";
  return user.displayName?.trim() || user.email?.trim() || "내 정보";
}

export function PublicAccountMenu({
  accountId,
  accountLabel,
  className,
  dismissToken,
  onOpenChange,
}: Props) {
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const { user } = useGlobalAdmin();
  const scopedAccess = useScopedAccountAccess(accountId);
  const [open, setOpen] = useState(false);
  const [demoLoading, setDemoLoading] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const menuStatus = useMemo(() => {
    if (scopedAccess.kind === "loading") return "loading" as const;
    if (scopedAccess.kind === "guest") return "guest" as const;
    return "active" as const;
  }, [scopedAccess.kind]);
  const visibleUser = scopedAccess.user ?? user;
  // hasDemoSession() 은 window.localStorage 를 읽으므로 SSR 결과(false)와
  // 클라이언트 첫 렌더(true) 사이에 hydration mismatch 가 발생한다.
  // mount 이후에만 true 가 되도록 gate 해서 SSR ↔ 첫 paint 가 동일하게
  // "확인 중" 또는 roleLabel 만 표시. mount 후에 "데모 체험 중" 으로 전환.
  const [hydrated, setHydrated] = useState(false);
  useEffect(() => {
    setHydrated(true);
  }, []);
  // Demo 세션은 Notion 모델 상 자기 공간 owner 권한을 받지만, UI 에서
  // "공간 소유자" 라 표기하면 "데모 뷰어" displayName 과 모순 ("viewer"
  // vs "owner"). 데모 맥락을 보존하면서 탐색 중임을 명시.
  const isDemoSession = hydrated && hasDemoSession();
  const statusCopy = useMemo(
    () => ({
      badge: isDemoSession ? "데모 체험 중" : scopedAccess.roleLabel,
    }),
    [isDemoSession, scopedAccess.roleLabel],
  );
  const identityLabel = useMemo(
    () => resolveIdentityLabel(menuStatus, visibleUser),
    [menuStatus, visibleUser],
  );
  const currentPath = useMemo(() => {
    const search = searchParams?.toString() ?? "";
    return `${pathname || "/"}${search ? `?${search}` : ""}`;
  }, [pathname, searchParams]);
  const loginHref = useMemo(() => {
    const url = new URL("/login", "http://local.test");
    url.searchParams.set("next", currentPath);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [accountId, currentPath]);
  const signupHref = useMemo(() => {
    const url = new URL("/signup", "http://local.test");
    url.searchParams.set("next", currentPath);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [accountId, currentPath]);
  const projectsHref = useMemo(() => {
    const url = new URL("/projects", "http://local.test");
    url.searchParams.set("returnTo", currentPath);
    return `${url.pathname}?${url.searchParams.toString()}`;
  }, [accountId, currentPath]);
  const accountSettingsHref = "/account";
  const docsVaultHref = "/docs/";
  const demoHref = getDemoProjectsHref();
  const settingsHref = scopedAccess.canManage
    ? "/projects/"
    : loginHref;
  const scopeLabel = accountLabel?.trim() || accountId?.trim() || null;
  const overviewHref = "/";
  const serviceEntryHref = buildServiceEntryHref();

  const handleDemoLogin = async () => {
    setDemoLoading(true);
    setDemoError(null);
    try {
      await signInWithDemo();
      setOpen(false);
      window.location.href = demoHref;
    } catch (error) {
      setDemoError(
        error instanceof Error ? error.message : "데모 로그인에 실패했습니다.",
      );
    } finally {
      setDemoLoading(false);
    }
  };

  useEffect(() => {
    if (!open) return;

    const handlePointerDown = (event: PointerEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(false);
      }
    };

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
      }
    };

    window.addEventListener("pointerdown", handlePointerDown);
    window.addEventListener("keydown", handleKeyDown);
    return () => {
      window.removeEventListener("pointerdown", handlePointerDown);
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [open]);

  useEffect(() => {
    const frame = window.requestAnimationFrame(() => {
      setOpen(false);
    });
    return () => {
      window.cancelAnimationFrame(frame);
    };
  }, [dismissToken]);

  useEffect(() => {
    onOpenChange?.(open);
  }, [onOpenChange, open]);

  return (
    <div ref={rootRef} className={cn("relative pointer-events-auto", className)}>
      <button
        type="button"
        onClick={() => setOpen((current) => !current)}
        className="inline-flex h-11 items-center gap-2 rounded-full border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3.5 text-left text-[color:var(--color-text-primary)] shadow-[0_10px_26px_rgba(0,0,0,0.14)] transition-[background-color,border-color,box-shadow,transform] duration-180 ease-out hover:border-[color:var(--color-border-strong)] hover:bg-[color:var(--color-panel)] hover:shadow-[0_14px_30px_rgba(0,0,0,0.2)] active:translate-y-[1px] active:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)] focus-visible:ring-offset-2 focus-visible:ring-offset-[color:var(--color-canvas)] motion-reduce:transition-none motion-reduce:transform-none"
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label="내 정보 메뉴 열기"
      >
        <span className="flex h-8 w-8 items-center justify-center rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-2)] text-[color:var(--color-text-secondary)]">
          <UserRound size={15} />
        </span>
        <span className="hidden min-w-0 sm:flex sm:flex-col">
          <span className="max-w-[11rem] truncate text-[13px] font-[var(--font-weight-signature)]">
            {identityLabel}
          </span>
          <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {statusCopy.badge}
          </span>
        </span>
        {scopeLabel && (
          <span className="hidden rounded-full border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.1)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.08em] text-[color:var(--color-indigo-accent)] lg:inline-flex">
            {scopeLabel}
          </span>
        )}
        <ChevronDown
          size={14}
          className={cn(
            "text-[color:var(--color-text-tertiary)] transition-transform",
            open && "rotate-180",
          )}
        />
      </button>

      {open && (
        <div
          role="menu"
          aria-label="내 정보 메뉴"
          className="absolute right-0 top-[calc(100%+0.75rem)] z-40 w-[min(20rem,calc(100vw-2rem))] overflow-hidden rounded-[20px] border border-[color:var(--color-divider)] bg-[color:rgba(11,12,14,0.98)] shadow-[0_28px_60px_rgba(0,0,0,0.34)]"
        >
          <div className="border-b border-[color:var(--color-border-soft)] px-4 py-4">
            <p className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {visibleUser?.displayName?.trim() || visibleUser?.email?.trim() || "로그인되지 않음"}
            </p>
            <div className="mt-3 inline-flex rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2.5 py-1 font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
              {statusCopy.badge}
            </div>
            {scopeLabel && (
              <p className="mt-3 text-xs leading-5 text-[color:var(--color-text-tertiary)]">
                현재 화면:{" "}
                <span className="text-[color:var(--color-text-primary)]">{scopeLabel}</span>
              </p>
            )}
          </div>

          <div className="px-3 py-3">
            <div className="rounded-[16px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-2">
              {scopeLabel && (
                <Link
                  href={overviewHref}
                  className="flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                    <span className="flex items-center gap-2">
                      <Compass size={15} className="text-[color:var(--color-text-tertiary)]" />
                    워크스페이스 지도
                  </span>
                </Link>
              )}
              {menuStatus !== "guest" && (
                <Link
                  href={projectsHref}
                  className={cn(
                    "flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]",
                    scopeLabel && "mt-1",
                  )}
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <span className="flex items-center gap-2">
                    <FolderKanban size={15} className="text-[color:var(--color-text-tertiary)]" />
                    프로젝트
                  </span>
                </Link>
              )}
              <Link
                href={docsVaultHref}
                className="mt-1 flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                role="menuitem"
                onClick={() => setOpen(false)}
              >
                <span className="flex items-center gap-2">
                  <BookOpen size={15} className="text-[color:var(--color-text-tertiary)]" />
                  문서 볼트
                </span>
                <span className="font-mono text-[9px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                  PKM
                </span>
              </Link>
              {menuStatus !== "guest" && (
                <Link
                  href={accountSettingsHref}
                  className="mt-1 flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <span className="flex items-center gap-2">
                    <UserRound size={15} className="text-[color:var(--color-text-tertiary)]" />
                    계정 설정
                  </span>
                </Link>
              )}
              {scopedAccess.canManage ? (
                <Link
                  href={settingsHref}
                  className="mt-1 flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:rgba(94,106,210,0.12)]"
                  role="menuitem"
                  onClick={() => setOpen(false)}
                >
                  <span className="flex items-center gap-2">
                    <Shield
                      size={15}
                      className="text-[color:var(--color-indigo-accent)]"
                    />
                    공간 관리
                  </span>
                </Link>
              ) : menuStatus === "guest" ? (
                <div className={cn(scopeLabel && "mt-1")}>
                  <Link
                    href={loginHref}
                    className="flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span className="flex items-center gap-2">
                      <UserRound size={15} className="text-[color:var(--color-text-tertiary)]" />
                      로그인
                    </span>
                  </Link>
                  <Link
                    href={signupHref}
                    className="mt-1 flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span className="flex items-center gap-2">
                      <Shield size={15} className="text-[color:var(--color-indigo-accent)]" />
                      회원가입
                    </span>
                  </Link>
                  <button
                    type="button"
                    className="mt-1 flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:rgba(94,106,210,0.08)]"
                    role="menuitem"
                    onClick={() => void handleDemoLogin()}
                    disabled={demoLoading}
                  >
                    <span className="flex items-center gap-2">
                      <PlayCircle size={15} className="text-[color:var(--color-indigo-accent)]" />
                      {demoLoading ? "데모 로그인 중..." : "데모 로그인"}
                    </span>
                  </button>
                  <Link
                    href={loginHref}
                    className="mt-1 flex items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                    role="menuitem"
                    onClick={() => setOpen(false)}
                  >
                    <span className="flex items-center gap-2">
                      <Shield size={15} className="text-[color:var(--color-text-tertiary)]" />
                      로그인
                    </span>
                  </Link>
                </div>
              ) : null}

              {/* 라이트/다크 토글 — 메뉴 닫지 않고 즉시 반영 */}
              <ThemeMenuRow />
              {menuStatus !== "guest" && (
                <button
                  type="button"
                  onClick={() => {
                    setOpen(false);
                    void (async () => {
                      await signOut();
                      window.location.assign(serviceEntryHref);
                    })();
                  }}
                  className="mt-1 flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                  role="menuitem"
                >
                  <span className="flex items-center gap-2">
                    <LogOut size={15} className="text-[color:var(--color-text-tertiary)]" />
                    로그아웃
                  </span>
                </button>
              )}
            </div>
            {demoError ? (
              <p className="px-2 pt-3 text-sm text-[color:var(--color-indigo-accent)]">
                {demoError}
              </p>
            ) : null}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 메뉴 안에 inline 으로 라이트/다크 토글 row. 클릭해도 메뉴를 닫지 않아
 * 사용자가 색 변화를 즉시 확인 가능. 다른 row 와 동일한 padding · radius.
 */
function ThemeMenuRow() {
  const [theme, setTheme] = useTheme();
  const isLight = theme === "light";
  return (
    <button
      type="button"
      role="menuitem"
      onClick={() => setTheme(isLight ? "dark" : "light")}
      aria-label={isLight ? "다크 모드로 전환" : "라이트 모드로 전환"}
      className="mt-1 flex w-full items-center justify-between rounded-[12px] px-3 py-3 text-sm text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
    >
      <span className="flex items-center gap-2">
        {isLight ? (
          <Moon size={15} className="text-[color:var(--color-text-tertiary)]" />
        ) : (
          <Sun size={15} className="text-[color:var(--color-text-tertiary)]" />
        )}
        테마
      </span>
      <span className="font-mono text-[10px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
        {isLight ? "라이트" : "다크"}
      </span>
    </button>
  );
}
