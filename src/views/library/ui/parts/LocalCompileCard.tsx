"use client";

import type { useTranslations } from "next-intl";
import { AlertTriangle, FileText, Loader2 } from "lucide-react";

import type { CompileCardRow, LocalCompileSession } from "@/features/vault-agent";
import { cn } from "@/shared/lib/cn";
import { Button } from "@/shared/ui";
import { ICON_SIZE } from "@/shared/ui/icon-size";

/**
 * **The card the local Compile turn ends at**, seated under step two.
 *
 * The 2026-09-06 record named the price of the local route: a page written by a model
 * from documents a person has not read themselves. This is what is put in front of the
 * button in exchange — for every page, the path it would take, what its five sections
 * carry, how many citations it holds, which sources it was written from, which were read
 * only in part, and which could not be opened at all.
 *
 * **A page that failed validation has no button.** Not a disabled one — the model
 * (`buildCompileConsentCard`) returns no proposal for it at all, so this component has
 * nothing to offer and shows the exact problem codes instead. The shape here follows the
 * ACP permission card the map and the workbench already use: the reading scrolls, and
 * Don't and Allow stay outside that scroller so the two decisions never scroll away.
 */
export function LocalCompileCard({
  session,
  model,
  t,
}: {
  session: LocalCompileSession;
  /** The runner's model name, so "who wrote this" is answered before the buttons. */
  model: string;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  if (session.status === "running") {
    return (
      <div
        data-testid="library-local-compile-running"
        className="flex items-center gap-2 rounded-panel border border-[color:var(--color-indigo-line-a35)] bg-[color:var(--color-indigo-a08)] p-[var(--card-pad)]"
      >
        <Loader2
          size={ICON_SIZE.sm}
          aria-hidden
          className="flex-none animate-spin text-[color:var(--color-indigo-accent)] motion-reduce:animate-none"
        />
        <p className="min-w-0 flex-1 text-label leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {t("localCompile.runningWith", { model, count: session.targets.length })}{" "}
          {t("localCompile.running")}
        </p>
        <Button variant="ghost" onClick={session.stop} data-testid="library-local-compile-stop">
          {t("localCompile.stop")}
        </Button>
      </div>
    );
  }

  if (session.status === "written") {
    return (
      <p
        data-testid="library-local-compile-written"
        className="rounded-panel border border-[color:var(--color-success-a35)] bg-[color:var(--color-success-a12)] p-[var(--card-pad)] text-label leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
      >
        {t("localCompile.written", { paths: session.writtenPaths.join(", ") })}
      </p>
    );
  }

  if (session.status === "failed") {
    return (
      <p
        data-testid="library-local-compile-failed"
        className="rounded-panel border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] p-[var(--card-pad)] text-label leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
      >
        {t("localCompile.failed", { reason: session.errorMessage ?? "" })}
      </p>
    );
  }

  const card = session.card;
  if (!card || (session.status !== "waiting" && session.status !== "applying")) return null;

  return (
    <div
      data-testid="library-local-compile-card"
      className="flex max-h-[60vh] min-h-0 flex-col gap-3 rounded-panel border border-[color:var(--color-indigo-a28)] bg-[color:var(--color-indigo-a08)] p-[var(--card-pad)]"
    >
      <div className="atlas-scroll-quiet flex min-h-0 shrink flex-col gap-3 overflow-y-auto">
        <h4 className="text-body font-[var(--font-weight-emphasis)] leading-title text-[color:var(--color-text-primary)]">
          {t("localCompile.title")}
        </h4>
        {card.rows.map((row) => (
          <CompileRow key={row.path} row={row} t={t} />
        ))}
        {card.rows.length === 0 ? (
          <p className="text-label leading-body text-[color:var(--color-text-tertiary)]">
            {t("localCompile.nothing")}
          </p>
        ) : null}
        <p className="text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
          {t("localCompile.noSnapshot")}
        </p>
      </div>

      {/* Outside the scroller: the two decisions must never scroll away from the reading. */}
      <div className="flex shrink-0 flex-wrap items-center justify-end gap-2">
        <Button variant="ghost" onClick={session.dismiss} data-testid="library-local-compile-deny">
          {t("localCompile.deny")}
        </Button>
        {card.proposal ? (
          <Button
            variant="primary"
            data-testid="library-local-compile-allow"
            disabled={session.status === "applying"}
            onClick={() => void session.allow()}
          >
            {session.status === "applying"
              ? t("localCompile.applying")
              : t("localCompile.allowCount", { count: card.writableCount })}
          </Button>
        ) : null}
      </div>
    </div>
  );
}

/** One proposed page. The same shell whether it is writable or refused; only the body differs. */
function CompileRow({
  row,
  t,
}: {
  row: CompileCardRow;
  t: ReturnType<typeof useTranslations<"library">>;
}) {
  return (
    <section
      data-testid="library-local-compile-row"
      data-page-ok={row.ok}
      className={cn(
        "rounded-chip border bg-[color:var(--color-panel)] p-3",
        row.ok
          ? "border-[color:var(--color-border-soft)]"
          : "border-[color:var(--color-amber-source-a35)]",
      )}
    >
      <div className="flex items-center gap-2">
        {row.ok ? (
          <FileText
            size={ICON_SIZE.sm}
            aria-hidden
            className="flex-none text-[color:var(--color-text-quaternary)]"
          />
        ) : (
          <AlertTriangle
            size={ICON_SIZE.sm}
            aria-hidden
            className="flex-none text-[color:var(--color-status-warning)]"
          />
        )}
        <span className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-primary)]">
          {row.path}
        </span>
        {row.replaces ? (
          <span className="flex-none text-caption text-[color:var(--color-text-quaternary)]">
            {t("localCompile.replaces")}
          </span>
        ) : null}
      </div>

      {row.ok ? (
        <dl className="mt-2 flex flex-col gap-1">
          <Fact
            label={t("localCompile.sectionsLabel")}
            value={row.sections
              .map((section) =>
                t("localCompile.sectionEntry", { name: section.name, count: section.entries }),
              )
              .join(" · ")}
          />
          <Fact label={t("localCompile.citationsLabel")} value={String(row.citationCount)} />
          <Fact label={t("localCompile.readLabel")} value={row.sourcesRead.join(", ")} />
          {row.sourcesTruncated.length > 0 ? (
            <Fact
              label={t("localCompile.truncatedLabel")}
              value={row.sourcesTruncated.join(", ")}
            />
          ) : null}
          {row.sourcesUnreadable.length > 0 ? (
            <Fact
              label={t("localCompile.unreadableLabel")}
              value={row.sourcesUnreadable
                .map((entry) =>
                  t("localCompile.unreadableEntry", {
                    path: entry.path,
                    reason: t(`localCompile.reason.${entry.refusal}`),
                  }),
                )
                .join(" · ")}
            />
          ) : null}
        </dl>
      ) : (
        <div className="mt-2 flex flex-col gap-1.5">
          <p className="text-label leading-body text-[color:var(--color-text-primary)] [word-break:keep-all]">
            {t("localCompile.refusedTitle")}
          </p>
          <ul className="flex flex-col gap-1">
            {row.problems.map((problem, index) => (
              <li
                key={`${problem.code}-${index}`}
                className="text-caption leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]"
              >
                <span className="font-mono text-[color:var(--color-text-quaternary)]">
                  {problem.code}
                </span>{" "}
                {problem.message}
              </li>
            ))}
          </ul>
          <p className="text-caption leading-body text-[color:var(--color-text-quaternary)] [word-break:keep-all]">
            {t("localCompile.refusedLede")}
          </p>
        </div>
      )}
    </section>
  );
}

function Fact({ label, value }: { label: string; value: string }) {
  if (!value) return null;
  return (
    <div className="flex flex-wrap items-baseline gap-x-3 gap-y-0.5">
      <dt className="w-full flex-none font-mono text-caption uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-text-quaternary)] sm:w-[148px]">
        {label}
      </dt>
      <dd className="min-w-0 flex-1 text-caption leading-body text-[color:var(--color-text-secondary)] [overflow-wrap:anywhere]">
        {value}
      </dd>
    </div>
  );
}
