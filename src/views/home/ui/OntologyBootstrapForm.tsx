"use client";

import { useMemo, useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import {
  selectedElements,
  type BootstrapPlan,
} from "@/features/docs-vault-local";
import { controlClass, fieldClass } from "@/shared/ui/control-class";
import { Checkbox } from "@/shared/ui";

/**
 * The first-graph bootstrap form for someone who opened an existing .md folder
 * with no frontmatter. Presentational: candidates come from
 * `features/docs-vault-local/lib/bootstrap-candidates.ts`, and the vault write
 * lives in the HomePage glue — the same split as `CreateNodeForm`.
 *
 * Two copy rules this surface exists to honour. The word "ontology" never
 * appears: to a non-developer this action is "make a map of my documents". And
 * local-first trust means showing exactly what will be written before confirming
 * — bodies untouched, frontmatter added, one new file.
 */

export interface OntologyBootstrapFormLabels {
  headingId?: string;
  heading: string;
  projectName: string;
  folders: string;
  folderDocCount: (count: number) => string;
  summary: (docCount: number, projectFile: string) => string;
  /** Used instead of `summary` when the vault already has a `kind: project` document. */
  summaryExistingProject: (docCount: number, projectFile: string) => string;
  bodyUntouched: string;
  alreadyTyped: (count: number) => string;
  runtimeSkills: (count: number) => string;
  agentPointers: (count: number) => string;
  confirm: string;
  cancel: string;
  errorPrefix: string;
}

export function OntologyBootstrapForm({
  plan,
  onConfirm,
  onCancel,
  labels,
}: {
  plan: BootstrapPlan;
  onConfirm: (input: {
    projectTitle: string;
    acceptedDomains: ReadonlySet<string>;
  }) => void | Promise<void>;
  onCancel: () => void;
  labels: OntologyBootstrapFormLabels;
}) {
  const [projectTitle, setProjectTitle] = useState(plan.projectTitle);
  const [accepted, setAccepted] = useState<ReadonlySet<string>>(
    () => new Set(plan.domains.map((d) => d.name)),
  );
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const pickedCount = useMemo(
    () => selectedElements(plan, accepted).length,
    [plan, accepted],
  );
  // ⚠️ **Never offer to create a second project file.** `executeBootstrapPlan` already merges the
  // approved domains into an existing `kind: project` document instead of writing a new one, but
  // this summary named `plan.projectSlug` unconditionally — so a folder that already held
  // `project.md` was told "and creates one new project file (ontology-project.md)", a file the run
  // never creates (measured on the starter's own output, 2026-09-04). The name and the sentence
  // both follow the branch the execution actually takes.
  const projectFileName = `${plan.existingProjectSlug ?? plan.projectSlug}.md`;
  const canConfirm = projectTitle.trim().length > 0 && pickedCount > 0 && !busy;

  const toggleDomain = (name: string) => {
    setAccepted((prev) => {
      const next = new Set(prev);
      if (next.has(name)) next.delete(name);
      else next.add(name);
      return next;
    });
  };

  const submit = async () => {
    if (!canConfirm) return;
    setBusy(true);
    setError(null);
    try {
      await onConfirm({ projectTitle: projectTitle.trim(), acceptedDomains: accepted });
    } catch (err) {
      setError(err instanceof Error ? err.message : String(err));
      setBusy(false);
    }
  };

  return (
    <section
      aria-label={labels.heading}
      data-testid="ontology-bootstrap-form"
      data-surface-role="blocking-edit-surface"
      data-elevation-contract="solid-panel-over-dimmed-map"
      data-surface-token="--topology-blocking-composer-surface"
      data-border-token="--topology-blocking-composer-border"
      data-shadow-token="--topology-blocking-composer-shadow"
      className="rounded-[var(--radius-panel)] border border-[color:var(--topology-blocking-composer-border)] bg-[color:var(--topology-blocking-composer-surface)] px-4 py-3 shadow-[var(--topology-blocking-composer-shadow)]"
    >
      <div className="flex items-center justify-between gap-2">
        <p
          id={labels.headingId}
          className="text-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)]"
        >
          {labels.heading}
        </p>
        <button
          type="button"
          onClick={onCancel}
          aria-label={labels.cancel}
          data-testid="ontology-bootstrap-cancel"
          className={controlClass({ hoverInk: 'strong',
            shape: "icon",
            size: "sm",
            tone: "muted",
            className: "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
          })}
        >
          <X size={ICON_SIZE.sm} aria-hidden />
        </button>
      </div>

      <div className="mt-2.5 flex flex-col gap-2.5">
        <label className="flex flex-col gap-1">
          <span className="text-label text-[color:var(--color-text-tertiary)]">
            {labels.projectName}
          </span>
          <input
            type="text"
            value={projectTitle}
            autoFocus
            disabled={busy}
            onChange={(e) => setProjectTitle(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === "Enter") void submit();
            }}
            aria-label={labels.projectName}
            data-testid="ontology-bootstrap-title"
            className={fieldClass({ size: "md", className: "w-full" })}
          />
        </label>

        {plan.domains.length > 0 ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-label text-[color:var(--color-text-tertiary)]">
              {labels.folders}
            </legend>
            <div className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {plan.domains.map((d) => (
                <Checkbox
                  key={d.name}
                  className="rounded-[var(--radius-chip)] px-1.5 py-1 text-body text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-1)]"
                  checked={accepted.has(d.name)}
                  disabled={busy}
                  onChange={() => toggleDomain(d.name)}
                  data-testid={`ontology-bootstrap-domain-${d.name}`}
                  label={
                    <>
                      <span className="min-w-0 flex-1 truncate">{d.name}</span>
                      <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                        {labels.folderDocCount(d.docCount)}
                      </span>
                    </>
                  }
                />
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2">
          <p className="text-label leading-prose text-[color:var(--color-text-secondary)]" data-testid="ontology-bootstrap-summary">
            {plan.existingProjectSlug
              ? labels.summaryExistingProject(pickedCount, projectFileName)
              : labels.summary(pickedCount, projectFileName)}
          </p>
          <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {labels.bodyUntouched}
          </p>
          {plan.alreadyTypedCount > 0 ? (
            <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {labels.alreadyTyped(plan.alreadyTypedCount)}
            </p>
          ) : null}
          {/* Say that these files were left alone because they belong to someone
              else — unsaid, it reads as "why is this empty?". */}
          {plan.runtimeOwnedSkipped > 0 ? (
            <p
              data-testid="ontology-bootstrap-runtime-skills"
              className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]"
            >
              {labels.runtimeSkills(plan.runtimeOwnedSkipped)}
            </p>
          ) : null}
          {/* Same reason as the line above: `AGENTS.md` and `CLAUDE.md` are addressed to an agent,
              and the starter writes them itself — say they were left alone rather than letting them
              vanish without explanation. */}
          {plan.agentPointerSkipped > 0 ? (
            <p
              data-testid="ontology-bootstrap-agent-pointers"
              className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]"
            >
              {labels.agentPointers(plan.agentPointerSkipped)}
            </p>
          ) : null}
        </div>

        {error ? (
          <p
            role="alert"
            data-testid="ontology-bootstrap-error"
            className="rounded-[var(--radius-chip)] border border-[color:var(--color-danger-a32)] bg-[color:var(--color-danger-a08)] px-2.5 py-1.5 text-label text-[color:var(--color-danger-text)]"
          >
            {labels.errorPrefix} {error}
          </p>
        ) : null}

        <button
          type="button"
          onClick={() => void submit()}
          disabled={!canConfirm}
          data-testid="ontology-bootstrap-confirm"
          className={controlClass({
            shape: "pill",
            size: "md",
            tone: "accentOnTint",
            className:
              "justify-center gap-1.5 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-focus-ring)] focus-visible:ring-inset",
          })}
        >
          <MapIcon size={ICON_SIZE.sm} aria-hidden />
          {busy ? "…" : labels.confirm}
        </button>
      </div>
    </section>
  );
}
