"use client";

// Aliased: under HMR a bare `History` can resolve to the DOM's global `History` constructor
// and throw "Illegal constructor"; an alias cannot collide with a global.
import {
  Check,
  Download,
  FolderOpen,
  History as HistoryIcon,
  ShieldCheck,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Link } from "@/i18n/navigation";
import type { OntologyChangeset } from "@/entities/knowledge-graph";
import { OntologyMapKindGlyph } from "@/shared/ui/map-kind-glyph";
import { buttonVariants } from "@/shared/ui";
import { cn } from "@/shared/lib/cn";
import { PAGE_TITLE } from "@/shared/ui/page-frame";
import type { Translator } from "../lib/translator";

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
 * The destination headline. `inColumn` drops the full-width divider to match the column;
 * `trailing` is state at the right; `showScope` says the recording scope here, which the
 * workbench says in its dock.
 */
export function PageHeader({
  t,
  inColumn = false,
  showScope = true,
  trailing,
}: {
  t: Translator;
  inColumn?: boolean;
  showScope?: boolean;
  trailing?: React.ReactNode;
}) {
  return (
    <header
      className={cn(
        "flex shrink-0 flex-wrap items-baseline justify-between gap-x-4 gap-y-1.5",
        inColumn ? "pb-1" : "border-b border-[color:var(--color-border-soft)] px-5 pt-1 pb-4",
      )}
    >
      <div className="flex min-w-0 flex-col gap-1.5">
        {/* Ramp utilities only: an arbitrary-length token raises the size but keeps the smaller step's
            leading. The display step matches every destination's h1; the pane's selection headline
            outranks it with `text-hero`. */}
        <h1 className={cn("flex items-center gap-2", PAGE_TITLE)}>
          <HistoryIcon size={ICON_SIZE.lg} aria-hidden className="text-[color:var(--color-indigo-text-soft)]" />
          {t("title")}
        </h1>
        {/* The scope notice stands here: nothing outside the folder is touched. */}
        {showScope ? (
          <p className="flex items-center gap-1.5 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="shrink-0" />
            {t("scopeNotice")}
          </p>
        ) : null}
      </div>
      {trailing}
    </header>
  );
}

/**
 * The connect flow: three steps, since a remote is optional and a local-only history is a
 * complete state. Each step has a name and a description on a hairline progress rail; done is
 * an indigo-outlined check, current a filled indigo mark, later neutral.
 */
const LADDER_NOTE_KEY = ["stepAppNote", "stepFolderNote", "stepStartNote"] as const;

