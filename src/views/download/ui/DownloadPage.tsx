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
import {
  CLI_COMMAND_COUNT,
  RELEASE_MIN_MACOS,
  RELEASE_VERSION,
  buildDmgName,
} from '../lib/release-facts';
import {
  ARCH_ORDER,
  MACOS_RELEASE,
  WINDOWS_STATUS,
  formatAssetSize,
  isMacosReleasePublished,
  macosAssetFor,
  type DesktopArch,
} from '../lib/release-state';
import { CHANGELOG_PREVIEW_AS_OF, CHANGELOG_PREVIEW_ENTRIES } from '../lib/changelog-preview';
import { DOGFOOD_CENSUS } from '../model/dogfood-census.generated';
import { buildMiniatureLayout } from '../model/miniature-layout';

const GITHUB_REPOSITORY_URL = 'https://github.com/wlsdks/ontology-atlas';

// RATIO-SYSTEM.md (docs/prototypes/RATIO-SYSTEM.md) — 1600 shared container,
// 960 utility column centered inside it. Token promotion tracked separately
// (see src/views/project-selector/ui/ProjectSelectorPage.tsx for the same
// note) — local constants until `--page-max`/`--page-col-utility` land.
const PAGE_MAX_WIDTH = 1600;
const UTILITY_COL_WIDTH = 960;

const numeralClass =
  'font-mono text-[color:var(--engraved-numeral-face)] [text-shadow:var(--engraved-numeral-text-shadow)]';

