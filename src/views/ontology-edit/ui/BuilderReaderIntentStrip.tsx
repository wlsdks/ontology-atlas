"use client";

import { Link } from "@/i18n/navigation";

/**
 * reader-intent 진입(`?reader=`) 안내 줄 — 헤더 바로 아래, 팔레트/캔버스
 * 위에 노출. (OntologyEditPage.tsx A4 분해 — 기능/props 무변, 물리 이동만.)
 */
export function BuilderReaderIntentStrip({
  label,
  title,
  body,
  actionLabel,
  actionHref,
}: {
  label: string;
  title: string;
  body: string;
  actionLabel: string;
  actionHref: string;
}) {
  return (
    <section
      aria-label={label}
      className="border-y border-[color:var(--color-border-soft)] py-2"
      data-testid="builder-reader-intent"
    >
      <div className="flex flex-col gap-2 sm:flex-row sm:items-center sm:justify-between">
        <div className="min-w-0">
          <p className="font-mono text-caption uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
            {label}
          </p>
          <p className="mt-1 text-body font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {title}
          </p>
          <p className="mt-1 max-w-3xl break-keep text-label leading-4 text-[color:var(--color-text-tertiary)]">
            {body}
          </p>
        </div>
        <Link
          href={actionHref}
          className="inline-flex h-8 shrink-0 items-center justify-center rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 text-caption font-[var(--font-weight-signature)] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-a36)] hover:bg-[color:var(--color-overlay-2)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a42)] focus-visible:ring-inset"
        >
          {actionLabel}
        </Link>
      </div>
    </section>
  );
}
