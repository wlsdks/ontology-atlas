"use client";

import { useTranslations } from "next-intl";
import { Cable, Check, ClipboardCopy, Plus } from "lucide-react";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";

/**
 * 빈 vault 시작 체크리스트 (2026-07-24 온보딩 라운드, 같은 날 소유자 지시로
 * 에이전트-우선 재구성) — 폴더를 연 직후 "뭘 해야 할지 감이 안 잡히는"
 * dead-end 를 대체한다.
 *
 * 소유자 지시(2026-07-24 2차): 폴더 연결 다음은 **AI 에이전트 연결이 1순위**,
 * 연결되면 "첫 분석 맡기기"로 이어져야 하며, 건너뛴 사람에게도 가이드가
 * 계속 이어져야 한다. 강제 차단 모달 대신 이 체크리스트가 다음 단계를
 * 화면에서 사라지지 않게 상시 유지하는 방식(지속 유도)을 택했다 — 진행을
 * 막는 강제는 이탈을 만들고, 수동 경로(③ 직접 만들기)도 정당한 사용법이다.
 *
 * 완료 판정은 전부 실데이터 파생: ① 에이전트 heartbeat(`agentConnected`),
 * ② 관계 수(분석/작성이 이뤄지면 관계가 생긴다), ③ 프로젝트 수.
 */
export interface VaultStartChecklistProps {
  projectCount: number;
  relationCount: number;
  /** 에이전트 heartbeat 연결 여부 (HomePage `useAgentConnectLauncher` 상태). */
  agentConnected?: boolean;
  /** "AI 에이전트 연결" 시트 열기 — 1단계 주 CTA. */
  onOpenAgentConnect?: (() => void) | null;
  /**
   * 지도 위 노드 생성 composer 열기 — ③ 직접 만들기 보조 경로("첫 프로젝트
   * 만들기" CTA 가 역량 기본값 폼을 여는 어긋남 방지, kind 의도 전달).
   */
  onCreateNode: (kind: "project" | "domain") => void;
  /** ② 첫 분석 맡기기 — 에이전트 채팅에 붙여넣을 지시문. */
  analyzePrompt: string;
}

export function VaultStartChecklist({
  projectCount,
  relationCount,
  agentConnected = false,
  onOpenAgentConnect = null,
  onCreateNode,
  analyzePrompt,
}: VaultStartChecklistProps) {
  const t = useTranslations("topology.startChecklist");
  const { state: copyState, copy: copyPrompt } = useCopyFeedback();

  const steps: ReadonlyArray<{
    id: "agent" | "analyze" | "manual";
    done: boolean;
    label: string;
    cta: React.ReactNode;
  }> = [
    {
      id: "agent",
      done: agentConnected,
      label: t("stepAgent"),
      cta: onOpenAgentConnect ? (
        <button
          type="button"
          onClick={onOpenAgentConnect}
          data-testid="checklist-cta-agent"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-2.5 text-label font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)]"
        >
          <Cable size={11} aria-hidden />
          {t("ctaAgent")}
        </button>
      ) : null,
    },
    {
      id: "analyze",
      done: relationCount > 0,
      label: t("stepAnalyze"),
      cta: (
        <button
          type="button"
          onClick={() => void copyPrompt(analyzePrompt)}
          data-testid="checklist-cta-analyze"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          <ClipboardCopy size={11} aria-hidden />
          {copyState === "copied" ? t("ctaAnalyzeCopied") : t("ctaAnalyze")}
        </button>
      ),
    },
    {
      id: "manual",
      done: projectCount > 0,
      label: t("stepManual"),
      cta: (
        <button
          type="button"
          onClick={() => onCreateNode("project")}
          data-testid="checklist-cta-project"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          <Plus size={11} aria-hidden />
          {t("ctaCreate")}
        </button>
      ),
    },
  ];

  const doneCount = steps.filter((s) => s.done).length;

  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4">
      <div
        data-testid="vault-start-checklist"
        role="status"
        aria-label={t("title")}
        aria-live="polite"
        className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 shadow-[0_10px_28px_var(--color-shadow-a25)]"
      >
        <p className="font-mono text-caption uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t("kicker", { done: doneCount, total: steps.length })}
        </p>
        <h2 className="mt-2 text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {t("title")}
        </h2>
        <p className="mt-1 text-body leading-relaxed text-[color:var(--color-text-tertiary)]">
          {t("subtitle")}
        </p>
        <ol className="mt-4 flex flex-col gap-2.5">
          {steps.map((step) => (
            <li
              key={step.id}
              data-testid={`checklist-step-${step.id}`}
              data-done={step.done ? "true" : "false"}
              className="flex items-center justify-between gap-3"
            >
              <span className="flex min-w-0 items-center gap-2.5">
                <span
                  aria-hidden
                  className={`flex h-4 w-4 shrink-0 items-center justify-center rounded-full border ${
                    step.done
                      ? "border-transparent bg-[color:var(--color-status-success)] text-[color:var(--color-canvas)]"
                      : "border-[color:var(--color-border-strong)] text-transparent"
                  }`}
                >
                  <Check size={10} strokeWidth={3} />
                </span>
                <span
                  className={`truncate text-body ${
                    step.done
                      ? "text-[color:var(--color-text-quaternary)] line-through"
                      : "text-[color:var(--color-text-secondary)]"
                  }`}
                >
                  {step.label}
                </span>
              </span>
              {step.done ? null : step.cta}
            </li>
          ))}
        </ol>
        <p className="mt-3 text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
          {t("agentHint")}
        </p>
      </div>
    </div>
  );
}
