"use client";

import { useState } from "react";
import { ChevronRight, FolderOpen } from "lucide-react";
import { useTranslations } from "next-intl";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { CompactCopyButton } from "@/shared/ui";
import { useFirstRunStarter } from "../model/use-first-run-starter";

export interface FirstRunStarterModuleProps {
  /** 실데이터 census — TopologyIndexPanel 이 이미 받는 값 그대로 전달. */
  concepts: number;
  relations: number;
  domains: number;
}

/**
 * P1-① (2026-07-21 리텐션 라운드) — 코드베이스 자동 부트스트랩
 * (`ontology-atlas bootstrap` = analyze_repo_structure + infer_imports 를
 * agent 없이 한 줄로) 은 실존하고 정확히 테크리드 페르소나가 원하던
 * 기능인데, 웹 첫 화면 어디에도 그 경로 안내가 없었다 — CLI/에이전트
 * 전용으로만 숨어 있어 "나중에"로 미뤄지고 재방문이 끊겼다. 새 표면을
 * 만들지 않고 이 카드 안에 명령 복사 한 줄만 추가한다.
 */
const CLI_BOOTSTRAP_COMMAND = "npx ontology-atlas init && npx ontology-atlas bootstrap";

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
  const { state: cliCopyState, copy: copyCliCommand } = useCopyFeedback();
  // 온보딩 디자이너 지적 — npx 명령 블록이 비개발자(기획/마케팅/리더십)
  // 첫 화면에 상시 노출돼 시선을 뺏었다. 기본 접힘 disclosure 뒤로 보내
  // 개발자만 펼쳐 보게 한다. 카드가 리마운트될 때까지 세션 내 상태.
  const [cliOpen, setCliOpen] = useState(false);

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

      {/* P1-① — 코드베이스 자동 부트스트랩(CLI/에이전트 전용)으로 가는 다리.
          위 두 버튼(폴더 열기 / 새 vault 만들기)은 빈 vault 를 여는 경로일
          뿐, "내 리포를 분석해서 채워줘"에는 답하지 못한다 — 그 답은
          `ontology-atlas bootstrap` 인데 웹 첫 화면엔 안내가 전혀 없었다.
          온보딩 디자이너 지적: 기본 접힘 disclosure 로 감춰 비개발자 시선에서
          제거하고, 개발자만 "개발자라면 —" 을 펼쳐 명령을 본다. */}
      <div className="mt-3">
        <button
          type="button"
          onClick={() => setCliOpen((open) => !open)}
          aria-expanded={cliOpen}
          aria-controls="first-run-starter-cli-bridge"
          data-testid="first-run-starter-cli-toggle"
          className="flex items-center gap-1 text-[10.5px] text-[color:var(--topology-v2-panel-text-quaternary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          <ChevronRight
            size={11}
            aria-hidden
            className={`transition-transform duration-150 motion-reduce:transition-none ${
              cliOpen ? "rotate-90" : ""
            }`}
          />
          {t("cliBridgeToggle")}
        </button>
        {cliOpen ? (
          <div
            id="first-run-starter-cli-bridge"
            data-testid="first-run-starter-cli-bridge"
            className="mt-2 flex items-center justify-between gap-2 rounded-md border border-[color:var(--topology-v2-panel-divider)] bg-[color:rgba(6,6,9,0.35)] px-2.5 py-2"
          >
            <div className="min-w-0 flex-1">
              <p className="text-[10px] leading-tight text-[color:var(--topology-v2-panel-text-quaternary)]">
                {t("cliBridgeLabel")}
              </p>
              <code className="mt-0.5 block truncate font-mono text-[10.5px] text-[color:var(--topology-v2-panel-text-secondary)]">
                {CLI_BOOTSTRAP_COMMAND}
              </code>
            </div>
            <CompactCopyButton
              copied={cliCopyState === "copied"}
              label={cliCopyState === "copied" ? t("cliBridgeCopied") : t("cliBridgeCopy")}
              ariaLabel={t("cliBridgeCopyAriaLabel")}
              onClick={() => void copyCliCommand(CLI_BOOTSTRAP_COMMAND)}
              data-testid="first-run-starter-cli-bridge-copy"
            />
          </div>
        ) : null}
      </div>

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
