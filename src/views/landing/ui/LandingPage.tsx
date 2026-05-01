"use client";

import Link from "next/link";
import { useEffect, useState } from "react";
import { ArrowRight, FolderOpen, Orbit } from "lucide-react";
import { signInWithDemo } from "@/features/user-auth";
import { getDemoHomeHref } from "@/shared/config/demo-space";
import { cn } from "@/shared/lib/cn";
import { Button, buttonVariants } from "@/shared/ui";

interface Props {
  accountId?: string | null;
  next?: string | null;
}

function buildAuthHref(
  path: "/login" | "/signup",
  next?: string | null,
) {
  if (!next?.trim()) return path;
  const params = new URLSearchParams({ next: next.trim() });
  return `${path}?${params.toString()}`;
}

/**
 * Landing — `/` 에서 비로그인 사용자가 처음 보는 화면.
 *
 * 헌장 (`.claude/rules/local-first.md`): "로그인은 옵션, 폴더만 선택하면 즉시
 * 사용". 그래서 hero CTA 의 primary 는 *로컬 폴더 열기 흐름* (= /docs/) 이고,
 * 데모와 로그인은 보조 옵션. 마케팅 sections 은 제거 — README + 별도 docs 가
 * 그 역할을 맡는다.
 */
export function LandingPage({ next }: Props) {
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  const loginHref = buildAuthHref("/login", next);
  const hasReturnTarget = Boolean(next?.trim());

  const handleDemoOpen = async () => {
    setDemoSubmitting(true);
    setDemoError(null);
    try {
      await signInWithDemo();
      window.location.href = getDemoHomeHref();
    } catch (error) {
      setDemoError(
        error instanceof Error ? error.message : "데모 로그인에 실패했습니다.",
      );
    } finally {
      setDemoSubmitting(false);
    }
  };

  // 에러 메시지 6초 후 자동 해제 — 사용자가 재시도 할 수 있게.
  useEffect(() => {
    if (!demoError) return;
    const id = window.setTimeout(() => setDemoError(null), 6000);
    return () => window.clearTimeout(id);
  }, [demoError]);

  return (
    <main
      id="main"
      className="relative flex min-h-screen flex-col bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] md:px-10 md:py-10"
    >
      <header className="flex items-center justify-between">
        <div className="inline-flex items-center gap-2.5">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)]">
            <Orbit size={15} />
          </span>
          <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-text-tertiary)]">
            oh-my-ontology
          </span>
        </div>
        <Link
          href={loginHref}
          className="text-[13px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          로그인
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center gap-8 py-16">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
            {hasReturnTarget ? "권한이 필요한 화면" : "open-source ontology workbench"}
          </p>
          <h1 className="text-[clamp(2.4rem,5vw,4rem)] leading-[1.04] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
            {hasReturnTarget ? (
              <>
                로그인 후 <span className="text-[color:var(--color-indigo-accent)]">이어보기</span>
              </>
            ) : (
              <>
                마크다운에서 자라는<br />
                <span className="text-[color:var(--color-indigo-accent)]">지식 그래프</span>
              </>
            )}
          </h1>
          <p className="max-w-xl text-base leading-7 text-[color:var(--color-text-secondary)]">
            {hasReturnTarget
              ? "요청한 화면은 로그인이 필요합니다. 로그인하면 방금 열려던 화면으로 바로 돌아갑니다."
              : "마크다운 문서에서 개념·관계·근거를 추출해 토폴로지로 키우는 오픈소스 온톨로지 워크벤치. 로그인 없이 내 폴더 하나로 바로 시작 가능."}
          </p>
        </div>

        <div className="flex flex-wrap items-center gap-3">
          {hasReturnTarget ? (
            <Link
              href={loginHref}
              className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
            >
              로그인하고 계속
              <ArrowRight size={16} />
            </Link>
          ) : (
            <Link
              href="/docs/"
              className={cn(
                buttonVariants({ size: "lg" }),
                "rounded-full min-w-[14rem]",
              )}
            >
              <FolderOpen size={16} />
              내 마크다운 폴더 열기
            </Link>
          )}
          <Button
            type="button"
            variant="outline"
            size="lg"
            className="rounded-full"
            disabled={demoSubmitting}
            onClick={() => void handleDemoOpen()}
          >
            {demoSubmitting ? "데모 진입 중…" : "데모 지도 보기"}
          </Button>
        </div>

        {!hasReturnTarget && (
          <p className="text-[12px] text-[color:var(--color-text-quaternary)]">
            로컬 폴더는 디스크에만 저장되고 외부로 전송되지 않아요. 데이터는 사용자 디스크가 진실원입니다.
          </p>
        )}
        {demoError ? (
          <p className="text-sm text-[color:var(--color-status-danger)]" role="alert">
            {demoError}
          </p>
        ) : null}
      </section>
    </main>
  );
}
