"use client";

import { useTranslations } from "next-intl";
import type { BuilderWriteConfirmStatus } from "../lib/builder-write-confirm-bar";

/**
 * 하단 앵커 쓰기-확인 바 — `docs/prototypes/builder-final.html` 스펙의
 * "쓰기 확인" 바. 여기서 새로 쓰기 로직을 만들지 않는다 — dry-run 버튼은
 * 기존 저장 상태 팝오버(BuilderWriteSummary)를 열고, "vault 에 쓰기" 는
 * `resolveBuilderWriteConfirmAction` 이 고른 기존 핸들러
 * (confirmPendingRelation / saveEphemeral / 상세 열기) 를 그대로 호출한다.
 * (OntologyEditPage.tsx A4 분해 — 기능/props 무변, 물리 이동만.)
 */
export function BuilderWriteConfirmBar({
  status,
  draftNodes,
  draftEdges,
  pendingRelationSummary,
  writeAriaLabel,
  writeDisabled,
  onDryRun,
  onWrite,
}: {
  status: BuilderWriteConfirmStatus;
  draftNodes: number;
  draftEdges: number;
  pendingRelationSummary?: { source: string; target: string; key: string } | null;
  writeAriaLabel: string;
  writeDisabled: boolean;
  onDryRun: () => void;
  onWrite: () => void;
}) {
  const t = useTranslations("ontologyPages.edit.page.writeConfirmBar");
  const payload =
    status === "relationPending" && pendingRelationSummary
      ? t("relationPending", pendingRelationSummary)
      : status === "draftReady"
        ? t("draftReady", { nodes: draftNodes, edges: draftEdges })
        : status === "draftNeedsName"
          ? t("draftNeedsName", { nodes: draftNodes, edges: draftEdges })
          : t("clean");
  return (
    <section
      aria-label={t("ariaLabel")}
      className="mt-2 hidden shrink-0 flex-wrap items-center gap-3 rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-panel)] px-3 py-2.5 md:flex"
    >
      <span className="shrink-0 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {t("label")}
      </span>
      <p className="min-w-0 flex-1 truncate font-mono text-[11px] text-[color:var(--color-text-tertiary)]">
        {payload}
      </p>
      <div className="flex shrink-0 items-center gap-1.5">
        <button
          type="button"
          onClick={onDryRun}
          aria-label={t("dryRunAriaLabel")}
          className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-overlay-3)] bg-[color:var(--color-overlay-1)] px-2.5 text-[11px] text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a32)] hover:text-[color:var(--color-text-primary)]"
        >
          {t("dryRunButton")}
        </button>
        <button
          type="button"
          onClick={onWrite}
          disabled={writeDisabled}
          aria-label={writeAriaLabel}
          className="inline-flex h-8 items-center rounded-md border border-[color:var(--color-indigo-a42)] bg-[color:var(--color-indigo-a14)] px-2.5 text-[11px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)] transition-colors hover:border-[color:var(--color-indigo-a60)] hover:bg-[color:var(--color-indigo-a20)] disabled:cursor-not-allowed disabled:opacity-50"
        >
          {t("writeButton")}
        </button>
      </div>
    </section>
  );
}
