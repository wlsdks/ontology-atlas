"use client";

import dynamic from "next/dynamic";
import Link from "next/link";
import { motion } from "framer-motion";
import { useEffect, useMemo, useState } from "react";
import { useMediaQuery } from "usehooks-ts";
import {
  ArrowRight,
  LockKeyhole,
  Orbit,
  Plug,
  Radio,
  Sparkles,
  Terminal,
  Waypoints,
  Zap,
} from "lucide-react";
import { signInWithDemo } from "@/features/user-auth";
import { resolveFallbackProjects } from "@/entities/project";
import { getDemoHomeHref, getDemoStats } from "@/shared/config/demo-space";
// 데모 진입 라우팅 + Stats 는 getDemoStats() 가 진실원.
import { appendAccountQuery, resolveAccountId } from "@/shared/lib/account-scope";
import { cn } from "@/shared/lib/cn";
import { Button, buttonVariants } from "@/shared/ui";

// 랜딩 hero 의 배경 레이어 — 실제 제품 (토폴로지) 을 보여주는 drift 캔버스.
// ssr: false 로 초기 번들에서 분리, 브라우저에서만 렌더.
const SigmaTopology = dynamic(
  () => import("@/widgets/topology-map-sigma").then((m) => m.SigmaTopology),
  { ssr: false },
);

interface Props {
  accountId?: string | null;
  next?: string | null;
}

function buildAuthHref(
  path: "/login" | "/signup",
  accountId?: string | null,
  next?: string | null,
) {
  const url = new URL(appendAccountQuery(path, accountId), "http://local.test");
  if (next?.trim()) {
    url.searchParams.set("next", next.trim());
  }
  return `${url.pathname}${url.search}`;
}