function ConnectLadder({ t, current }: { t: Translator; current: SetupStep }) {
  const steps = [t("stepApp"), t("stepFolder"), t("stepStart")];
  return (
    <ol
      data-testid="atlas-git-ladder"
      className="flex flex-col border-l border-[color:var(--color-divider)]"
    >
      {steps.map((label, index) => {
        const step = index + 1;
        const done = step < current;
        const active = step === current;
        return (
          <li
            key={label}
            data-step-state={done ? "done" : active ? "current" : "todo"}
            aria-current={active ? "step" : undefined}
            className="relative grid grid-cols-[24px_minmax(0,1fr)] items-start gap-3 py-2 pl-4"
          >
            {/* Only the current step paints indigo over the existing hairline. */}
            {active ? (
              <span
                aria-hidden
                className="absolute top-0 bottom-0 -left-px w-px bg-[color:var(--color-indigo-accent)]"
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
            <span className="flex min-w-0 flex-col">
              <span
                className={cn(
                  "truncate text-body font-[var(--font-weight-emphasis)]",
                  active
                    ? "text-[color:var(--color-text-primary)]"
                    : "text-[color:var(--color-text-tertiary)]",
                )}
              >
                {label}
              </span>
              <span className="text-label text-[color:var(--color-text-quaternary)]">
                {done ? t("stepDoneA11y") : t(LADDER_NOTE_KEY[index])}
              </span>
            </span>
            {active ? <span className="sr-only">{t("stepCurrentA11y")}</span> : null}
          </li>
        );
      })}
    </ol>
  );
}

/**
 * A miniature of the connected workbench, so the setup's one request shows what it offers.
 * No data is invented: names are redaction bars, and kinds use `OntologyMapKindGlyph`. The
 * classes `opacity-45` and `aria-hidden` keep it out of assistive technology and the keyboard.
 */
const PREVIEW_ROW_KINDS = [
  "capability",
  "domain",
  "element",
  "capability",
  "element",
  "capability",
] as const;
/** Satellite coordinates (%) on the four `EGO_BEARINGS`, the real layout of the ego drawing. */
const PREVIEW_SATELLITES = [
  { x: 50, y: 14, kind: "domain" },
  { x: 86, y: 50, kind: "element" },
  { x: 50, y: 86, kind: "capability" },
  { x: 14, y: 50, kind: "element" },
] as const;

function SetupPreview({ t }: { t: Translator }) {
  return (
    <div className="hidden min-w-0 flex-col gap-3 lg:flex">
      <div
        aria-hidden
        data-testid="atlas-git-setup-preview"
        className="overflow-hidden rounded-[var(--radius-panel)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] opacity-45"
      >
        <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-3 py-2">
          <span className="h-1.5 w-24 rounded-full bg-[color:var(--color-overlay-3)]" />
          <span className="ml-auto h-4 w-10 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)]" />
        </div>
        {/* Between `lg` and `xl` only the timeline survives — forcing two cells
            into a narrow width gives a mangled diagram, not a smaller one. */}
        <div className="grid grid-cols-1 xl:grid-cols-[minmax(0,1fr)_minmax(0,1.1fr)]">
          <div className="flex flex-col py-1.5 xl:border-r xl:border-[color:var(--color-divider)]">
            <span className="flex h-[var(--git-row-h)] items-center gap-2 border-l-2 border-dashed border-l-[color:var(--color-indigo-a46)] pr-3 pl-2.5">
              <span className="h-1.5 w-8 rounded-full bg-[color:var(--color-overlay-2)]" />
              <span className="h-1.5 flex-1 rounded-full bg-[color:var(--color-overlay-3)]" />
            </span>
            {PREVIEW_ROW_KINDS.map((kind, index) => (
              <span
                key={`${kind}-${String(index)}`}
                className={cn(
                  "flex h-[var(--git-row-h)] items-center gap-2 border-l-2 pr-3 pl-2.5",
                  index === 0
                    ? "border-l-[color:var(--color-indigo-brand)] bg-[color:var(--color-overlay-2)]"
                    : "border-l-transparent",
                )}
              >
                <span className="h-1.5 w-6 rounded-full bg-[color:var(--color-overlay-2)]" />
                <OntologyMapKindGlyph kind={kind} size={11} />
                <span
                  className="h-1.5 rounded-full bg-[color:var(--color-overlay-3)]"
                  style={{ width: `${String(46 + index * 9)}%` }}
                />
              </span>
            ))}
          </div>
          <div className="hidden min-w-0 flex-col gap-2.5 p-3 xl:flex">
            <span className="h-1.5 w-2/3 rounded-full bg-[color:var(--color-overlay-3)]" />
            {/* Bars, not words: no ink passes AA at `opacity-45`. The caption step stays for its
                leading, which sets the chip height. */}
            <div className="flex flex-wrap gap-1.5">
              {(["capability", "element"] as const).map((kind) => (
                <span
                  key={kind}
                  className="inline-flex items-center gap-1.5 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] px-1.5 py-0.5 text-caption"
                >
                  <OntologyMapKindGlyph kind={kind} size={9} />
                  <span className="h-1.5 w-4 rounded-full bg-[color:var(--color-overlay-3)]" />
                </span>
              ))}
            </div>
            <div className="relative h-32 rounded-[var(--radius-card)] border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)]">
              <svg
                viewBox="0 0 100 100"
                preserveAspectRatio="none"
                className="absolute inset-0 h-full w-full"
              >
                {PREVIEW_SATELLITES.map((s) => (
                  <line
                    key={`${String(s.x)}-${String(s.y)}-${s.kind}`}
                    x1="50"
                    y1="50"
                    x2={s.x}
                    y2={s.y}
                    stroke="var(--map-edge-contains)"
                    strokeWidth={1}
                    vectorEffect="non-scaling-stroke"
                  />
                ))}
              </svg>
              <span className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-canvas)] p-1">
                <OntologyMapKindGlyph kind="capability" size={17} />
              </span>
              {PREVIEW_SATELLITES.map((s) => (
                <span
                  key={`g-${String(s.x)}-${String(s.y)}`}
                  className="absolute -translate-x-1/2 -translate-y-1/2 rounded-full bg-[color:var(--color-canvas)] p-1"
                  style={{ left: `${String(s.x)}%`, top: `${String(s.y)}%` }}
                >
                  <OntologyMapKindGlyph kind={s.kind} size={11} />
                </span>
              ))}
            </div>
          </div>
        </div>
      </div>
      <p className="text-center text-label text-[color:var(--color-text-quaternary)]">
        {t("previewCaption")}
      </p>
    </div>
  );
}

