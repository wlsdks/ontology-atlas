"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState } from "react";
import { useTranslations } from "next-intl";
import { ArrowRight, FolderOpen, Orbit } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { buttonVariants, StaggeredFadeIn } from "@/shared/ui";
import { LocaleSwitch } from "@/features/locale-switch";

interface Props {
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
 * 사용". hero 옆 정적 미니 토폴로지로 *지식 그래프* 가 무엇인지 시각 증명 +
 * 3-step rail 로 mission 의 가치사슬 (markdown → 추출 → 3 view) 명시.
 *
 * 디자인 헌장 준수: 단일 인디고 + 무채색, 애니메이션 0, gradient/glow/scale
 * hover 0. 미니 토폴로지는 frozen SVG (정적) — `prefers-reduced-motion`
 * 안전.
 */
export function LandingPage({ next }: Props) {
  const t = useTranslations('landing');
  const tNav = useTranslations('nav');
  const tFooter = useTranslations('footer');
  const loginHref = buildAuthHref("/login", next);
  const hasReturnTarget = Boolean(next?.trim());

  return (
    <main
      id="main"
      // 모바일 BottomTabBar (56px) + safe-area 만큼 더 padding-bottom 확보 —
      // eval H3 finding: 모바일에서 '01' 카드를 탭바가 가리던 회귀.
      className="relative flex min-h-screen flex-col bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(56px+env(safe-area-inset-bottom)+1rem)] md:px-10 md:py-10 md:pb-10"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-3">
          <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-lg border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-indigo-accent)]">
            <Orbit size={15} />
          </span>
          <span className="text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            oh-my-ontology
          </span>
          <span className="hidden font-mono text-[10px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)] md:inline">
            {t('headerKicker')}
          </span>
        </div>
        <Link
          href={loginHref}
          className="text-[13px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          {tNav('signIn')}
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 py-12 md:gap-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_22rem] md:items-center md:gap-12">
          <div className="space-y-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
              {hasReturnTarget ? t('returnTargetEyebrow') : t('eyebrow')}
            </p>
            <h1 className="text-[clamp(2.4rem,5vw,4rem)] leading-[1.04] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
              {hasReturnTarget ? (
                <>
                  {t('returnTargetTitleLine1')}{' '}
                  <span className="text-[color:var(--color-indigo-accent)]">{t('returnTargetTitleEmphasis')}</span>
                </>
              ) : (
                <>
                  {t('titleLine1')}<br />
                  <span className="text-[color:var(--color-indigo-accent)]">{t('titleEmphasis')}</span>
                </>
              )}
            </h1>
            <p className="max-w-xl text-base leading-7 text-[color:var(--color-text-secondary)]">
              {hasReturnTarget ? t('returnTargetSubtitle') : t('subtitle')}
            </p>
          </div>

          {!hasReturnTarget && (
            <MiniTopology caption={t('topologyCaption', { nodes: 14, relations: 21 })} />
          )}
        </div>

        {!hasReturnTarget && (
          <ValueChainRail
            steps={[
              { index: '01', title: t('step1Title'), sub: t('step1Body') },
              { index: '02', title: t('step2Title'), sub: t('step2Body') },
              { index: '03', title: t('step3Title'), sub: t('step3Body') },
            ]}
          />
        )}

        <div className="flex flex-wrap items-center gap-3">
          {hasReturnTarget ? (
            <Link
              href={loginHref}
              className={cn(buttonVariants({ size: "lg" }), "rounded-full")}
            >
              {t('returnTargetCta')}
              <ArrowRight size={16} />
            </Link>
          ) : (
            <>
              <Link
                href="/ontology/"
                className={cn(buttonVariants({ size: "lg" }), "rounded-full min-w-[14rem]")}
              >
                {t('exploreCta')}
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/docs/?intent=local"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "rounded-full",
                )}
              >
                <FolderOpen size={16} />
                {t('openVaultCta')}
              </Link>
            </>
          )}
        </div>

        {!hasReturnTarget && (
          <p className="text-[12px] text-[color:var(--color-text-quaternary)]">
            {t('privacyNote')}
          </p>
        )}
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--color-divider)] pt-4 text-[11px] text-[color:var(--color-text-quaternary)]">
        <span className="font-mono uppercase tracking-[0.14em]">{tFooter('license')}</span>
        <span aria-hidden>·</span>
        <a
          href="https://github.com/wlsdks/oh-my-ontology"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[color:var(--color-text-tertiary)]"
        >
          {tFooter('github')}
        </a>
        <span aria-hidden>·</span>
        <span className="font-mono">{tFooter('stack')}</span>
        <span className="ml-auto">
          <LocaleSwitch />
        </span>
      </footer>
    </main>
  );
}