export function LandingPage({ accountId, next }: Props) {
  const [demoSubmitting, setDemoSubmitting] = useState(false);
  const [demoError, setDemoError] = useState<string | null>(null);
  // SigmaTopology 배경은 md+ 에서만 display:block 으로 보이지만 React 는
  // display:none 에서도 컴포넌트를 마운트한다. Sigma 는 width 0 container
  // 에 attach 하면 "Container has no width" 로 throw → Landing 전체 크래시.
  // 따라서 render 자체를 viewport 크기로 gate: md(768px) 이상에서만 mount.
  // initializeWithValue=false → SSR 동안 false 반환 후 mount 시 갱신 (hydration mismatch 회피).
  const isDesktop = useMediaQuery("(min-width: 768px)", {
    initializeWithValue: false,
  });
  const loginHref = useMemo(
    () => buildAuthHref("/login", accountId, next),
    [accountId, next],
  );
  const signupHref = useMemo(
    () => buildAuthHref("/signup", accountId, next),
    [accountId, next],
  );
  const scopeLabel = resolveAccountId(accountId ?? null);
  const hasReturnTarget = Boolean(next?.trim());
  // hero 배경 토폴로지용 샘플 프로젝트 — SEED 기반 fallback 을 재사용해
  // 실제 제품 느낌의 그래프를 즉시 보여준다. 외부 네트워크 요청 없음.
  const heroProjects = useMemo(() => resolveFallbackProjects(), []);
  // 데모 워크스페이스 실측 통계 — CTA·Stats·안내 카피의 단일 진실원.
  // 진입 후 워크스페이스 헤더가 보여주는 숫자와 일치해야 한다.
  const demoStats = useMemo(() => getDemoStats(), []);
  const formatCount = (n: number) => n.toLocaleString("en-US");

  const handleDemoLogin = async () => {
    setDemoSubmitting(true);
    setDemoError(null);
    try {
      await signInWithDemo();
      // 데모 로그인 후 바로 워크스페이스 지도 (Layer 0) 로. 프로젝트 목록은
      // 좌상단 카드에서 접근 가능하므로 첫 경험은 "전체 조망" 으로 시작.
      window.location.href = getDemoHomeHref();
    } catch (error) {
      setDemoError(
        error instanceof Error ? error.message : "데모 로그인에 실패했습니다.",
      );
    } finally {
      setDemoSubmitting(false);
    }
  };

  // 에러 메시지 6초 후 자동 해제 — 사용자가 재시도 할 수 있게. 에러가 남아
  // 있는 동안 재시도 해도 handleDemoLogin 에서 setDemoError(null) 로 즉시 리셋.
  useEffect(() => {
    if (!demoError) return;
    const id = window.setTimeout(() => setDemoError(null), 6000);
    return () => window.clearTimeout(id);
  }, [demoError]);

  return (
    <main
      id="main"
      className="relative min-h-screen overflow-x-hidden bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] md:px-10 md:py-10"
    >
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-90"
        style={{
          backgroundImage: [
            "radial-gradient(circle at 12% 18%, rgba(94,106,210,0.22), transparent 26%)",
            "radial-gradient(circle at 82% 14%, var(--color-divider), transparent 18%)",
            "radial-gradient(circle at 72% 72%, rgba(94,106,210,0.14), transparent 24%)",
            "linear-gradient(180deg, var(--color-overlay-1), transparent 24%)",
          ].join(","),
        }}
      />
      <div
        aria-hidden="true"
        className="pointer-events-none absolute inset-0 opacity-35"
        style={{
          backgroundImage:
            "linear-gradient(rgba(255,255,255,0.045) 1px, transparent 1px), linear-gradient(90deg, var(--color-overlay-2) 1px, transparent 1px)",
          backgroundSize: "160px 160px",
          maskImage:
            "linear-gradient(180deg, rgba(0,0,0,0.95), rgba(0,0,0,0.65) 44%, transparent 100%)",
        }}
      />

      {/* 랜딩 hero 배경 — 실제 제품(토폴로지) 이 천천히 drift. product-first
          hero 패턴 (Linear/Vercel/Cursor 참고). pointer-events 는 끊어
          클릭·드래그 불가, 시각적 자극만. 우측으로 치우쳐 좌측 카피와
          겹치지 않게. opacity·mask 로 주변과 부드럽게 섞이도록.
          opacity 0.6 → 0.78, mask alpha 강화 해 "배경" 이 아니라
          "제품 증거" 로 읽히게. 여전히 카피 가독성은 mask outer 로 보호. */}
      {isDesktop && (
        <div
          aria-hidden="true"
          className="pointer-events-none absolute inset-y-0 right-0 w-[72%] opacity-[0.78]"
          style={{
            maskImage:
              "radial-gradient(ellipse at 68% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.45) 60%, transparent 82%)",
            WebkitMaskImage:
              "radial-gradient(ellipse at 68% 50%, rgba(0,0,0,1) 0%, rgba(0,0,0,0.85) 30%, rgba(0,0,0,0.45) 60%, transparent 82%)",
          }}
        >
          <SigmaTopology projects={heroProjects} categories={[]} minimal />
        </div>
      )}

      {/*
        flex justify-between + min-h-[calc(100vh-4rem)] 은 모바일에서
        hero·Why·Coming soon 사이에 ~800px 빈 gap 을 만들었다 (4 자식이
        viewport 를 채우려 분산되며). 마케팅 페이지는 콘텐츠가 길어
        강제 viewport-fill 이 필요 없으므로 자연 흐름 + section 별
        mt-* 만으로 간격을 잡는다.
      */}
      <div className="relative mx-auto flex w-full max-w-7xl flex-col">
        <header className="flex flex-wrap items-center justify-between gap-4">
          <div className="inline-flex items-center gap-2.5">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)]">
              <Orbit size={15} />
            </span>
            <span className="font-mono text-[11px] uppercase tracking-[0.18em] text-[color:var(--color-text-tertiary)]">
              Demo
            </span>
            {scopeLabel ? (
              <span className="ml-2 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                {scopeLabel}
              </span>
            ) : null}
          </div>
          {/* 재방문자 빠른 진입 — hero CTA 와 같은 인디고 fill, 작은 사이즈로 헤더에 맞춤. */}
          <Link href={loginHref} className={cn(buttonVariants({ size: "sm" }), "rounded-full")}>
            로그인
            <ArrowRight size={14} />
          </Link>
        </header>

        <section className="mt-10 grid gap-8 lg:grid-cols-[minmax(0,1fr)_26rem] lg:items-end">
          <div className="space-y-7">
            <motion.div
              className="space-y-4"
              initial={{ opacity: 0, y: 16 }}
              animate={{ opacity: 1, y: 0 }}
              transition={{ duration: 0.5, ease: "easeOut" }}
            >
              <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
                {hasReturnTarget ? "권한이 필요한 화면" : "AI-native project map"}
              </p>
              <div className="max-w-3xl">
                <h1 className="text-[clamp(3rem,7vw,6.4rem)] leading-[0.94] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
                  {hasReturnTarget ? (
                    <>
                      로그인 후
                      <br />
                      <span className="text-[color:var(--color-indigo-accent)]">이어보기</span>
                    </>
                  ) : (
                    <>
                      모든 컨텍스트를
                      <br />
                      <span className="text-[color:var(--color-indigo-accent)]">하나</span>로
                    </>
                  )}
                </h1>
              </div>
              <p className="max-w-xl text-base leading-7 text-[color:var(--color-text-secondary)] md:text-lg md:leading-8">
                {hasReturnTarget
                  ? "요청한 화면은 내 공간 권한이 필요합니다. 로그인하면 방금 열려던 화면으로 바로 돌아갑니다."
                  : "문서·프로젝트·허브·노드 — 흩어진 컨텍스트를 한 장의 지도로 묶습니다. 팀 전체가 한 화면에서 “지금 무엇이 어디에 연결됐는지” 를 같이 봅니다."}
              </p>
            </motion.div>

            {/*
              CTA 위계 (토스/Linear 스타일 — primary 1 + secondary 1):
                1. 데모 지도 열기 (primary) — 제품을 *지금* 경험하는 것이 최우선.
                   진입 후 보이는 워크스페이스 헤더가 같은 숫자(컨테이너+프로젝트)
                   를 노출하도록 demoStats 한 곳에서 derive.
                2. 내 공간 만들기 (outline) — 진짜 사용할 사람 경로.
              "로그인" 은 헤더 우측 ghost 링크로 이동 (재방문자는 거기서 찾음).
            */}
            <div className="flex flex-wrap items-center gap-3">
              {hasReturnTarget ? (
                <Link
                  href={loginHref}
                  className={cn(
                    buttonVariants({ size: "lg" }),
                    "min-w-[12rem] rounded-full",
                  )}
                >
                  로그인하고 계속
                  <ArrowRight size={16} />
                </Link>
              ) : (
                <Button
                  type="button"
                  size="lg"
                  className="min-w-[14rem] rounded-full"
                  disabled={demoSubmitting}
                  onClick={() => void handleDemoLogin()}
                >
                  {demoSubmitting
                    ? "데모 로그인 중…"
                    : `데모 지도 열기 · ${demoStats.totalContainers} 컨테이너`}
                  {!demoSubmitting && <ArrowRight size={16} />}
                </Button>
              )}
              <Link
                href={signupHref}
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "rounded-full",
                )}
              >
                내 공간 만들기
              </Link>
            </div>
            {hasReturnTarget ? (
              <button
                type="button"
                className="mt-3 text-[12px] text-[color:var(--color-text-quaternary)] underline-offset-4 transition-colors hover:text-[color:var(--color-text-secondary)] hover:underline focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(94,106,210,0.46)]"
                disabled={demoSubmitting}
                onClick={() => void handleDemoLogin()}
              >
                {demoSubmitting ? "데모 로그인 중…" : "로그인 없이 데모 공간 먼저 보기"}
              </button>
            ) : (
              <p className="mt-3 text-[12px] text-[color:var(--color-text-quaternary)]">
                데모는 실제 로그인된 사용자로 들어가 {demoStats.workspaceName} 공간의 고밀도 데이터를 탐색합니다. 가입 없이 바로 열림.
              </p>
            )}
            {demoError ? (
              <p className="mt-3 text-sm text-[color:var(--color-indigo-accent)]" role="alert">
                {demoError}
              </p>
            ) : null}

            {/* Stats 1 줄 — 실제 데모 데이터 규모. Live topology 배경의 "이게
                그냥 mock 이 아니다" 증거로 작동. FLOW 카드는 HOW IT WORKS 와
                중복이라 제거. */}
            {!hasReturnTarget && (
              <motion.dl
                className="mt-8 grid max-w-2xl grid-cols-2 gap-x-8 gap-y-4 sm:grid-cols-4"
                initial={{ opacity: 0, y: 12 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true, amount: 0.25 }}
                transition={{ duration: 0.45, ease: "easeOut" }}
              >
                <InlineStat value={formatCount(demoStats.totalProjects)} label="프로젝트" />
                <InlineStat value={formatCount(demoStats.totalHubs)} label="허브" />
                <InlineStat value={formatCount(demoStats.totalContainers)} label="컨테이너" />
                <InlineStat value={demoStats.workspaceName} label="데모 공간" mono />
              </motion.dl>
            )}
          </div>

          <motion.div
            className="relative"
            initial={{ opacity: 0, y: 28 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, ease: "easeOut", delay: 0.08 }}
          >
            <div className="absolute -left-6 top-10 hidden h-[78%] w-px bg-[linear-gradient(180deg,rgba(94,106,210,0.0),rgba(94,106,210,0.8),var(--color-divider),rgba(94,106,210,0.0))] lg:block" />
            <div className="rounded-[40px] border border-[color:var(--color-divider)] bg-[linear-gradient(180deg,var(--color-backdrop-strong),var(--color-backdrop-strong))] p-6 shadow-[0_34px_80px_rgba(0,0,0,0.36)]">
              {hasReturnTarget ? (
                <div className="rounded-[24px] border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.08)] px-5 py-5">
                  <div className="flex items-center gap-3">
                    <span className="flex h-10 w-10 items-center justify-center rounded-full border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)]">
                      <LockKeyhole size={16} />
                    </span>
                    <div>
                      <p className="text-sm text-[color:var(--color-text-primary)]">
                        로그인하면 원래 보던 화면으로 돌아갑니다.
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--color-text-tertiary)]">
                        보호된 화면이라 로그인 후 이어서 확인할 수 있습니다.
                      </p>
                    </div>
                  </div>
                </div>
              ) : (
                <>
                  <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
                    How it works
                  </p>
                  <div className="mt-6 space-y-4">
                    <StepCard
                      index="01"
                      title="맥락을 그대로 붙이기"
                      body="기획 메모·결정 기록·운영 가이드를 그대로 올리면 AI 가 프로젝트·허브·연결을 바로 읽어냅니다."
                    />
                    <StepCard
                      index="02"
                      title="반영 전 한 번 더 확인"
                      body="AI 가 제안한 연결을 팀 언어로 검토한 뒤, 승인한 항목만 공개 지도에 반영합니다."
                    />
                    <StepCard
                      index="03"
                      title="한 지도에서 같이 보기"
                      body="전체 토폴로지·허브 중심 뷰·1-hop 이웃 뷰 세 시선으로 “무엇이 어디와 연결됐나” 를 팀이 같이 읽습니다."
                    />
                  </div>
                </>
              )}
            </div>
          </motion.div>
        </section>

        {/* 왜 지도인가? — Stats row 아래 비어 있던 공간에 3-column value prop.
            hero 의 추상 카피 ("흩어진 컨텍스트를...") 를 구체적 before/after 로
            풀어서, "이게 왜 나에게 필요한지" 를 1 scroll 안에 답하게 한다.
            L-5 빈 카드를 실 value prop 로 대체. 디자인 토큰: 무채색 패널 + 얇은
            구분선, 아이콘은 기존 lucide set 재사용. */}
        {!hasReturnTarget && (
          <motion.section
            aria-labelledby="why-heading"
            className="mt-20"
            initial={{ opacity: 0, y: 20 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.5, ease: "easeOut" }}
          >
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
              Why
            </p>
            <h2
              id="why-heading"
              className="text-[clamp(1.5rem,3vw,2.2rem)] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)]"
            >
              왜 지도로 보는 거야?
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-[color:var(--color-text-secondary)] md:text-base md:leading-7">
              문서·코드·대화가 따로 도는 팀에서 &ldquo;지금 뭐가 어디에 연결됐지?&rdquo; 는
              대답 못 하는 질문이 됩니다. Demo 는 그 질문을 한 장의 지도로 바꿉니다.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <ValueCard
              icon={<Waypoints size={18} />}
              eyebrow="Before"
              title="흩어진 맥락이 한 장에"
              body="Notion·Jira·Drive 에 따로 쌓인 기획·설계·운영 기록을 그대로 올리면, 프로젝트와 허브가 실제 연결 관계로 이어져 한 화면에 정렬됩니다."
            />
            <ValueCard
              icon={<Sparkles size={18} />}
              eyebrow="During"
              title="문서만 있으면 구조가 보임"
              body="AI 가 문서에서 프로젝트·허브·서비스·의존 관계를 추출해 후보로 제시합니다. 팀은 반영 전에 한 번 검토하고, 맞는 것만 공개 지도에 올립니다."
            />
            <ValueCard
              icon={<Orbit size={18} />}
              eyebrow="After"
              title="팀이 같은 시선으로 읽음"
              body="전체 토폴로지·허브 중심 뷰·1-hop 이웃 뷰 — 세 시선으로 지도를 같이 보면서, 의사결정·리팩터·온보딩 할 때 맥락을 매번 다시 설명하지 않아도 됩니다."
            />
          </div>
          </motion.section>
        )}

        {/* 엔드게임 티저 — 개발 중 프로젝트에서 MCP/API 로 docs 를 쏘면
            실시간 토폴로지 반영 + 팀 presence overlay 라는 차별점을 미리 약속.
            M2 · M3 · M4 세 장 카드. 디자인 토큰 엄수 (무채색 + 단일 인디고). */}
        {!hasReturnTarget && (
          <motion.section
            aria-labelledby="roadmap-heading"
            className="mt-16"
            initial={{ opacity: 0, y: 24 }}
            whileInView={{ opacity: 1, y: 0 }}
            viewport={{ once: true, amount: 0.2 }}
            transition={{ duration: 0.55, ease: "easeOut" }}
          >
          <div className="flex flex-col gap-2">
            <p className="font-mono text-[10px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
              Coming soon
            </p>
            <h2
              id="roadmap-heading"
              className="text-[clamp(1.5rem,3vw,2.2rem)] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)]"
            >
              쓰는 순간 지도에 반영되는 워크플로
            </h2>
            <p className="max-w-2xl text-sm leading-6 text-[color:var(--color-text-secondary)] md:text-base md:leading-7">
              문서, 커맨드, 에디터 어디에서든 프로젝트 변화를 보내면 Demo 가 받아 토폴로지에 바로 반영합니다. 팀이 한 지도에서 &ldquo;지금 누가 무엇을 어디에서&rdquo; 같이 봅니다.
            </p>
          </div>
          <div className="mt-6 grid gap-4 md:grid-cols-3">
            <RoadmapCard
              milestone="M2"
              icon={<Zap size={18} />}
              title="HTTP API"
              body="POST /api/v1/docs — curl 한 줄로 md 를 쏘면 extraction 파이프라인이 즉시 받아 처리합니다."
            />
            <RoadmapCard
              milestone="M3"
              icon={<Terminal size={18} />}
              title="MCP 서버"
              body="project-demo-mcp — Claude Code · Cursor 같은 AI 에디터에서 tool 로 붙여 지도를 자연어로 조회·업데이트."
            />
            <RoadmapCard
              milestone="M4"
              icon={<Radio size={18} />}
              title="실시간 presence"
              body="노드 위에 '작업 중 · 누가' 오버레이. 팀원 커서가 지도 위에서 흐릅니다."
            />
          </div>
          <p className="mt-4 text-[11px] text-[color:var(--color-text-quaternary)]">
            <Plug size={10} className="mr-1 inline-block -translate-y-[1px]" />
            M1 (현재 루프) · 온보딩·UX 허들 제거가 완료되면 순차 오픈. 로드맵은 진행 상황에 따라 조정됩니다.
          </p>
          </motion.section>
        )}
      </div>
    </main>
  );
}