export function DownloadPage() {
  const t = useTranslations('download');
  const tFooter = useTranslations('footer');
  const published = isMacosReleasePublished();
  // Apple Silicon is the default offer: every Mac sold since 2020 is one, so
  // the header's single strongest action targets it and the platform block
  // below carries the full set (Intel, checksums, Windows status).
  const primaryAsset = published ? macosAssetFor('aarch64') : null;

  return (
    <div className="flex min-h-full w-full">
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
            <span aria-hidden className="text-body text-[color:var(--color-text-quaternary)]">/</span>
            <Link
              href="/"
              className="inline-flex items-center gap-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
            >
              <ArrowLeft size={14} />
              {t('back')}
            </Link>
            <span aria-hidden className="text-body text-[color:var(--color-text-quaternary)]">/</span>
            <span className="text-[12px] text-[color:var(--color-text-tertiary)]">{t('eyebrow')}</span>
            <span className="ml-auto">
              <LocaleSwitch />
            </span>
          </nav>

          <header className="mt-7 flex flex-wrap items-start gap-4 border-t border-[color:var(--color-divider)] pt-7">
            <div className="min-w-0">
              <p className="font-mono text-[10px] uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
                {t('downloadSectionLabel')}
              </p>
              <h1 className="mt-1.5 max-w-2xl text-[clamp(1.9rem,4vw,2.75rem)] leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
                {t('title')}
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
                {t('subtitle')}
              </p>
            </div>
            <div className="ml-auto flex max-w-full shrink-0 flex-wrap items-center gap-3">
              {primaryAsset ? (
                <a
                  href={primaryAsset.downloadUrl}
                  data-testid="download-primary-cta"
                  className={cn(buttonVariants({ size: 'lg' }), 'rounded-full min-w-[13rem]')}
                >
                  <Download size={16} />
                  {t('primaryCtaPublished', { size: formatAssetSize(primaryAsset.sizeBytes) })}
                </a>
              ) : (
                <MacosDownloadLink
                  data-testid="download-primary-cta"
                  className={cn(
                    buttonVariants({ variant: 'ghost', size: 'lg' }),
                    'rounded-full min-w-[13rem]',
                  )}
                >
                  <ExternalLink size={16} />
                  {t('primaryCtaPending')}
                </MacosDownloadLink>
              )}
              <a
                href={GITHUB_REPOSITORY_URL}
                target="_blank"
                rel="noopener noreferrer"
                className={cn(buttonVariants({ variant: 'ghost', size: 'md' }), 'rounded-full')}
              >
                <ExternalLink size={16} />
                {t('sourceCta')}
              </a>
            </div>
          </header>

          {/* engraved fact strip — repo facts that hold before any build
              exists (package.json / tauri.conf.json). Per-release facts
              (size, checksum, download URL) belong to the platform block
              below, which only renders them once a release is published. */}
          <div
            data-testid="download-fact-strip"
            className="mt-6 flex flex-wrap items-baseline gap-5 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--topology-v2-panel-metric-surface,var(--color-overlay-1))] px-4 py-2.5 text-[12.5px]"
          >
            <FactItem label={t('factVersionLabel')} value={`v${RELEASE_VERSION}`} />
            <FactItem label={t('factFormatLabel')} value="DMG" />
            <FactItem label={t('factArchLabel')} value={t('factArchValue')} />
            <FactItem label={t('factMinOsLabel')} value={RELEASE_MIN_MACOS} />
            <FactItem label={t('factChannelLabel')} value={t('factChannelValue')} />
          </div>

          <PlatformBlock published={published} />

          {/* A18 — `/download`의 첫 사용자 순간은 설치 가능 여부 판단이다.
              다운로드 CTA·실제 release facts·대기 상태를 먼저 읽힌 뒤,
              구 LandingPage에서 이관한 소개는 보조 설명으로 강등한다. */}
          <div className="mt-10 border-t border-[color:var(--color-divider)] pt-10">
            <IntroSection />
          </div>

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

          {/* `min-w-0` on the tracks — without it a grid item's min-content width
              (mono command strings, nowrap release rows) forces the track wider
              than its fr share and the right card spills past the viewport at the
              lg breakpoint itself (1024px: grid clientWidth 880 vs scrollWidth
              930, card right edge 1034 > 1024). Caught by the responsive
              overflow audit spec, not by eyeballing a wide window. */}
          <div className="mt-7 grid grid-cols-1 items-stretch gap-4 lg:grid-cols-[minmax(0,1.15fr)_minmax(0,0.85fr)]">
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
              {/* The verify command names the real asset the user just
                  downloaded — deriving it from buildDmgName keeps it correct
                  across versions instead of freezing an old filename into a
                  translation string. */}
              <div className="mt-2 overflow-x-auto whitespace-nowrap rounded-[6px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 font-mono text-[11px] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
                {t('trustVerifyCommand', { file: buildDmgName('aarch64') })}
              </div>
              <p className="mt-2 break-keep text-[11.5px] leading-6 text-[color:var(--color-text-quaternary)]">
                {t('trustPolicy')}
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
              {/* A preview excerpt is a summary, not the release notes. Once
                  a release exists, point at the notes themselves rather than
                  leaving this excerpt as the only thing a visitor can read. */}
              {published ? (
                <a
                  href={MACOS_RELEASE.releaseUrl}
                  target="_blank"
                  rel="noopener noreferrer"
                  data-testid="download-release-notes-link"
                  className="mt-2 inline-flex h-7 items-center rounded-md border border-[color:var(--color-indigo-a50)] px-2.5 text-label text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
                >
                  {t('releaseNotesLink')}
                </a>
              ) : null}
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
            className="text-[clamp(1.6rem,3vw,2.2rem)] leading-display-tight font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]"
          >
            {t('titleLine1')} <br />
            <span className="text-[color:var(--color-indigo-accent)]">{t('titleEmphasis')}</span>
          </h2>
          <p className="max-w-xl break-keep text-[15px] leading-8 text-[color:var(--color-text-secondary)]">
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

      {/* [download-honesty] 이 카드의 숫자(census.concepts)는 이 저장소
          docs/ontology 의 frontmatter 노드 합이다. 앱에서 자신의 vault 를
          열면 다른 정의(런타임 파생 그래프)로 다른 숫자가 나온다 — 문맥
          라벨 없이는 같은 사용자가 두 숫자를 3배 차이로 보고 신뢰를
          잃는다. 앱 사이드 파생 로직은 이 파일 소유권 밖이라 건드리지
          않는다. */}
      <p className="break-keep border-t border-[color:var(--color-border-soft)] px-4 pt-1.5 pb-1 text-[10px] leading-4 text-[color:var(--color-text-quaternary)]">
        {t('scopeNote')}
      </p>

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

function FactItem({ label, value }: { label: string; value: string }) {
  return (
    <span>
      <span className="text-[color:var(--color-text-tertiary)]">{label}</span>{' '}
      <b className={numeralClass}>{value}</b>
    </span>
  );
}

// ─── Platform block ─────────────────────────────────────────────────────────

/**
 * The page's first job is letting a visitor answer "can I install this, on my
 * machine, right now?". Two cards answer it per platform instead of one
 * macOS-shaped narrative that leaves Windows visitors guessing whether the
 * product excludes them or simply has not shipped for them yet.
 */
function PlatformBlock({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    // Published, macOS carries two architecture rows and earns the wider
    // column; the cards then read as one set and share a row height. Before
    // publishing it is a single sentence, so stretching it to the Windows
    // card's height would open a void no content is asking for — equal
    // columns hugging their content is the tidier shape for that state.
    <div
      data-testid="download-platforms"
      className={cn(
        'mt-4 grid min-w-0 grid-cols-1 gap-4',
        published
          ? 'items-stretch lg:grid-cols-[minmax(0,1.35fr)_minmax(0,0.65fr)]'
          : 'items-start lg:grid-cols-2',
      )}
    >
      <MacosPlatformCard published={published} />

      <section
        data-testid="download-platform-windows"
        aria-labelledby="download-platform-windows-heading"
        className="flex min-w-0 flex-col rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4"
      >
        <div className="flex items-baseline gap-2">
          <h2
            id="download-platform-windows-heading"
            className="text-body-lg font-semibold text-[color:var(--color-text-primary)]"
          >
            {t('windowsHeading')}
          </h2>
          <span className="rounded-full border border-[color:var(--color-border-soft)] px-2 py-0.5 font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('windowsPendingBadge')}
          </span>
        </div>
        <p className="mt-2 break-keep text-body leading-5 text-[color:var(--color-text-tertiary)]">
          {t('windowsPendingBody')}
        </p>
        <a
          href={WINDOWS_STATUS.trackingUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="mt-4 inline-flex h-8 w-fit items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-3 text-body text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
        >
          {t('windowsTrackCta')}
        </a>
      </section>
    </div>
  );
}

function MacosPlatformCard({ published }: { published: boolean }) {
  const t = useTranslations('download');

  return (
    <section
      data-testid="download-platform-macos"
      aria-labelledby="download-platform-macos-heading"
      className="min-w-0 rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 shadow-[inset_0_1px_0_var(--color-overlay-2)]"
    >
      <div className="flex items-baseline gap-2 border-b border-[color:var(--color-divider)] pb-2.5">
        <h2
          id="download-platform-macos-heading"
          className="text-body-lg font-semibold text-[color:var(--color-text-primary)]"
        >
          {t('macosHeading')}
        </h2>
        <span className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
          {RELEASE_MIN_MACOS}
        </span>
        {published ? (
          // Neutral on purpose: the success tone is reserved for state signals
          // like "connected" / "write confirmed", and a third colour system
          // here would compete with the download button for attention.
          // `uppercase` is also wrong for a tag — it would print `V1.0.0`.
          <span className="ml-auto whitespace-nowrap font-mono text-caption tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {t('macosPublishedBadge', { tag: MACOS_RELEASE.tag })}
          </span>
        ) : null}
      </div>

      {published ? (
        <div className="grid gap-2.5 pt-3">
          {ARCH_ORDER.map((arch) => (
            <MacosArchRow key={arch} arch={arch} />
          ))}
        </div>
      ) : (
        // No published build means no size, no checksum, no download URL.
        // Saying that once beats rendering four placeholder facts that each
        // look like data.
        <p
          data-testid="download-macos-pending"
          className="break-keep pt-3 text-body leading-6 text-[color:var(--color-text-secondary)]"
        >
          {t('macosPendingBody', { tag: MACOS_RELEASE.tag })}
        </p>
      )}
    </section>
  );
}

function MacosArchRow({ arch }: { arch: DesktopArch }) {
  const t = useTranslations('download');
  const { state: copyState, copy } = useCopyFeedback(1500);
  const asset = macosAssetFor(arch);
  if (!asset) return null;

  const copyLabel =
    copyState === 'copied'
      ? t('checksumCopied')
      : copyState === 'failed'
        ? t('checksumCopyFailed')
        : t('checksumCopy');

  return (
    <div className="min-w-0 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] p-3">
      <div className="flex min-w-0 flex-wrap items-center gap-x-3 gap-y-2">
        {/* Outline, not filled: the header already spends the page's one
            primary action on the Apple Silicon download. Three filled indigo
            buttons would leave no attention winner. */}
        <a
          href={asset.downloadUrl}
          data-testid={`download-macos-${arch}`}
          className={cn(buttonVariants({ variant: 'outline', size: 'sm' }), 'rounded-full')}
        >
          <Download size={15} />
          {t(arch === 'aarch64' ? 'archAppleSiliconCta' : 'archIntelCta')}
        </a>
        <span className={`text-body ${numeralClass}`}>{formatAssetSize(asset.sizeBytes)}</span>
        <span className="min-w-0 flex-1 truncate text-right font-mono text-label text-[color:var(--color-text-quaternary)]">
          {asset.fileName}
        </span>
      </div>
      <div className="mt-2 flex min-w-0 items-center gap-2">
        <span className="shrink-0 font-mono text-caption uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {t('checksumLabel')}
        </span>
        <span className={`min-w-0 flex-1 truncate text-label tracking-[0.02em] ${numeralClass}`}>
          {asset.sha256}
        </span>
        <button
          type="button"
          onClick={() => void copy(asset.sha256)}
          aria-label={copyLabel}
          className="inline-flex h-7 shrink-0 items-center gap-1.5 rounded-md border border-[color:var(--color-border-soft)] px-2 font-mono text-caption text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)]"
        >
          {copyState === 'copied' ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
          {t('checksumCopy')}
        </button>
      </div>
      <span className="sr-only" aria-live="polite" aria-atomic="true">
        {copyState === 'copied' ? t('checksumCopied') : copyState === 'failed' ? t('checksumCopyFailed') : ''}
      </span>
    </div>
  );
}

function SectionHeading({ label, caption }: { label: string; caption: string }) {
  return (
    <div className="mb-3 mt-7 flex items-center gap-2.5">
      <span className="text-[13.5px] font-medium tracking-[-0.01em] text-[color:var(--color-text-primary)]">
        {label}
      </span>
      <span className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
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
        <h3 className="text-body font-semibold text-[color:var(--color-text-primary)]">
          {title}
          {count ? <span className={`ml-1.5 text-label ${numeralClass}`}>{count}</span> : null}
        </h3>
        <p className="mt-1 text-label leading-5 text-[color:var(--color-text-tertiary)]">{body}</p>
      </div>
    </article>
  );
}

function InstallStep({ index, title, body }: { index: string; title: string; body: string }) {
  return (
    <li className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3.5 shadow-[inset_0_1px_0_var(--color-overlay-2)]">
      <span className={`text-label tracking-[0.1em] ${numeralClass}`}>{index}</span>
      <h3 className="mt-1.5 text-body-lg font-semibold text-[color:var(--color-text-primary)]">{title}</h3>
      <p className="mt-1 text-body leading-5 text-[color:var(--color-text-tertiary)]">{body}</p>
    </li>
  );
}

function TrustRow({ label, note }: { label: string; note: string }) {
  return (
    <div className="flex items-center gap-2 py-1 text-body text-[color:var(--color-text-secondary)]">
      <CheckCircle2 size={13} className="shrink-0 text-[color:var(--color-indigo-accent)]" />
      <span>{label}</span>
      {note ? (
        <span className="ml-auto whitespace-nowrap font-mono text-label text-[color:var(--color-text-quaternary)]">
          {note}
        </span>
      ) : null}
    </div>
  );
}