// 미리 계산된 force-atlas 풍 좌표 — 노드끼리 겹치지 않으면서 밀집/분산.
// 14 노드 + 21 엣지. 3 hub (Project / Capability / Element 격) + 11 leaf
// (구체 fact). 단일 인디고만, 두께·반지름으로 위계 표현.
const MINI_HUBS: ReadonlyArray<{ id: string; cx: number; cy: number; r: number }> = [
  { id: "h1", cx: 158, cy: 110, r: 9 },
  { id: "h2", cx: 80, cy: 60, r: 7 },
  { id: "h3", cx: 240, cy: 160, r: 7 },
];
const MINI_LEAVES: ReadonlyArray<{ id: string; cx: number; cy: number; r: number }> = [
  { id: "l1", cx: 50, cy: 105, r: 4 },
  { id: "l2", cx: 110, cy: 30, r: 4 },
  { id: "l3", cx: 50, cy: 165, r: 4 },
  { id: "l4", cx: 200, cy: 50, r: 4 },
  { id: "l5", cx: 270, cy: 90, r: 4 },
  { id: "l6", cx: 290, cy: 195, r: 4 },
  { id: "l7", cx: 100, cy: 175, r: 4 },
  { id: "l8", cx: 175, cy: 195, r: 4 },
  { id: "l9", cx: 215, cy: 110, r: 4 },
  { id: "l10", cx: 30, cy: 60, r: 4 },
  { id: "l11", cx: 130, cy: 130, r: 4 },
];
const MINI_EDGES: ReadonlyArray<[string, string]> = [
  ["h1", "h2"], ["h1", "h3"], ["h2", "h3"],
  ["h2", "l1"], ["h2", "l2"], ["h2", "l10"],
  ["h1", "l4"], ["h1", "l9"], ["h1", "l11"],
  ["h3", "l5"], ["h3", "l6"], ["h3", "l9"],
  ["h1", "l8"], ["h2", "l3"], ["l3", "l7"],
  ["l7", "l11"], ["l4", "l5"], ["l9", "l8"],
  ["l1", "l3"], ["l1", "l10"], ["l11", "h3"],
];

const SETTLE_DURATION_MS = 1800;
const CENTER_X = 160;
const CENTER_Y = 110;

// Deterministic offset hash — SSR / hydration 같은 결과 보장. id 의 char
// code 합으로 angle + radius 결정. crypto / Math.random 안 쓴 이유.
function initialOffset(id: string): { dx: number; dy: number } {
  const seed = id.split("").reduce((acc, c) => acc + c.charCodeAt(0), 0);
  const angle = (seed % 360) * (Math.PI / 180);
  const radius = 60 + ((seed * 7) % 40);
  return { dx: Math.cos(angle) * radius, dy: Math.sin(angle) * radius };
}

// Cubic ease-out — start fast, settle slow.
function easeOutCubic(t: number): number {
  return 1 - Math.pow(1 - t, 3);
}

/**
 * Live 미니 토폴로지 — 14 노드가 중앙 부근에서 force-atlas 식으로 settle
 * 하는 1.8s entrance animation. 끝나면 RAF 종료, 정적 SVG 와 동일한 GPU
 * 부하 (= 0). prefers-reduced-motion 사용자는 즉시 settled 상태.
 *
 * 디자인 헌장 안: 단일 인디고, 짧은 motion, glow 0. 번들 영향 0 (외부 lib
 * 안 씀, RAF + SVG transform 만).
 *
 * mission 의 *결과물 = 그래프* 를 시각 증명. 정적 SVG 는 "broken" 처럼
 * 보일 위험을 (eval Aesthetic agent finding P2) 동적으로 살림.
 */
