"use client";

import { Link } from "@/i18n/navigation";
import { useTranslations } from "next-intl";
import { ArrowRight, Download, ExternalLink, Orbit } from "lucide-react";
import { cn } from "@/shared/lib/cn";
import { buttonVariants, StaggeredFadeIn } from "@/shared/ui";
import { LocaleSwitch } from "@/features/locale-switch";
import { MacosDownloadLink } from "@/features/macos-download-link";
import { DOGFOOD_CENSUS } from "../model/dogfood-census.generated";
import { buildMiniatureLayout } from "../model/miniature-layout";

/**
 * Landing — `/` 에서 vault 미선택 사용자가 처음 보는 화면 (첫인상 = 획득).
 *
 * B2+ "Circuit × Constellation" 페이지 롤아웃 #1 (docs/DESIGN-SYSTEM.md v2 절).
 * 페이지로 가져온 전역 언어만 사용:
 * - machined 카드: `--color-panel` + 1px `border-soft` + 컴팩트 radius
 * - 음각 mono 숫자: `--engraved-numeral-*` — 실데이터(빌드타임 dogfood census)만
 * - kind = shape 글리프: hex/칩/원/pad — `--kind-glyph-*` (전역 승격 토큰)
 * - trace divider: hairline 1px, 관계 의미가 있을 때만 실선(contains)/점선(relates)
 * - powered dot: 인디고 상태 점 — census 가 이 repo 빌드에서 살아있음을 표시
 *
 * canvas 전용 요소 (constellation 배경, comet pulse, grid, vignette, breathe,
 * amber hub) 는 DOM 에서 흉내내지 않는다. 히어로 우측은 장식이 아니라 증거 —
 * 실제 dogfood vault(docs/ontology) frontmatter 에서 유도한 정적 미니어처다.
 *
 * 헌장 (`.claude/rules/local-first.md`): "폴더만 선택하면 즉시 사용" — 인증 분기 0.
 * 단일 인디고 + 무채색, gradient/glow/scale hover 0, 정적 SVG (모션 0).
 */
export function LandingPage() {
  const t = useTranslations("landing");
  const tFooter = useTranslations("footer");

  return (
    <main
      id="main"
      // 모바일 safe-area 만큼 padding-bottom 확보 — 공개 landing 에서는
      // BottomTabBar 를 숨기지만 iOS 하단 제스처 영역과 footer 충돌은 피한다.
      className="relative flex min-h-screen flex-col bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.25rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(56px+env(safe-area-inset-bottom)+1rem)] md:px-10 md:py-8 md:pb-8"
    >
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div className="inline-flex items-center gap-3">
          <span className="flex h-7 w-7 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
            <Orbit size={13} />
          </span>
          <span className="text-[13px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
            Ontology Atlas
          </span>
          <span className="hidden font-mono text-[9px] uppercase tracking-[0.16em] text-[color:var(--color-text-quaternary)] md:inline">
            {t("headerKicker")}
          </span>
        </div>
        <LocaleSwitch />
      </header>

      <section className="mx-auto flex w-full max-w-6xl flex-1 flex-col justify-center gap-12 py-10 md:gap-14 md:py-14">
        <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(24rem,27rem)] md:items-center md:gap-12">
          <div className="space-y-5">
            <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
              {t("eyebrow")}
            </p>
            <h1 className="text-[clamp(2.4rem,5vw,4rem)] leading-[1.04] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
              {t("titleLine1")} <br />
              <span className="text-[color:var(--color-indigo-accent)]">{t("titleEmphasis")}</span>
            </h1>
            <p className="max-w-xl text-base leading-7 text-[color:var(--color-text-secondary)]">
              {t("subtitle")}
            </p>
            <LandingActions className="pt-3" />
            <p className="max-w-xl text-[12px] text-[color:var(--color-text-quaternary)]">
              {t("privacyNote")}
            </p>
          </div>

          <VaultInstrument />
        </div>

        <ValueChainRail
          steps={[
            { index: "01", title: t("step1Title"), sub: t("step1Body") },
            { index: "02", title: t("step2Title"), sub: t("step2Body") },
            { index: "03", title: t("step3Title"), sub: t("step3Body") },
          ]}
        />

        <OpenSourcePanel />
      </section>

      <footer className="flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--color-divider)] pt-4 text-[11px] text-[color:var(--color-text-quaternary)]">
        <span className="font-mono uppercase tracking-[0.14em]">{tFooter("license")}</span>
        <span aria-hidden>·</span>
        <a
          href="https://github.com/wlsdks/ontology-atlas"
          target="_blank"
          rel="noopener noreferrer"
          className="transition-colors hover:text-[color:var(--color-text-tertiary)]"
        >
          {tFooter("github")}
        </a>
        <span aria-hidden>·</span>
        <span className="font-mono">{tFooter("stack")}</span>
      </footer>
    </main>
  );
}

