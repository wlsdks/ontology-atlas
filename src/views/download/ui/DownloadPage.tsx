'use client';

import { ArrowLeft, CheckCircle2, Download, ExternalLink, ShieldCheck } from 'lucide-react';
import { useTranslations } from 'next-intl';
import { Link } from '@/i18n/navigation';
import { cn } from '@/shared/lib/cn';
import { buttonVariants } from '@/shared/ui';
import { LocaleSwitch } from '@/features/locale-switch';
import { MacosDownloadLink } from '@/features/macos-download-link';

const GITHUB_REPOSITORY_URL = 'https://github.com/wlsdks/oh-my-ontology';

interface Props {
  showFirstReleaseChecklist?: boolean;
}

export function DownloadPage({ showFirstReleaseChecklist = true }: Props) {
  const t = useTranslations('download');
  const tFooter = useTranslations('footer');

  return (
    <main
      id="main"
      className="min-h-screen bg-[color:var(--color-canvas)] px-[max(1.5rem,env(safe-area-inset-left))] py-[max(1.5rem,env(safe-area-inset-top))] pr-[max(1.5rem,env(safe-area-inset-right))] pb-[calc(56px+env(safe-area-inset-bottom)+1rem)] md:px-10 md:py-10 md:pb-10"
    >
      <header className="mx-auto flex w-full max-w-6xl flex-wrap items-center justify-between gap-3">
        <Link
          href="/"
          className="inline-flex items-center gap-2 text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <ArrowLeft size={14} />
          {t('back')}
        </Link>
        <LocaleSwitch />
      </header>

      <section className="mx-auto grid w-full max-w-6xl gap-10 py-12 md:grid-cols-[minmax(0,1fr)_25rem] md:items-start md:gap-12 md:py-16">
        <div className="space-y-6">
          <p className="font-mono text-[11px] uppercase tracking-[0.2em] text-[color:var(--color-text-quaternary)]">
            {t('eyebrow')}
          </p>
          <div className="space-y-4">
            <h1 className="max-w-3xl text-[clamp(2.3rem,5vw,4.1rem)] leading-[1.03] font-[var(--font-weight-signature)] tracking-[var(--tracking-display)] text-[color:var(--color-text-primary)]">
              {t('title')}
            </h1>
            <p className="max-w-2xl text-base leading-7 text-[color:var(--color-text-secondary)]">
              {t('subtitle')}
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3 pt-2">
            <MacosDownloadLink
              className={cn(buttonVariants({ size: 'lg' }), 'rounded-full min-w-[15rem]')}
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
          <p className="max-w-2xl text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
            {t('releaseAvailabilityNote')}
          </p>

          {showFirstReleaseChecklist ? (
            <div className="grid max-w-2xl gap-2 rounded-lg border border-[color:rgba(244,183,49,0.34)] bg-[color:rgba(244,183,49,0.08)] p-3">
              <p className="font-mono text-[10px] uppercase text-[color:var(--color-status-warning)]">
                {t('releaseStatusTitle')}
              </p>
              <ul className="grid gap-1.5 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
                <ReleaseStatusItem label={t('releaseStatusPr')} />
                <ReleaseStatusItem label={t('releaseStatusSecrets')} />
                <ReleaseStatusItem label={t('releaseStatusRelease')} />
                <ReleaseStatusItem label={t('releaseStatusHosted')} />
              </ul>
            </div>
          ) : null}

          <div className="grid gap-3 border-y border-[color:var(--color-divider)] py-5 md:grid-cols-3">
            <ProofItem label={t('proofSigned')} />
            <ProofItem label={t('proofNotarized')} />
            <ProofItem label={t('proofChecksum')} />
          </div>
        </div>

        <aside className="rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] p-4">
          <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] pb-3">
            <ShieldCheck size={16} className="text-[color:var(--color-indigo-accent)]" />
            <h2 className="text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
              {t('installTitle')}
            </h2>
          </div>
          <ol className="mt-4 grid gap-3">
            <InstallStep index="1" title={t('step1Title')} body={t('step1Body')} />
            <InstallStep index="2" title={t('step2Title')} body={t('step2Body')} />
            <InstallStep index="3" title={t('step3Title')} body={t('step3Body')} />
          </ol>
          <p className="mt-5 rounded-md border border-[color:rgba(94,106,210,0.24)] bg-[color:rgba(94,106,210,0.07)] p-3 text-[12px] leading-5 text-[color:var(--color-text-secondary)]">
            {t('releaseGateNote')}
          </p>
        </aside>
      </section>

      <footer className="mx-auto flex w-full max-w-6xl flex-wrap items-center gap-x-4 gap-y-2 border-t border-[color:var(--color-divider)] pt-4 text-[11px] text-[color:var(--color-text-quaternary)]">
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
      </footer>
    </main>
  );
}

function ProofItem({ label }: { label: string }) {
  return (
    <div className="flex items-center gap-2 text-[12px] text-[color:var(--color-text-secondary)]">
      <CheckCircle2 size={14} className="shrink-0 text-[color:var(--color-indigo-accent)]" />
      <span>{label}</span>
    </div>
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

function InstallStep({
  index,
  title,
  body,
}: {
  index: string;
  title: string;
  body: string;
}) {
  return (
    <li className="grid grid-cols-[1.75rem_1fr] gap-3">
      <span className="flex h-7 w-7 items-center justify-center rounded-md border border-[color:rgba(94,106,210,0.28)] bg-[color:rgba(94,106,210,0.08)] font-mono text-[10px] text-[color:var(--color-indigo-accent)]">
        {index}
      </span>
      <span>
        <span className="block text-[13px] font-medium text-[color:var(--color-text-primary)]">
          {title}
        </span>
        <span className="mt-1 block text-[12px] leading-5 text-[color:var(--color-text-tertiary)]">
          {body}
        </span>
      </span>
    </li>
  );
}