function RoadmapCard({
  milestone,
  icon,
  title,
  body,
}: {
  milestone: string;
  icon: React.ReactNode;
  title: string;
  body: string;
}) {
  return (
    <article className="group flex flex-col gap-3 rounded-[24px] border border-[color:var(--color-divider)] bg-[color:rgba(11,12,14,0.76)] px-5 py-5 transition-colors hover:border-[color:rgba(94,106,210,0.3)]">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.1)] text-[color:var(--color-indigo-accent)]">
          {icon}
        </span>
        <span className="rounded-full border border-[color:rgba(94,106,210,0.25)] bg-[color:rgba(94,106,210,0.08)] px-2 py-0.5 font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-indigo-accent)]">
          {milestone}
        </span>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {title}
        </h3>
        <p className="text-[12.5px] leading-6 text-[color:var(--color-text-tertiary)]">
          {body}
        </p>
      </div>
    </article>
  );
}

function ValueCard({
  icon,
  eyebrow,
  title,
  body,
}: {
  icon: React.ReactNode;
  eyebrow: string;
  title: string;
  body: string;
}) {
  return (
    <article className="flex flex-col gap-3 rounded-[24px] border border-[color:var(--color-divider)] bg-[color:rgba(11,12,14,0.76)] px-5 py-5 transition-colors hover:border-[color:rgba(94,106,210,0.3)]">
      <div className="flex items-center justify-between">
        <span className="flex h-9 w-9 items-center justify-center rounded-xl border border-[color:rgba(94,106,210,0.22)] bg-[color:rgba(94,106,210,0.1)] text-[color:var(--color-indigo-accent)]">
          {icon}
        </span>
        <span className="font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
          {eyebrow}
        </span>
      </div>
      <div className="space-y-1.5">
        <h3 className="text-base font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {title}
        </h3>
        <p className="text-[12.5px] leading-6 text-[color:var(--color-text-tertiary)]">
          {body}
        </p>
      </div>
    </article>
  );
}

function InlineStat({
  value,
  label,
  mono = false,
}: {
  value: string;
  label: string;
  mono?: boolean;
}) {
  return (
    <div className="flex flex-col gap-1">
      <dt className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        {label}
      </dt>
      <dd
        className={`text-[color:var(--color-text-primary)] ${
          mono
            ? "font-mono text-[15px] tracking-[0.08em]"
            : "text-xl font-[var(--font-weight-signature)] tracking-tight"
        }`}
      >
        {value}
      </dd>
    </div>
  );
}

function StepCard({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <article className="rounded-[28px] border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-5 py-5">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
            {index}
          </p>
          <h2 className="mt-3 text-xl font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {title}
          </h2>
        </div>
      </div>
      <p className="mt-3 text-sm leading-7 text-[color:var(--color-text-secondary)]">{body}</p>
    </article>
  );
}