// ─── Hero evidence instrument ────────────────────────────────────────────────

// 결정적 좌표 — 빌드타임 census 에서 1회 계산. 난수/애니메이션 0.
const MINIATURE = buildMiniatureLayout(DOGFOOD_CENSUS);

const HEX_RADIUS = 34;
const CHIP_HALF = 8;
const HUB_RADIUS = 8;

function hexPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    // flat-top hexagon — v2 project 플레이트와 같은 방향.
    const angle = (Math.PI / 180) * (60 * i);
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(" ");
}

/**
 * 히어로 우측 — "정직한 topology 미니어처" (rulebook hero 규칙).
 * 실제 dogfood vault 를 그린다: project hex 1 + domain 칩 6 + 허브 capability 원.
 * contains = 실선, relates = 점선. 라벨/숫자는 전부 실데이터.
 */
function VaultInstrument() {
  const t = useTranslations("landing.instrument");
  const census = DOGFOOD_CENSUS;
  const layout = MINIATURE;

  return (
    <figure
      data-token="kind-glyph"
      className="overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)]"
    >
      <div className="flex h-[var(--topology-chrome-control-height)] items-center gap-2 px-4">
        <span
          aria-hidden
          className="h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-indigo-brand)]"
        />
        <span className="font-mono text-[length:var(--topology-chrome-eyebrow-size)] uppercase tracking-[0.18em] text-[color:var(--color-text-tertiary)]">
          {t("eyebrow")}
        </span>
        <span className="ml-auto font-mono text-[length:var(--topology-chrome-eyebrow-size)] tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
          docs/ontology
        </span>
      </div>

      <div className="border-t border-[color:var(--color-border-soft)]">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={t("svgLabel", {
            concepts: census.concepts,
            relations: census.relations,
          })}
        >
          {/* trace — contains: project → domain (실선) */}
          {layout.domains.map((d) => (
            <line
              key={`c-${d.slug}`}
              x1={layout.project.x}
              y1={layout.project.y}
              x2={d.x}
              y2={d.y}
              stroke="var(--kind-glyph-edge-contains)"
              strokeWidth={1}
            />
          ))}
          {/* trace — relates: domain ↔ domain (점선) */}
          {layout.relates.map((e, i) => (
            <line
              key={`r-${i}`}
              x1={e.x1}
              y1={e.y1}
              x2={e.x2}
              y2={e.y2}
              stroke="var(--kind-glyph-edge-relates)"
              strokeWidth={1}
              strokeDasharray="3 3"
            />
          ))}
          {/* trace — hub capability 는 소유 domain 에 contains 로 붙는다 */}
          {layout.hub ? (
            <line
              x1={layout.hub.anchor.x}
              y1={layout.hub.anchor.y}
              x2={layout.hub.x}
              y2={layout.hub.y}
              stroke="var(--kind-glyph-edge-contains)"
              strokeWidth={1}
            />
          ) : null}

          {/* domain 사각 칩 (pin-tick) + slug 라벨 — 라벨은 링 바깥 방사형
              배치로 relates 점선(링 안쪽 chord)과 절대 겹치지 않는다 */}
          {layout.domains.map((d) => {
            const dx = d.x - layout.project.x;
            const dy = d.y - layout.project.y;
            const length = Math.hypot(dx, dy) || 1;
            const ux = dx / length;
            const uy = dy / length;
            // 허브 소유 칩은 방사 레인을 허브 trace 가 쓰고 있으므로 라벨을
            // 수평측으로 비켜 배치 — 라벨/trace 겹침 방지 (결정적 배치).
            const isHubAnchor =
              layout.hub !== null &&
              layout.hub.anchor.x === d.x &&
              layout.hub.anchor.y === d.y;
            const labelX = isHubAnchor
              ? d.x + (ux >= 0 ? 1 : -1) * (CHIP_HALF + 6)
              : d.x + ux * (CHIP_HALF + 8);
            const labelY = isHubAnchor ? d.y + 3 : d.y + uy * (CHIP_HALF + 10) + 3;
            const anchor = isHubAnchor
              ? ux >= 0
                ? "start"
                : "end"
              : Math.abs(ux) < 0.3
                ? "middle"
                : ux > 0
                  ? "start"
                  : "end";
            return (
              <g key={d.slug}>
                <rect
                  x={d.x - CHIP_HALF}
                  y={d.y - CHIP_HALF}
                  width={CHIP_HALF * 2}
                  height={CHIP_HALF * 2}
                  rx={2}
                  fill="var(--kind-glyph-fill-domain)"
                  stroke="var(--kind-glyph-stroke-domain)"
                  strokeWidth={1}
                />
                <line
                  x1={d.x}
                  y1={d.y - CHIP_HALF - 3}
                  x2={d.x}
                  y2={d.y - CHIP_HALF}
                  stroke="var(--kind-glyph-stroke-domain)"
                  strokeWidth={1}
                />
                <text
                  x={labelX}
                  y={labelY}
                  textAnchor={anchor}
                  fill="var(--color-text-quaternary)"
                  fontSize={8}
                  fontFamily="var(--font-mono, ui-monospace, monospace)"
                >
                  {d.slug}
                </text>
              </g>
            );
          })}

          {/* 허브 capability 원 + slug 라벨 */}
          {layout.hub ? (
            <g>
              <circle
                cx={layout.hub.x}
                cy={layout.hub.y}
                r={HUB_RADIUS}
                fill="var(--kind-glyph-fill-capability)"
                stroke="var(--kind-glyph-stroke-capability)"
                strokeWidth={1}
              />
              <text
                x={layout.hub.x}
                y={layout.hub.y - HUB_RADIUS - 5}
                textAnchor="middle"
                fill="var(--color-text-quaternary)"
                fontSize={8}
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {layout.hub.slug}
              </text>
            </g>
          ) : null}

          {/* project hex 플레이트 — 도형 위에 그려 trace 종단을 가리고,
              slug 는 부품 각인처럼 플레이트 안에 새긴다 */}
          <polygon
            points={hexPoints(layout.project.x, layout.project.y, HEX_RADIUS)}
            fill="var(--kind-glyph-fill-project)"
            stroke="var(--kind-glyph-stroke-project)"
            strokeWidth={1}
          />
          <text
            x={layout.project.x}
            y={layout.project.y + 2.5}
            textAnchor="middle"
            fill="var(--color-text-tertiary)"
            fontSize={7.5}
            fontFamily="var(--font-mono, ui-monospace, monospace)"
          >
            ontology-atlas
          </text>
        </svg>
      </div>

      <div
        data-token="engraved-numeral"
        className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-t border-[color:var(--color-border-soft)] px-4 py-3 font-mono text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
      >
        <span className="text-[13px] tracking-[0.06em]">
          {census.concepts}{" "}
          <span className="text-[9px] uppercase tracking-[0.18em]">{t("conceptsUnit")}</span>
        </span>
        <span aria-hidden className="text-[9px]">
          ·
        </span>
        <span className="text-[13px] tracking-[0.06em]">
          {census.relations}{" "}
          <span className="text-[9px] uppercase tracking-[0.18em]">{t("relationsUnit")}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--color-border-soft)] px-4 py-2.5">
        <KindLegendItem kind="project" count={census.kinds.project} />
        <KindLegendItem kind="domain" count={census.kinds.domain} />
        <KindLegendItem kind="capability" count={census.kinds.capability} />
        <KindLegendItem kind="element" count={census.kinds.element} />
      </div>

      <figcaption className="border-t border-[color:var(--color-border-soft)] px-4 py-2.5 text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
        {t("caption")}
      </figcaption>
    </figure>
  );
}