/**
 * The centred setup stage every not-yet-recording state shares: the telling cell with the
 * task as h1 and, from `xl`, the showing cell (`SetupPreview`). It enters with
 * `.topology-chrome-in`, whose reduced-motion equivalent the globals layer supplies.
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
  /** The promise on the last line, by default the recording-scope notice, just before the action. */
  note?: string;
  children?: React.ReactNode;
}) {
  return (
    <div
      data-testid="atlas-git-setup"
      data-setup-state={state}
      className="topology-chrome-in grid w-full flex-1 grid-cols-1 content-center items-center gap-9 py-[var(--git-setup-top)] lg:grid-cols-[minmax(0,var(--git-setup-measure))_minmax(0,var(--git-setup-preview-max))] lg:justify-center lg:gap-10 xl:gap-14"
    >
      {/* Capped at the prose measure at every width, or below `lg` the divider and CLI line stretch. */}
      <div className="flex min-w-0 max-w-[var(--git-setup-measure)] flex-col gap-5">
        {/* The destination name is an eyebrow; the h1 is the task at hand. */}
        <p className="flex items-center gap-2 text-label text-[color:var(--color-text-quaternary)]">
          <HistoryIcon size={ICON_SIZE.sm} aria-hidden className="text-[color:var(--color-indigo-text-soft)]" />
          {t("title")}
        </p>
        <div className="flex flex-col gap-2">
          <h1 className={PAGE_TITLE}>
            {title}
          </h1>
          {body ? (
            <p className="max-w-[34em] text-body-lg leading-body-lg text-[color:var(--color-text-secondary)]">
              {body}
            </p>
          ) : null}
        </div>
        {step ? <ConnectLadder t={t} current={step} /> : null}
        {children}
        {note ? (
          <p className="flex items-start gap-2 text-label leading-prose text-[color:var(--color-text-quaternary)]">
            <ShieldCheck size={ICON_SIZE.sm} aria-hidden className="mt-0.5 shrink-0" />
            <span>{note}</span>
          </p>
        ) : null}
      </div>
      <SetupPreview t={t} />
    </div>
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
      className="flex flex-col gap-1.5 border-t border-[color:var(--color-divider)] pt-4"
    >
      <SectionLabel>{title}</SectionLabel>
      {rows.length > 0 ? (
        <ul className="flex flex-wrap items-center gap-x-3 gap-y-1">
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
      <Link
        href="/download"
        data-testid="atlas-git-web-get-app"
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), SETUP_ACTION_PLACEMENT, "self-start")}
      >
        <Download size={ICON_SIZE.md} aria-hidden />
        {t("webGetApp")}
      </Link>

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
        className={cn(buttonVariants({ variant: "primary", size: "sm" }), SETUP_ACTION_PLACEMENT, "self-start")}
      >
        <FolderOpen size={ICON_SIZE.md} aria-hidden />
        {t("noVaultAction")}
      </Link>
    </SetupFrame>
  );
}
