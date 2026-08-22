"use client";

import { useState } from "react";
import { fieldClass } from '@/shared/ui/control-class';
import { Plus, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { Button, Select, Surface, controlClass } from "@/shared/ui";
import { OntologyChangeReview } from "@/features/ontology-change-review";
import type { OntologyChangeSet } from "@/entities/knowledge-graph";

/**
 * Presentational form for creating a node from the map itself, rather than
 * assembling one in a separate builder. It only reports title + kind + optional
 * domain through `onCreate`; the vault write lives in the HomePage glue.
 */

export type CreateNodeKind = "project" | "domain" | "capability" | "element";

export interface CreateNodeFormLabels {
  headingId?: string;
  heading: string;
  titlePlaceholder: string;
  kind: string;
  /** aria label for the domain picker. */
  domain: string;
  /** The picker's visible question — plain words, not the word "domain" alone. */
  domainQuestion: string;
  /** Option label for "no domain" (unassigned). */
  domainNone: string;
  /** One line explaining what a domain is, for a non-developer. */
  domainHelper: string;
  create: string;
  cancel: string;
  reviewHeading: string;
  reviewBack: string;
  reviewConfirm: string;
  reviewConfirming: string;
  kindLabels: Record<CreateNodeKind, string>;
  /** Per-locale name UI — used only when `localeNames` is passed. */
  primaryNamePlaceholder: string;
  secondaryNamePlaceholder: string;
  localeNamesHint: string;
  primaryLocaleRequired: string;
}

// Onboarding QA 2026-07-24: the checklist's first step ("create your first
// project") asked for something this form could not create. The write path
// (`vaultFolderForKind`) already supported `project`, so it joins the options.
// Ordered by containment: project → domain → capability → element.
const KINDS: readonly CreateNodeKind[] = ["project", "domain", "capability", "element"];

export function CreateNodeForm({
  onCreate,
  onCancel,
  localeNames,
  labels,
  defaultKind = "capability",
  defaultDomain = "",
  domainOptions = [],
  review = null,
}: {
  onCreate: (input: {
    title: string;
    kind: CreateNodeKind;
    domain?: string;
    /** Per-locale display names — `{ ko, en }` → `display_ko` / `display_en`. */
    localeLabels?: Record<string, string>;
  }) => boolean | void | Promise<boolean | void>;
  onCancel?: () => void;
  labels: CreateNodeFormLabels;
  review?: {
    changeSet: OntologyChangeSet;
    confirming: boolean;
    onBack: () => void;
    onConfirm: () => void | Promise<void>;
  } | null;
  defaultKind?: CreateNodeKind;
  /**
   * Pre-picked domain (2026-08-03) — opening this from a domain node on the map
   * arrives with that domain already selected. Making someone re-pick the node
   * they just clicked is asking a question that has no need to be asked.
   */
  defaultDomain?: string;
  /**
   * Existing domains (value = bare tail-slug, label = display name). The user
   * picks from this list plus "no domain" instead of typing a slug freehand, so
   * a non-developer never has to know what a slug is. An empty list leaves only
   * "no domain" — a fresh vault, where a domain is created first and assigned
   * afterwards.
   */
  domainOptions?: readonly { value: string; label: string }[];
  /**
   * Per-locale name contract (owner instruction, 2026-07-24). The current screen
   * language is `primaryLocale`, the other is `secondaryLocale`. **The user's own
   * screen language is required**: filling only the other one leaves the raw
   * title showing on their own screen. Omit this prop for the older single-name
   * form.
   */
  localeNames?: {
    primaryLocale: string;
    secondaryLocale: string;
  };
}) {
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState<CreateNodeKind>(defaultKind);
  const [domain, setDomain] = useState(defaultDomain);
  const [secondaryName, setSecondaryName] = useState("");
  const [creating, setCreating] = useState(false);

  const primaryEmpty = title.trim().length === 0;
  // "Only the other language is filled" — block the save and say why in place.
  // Inline rather than a modal: the rule is learned without breaking the typing.
  const secondaryOnly = Boolean(localeNames) && primaryEmpty && secondaryName.trim().length > 0;
  const canCreate = !primaryEmpty && !creating;

  const submit = async () => {
    if (!canCreate) return;
    setCreating(true);
    try {
      const localeLabels = localeNames
        ? {
            [localeNames.primaryLocale]: title.trim(),
            ...(secondaryName.trim()
              ? { [localeNames.secondaryLocale]: secondaryName.trim() }
              : {}),
          }
        : undefined;
      const shouldReset = await onCreate({
        title: title.trim(),
        kind,
        domain: domain.trim() || undefined,
        localeLabels,
      });
      if (shouldReset !== false) {
        setTitle("");
        setDomain("");
        setSecondaryName("");
      }
    } finally {
      setCreating(false);
    }
  };

  return (
    <section
      aria-label={review ? labels.reviewHeading : labels.heading}
      data-testid="create-node-form"
      data-surface-role="blocking-edit-surface"
      data-elevation-contract="solid-panel-over-dimmed-map"
      data-surface-token="--topology-blocking-composer-surface"
      data-border-token="--topology-blocking-composer-border"
      data-shadow-token="--topology-blocking-composer-shadow"
      className="rounded-card border border-[color:var(--topology-blocking-composer-border)] bg-[color:var(--topology-blocking-composer-surface)] px-5 py-4 shadow-[var(--topology-blocking-composer-shadow)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p
          id={labels.headingId}
          className="font-mono text-label uppercase tracking-[var(--tracking-caps-14)] text-[color:var(--color-indigo-accent)]"
        >
          {review ? labels.reviewHeading : labels.heading}
        </p>
        {onCancel ? (
          <button
            type="button"
            onClick={onCancel}
            aria-label={labels.cancel}
            data-testid="create-node-cancel"
            className={controlClass({
              shape: "icon",
              size: "sm",
              tone: "muted",
              className:
                "hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
            })}
          >
            <X size={ICON_SIZE.sm} aria-hidden />
          </button>
        ) : null}
      </div>
      <div className="grid">
      <Surface open={!review} className="col-start-1 row-start-1">
      <div className="mt-3.5 flex flex-col gap-3.5">
        <input
          type="text"
          value={title}
          autoFocus
          disabled={creating}
          placeholder={localeNames ? labels.primaryNamePlaceholder : labels.titlePlaceholder}
          onChange={(e) => setTitle(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter") void submit();
          }}
          aria-label={localeNames ? labels.primaryNamePlaceholder : labels.titlePlaceholder}
          data-testid="create-node-title"
          className={fieldClass({ size: "lg" })}
        />
        {localeNames ? (
          <>
            {/* The field above is the current screen language (required); this one
                is the other language (optional). */}
            <input
              type="text"
              value={secondaryName}
              disabled={creating}
              placeholder={labels.secondaryNamePlaceholder}
              onChange={(e) => setSecondaryName(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter") void submit();
              }}
              aria-label={labels.secondaryNamePlaceholder}
              data-testid="create-node-title-secondary"
              className={fieldClass({ size: "lg" })}
            />
            {secondaryOnly ? (
              <p
                role="alert"
                data-testid="create-node-primary-required"
                className="text-label leading-prose text-[color:var(--color-status-warning)]"
              >
                {labels.primaryLocaleRequired}
              </p>
            ) : (
              <p className="text-label leading-prose text-[color:var(--color-text-quaternary)]">
                {labels.localeNamesHint}
              </p>
            )}
          </>
        ) : null}
        <label className="flex flex-col gap-1.5">
          <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {labels.kind}
          </span>
          <Select
            size="lg"
            value={kind}
            disabled={creating}
            onChange={(v) => setKind(v as CreateNodeKind)}
            ariaLabel={labels.kind}
            data-testid="create-node-kind"
            options={KINDS.map((k) => ({ value: k, label: labels.kindLabels[k] }))}
          />
        </label>
        {/* The picked value passes through `canonicalizeDomainRef` on save
            (HomePage glue), so the option values stay bare tail-slugs here. */}
        <div className="flex flex-col gap-1.5">
          <span className="font-mono text-label uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--color-text-quaternary)]">
            {labels.domainQuestion}
          </span>
          <Select
            size="lg"
            value={domain}
            disabled={creating}
            onChange={(v) => setDomain(v)}
            ariaLabel={labels.domain}
            data-testid="create-node-domain"
            options={[
              { value: "", label: labels.domainNone },
              ...domainOptions.map((o) => ({ value: o.value, label: o.label })),
            ]}
          />
          <p className="text-label leading-prose text-[color:var(--color-text-quaternary)]">
            {labels.domainHelper}
          </p>
        </div>
        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canCreate}
          data-testid="create-node-submit"
          className={controlClass({ shape: "pill", tone: "accentOnTint", className: "h-[var(--control-h-lg)] justify-center gap-1.5 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-3 text-body font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset" })}
        >
          <Plus size={ICON_SIZE.sm} aria-hidden />
          {labels.create}
        </button>
      </div>
      </Surface>
      <Surface open={Boolean(review)} className="col-start-1 row-start-1">
        {review ? (
          <div className="mt-3.5 grid gap-4">
            <OntologyChangeReview
              changeSet={review.changeSet}
              testId="create-node-change-review"
            />
            <div className="flex justify-end gap-2">
              <Button
                variant="ghost"
                autoFocus
                disabled={review.confirming}
                onClick={review.onBack}
              >
                {labels.reviewBack}
              </Button>
              <Button
                variant="primary"
                data-testid="create-node-confirm"
                disabled={review.confirming}
                onClick={() => void review.onConfirm()}
              >
                {review.confirming ? labels.reviewConfirming : labels.reviewConfirm}
              </Button>
            </div>
          </div>
        ) : null}
      </Surface>
      </div>
    </section>
  );
}