function MiniTopology({ caption }: { caption: string }) {
  const reducedMotionRef = useRef(false);
  const [progress, setProgress] = useState(0); // 0..1
  const startRef = useRef<number | null>(null);
  const rafRef = useRef<number | null>(null);

  useEffect(() => {
    if (typeof window === "undefined") return;
    const reducedMotion =
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;
    reducedMotionRef.current = reducedMotion;
    if (reducedMotion) {
      setProgress(1);
      return;
    }
    const tick = (now: number) => {
      if (startRef.current === null) startRef.current = now;
      const elapsed = now - startRef.current;
      const raw = Math.min(1, elapsed / SETTLE_DURATION_MS);
      setProgress(easeOutCubic(raw));
      if (raw < 1) {
        rafRef.current = window.requestAnimationFrame(tick);
      } else {
        rafRef.current = null;
      }
    };
    rafRef.current = window.requestAnimationFrame(tick);
    return () => {
      if (rafRef.current !== null) window.cancelAnimationFrame(rafRef.current);
    };
  }, []);

  // 모든 노드의 현재 좌표 — progress 0 = 중앙 부근 (목적지에서 offset 빼서),
  // progress 1 = 정확히 목적지. opacity 도 progress 에 비례 (0.1 → 1).
  const positions = useMemo(() => {
    const map = new Map<string, { x: number; y: number; opacity: number }>();
    for (const n of [...MINI_HUBS, ...MINI_LEAVES]) {
      const { dx, dy } = initialOffset(n.id);
      const x = n.cx + (1 - progress) * (CENTER_X + dx - n.cx) * 0.3;
      const y = n.cy + (1 - progress) * (CENTER_Y + dy - n.cy) * 0.3;
      const opacity = 0.15 + 0.85 * progress;
      map.set(n.id, { x, y, opacity });
    }
    return map;
  }, [progress]);

  return (
    <div
      aria-hidden
      className="relative aspect-[4/3] w-full overflow-hidden rounded-[24px] border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)]"
    >
      <svg
        viewBox="0 0 320 220"
        className="h-full w-full"
        preserveAspectRatio="xMidYMid meet"
      >
        {MINI_EDGES.map(([a, b], i) => {
          const pa = positions.get(a);
          const pb = positions.get(b);
          if (!pa || !pb) return null;
          // 엣지는 양 끝 노드 opacity 의 평균. 노드가 settle 되기 전엔
          // 흐릿, settle 후 정상 톤.
          const avgOpacity = (pa.opacity + pb.opacity) / 2;
          return (
            <line
              key={i}
              x1={pa.x}
              y1={pa.y}
              x2={pb.x}
              y2={pb.y}
              stroke="rgba(94,106,210,0.28)"
              strokeOpacity={avgOpacity}
              strokeWidth={1}
            />
          );
        })}
        {MINI_LEAVES.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={n.r}
              fill="rgba(94,106,210,0.55)"
              fillOpacity={p.opacity}
              stroke="rgba(94,106,210,0.6)"
              strokeOpacity={p.opacity}
              strokeWidth={0.8}
            />
          );
        })}
        {MINI_HUBS.map((n) => {
          const p = positions.get(n.id);
          if (!p) return null;
          return (
            <circle
              key={n.id}
              cx={p.x}
              cy={p.y}
              r={n.r}
              fill="var(--color-indigo-brand)"
              fillOpacity={p.opacity}
              stroke="var(--color-indigo-accent)"
              strokeOpacity={p.opacity}
              strokeWidth={1.5}
            />
          );
        })}
      </svg>
      <span className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
        {caption}
      </span>
    </div>
  );
}

/**
 * Mission 의 3-step 가치사슬 — markdown → 추출 → 3 view. 수직선 + dot 패턴.
 * 디자인 헌장 안 (보더 + 단일 인디고 + 무채색 텍스트).
 */
function ValueChainRail({
  steps,
}: {
  steps: ReadonlyArray<{ index: string; title: string; sub: string }>;
}) {
  return (
    <StaggeredFadeIn as="ol" className="grid gap-3 md:grid-cols-3 md:gap-4">
      {steps.map((s, i) => (
        <li
          key={s.index}
          className="relative rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3.5"
        >
          <div className="flex items-baseline gap-3">
            <span className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-indigo-accent)]">
              {s.index}
            </span>
            {i < steps.length - 1 ? (
              <span
                aria-hidden
                className="hidden h-px flex-1 translate-y-[2px] bg-[color:var(--color-divider)] md:block"
              />
            ) : null}
          </div>
          <p className="mt-2 text-[14px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {s.title}
          </p>
          <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {s.sub}
          </p>
        </li>
      ))}
    </StaggeredFadeIn>
  );
}
