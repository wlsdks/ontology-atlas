"use client";

// Aliased: under HMR a bare `History` can resolve to the DOM's global `History` constructor
// and throw "Illegal constructor"; an alias cannot collide with a global.
import {
  Check,
  FolderOpen,
  ShieldCheck,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/tokens/icon-size";
import { Link } from "@/i18n/navigation";
import type { OntologyChangeset } from "@/entities/knowledge-graph";
import { buttonVariants, FeatureStage, GetAppLink } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import type { Translator } from "../lib/translator";
import { GitHistoryArtwork } from "./GitHistoryArtwork";

export const SETUP_ACTION_PLACEMENT = "atlas-touch-floor atlas-touch-floor-wide shrink-0";

export type SetupStep = 1 | 2 | 3;

/**
 * Section label in the body face at `--text-label` with quaternary ink; a mono uppercase
 * tracked eyebrow is Latin-only and breaks Hangul word spacing.
 */
function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <span className="text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-quaternary)]">
      {children}
    </span>
  );
}

/**
 * The connect flow: three steps, since a remote is optional and a local-only history is a
 * complete state. Each step has a name and a description on a hairline progress rail; done is
 * an indigo-outlined check, current a filled indigo mark, later neutral.
 */
function ConnectLadder({ t, current }: { t: Translator; current: SetupStep }) {
  const steps = [t("stepApp"), t("stepFolder"), t("stepStart")];
  return (
    <ol data-testid="atlas-git-ladder" className="mt-6 flex w-full max-w-md items-start justify-center">
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            data-step-state={done ? "done" : active ? "current" : "todo"}
            aria-current={active ? "step" : undefined}
            className="relative flex min-w-0 flex-1 flex-col items-center gap-2 px-1"
          >
            {/* The hairline back to the previous step; indigo once that step is done. */}
            {index > 0 ? (
              <span
                aria-hidden
                className={cn(
                  "absolute top-3 right-[calc(50%+16px)] left-[calc(-50%+16px)] h-px",
                  step <= current ? "bg-[color:var(--color-indigo-line-a35)]" : "bg-[color:var(--color-divider)]",
                )}
              />
            ) : null}
            <span
              aria-hidden
              className={cn(
                // `text-label`, not `text-caption`: indigo at caption size sits at the AA contrast
                // threshold, and 11px fits the 24px circle.
                "grid size-6 shrink-0 place-items-center rounded-full border text-label tabular-nums",
                done
                  ? "border-[color:var(--color-indigo-a46)] text-[color:var(--color-indigo-text-soft)]"
                  : active
                    ? "border-[color:var(--color-indigo-accent)] bg-[color:var(--color-indigo-a16)] text-[color:var(--color-indigo-text-soft)]"
                    : "border-[color:var(--color-border-soft)] text-[color:var(--color-text-quaternary)]",
              )}
            >
              {done ? <Check size={ICON_SIZE.sm} /> : step}
            </span>
            <span
              className={cn(
                "text-body font-[var(--font-weight-emphasis)]",
                active ? "text-[color:var(--color-text-primary)]" : "text-[color:var(--color-text-tertiary)]",
              )}
            >
              {label}
            </span>
            {done ? <span className="sr-only">{t("stepDoneA11y")}</span> : null}
            {active ? <span className="sr-only">{t("stepCurrentA11y")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * The centred setup stage every not-yet-recording state shares: the history artwork, the task as
 * h1, the connect steps and this state's action.
 */
export function SetupFrame({
  t,
  step,
  state,
  title,
  body,
  note,
  children,
}: {
  t: Translator;
  /** `null` skips the connect flow (loading and error are events, not steps). */
  step: SetupStep | null;
  state: string;
  /** This moment's task in one sentence — the screen's h1. */
  title: string;
  body?: string;
  /** The promise on the last line, by default the recording-scope notice. */
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <FeatureStage
      data-testid="atlas-git-setup"
      data-setup-state={state}
      data-placement="stage"
      titleAs="h1"
      art={(motionState) => <GitHistoryArtwork {...motionState} />}
      title={title}
      body={body}
      alert={step ? <ConnectLadder t={t} current={step} /> : undefined}
      action={children ? <div className="flex w-full flex-col items-center gap-4">{children}</div> : undefined}
      note={note ? <><ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" /><span>{note}</span></> : undefined}
    />
  );
}

/**
 * What changed this session, independent of git: `computeOntologyChangeset` against the
 * per-vault `change-baseline-store` baseline, which survives a reload. Shown on desktop and web.
 */
export function SessionChangeSummary({
  t,
  changeset,
  title,
}: {
  t: Translator;
  changeset: OntologyChangeset | null;
  /** Section title — web and desktop use different wording. */
  title: string;
}) {
  const rows = changeset
    ? (
        [
          ["webNodesAdded", changeset.addedNodes.length],
          ["webNodesChanged", changeset.changedNodes.length],
          ["webNodesRemoved", changeset.removedNodes.length],
          ["webEdgesAdded", changeset.addedEdges.length],
          ["webEdgesRemoved", changeset.removedEdges.length],
        ] as const
      ).filter(([, count]) => count > 0)
    : [];
  return (
    <div
      data-testid="atlas-git-session-changes"
      className="flex w-full max-w-md flex-col items-center gap-1.5 border-t border-[color:var(--color-divider)] pt-4"
    >
      <SectionLabel>{title}</SectionLabel>
      {rows.length > 0 ? (
        <ul className="flex flex-wrap items-center justify-center gap-x-3 gap-y-1">
          <li aria-hidden className="flex items-center">
            <span className="h-1.5 w-1.5 rounded-full bg-[color:var(--color-status-warning)]" />
          </li>
          {rows.map(([key, count]) => (
            <li key={key} className="text-body text-[color:var(--color-text-secondary)]">
              {t(key, { count })}
            </li>
          ))}
        </ul>
      ) : (
        <p className="text-body text-[color:var(--color-text-quaternary)]">{t("webNoChanges")}</p>
      )}
    </div>
  );
}

export function WebSetup({
  t,
  sessionChangeset,
}: {
  t: Translator;
  sessionChangeset: OntologyChangeset | null;
}) {
  return (
    <SetupFrame
      t={t}
      step={1}
      state="web"
      title={t("webTitle")}
      body={t("webDesktopHint")}
      note={t("scopeNotice")}
    >
      <GetAppLink data-testid="atlas-git-web-get-app" className="shrink-0">{t("webGetApp")}</GetAppLink>

      {/* What changed this time — the **basis** for the action, so it sits below the primary action. */}
      <SessionChangeSummary t={t} changeset={sessionChangeset} title={t("webSummaryTitle")} />

      {/*
       * No CLI escape here: it needs a source checkout, and plain `git commit` already works.
       * The degradation card (`surfaces.md`) is complete: why in the body, where in `/download`,
       * what works here in the session summary below.
       */}
    </SetupFrame>
  );
}

/** The app is open without a folder: the next step is choosing one, never getting the app. */
export function NoVaultSetup({ t }: { t: Translator }) {
  return (
    <SetupFrame
      t={t}
      step={2}
      state="no-vault"
      title={t("noVaultTitle")}
      body={t("noVaultBody")}
      note={t("scopeNotice")}
    >
      <Link
        href="/docs"
        data-testid="atlas-git-pick-vault"
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), SETUP_ACTION_PLACEMENT)}
      >
        <FolderOpen size={ICON_SIZE.md} aria-hidden />
        {t("noVaultAction")}
      </Link>
    </SetupFrame>
  );
}