/**
 * kind 글리프 미니어처 — hex(project) / 사각 칩(domain) / 원(capability) /
 * pad+via(element). kind 의 1차 채널은 형태, 색은 밝기 tier 차이만.
 */
function KindLegendItem({
  kind,
  count,
}: {
  kind: "project" | "domain" | "capability" | "element";
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        {kind === "project" ? (
          <polygon
            points={hexPoints(6, 6, 5)}
            fill="var(--kind-glyph-fill-project)"
            stroke="var(--kind-glyph-stroke-project)"
            strokeWidth={1}
          />
        ) : null}
        {kind === "domain" ? (
          <rect
            x={1.5}
            y={1.5}
            width={9}
            height={9}
            rx={1.5}
            fill="var(--kind-glyph-fill-domain)"
            stroke="var(--kind-glyph-stroke-domain)"
            strokeWidth={1}
          />
        ) : null}
        {kind === "capability" ? (
          <circle
            cx={6}
            cy={6}
            r={4.5}
            fill="var(--kind-glyph-fill-capability)"
            stroke="var(--kind-glyph-stroke-capability)"
            strokeWidth={1}
          />
        ) : null}
        {kind === "element" ? (
          <>
            <rect
              x={2}
              y={2}
              width={8}
              height={8}
              rx={1}
              fill="var(--kind-glyph-fill-element)"
              stroke="var(--kind-glyph-stroke-element)"
              strokeWidth={1}
            />
            <circle cx={6} cy={6} r={1.4} fill="var(--kind-glyph-stroke-element)" />
          </>
        ) : null}
      </svg>
      {count} {kind}
    </span>
  );
}

