"use client";

import { FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useFirstRunStarter } from "../model/use-first-run-starter";

export interface FirstRunStarterModuleProps {
  /** 실데이터 census — TopologyIndexPanel 이 이미 받는 값 그대로 전달. */
  concepts: number;
  relations: number;
  domains: number;
}

/**
 * INDEX 패널(TopologyIndexPanel) 맨 위에 통합되는 "시작하기" 모듈 —
 * 승인 계약: `docs/prototypes/first-run-v3-flagship.html` (2026-07-18,
 * "관제탑 첫 기동" v3). 플로팅 표면 0개 — 중앙 카드(반려)와 하단 커맨드독
 * (중간 반려) 둘 다 폐기하고 기존 INDEX 패널 안에 자리를 잡는다.
 *
 * vault 미선택 + 정적 모드 + 세션 내 미dismiss 일 때만 렌더(`visible`,
 * `useFirstRunStarter`). 그 외엔 null — INDEX 는 원래 모습(검색 + 트리)
 * 그대로.
 */
export function FirstRunStarterModule({
  concepts,
  relations,
  domains,
}: FirstRunStarterModuleProps) {
  const t = useTranslations("firstRunStarter");
  const {
    visible,
    dismiss,
    openFolder,
    createVault,
    busy,
    scaffolding,
    errorText,
  } = useFirstRunStarter();

  if (!visible) return null;

  return (
    <div
      data-testid="first-run-starter"
      className="relative border-b border-[color:var(--topology-v2-panel-divider)] bg-gradient-to-b from-[color:var(--color-indigo-a08)] via-[color:var(--color-indigo-a06)] to-transparent px-4 pb-3.5 pt-4"
    >
      <p className="mb-3 flex items-center gap-2 font-mono text-[9.5px] uppercase tracking-[0.22em] text-[color:var(--topology-v2-panel-text-secondary)]">
        <span className="relative h-2 w-2 shrink-0" aria-hidden>
          <span className="absolute inset-0 rounded-full bg-[color:var(--color-status-warning)]" />
          <span className="absolute -inset-[3px] rounded-full border border-[color:var(--color-amber-source-a42)]" />
        </span>
        {t("caption")}
        <span className="ml-auto text-[8.5px] tracking-[0.16em] text-[color:var(--color-status-warning)]">
          {t("sampleLabel")}
        </span>
      </p>

      <p className="mb-4 text-[12px] leading-[1.65] text-[color:var(--topology-v2-panel-text-tertiary)]">
        <b className="font-semibold text-[color:var(--topology-v2-panel-text-primary)]">
          {t("contextBold")}
        </b>{" "}
        {t("contextRest")}
      </p>

      <div className="mb-4 grid grid-cols-3 divide-x divide-[color:var(--topology-v2-panel-divider)] rounded-[9px] border border-[color:var(--topology-v2-panel-divider)] bg-[color:rgba(6,6,9,0.55)] shadow-[inset_0_1px_2px_var(--color-shadow-a35)]">
        <MeterCell value={concepts} label={t("meterConcepts")} />
        <MeterCell value={relations} label={t("meterRelations")} />
        <MeterCell value={domains} label={t("meterDomains")} />
      </div>

      <button
        type="button"
        onClick={() => void openFolder()}
        disabled={busy}
        data-testid="first-run-starter-open"
        className="relative flex h-10 w-full items-center justify-center gap-2 rounded-lg border border-[color:var(--color-indigo-line-a45)] bg-[color:var(--color-indigo-brand)] text-[13px] font-semibold text-white shadow-[inset_0_1px_0_var(--color-overlay-3)] transition-colors hover:bg-[color:var(--color-indigo-accent)] disabled:opacity-60"
      >
        <FolderOpen size={14} aria-hidden />
        {busy && !scaffolding ? t("openBusy") : t("openLabel")}
        <span className="rounded border border-b-2 border-white/35 px-1.5 py-px font-mono text-[9px] font-medium opacity-80">
          ⌘O
        </span>
      </button>

      <p className="mb-1 mt-3 flex items-center justify-between gap-4 text-[11.5px]">
        <button
          type="button"
          onClick={() => void createVault()}
          disabled={busy}
          data-testid="first-run-starter-create"
          className="border-b border-transparent pb-px text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {scaffolding ? t("createBusy") : t("createLabel")}
        </button>
        <button
          type="button"
          onClick={dismiss}
          data-testid="first-run-starter-dismiss"
          className="border-b border-transparent pb-px text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-divider)] hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {t("dismissLabel")}
        </button>
      </p>

      {errorText !== null ? (
        <p
          role="alert"
          className="mt-2 text-[11px] text-[color:var(--color-status-danger)]"
        >
          {errorText || t("errorFallback")}
        </p>
      ) : null}
    </div>
  );
}

function MeterCell({ value, label }: { value: number; label: string }) {
  return (
    <div className="py-2.5 text-center font-mono">
      <span className="block text-[19px] font-semibold leading-none text-[color:var(--topology-v2-panel-text-primary)]">
        {value}
      </span>
      <span className="mt-1.5 block text-[8px] uppercase tracking-[0.18em] text-[color:var(--topology-v2-panel-text-quaternary)]">
        {label}
      </span>
    </div>
  );
}
