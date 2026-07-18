'use client';

import { ArrowLeft, Check, CheckCircle2, Clipboard, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { useCopyFeedback } from '@/shared/lib/use-copy-feedback';
import { buttonVariants } from '@/shared/ui';
import { TopologyV2KindGlyph } from '@/shared/ui/topology-v2-kind-glyph';
import { LocaleSwitch } from '@/features/locale-switch';
import { GITHUB_RELEASES_URL, MacosDownloadLink } from '@/features/macos-download-link';
import { RELEASE_MIN_MACOS, RELEASE_VERSION } from '../lib/release-facts';
import { CHANGELOG_PREVIEW_AS_OF, CHANGELOG_PREVIEW_ENTRIES } from '../lib/changelog-preview';

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
  const { state: checksumCopyState, copy: copyChecksum } = useCopyFeedback(1500);
  const checksumCopyLabel =
    checksumCopyState === 'copied'
      ? t('checksumCopyCopied')
      : checksumCopyState === 'failed'
        ? t('checksumCopyFailed')
        : t('checksumCopy');

  return (
    <main
      id="main"
      className="min-h-screen bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(56px+env(safe-area-inset-bottom)+1rem)] md:px-10 md:py-10 md:pb-10"
    >
      <div className="mx-auto" style={{ maxWidth: PAGE_MAX_WIDTH }}>
        <div className="mx-auto" style={{ maxWidth: UTILITY_COL_WIDTH }}>
          <nav className="flex flex-wrap items-center gap-3 pb-6">
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

          <header className="flex flex-wrap items-start gap-4">
            <div className="min-w-0">
              <h1 className="max-w-2xl text-[clamp(1.9rem,4vw,2.75rem)] leading-[1.05] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
                {t('title')}
              </h1>
              <p className="mt-3 max-w-xl text-[13px] leading-6 text-[color:var(--color-text-secondary)]">
                {t('subtitle')}
              </p>
            </div>
            <div className="ml-auto flex shrink-0 flex-wrap items-center gap-3">
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
          <div className="mt-6 flex flex-wrap items-baseline gap-5 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--topology-v2-panel-metric-surface,rgba(255,255,255,0.028))] px-4 py-2.5 text-[12.5px]">
            <FactItem label={t('factVersionLabel')} value={`v${RELEASE_VERSION}`} />
            <FactItem label={t('factFormatLabel')} value="DMG" />
            <FactItem label={t('factArchLabel')} value={t('factArchValue')} />
            <FactItem label={t('factSizeLabel')} value={t('factSizeValuePending')} muted />
            <FactItem label={t('factMinOsLabel')} value={RELEASE_MIN_MACOS} />
            <FactItem label={t('factChannelLabel')} value={t('factChannelValue')} />
          </div>
          <div className="mt-2 flex items-baseline gap-3 rounded-[7px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-4 py-2.5 shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]">
            <span className="shrink-0 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
              {t('checksumLabel')}
            </span>
            <span className={`min-w-0 flex-1 truncate text-[11.5px] tracking-[0.02em] ${numeralClass}`}>
              {'0'.repeat(64)}{' '}
              <span className="text-[color:var(--color-text-quaternary)] [text-shadow:none]">
                — {t('checksumValuePending')}
              </span>
            </span>
            <button
              type="button"
              onClick={() => void copyChecksum('0'.repeat(64))}
              aria-label={checksumCopyLabel}
              className="inline-flex h-7 shrink-0 items-center gap-1 rounded-[5px] border border-[color:var(--color-border-soft)] px-2 font-mono text-[10px] text-[color:var(--color-text-tertiary)] transition-colors hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)]"
            >
              {checksumCopyState === 'copied' ? <Check size={12} aria-hidden /> : <Clipboard size={12} aria-hidden />}
              {t('checksumCopy')}
            </button>
          </div>
          <p className="mt-3 max-w-2xl text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t('releaseAvailabilityNote')}
          </p>

          {showFirstReleaseChecklist ? (
            <div className="mt-4 grid min-w-0 gap-2 rounded-lg border border-[color:rgba(244,183,49,0.34)] bg-[color:rgba(244,183,49,0.08)] p-3">
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
              <div className="mt-1 min-w-0 rounded-md border border-[color:rgba(244,183,49,0.24)] bg-[color:rgba(0,0,0,0.12)] p-2">
                <div className="flex min-w-0 flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0 flex-1">
                    <p className="font-mono text-[10px] uppercase text-[color:var(--color-status-warning)]">
                      {t('releaseStatusAuditLabel')}
                    </p>
                    <code className="mt-1 block overflow-x-auto whitespace-nowrap rounded-sm bg-[color:rgba(0,0,0,0.16)] px-2 py-1 font-mono text-[10px] text-[color:var(--color-text-secondary)]">
                      {RELEASE_STATUS_COMMAND}
                    </code>
                  </div>
                  <button
                    type="button"
                    onClick={() => void copyReleaseStatus(RELEASE_STATUS_COMMAND)}
                    className="inline-flex min-h-8 shrink-0 items-center justify-center gap-1.5 rounded-md border border-[color:rgba(244,183,49,0.30)] bg-[color:rgba(244,183,49,0.08)] px-2.5 py-1.5 font-mono text-[10px] text-[color:var(--color-status-warning)] transition-colors hover:bg-[color:rgba(244,183,49,0.13)]"
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
              count={t('includeCliCount')}
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
            <div className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
              <div className="flex items-center gap-2 pb-2">
                <ShieldCheck size={15} className="text-[color:var(--color-indigo-accent)]" />
                <h2 className="text-[13px] font-semibold text-[color:var(--color-text-primary)]">
                  {t('trustHeading')}
                </h2>
              </div>
              <TrustRow label={t('proofSigned')} note={t('trustSignedNote')} />
              <TrustRow label={t('proofNotarized')} note={t('trustNotarizedNote')} />
              <TrustRow label={t('proofChecksum')} note="" />
              <div className="mt-2 overflow-x-auto whitespace-nowrap rounded-[6px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-canvas)] px-3 py-2 font-mono text-[11px] text-[color:var(--color-text-tertiary)] shadow-[inset_0_1px_2px_rgba(0,0,0,0.35)]">
                {t('trustVerifyCommand')}
              </div>
              <p className="mt-2 text-[11.5px] leading-6 text-[color:var(--color-text-quaternary)]">
                {t('trustNote')}
              </p>
            </div>

            <div className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-4 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
              className="inline-flex h-8 shrink-0 items-center rounded-md border border-[color:rgba(94,106,210,0.5)] px-3 text-[12px] text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-overlay-2)]"
            >
              {t('githubOpen')}
            </a>
          </section>

          <p className="mt-6 rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] p-3 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
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
    <article className="flex items-start gap-2.5 rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
    <li className="rounded-[9px] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] p-3.5 shadow-[inset_0_1px_0_rgba(255,255,255,0.05)]">
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
