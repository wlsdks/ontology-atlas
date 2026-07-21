'use client';

import { ArrowLeft, Check, CheckCircle2, Clipboard, Download, ExternalLink, Orbit, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { buttonVariants, StaggeredFadeIn } from '@/shared/ui';
import { TopologyV2KindGlyph } from '@/shared/ui/topology-v2-kind-glyph';
import { LocaleSwitch } from '@/features/locale-switch';
import { GITHUB_RELEASES_URL, MacosDownloadLink } from '@/features/macos-download-link';
import { CLI_COMMAND_COUNT, RELEASE_MIN_MACOS, RELEASE_VERSION } from '../lib/release-facts';
import { CHANGELOG_PREVIEW_AS_OF, CHANGELOG_PREVIEW_ENTRIES } from '../lib/changelog-preview';
import { DOGFOOD_CENSUS } from '../model/dogfood-census.generated';
import { buildMiniatureLayout } from '../model/miniature-layout';

const GITHUB_REPOSITORY_URL = 'https://github.com/wlsdks/ontology-atlas';
const RELEASE_STATUS_COMMAND =
  'pnpm desktop:release-status -- --pr=<number> --tag=v0.1.0 --include-hosted-surface --json-file=.tmp/desktop-release-status.json --markdown-file=.tmp/desktop-release-status.md';

// RATIO-SYSTEM.md (docs/prototypes/RATIO-SYSTEM.md) — 1600 shared container,
// 960 utility column centered inside it. Token promotion tracked separately
// (see src/views/project-selector/ui/ProjectSelectorPage.tsx for the same
// note) — local constants until `--page-max`/`--page-col-utility` land.
const PAGE_MAX_WIDTH = 1600;
const UTILITY_COL_WIDTH = 960;

const numeralClass =
  'font-mono text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]';

interface Props {
  showFirstReleaseChecklist?: boolean;
}

export function DownloadPage({ showFirstReleaseChecklist = true }: Props) {
  const t = useTranslations('download');
  const tFooter = useTranslations('footer');
  const { state: releaseStatusCopyState, copy: copyReleaseStatus } = useCopyFeedback(1500);
  const releaseStatusCopyLabel =
    releaseStatusCopyState === 'copied'
      ? t('releaseStatusCopyCopied')
      : releaseStatusCopyState === 'failed'
        ? t('releaseStatusCopyFailed')
        : t('releaseStatusCopy');
  return (
    <div className="flex min-h-screen w-full">
      {/* 레일은 perf/persistent-shell 이후 layout(AppShell) 상주. */}
      <main
        id="main"
        className="min-w-0 flex-1 bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(56px+env(safe-area-inset-bottom)+1rem)] md:px-10 md:py-10 md:pb-10"
      >
      <div className="mx-auto" style={{ maxWidth: PAGE_MAX_WIDTH }}>
        <div className="mx-auto" style={{ maxWidth: UTILITY_COL_WIDTH }}>
          <nav className="flex flex-wrap items-center gap-3 pb-6">
            <span className="inline-flex items-center gap-2">
              <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] text-[color:var(--color-indigo-accent)]">
                <Orbit size={12} />
              </span>
              <span className="text-[12.5px] font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)]">
                Ontology Atlas
              </span>
            </span>
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">/</span>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <ArrowLeft size={14} />
              {t('back')}
            </Link>
            <span aria-hidden className="text-[color:var(--color-text-quaternary)]">/</span>
            <span className="text-[12px] text-[color:var(--color-text-tertiary)]">{t('eyebrow')}</span>
            <span className={`ml-auto text-[11px] tracking-[0.08em] ${numeralClass}`}>
              macOS · DMG · GitHub Release
            </span>
            <LocaleSwitch />
          </nav>

          {/* 소개 섹션 (root-first-open Slice 2) — 구 LandingPage(`/`) 의
              히어로 카피 + 가치사슬 3-step + dogfood evidence 미니어처를
              이관. `/` 는 이제 지도 자체가 첫 화면이라 별도 마케팅 랜딩이
              없다 — 소개는 이 페이지가 "소개 + 다운로드" 둘 다 맡는다. */}
          <IntroSection />

          <header className="mt-7 flex flex-wrap items-start gap-4 border-t border-[color:var(--color-divider)] pt-7">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
                {t('downloadSectionLabel')}
              </p>
              <h1 className="mt-1.5 max-w-2xl text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.05] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
                {t('title')}
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
                {t('subtitle')}
              </p>
            </div>
            <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-3">
              <MacosDownloadLink
                className={cn(buttonVariants({ size: 'lg' }), 'rounded-full min-w-[13rem]')}
              >
                <Download size={16} />
                {t('primaryCta')}
              </MacosDownloadLink>
              <a
                href={GITHUB_REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'outline', size: 'lg' }), 'rounded-full')}
              >
                <ExternalLink size={16} />
                {t('sourceCta')}
              </a>
            </div>
          </header>

          {/* engraved fact strip — real repo facts only (package.json /
              tauri.conf.json). Size is deliberately absent: no DMG has been
              built yet, see release-facts.ts. */}
          <div className="mt-6 flex flex-wrap items-baseline gap-5 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--topology-v2-panel-metric-surface,var(--color-overlay-1))] px-4 py-2.5 text-[12.5px]">
            <FactItem label={t('factVersionLabel')} value={`v${RELEASE_VERSION}`} />
            <FactItem label={t('factFormatLabel')} value="DMG" />
            <FactItem label={t('factArchLabel')} value={t('factArchValue')} />
            <FactItem label={t('factSizeLabel')} value={t('factSizeValuePending')} muted />
            <FactItem label={t('factMinOsLabel')} value={RELEASE_MIN_MACOS} />
            <FactItem label={t('factChannelLabel')} value={t('factChannelValue')} />
          </div>
          <div
            data-testid="download-checksum-row"
            className="mt-2 flex items-baseline gap-3 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-2.5 shadow-[inset_0_1px_2px_var(--color-shadow-a35)]"
          >
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('checksumLabel')}
            </span>
            {/* [W-4] 게시된 DMG 가 아직 없어 실 SHA-256 이 존재하지 않는다 —
                자리표시자(0×64)를 복사 가능하게 두면 사용자가 가짜 체크섬을
                무결성 검증에 붙여넣는 사고로 이어진다. 복사 버튼은 실 해시가
                채워질 때까지 렌더하지 않는다(release-facts.ts 참고). */}
            <span className={`min-w-0 flex-1 truncate text-[11.5px] tracking-[0.02em] ${numeralClass}`}>
              {t('checksumValuePending')}
            </span>
          </div>
          <p className="mt-3 max-w-2xl text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t('releaseAvailabilityNote')}
          </p>

          {showFirstReleaseChecklist ? (
            <div className="mt-4 grid min-w-0 gap-2 rounded-lg border border-[color:var(--color-amber-source-a34)] bg-[color:var(--color-amber-source-a08)] p-3">
              <p className="font-mono text-[10px] uppercase text-[color:var(--color-status-warning)]">
                {t('releaseStatusTitle')}
              </p>
              <ul className="grid gap-1.5 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
                <ReleaseStatusItem label={t('releaseStatusPr')} />
                <ReleaseStatusItem label={t('releaseStatusVersion')} />
                <ReleaseStatusItem label={t('releaseStatusSecrets')} />
                <ReleaseStatusItem label={t('releaseStatusRelease')} />
                <ReleaseStatusItem label={t('releaseStatusHosted')} />
              </ul>
              <div className="mt-1 min-w-0 rounded-md border border-[color:var(--color-amber-source-a24)] bg-[color:var(--color-overlay-recessed-a12)] p-2">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase text-[color:var(--color-status-warning)]">
                      {t('releaseStatusAuditLabel')}
                    </p>
                    <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-sm bg-[color:var(--color-overlay-recessed)] px-2 py-1 font-mono text-[10px] text-[color:var(--color-text-secondary)]">
                      {RELEASE_STATUS_COMMAND}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyReleaseStatus(RELEASE_STATUS_COMMAND)}
                    className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[color:var(--color-amber-source-a30)] bg-[color:var(--color-amber-source-a08)] px-2.5 py-1.5 font-mono text-[10px] text-[color:var(--color-status-warning)] transition-colors hover:bg-[color:var(--color-amber-source-a13)]"
                    aria-label={releaseStatusCopyLabel}
                  >
                    {releaseStatusCopyState === 'copied' ? (
                      <Check size={13} aria-hidden />
                    ) : (
                      <Clipboard size={13} aria-hidden />
                    )}
                    {t('releaseStatusCopy')}
                  </button>
                </div>
                <p className="mt-2 text-[11px] leading-5 text-[color:var(--color-text-tertiary)]">
                  {t('releaseStatusAuditBody')}
                </p>
                <span className="sr-only" aria-live="polite" aria-atomic="true">
                  {releaseStatusCopyState === 'copied'
                    ? t('releaseStatusCopyCopied')
                    : releaseStatusCopyState === 'failed'
                      ? t('releaseStatusCopyFailed')
                      : ''}
                </span>
              </div>
            </div>
          ) : null}

          <SectionHeading label={t('includesHeading')} caption={t('includesCaption')} />
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <IncludeCard
              glyph="domain"
              title={t('includeTopologyTitle')}
              body={t('includeTopologyBody')}
            />
            <IncludeCard
              glyph="capability"
              title={t('includeMcpTitle')}
              count={t('includeMcpCount')}
              body={t('includeMcpBody')}
            />
            <IncludeCard
              glyph="element"
              title={t('includeCliTitle')}
              count={t('includeCliCount', { count: CLI_COMMAND_COUNT })}
              body={t('includeCliBody')}
            />
          </div>

          <SectionHeading label={t('installTitle')} caption="4 steps" />
          <ol className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <InstallStep index="01" title={t('step1Title')} body={t('step1Body')} />
            <InstallStep index="02" title={t('step2Title')} body={t('step2Body')} />
            <InstallStep index="03" title={t('step3Title')} body={t('step3Body')} />
            <InstallStep index="04" title={t('step4Title')} body={t('step4Body')} />
          </ol>

          <div className="mt-7 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[1.15fr_0.85fr]">
            <div className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 shadow-[inset_0_1px_0_var(--color-overlay-2)]">
              <div className="flex items-center gap-2 pb-2">
                <ShieldCheck size={15} className="text-[color:var(--color-indigo-accent)]" />
                <h2 className="text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                  {t('trustHeading')}
                </h2>
              </div>
              <TrustRow label={t('proofSigned')} note={t('trustSignedNote')} />
              <TrustRow label={t('proofNotarized')} note={t('trustNotarizedNote')} />
              <TrustRow label={t('proofChecksum')} note="" />
              <div className="mt-2 overflow-x-auto whitespace-nowrap rounded-[6px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 font-mono text-[11px] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
                {t('trustVerifyCommand')}
              </div>
              <p className="mt-2 text-[11.5px] leading-6 text-[color:var(--color-text-quaternary)]">
                {t('trustNote')}
              </p>
            </div>

            <div className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 shadow-[inset_0_1px_0_var(--color-overlay-2)]">
              <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] pb-2">
                <span className={`text-[12px] ${numeralClass}`}>v{RELEASE_VERSION}</span>
                <span className="ml-auto whitespace-nowrap font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  {t('releaseNotesSource')}
                </span>
              </div>
              {CHANGELOG_PREVIEW_ENTRIES.map((entry) => (
                <div key={entry.title} className="flex items-baseline gap-2 pt-1.5 text-[12px] leading-6 text-[color:var(--color-text-secondary)]">
                  <span className={`shrink-0 text-[11px] ${numeralClass}`}>+</span>
                  <span className="min-w-0">{entry.title}</span>
                </div>
              ))}
              <p className="mt-2 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                {t('releaseNotesHeading')} · {t('releaseNotesCaption', { date: CHANGELOG_PREVIEW_AS_OF })}
              </p>
            </div>
          </div>

          <section className="mt-7 flex flex-wrap items-center gap-3 rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-4 py-3.5">
            <span className="text-[13px] font-medium text-[color:var(--color-text-primary)]">
              {t('githubLabel')}
            </span>
            <span className="min-w-0 flex-1 truncate font-mono text-[11.5px] text-[color:var(--color-text-tertiary)]">
              {t('githubBody')}
            </span>
            <a
              href={GITHUB_RELEASES_URL}
              target="_blank"
              rel="noopener noreferrer"
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:var(--color-indigo-a50)] px-3 text-[12px] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
            >
              {t('githubOpen')}
            </a>
          </section>

          <p className="mt-6 rounded-md border border-[color:var(--color-indigo-a24)] bg-[color:var(--color-indigo-a07)] p-3 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {t('releaseGateNote')}
          </p>

          <footer className="mt-6 flex flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--color-divider)] pt-4 text-[11px] text-[color:var(--color-text-quaternary)]">
            <span className="font-mono uppercase tracking-[0.14em]">{tFooter('license')}</span>
            <span aria-hidden>·</span>
            <a
              href="https://github.com/wlsdks/ontology-atlas"
              target="_blank"
              rel="noopener noreferrer"
              className="transition-colors hover:text-[color:var(--color-text-tertiary)]"
            >
              {tFooter('github')}
            </a>
            <span aria-hidden>·</span>
            <span className="font-mono">{tFooter('stack')}</span>
          </footer>
        </div>
      </div>
      </main>
    </div>
  );
}

