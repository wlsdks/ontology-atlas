"use client";

import Link from "next/link";
import { ArrowRight, FolderOpen, Orbit } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { buttonVariants } from "@/shared/ui";

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
  const loginHref = buildAuthHref("/login", next);
  const hasReturnTarget = Boolean(next?.trim());

  return (
    <main
      id="main"
      className="relative flex min-h-screen flex-col bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[max(2rem,env(safe-area-inset-bottom))] md:px-10 md:py-10"
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
            open-source ontology workbench
          </span>
        </div>
        <Link
          href={loginHref}
          className="text-[13px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          로그인
        </Link>
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 py-12 md:gap-14 md:py-16">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_22rem] md:items-center md:gap-12">
          <div className="space-y-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
              {hasReturnTarget ? "권한이 필요한 화면" : "ontology workbench · 사람 + AI agent 협업"}
            </p>
            <h1 className="text-[clamp(2.4rem,5vw,4rem)] leading-[1.04] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
              {hasReturnTarget ? (
                <>
                  로그인 후 <span className="text-[color:var(--color-indigo-accent)]">이어보기</span>
                </>
              ) : (
                <>
                  AI 와 함께 자라는<br />
                  <span className="text-[color:var(--color-indigo-accent)]">codebase ontology</span>
                </>
              )}
            </h1>
            <p className="max-w-xl text-base leading-7 text-[color:var(--color-text-secondary)]">
              {hasReturnTarget
                ? "요청한 화면은 로그인이 필요합니다. 로그인하면 방금 열려던 화면으로 바로 돌아갑니다."
                : "사람과 AI agent 가 같이 자라게 하는 codebase ontology. 마크다운 frontmatter 가 곧 노드와 관계 — *트리·토폴로지·ERD* 세 시각으로 본다. Obsidian/Notion 처럼 폴더만 가리키면 시작."}
            </p>
          </div>

          {!hasReturnTarget && (
            <MiniTopology />
          )}
        </div>

        {!hasReturnTarget && <ValueChainRail />}

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
            <>
              <Link
                href="/ontology/"
                className={cn(buttonVariants({ size: "lg" }), "rounded-full min-w-[14rem]")}
              >
                ontology 둘러보기
                <ArrowRight size={16} />
              </Link>
              <Link
                href="/docs/"
                className={cn(
                  buttonVariants({ variant: "outline", size: "lg" }),
                  "rounded-full",
                )}
              >
                <FolderOpen size={16} />
                내 마크다운 폴더 열기
              </Link>
            </>
          )}
        </div>

        {!hasReturnTarget && (
          <p className="text-[12px] text-[color:var(--color-text-quaternary)]">
            로컬 폴더는 디스크에만 저장되고 외부로 전송되지 않아요. 데이터는 사용자 디스크가 진실원.
          </p>
        )}
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--color-divider)] pt-4 text-[11px] text-[color:var(--color-text-quaternary)]">
        <span className="font-mono uppercase tracking-[0.14em]">MIT licensed</span>
        <span aria-hidden>·</span>
        <a
          href="https://github.com/wlsdks/oh-my-ontology"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[color:var(--color-text-tertiary)]"
        >
          GitHub
        </a>
        <span aria-hidden>·</span>
        <span className="font-mono">Local-first · Next.js · TypeScript · Sigma.js · MCP</span>
      </footer>
    </main>
  );
}

/**
 * 정적 미니 토폴로지 — frozen SVG. mission 의 *결과물 = 그래프* 를 시각 증명.
 * 사용자 인터랙션 없음, 애니메이션 없음 (`prefers-reduced-motion` 안전).
 *
 * 14 노드 + 21 엣지의 미니 그래프. 3 hub (Project / Capability / Element 격)
 * + 11 leaf (구체 fact). 단일 인디고만, 두께·반지름으로 위계 표현.
 */
function MiniTopology() {
  // 미리 계산된 force-atlas 풍 좌표 — 노드끼리 겹치지 않으면서 밀집/분산.
  const hubs: Array<{ id: string; cx: number; cy: number; r: number }> = [
    { id: "h1", cx: 158, cy: 110, r: 9 },
    { id: "h2", cx: 80, cy: 60, r: 7 },
    { id: "h3", cx: 240, cy: 160, r: 7 },
  ];
  const leaves: Array<{ id: string; cx: number; cy: number; r: number }> = [
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
  const edges: Array<[string, string]> = [
    ["h1", "h2"], ["h1", "h3"], ["h2", "h3"],
    ["h2", "l1"], ["h2", "l2"], ["h2", "l10"],
    ["h1", "l4"], ["h1", "l9"], ["h1", "l11"],
    ["h3", "l5"], ["h3", "l6"], ["h3", "l9"],
    ["h1", "l8"], ["h2", "l3"], ["l3", "l7"],
    ["l7", "l11"], ["l4", "l5"], ["l9", "l8"],
    ["l1", "l3"], ["l1", "l10"], ["l11", "h3"],
  ];
  const idToPoint: Record<string, { cx: number; cy: number }> = Object.fromEntries(
    [...hubs, ...leaves].map((n) => [n.id, { cx: n.cx, cy: n.cy }]),
  );

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
        {edges.map(([a, b], i) => {
          const pa = idToPoint[a];
          const pb = idToPoint[b];
          return (
            <line
              key={i}
              x1={pa.cx}
              y1={pa.cy}
              x2={pb.cx}
              y2={pb.cy}
              stroke="rgba(94,106,210,0.28)"
              strokeWidth={1}
            />
          );
        })}
        {leaves.map((n) => (
          <circle
            key={n.id}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="rgba(94,106,210,0.55)"
            stroke="rgba(94,106,210,0.6)"
            strokeWidth={0.8}
          />
        ))}
        {hubs.map((n) => (
          <circle
            key={n.id}
            cx={n.cx}
            cy={n.cy}
            r={n.r}
            fill="var(--color-indigo-brand)"
            stroke="var(--color-indigo-accent)"
            strokeWidth={1.5}
          />
        ))}
      </svg>
      <span className="pointer-events-none absolute bottom-3 left-4 font-mono text-[9.5px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)]">
        topology · 14 nodes · 21 relations
      </span>
    </div>
  );
}

/**
 * Mission 의 3-step 가치사슬 — markdown → 추출 → 3 view. 수직선 + dot 패턴.
 * 디자인 헌장 안 (보더 + 단일 인디고 + 무채색 텍스트).
 */
function ValueChainRail() {
  // 효과 (사용자가 얻는 것) 중심 copy. 단순 flow 가 아닌 "ontology 가
  // 마크다운만으로는 못 하는 것" 의 3 가지 답.
  const steps: Array<{ index: string; title: string; sub: string }> = [
    {
      index: "01",
      title: "마크다운 한 곳에 적기",
      sub: "frontmatter 키만 넣으면 노드/관계가 자동으로. AI agent (MCP) 도 같은 vault 에 read/write.",
    },
    {
      index: "02",
      title: "역추적 + 의존 분석 즉시",
      sub: "'이 기능 누가 쓰나?' '이거 바꾸면 뭐 깨지나?' — 마크다운에선 grep 인데, ontology 면 0 클릭에 답.",
    },
    {
      index: "03",
      title: "한눈 탐색 — 트리·토폴로지·ERD",
      sub: "같은 ontology 를 세 시각으로. 도메인 census, 영향 범위, 의존 chain 한 화면.",
    },
  ];

  return (
    <ol className="grid gap-3 md:grid-cols-3 md:gap-4">
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
    </ol>
  );
}
