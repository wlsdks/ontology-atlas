"use client";

import { useMemo, useState } from "react";
import { Map as MapIcon, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";

import {
  selectedElements,
  type BootstrapPlan,
} from "@/features/docs-vault-local";
import { controlClass } from "@/shared/ui/control-class";

/**
 * "내 문서로 지도 만들기" — 기존 .md 폴더(frontmatter 없음)를 연 사용자의
 * 첫 그래프 부트스트랩 form (presentational). 후보 파생은
 * `features/docs-vault-local/lib/bootstrap-candidates.ts` (순수), 실제
 * vault write 는 HomePage 글루가 담당 — `CreateNodeForm` 과 같은 분업.
 *
 * PO 근거: .qa-scratch/ontology-onboarding-2026-07/discovery.md (F1~F6).
 * 카피 원칙: "온톨로지" 전문용어 금지 — 비개발자에게 이 행위는 "지도 만들기"다.
 * 신뢰 원칙(local-first): 뭘 쓰는지 확정 전에 정확히 보여준다 — 본문 무변경,
 * frontmatter 추가 + 새 파일 1개가 전부.
 */

export interface OntologyBootstrapFormLabels {
  headingId?: string;
  heading: string;
  projectName: string;
  folders: string;
  folderDocCount: (count: number) => string;
  summary: (docCount: number, projectFile: string) => string;
  bodyUntouched: string;
  alreadyTyped: (count: number) => string;
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
  const projectFileName = `${plan.projectSlug}.md`;
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
          className={controlClass({
            shape: "icon",
            size: "sm",
            tone: "muted",
            className:
              "hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset",
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
            className="h-8 rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2 text-body text-[color:var(--color-text-primary)] transition-colors focus-visible:border-[color:var(--color-indigo-a46)] focus-visible:outline-none"
          />
        </label>

        {plan.domains.length > 0 ? (
          <fieldset className="flex flex-col gap-1">
            <legend className="text-label text-[color:var(--color-text-tertiary)]">
              {labels.folders}
            </legend>
            <div className="mt-1 flex max-h-40 flex-col gap-0.5 overflow-y-auto">
              {plan.domains.map((d) => (
                <label
                  key={d.name}
                  className="flex cursor-pointer items-center gap-2 rounded-[var(--radius-chip)] px-1.5 py-1 text-body text-[color:var(--color-text-primary)] transition-colors hover:bg-[color:var(--color-overlay-1)]"
                >
                  <input
                    type="checkbox"
                    checked={accepted.has(d.name)}
                    disabled={busy}
                    onChange={() => toggleDomain(d.name)}
                    data-testid={`ontology-bootstrap-domain-${d.name}`}
                    className="h-3.5 w-3.5 accent-[color:var(--color-indigo-brand)]"
                  />
                  <span className="min-w-0 flex-1 truncate">{d.name}</span>
                  <span className="font-mono text-caption text-[color:var(--color-text-quaternary)]">
                    {labels.folderDocCount(d.docCount)}
                  </span>
                </label>
              ))}
            </div>
          </fieldset>
        ) : null}

        <div className="rounded-[var(--radius-chip)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2">
          <p className="text-label leading-prose text-[color:var(--color-text-secondary)]" data-testid="ontology-bootstrap-summary">
            {labels.summary(pickedCount, projectFileName)}
          </p>
          <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
            {labels.bodyUntouched}
          </p>
          {plan.alreadyTypedCount > 0 ? (
            <p className="mt-1 text-label leading-prose text-[color:var(--color-text-tertiary)]">
              {labels.alreadyTyped(plan.alreadyTypedCount)}
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
              "justify-center gap-1.5 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset",
          })}
        >
          <MapIcon size={ICON_SIZE.sm} aria-hidden />
          {busy ? "…" : labels.confirm}
        </button>
      </div>
    </section>
  );
}