// ─── Intro section (구 LandingPage 히어로, Slice 2 이관) ──────────────────────

// 결정적 좌표 — 빌드타임 census 에서 1회 계산. 난수/애니메이션 0.
const INTRO_MINIATURE = buildMiniatureLayout(DOGFOOD_CENSUS);

const INTRO_HEX_RADIUS = 34;
const INTRO_CHIP_HALF = 8;
const INTRO_HUB_RADIUS = 8;

function introHexPoints(cx: number, cy: number, r: number): string {
  const points: string[] = [];
  for (let i = 0; i < 6; i += 1) {
    // flat-top hexagon — v2 project 플레이트와 같은 방향.
    const angle = (Math.PI / 180) * (60 * i);
    points.push(`${(cx + r * Math.cos(angle)).toFixed(2)},${(cy + r * Math.sin(angle)).toFixed(2)}`);
  }
  return points.join(' ');
}

/**
 * 소개 섹션 — 구 LandingPage 히어로(eyebrow/title/subtitle + evidence
 * 미니어처) + 가치사슬 3-step. `/` 가 이제 지도 자체를 첫 화면으로 쓰므로
 * (root-first-open B3), 별도 마케팅 랜딩 없이 이 소개 콘텐츠가 `/download`
 * 로 옮겨왔다 — "소개 + 다운로드" 한 페이지.
 */