// ─── Sections ────────────────────────────────────────────────────────────────

function LandingActions({ className }: { className?: string }) {
  const t = useTranslations("landing");

  return (
    <div className={cn("space-y-3", className)}>
      <div className="flex flex-wrap items-center gap-3">
        <MacosDownloadLink className={cn(buttonVariants({ size: "md" }), "min-w-[13rem]")}>
          <Download size={15} />
          {t("downloadMacCta")}
        </MacosDownloadLink>
        <Link
          href="/download/"
          className={cn(buttonVariants({ variant: "outline", size: "md" }))}
        >
          {t("exploreCta")}
          <ArrowRight size={15} />
        </Link>
      </div>
      <p className="max-w-xl text-[11px] leading-5 text-[color:var(--color-text-quaternary)]">
        {t("downloadNote")}
      </p>
    </div>
  );
}

/**
 * Mission 의 3-step 가치사슬 — machined 카드 + 음각 index 숫자.
 * hover 는 보더 밝기 상승만 (rulebook card grid do/don't).
 */
function ValueChainRail({
  steps,
}: {
  steps: ReadonlyArray<{ index: string; title: string; sub: string }>;
}) {
  return (
    <StaggeredFadeIn as="ol" className="grid gap-3 md:grid-cols-3 md:gap-4">
      {steps.map((s) => (
        <li
          key={s.index}
          className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-5 py-4 transition-colors hover:border-[color:var(--color-border-strong)]"
        >
          <span
            data-token="engraved-numeral"
            className="font-mono text-[18px] leading-none tracking-[0.08em] text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]"
          >
            {s.index}
          </span>
          <p className="mt-3 text-[14px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {s.title}
          </p>
          <p className="mt-1.5 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {s.sub}
          </p>
        </li>
      ))}
    </StaggeredFadeIn>
  );
}

function OpenSourcePanel() {
  const t = useTranslations("landing.openSource");

  return (
    <section
      aria-labelledby="open-source-heading"
      className="grid gap-6 border-t border-[color:var(--color-divider)] pt-8 md:grid-cols-[minmax(0,1.08fr)_minmax(22rem,0.92fr)] md:items-center"
    >
      <div>
        <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t("eyebrow")}
        </p>
        <h2
          id="open-source-heading"
          className="mt-2 text-[clamp(1.45rem,2.8vw,2.2rem)] leading-tight font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]"
        >
          {t("title")}
        </h2>
        <p className="mt-3 max-w-2xl text-sm leading-6 text-[color:var(--color-text-secondary)]">
          {t("body")}
        </p>
      </div>

      <div className="overflow-hidden rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] text-[12px] text-[color:var(--color-text-tertiary)]">
        <div className="grid min-h-12 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-4 border-b border-[color:var(--color-border-soft)] px-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("madeByLabel")}
          </span>
          <span className="text-[13px] text-[color:var(--color-text-secondary)]">{t("madeByValue")}</span>
        </div>
        <div className="grid min-h-12 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-4 border-b border-[color:var(--color-border-soft)] px-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("licenseLabel")}
          </span>
          <span className="text-[13px] text-[color:var(--color-text-secondary)]">{t("licenseValue")}</span>
        </div>
        <div className="grid min-h-12 grid-cols-[7.5rem_minmax(0,1fr)] items-center gap-4 border-b border-[color:var(--color-border-soft)] px-4">
          <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
            {t("stackLabel")}
          </span>
          <span className="text-[13px] leading-5 text-[color:var(--color-text-secondary)]">{t("stackValue")}</span>
        </div>
        <div className="px-4 py-3.5">
          <a
            href="https://github.com/wlsdks/ontology-atlas"
            target="_blank"
            rel="noopener noreferrer"
            className={cn(buttonVariants({ variant: "outline", size: "sm" }), "w-fit")}
          >
            <ExternalLink size={13} />
            {t("githubCta")}
          </a>
        </div>
      </div>
    </section>
  );
}