function IntroSection() {
  const t = useTranslations('download.intro');

  return (
    <section aria-labelledby="download-intro-heading" className="pt-2">
      <div className="grid gap-10 md:grid-cols-[minmax(0,1fr)_minmax(22rem,25rem)] md:items-center md:gap-12">
        <div className="space-y-4">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
            {t('eyebrow')}
          </p>
          <h2
            id="download-intro-heading"
            className="text-[clamp(2rem,4.4vw,3.4rem)] leading-[1.06] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]"
          >
            {t('titleLine1')} <br />
            <span className="text-[color:var(--color-indigo-accent)]">{t('titleEmphasis')}</span>
          </h2>
          <p className="max-w-xl break-keep text-[13.5px] leading-7 text-[color:var(--color-text-secondary)]">
            {t('subtitle')}
          </p>
        </div>

        <IntroVaultInstrument />
      </div>

      <IntroValueChainRail
        steps={[
          { index: '01', title: t('step1Title'), sub: t('step1Body') },
          { index: '02', title: t('step2Title'), sub: t('step2Body') },
          { index: '03', title: t('step3Title'), sub: t('step3Body') },
        ]}
      />
    </section>
  );
}

/**
 * 소개 섹션 evidence 미니어처 — "정직한 topology 미니어처" (rulebook hero
 * 규칙 계승). 실제 dogfood vault 를 그린다: project hex 1 + domain 칩 N +
 * 허브 capability 원. contains = 실선, relates = 점선. 라벨/숫자는 실데이터.
 */
function IntroVaultInstrument() {
  const t = useTranslations('download.intro.instrument');
  const census = DOGFOOD_CENSUS;
  const layout = INTRO_MINIATURE;

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
          {t('eyebrow')}
        </span>
        <span className="ml-auto font-mono text-[length:var(--topology-chrome-eyebrow-size)] tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
          docs/ontology
        </span>
      </div>

      <div className="border-t border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)]">
        <svg
          viewBox={`0 0 ${layout.width} ${layout.height}`}
          className="h-auto w-full"
          role="img"
          aria-label={t('svgLabel', {
            concepts: census.concepts,
            relations: census.relations,
          })}
        >
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

          {layout.domains.map((d) => {
            const dx = d.x - layout.project.x;
            const dy = d.y - layout.project.y;
            const length = Math.hypot(dx, dy) || 1;
            const ux = dx / length;
            const uy = dy / length;
            const isHubAnchor =
              layout.hub !== null &&
              layout.hub.anchor.x === d.x &&
              layout.hub.anchor.y === d.y;
            const labelX = isHubAnchor
              ? d.x + (ux >= 0 ? 1 : -1) * (INTRO_CHIP_HALF + 6)
              : d.x + ux * (INTRO_CHIP_HALF + 8);
            const labelY = isHubAnchor ? d.y + 3 : d.y + uy * (INTRO_CHIP_HALF + 10) + 3;
            const anchor = isHubAnchor
              ? ux >= 0
                ? 'start'
                : 'end'
              : Math.abs(ux) < 0.3
                ? 'middle'
                : ux > 0
                  ? 'start'
                  : 'end';
            return (
              <g key={d.slug}>
                <rect
                  x={d.x - INTRO_CHIP_HALF}
                  y={d.y - INTRO_CHIP_HALF}
                  width={INTRO_CHIP_HALF * 2}
                  height={INTRO_CHIP_HALF * 2}
                  rx={2}
                  fill="var(--kind-glyph-fill-domain)"
                  stroke="var(--kind-glyph-stroke-domain)"
                  strokeWidth={1}
                />
                <line
                  x1={d.x}
                  y1={d.y - INTRO_CHIP_HALF - 3}
                  x2={d.x}
                  y2={d.y - INTRO_CHIP_HALF}
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

          {layout.hub ? (
            <g>
              <circle
                cx={layout.hub.x}
                cy={layout.hub.y}
                r={INTRO_HUB_RADIUS}
                fill="var(--kind-glyph-fill-capability)"
                stroke="var(--kind-glyph-stroke-capability)"
                strokeWidth={1}
              />
              <text
                x={layout.hub.x}
                y={layout.hub.y - INTRO_HUB_RADIUS - 5}
                textAnchor="middle"
                fill="var(--color-text-quaternary)"
                fontSize={8}
                fontFamily="var(--font-mono, ui-monospace, monospace)"
              >
                {layout.hub.slug}
              </text>
            </g>
          ) : null}

          <polygon
            points={introHexPoints(layout.project.x, layout.project.y, INTRO_HEX_RADIUS)}
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
          {census.concepts}{' '}
          <span className="text-[9px] uppercase tracking-[0.18em]">{t('conceptsUnit')}</span>
        </span>
        <span aria-hidden className="text-[9px]">
          ·
        </span>
        <span className="text-[13px] tracking-[0.06em]">
          {census.relations}{' '}
          <span className="text-[9px] uppercase tracking-[0.18em]">{t('relationsUnit')}</span>
        </span>
      </div>

      <div className="flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-[color:var(--color-border-soft)] px-4 py-2.5">
        <IntroKindLegendItem kind="project" count={census.kinds.project} />
        <IntroKindLegendItem kind="domain" count={census.kinds.domain} />
        <IntroKindLegendItem kind="capability" count={census.kinds.capability} />
        <IntroKindLegendItem kind="element" count={census.kinds.element} />
      </div>

      <figcaption className="break-keep border-t border-[color:var(--color-border-soft)] px-4 py-2.5 text-[11px] leading-4 text-[color:var(--color-text-quaternary)]">
        {t('caption')}
      </figcaption>
    </figure>
  );
}

function IntroKindLegendItem({
  kind,
  count,
}: {
  kind: 'project' | 'domain' | 'capability' | 'element';
  count: number;
}) {
  return (
    <span className="inline-flex items-center gap-1.5 font-mono text-[9px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
      <svg viewBox="0 0 12 12" className="h-3 w-3" aria-hidden>
        {kind === 'project' ? (
          <polygon
            points={introHexPoints(6, 6, 5)}
            fill="var(--kind-glyph-fill-project)"
            stroke="var(--kind-glyph-stroke-project)"
            strokeWidth={1}
          />
        ) : null}
        {kind === 'domain' ? (
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
        {kind === 'capability' ? (
          <circle
            cx={6}
            cy={6}
            r={4.5}
            fill="var(--kind-glyph-fill-capability)"
            stroke="var(--kind-glyph-stroke-capability)"
            strokeWidth={1}
          />
        ) : null}
        {kind === 'element' ? (
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

/**
 * 가치사슬 3-step — machined 카드 + 음각 index 숫자 (구 LandingPage
 * ValueChainRail). hover 는 보더 밝기 상승만.
 */
function IntroValueChainRail({
  steps,
}: {
  steps: ReadonlyArray<{ index: string; title: string; sub: string }>;
}) {
  return (
    <StaggeredFadeIn as="ol" className="mt-8 grid gap-3 md:grid-cols-3 md:gap-4">
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
          <p className="mt-1.5 break-keep text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {s.sub}
          </p>
        </li>
      ))}
    </StaggeredFadeIn>
  );
}

function FactItem({ label, value, muted }: { label: string; value: string; muted?: boolean }) {
  return (
    <span>
      <span className="text-[color:var(--color-text-tertiary)]">{label}</span>{' '}
      <b className={muted ? 'text-[color:var(--color-text-quaternary)]' : numeralClass}>{value}</b>
    </span>
  );
}

function ReleaseStatusItem({ label }: { label: string }) {
  return (
    <li className="flex items-start gap-2">
      <span
        className="mt-[0.42rem] h-1.5 w-1.5 shrink-0 rounded-full bg-[color:var(--color-status-warning)]"
        aria-hidden
      />
      <span>{label}</span>
    </li>
  );
}

function SectionHeading({ label, caption }: { label: string; caption: string }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-2.5">
      <span className="text-[13.5px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
        {label}
      </span>
      <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {caption}
      </span>
    </div>
  );
}

function IncludeCard({
  glyph,
  title,
  count,
  body,
}: {
  glyph: string;
  title: string;
  count?: string;
  body: string;
}) {
  return (
    <article className="flex items-start gap-2.5 rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3.5 shadow-[inset_0_1px_0_var(--color-overlay-2)]">
      <TopologyV2KindGlyph kind={glyph} size={16} className="mt-0.5 shrink-0" />
      <div className="min-w-0">
        <h3 className="text-[12.5px] font-semibold text-[color:var(--color-text-primary)]">
          {title}
          {count ? <span className={`ml-1.5 text-[11px] ${numeralClass}`}>{count}</span> : null}
        </h3>
        <p className="mt-1 text-[11.5px] leading-5 text-[color:var(--color-text-tertiary)]">{body}</p>
      </div>
    </article>
  );
}

function InstallStep({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <li className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3.5 shadow-[inset_0_1px_0_var(--color-overlay-2)]">
      <span className={`text-[11px] tracking-[0.1em] ${numeralClass}`}>{index}</span>
      <h3 className="mt-1.5 text-[13px] font-semibold text-[color:var(--color-text-primary)]">{title}</h3>
      <p className="mt-1 text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">{body}</p>
    </li>
  );
}

function TrustRow({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-[12.5px] text-[color:var(--color-text-secondary)]">
      <CheckCircle2 size={13} className="shrink-0 text-[color:var(--color-indigo-accent)]" />
      <span>{label}</span>
      {note ? (
        <span className="ml-auto whitespace-nowrap font-mono text-[11px] text-[color:var(--color-text-quaternary)]">
          {note}
        </span>
      ) : null}
    </div>
  );
}
