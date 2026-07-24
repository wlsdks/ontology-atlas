"use client";

import { useTranslations } from "next-intl";
import { Cable, Check, GitBranch, Plus } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * 빈 vault 시작 체크리스트 (2026-07-24 온보딩 라운드) — 폴더를 연 직후의
 * "지형도에 그릴 프로젝트가 없습니다" dead-end 를 대체한다. 실카운트에서
 * 완료 상태를 파생하는 4단계 진행형 안내(프로젝트 → 도메인 → 관계 →
 * 에이전트 연결)로, 저장소/플래그 없이 그래프가 자라는 만큼 체크가
 * 채워진다. 렌더 조건(로컬 vault 열림 + 쓰기 가능 + structural-empty)은
 * HomePage 가 판정한다.
 */
export interface VaultStartChecklistProps {
  projectCount: number;
  domainCount: number;
  relationCount: number;
  /** 지도 위 "첫 노드 만들기" composer 열기 (TopologyEmptyState 와 동일). */
  onCreateNode: () => void;
  /** "AI 에이전트 연결" 시트 열기 — 생략 시 에이전트 행은 정보만 표시. */
  onOpenAgentConnect?: (() => void) | null;
}

export function VaultStartChecklist({
  projectCount,
  domainCount,
  relationCount,
  onCreateNode,
  onOpenAgentConnect = null,
}: VaultStartChecklistProps) {
  const t = useTranslations("topology.startChecklist");

  const steps: ReadonlyArray<{
    id: "project" | "domain" | "relation" | "agent";
    done: boolean;
    label: string;
    cta: React.ReactNode;
  }> = [
    {
      id: "project",
      done: projectCount > 0,
      label: t("stepProject"),
      cta: (
        <button
          type="button"
          onClick={onCreateNode}
          data-testid="checklist-cta-project"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] px-2.5 text-label font-medium text-[color:var(--color-indigo-accent)] transition-colors hover:bg-[color:var(--color-indigo-a24)]"
        >
          <Plus size={11} aria-hidden />
          {t("ctaCreate")}
        </button>
      ),
    },
    {
      id: "domain",
      done: domainCount > 0,
      label: t("stepDomain"),
      cta: (
        <button
          type="button"
          onClick={onCreateNode}
          data-testid="checklist-cta-domain"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          <Plus size={11} aria-hidden />
          {t("ctaCreate")}
        </button>
      ),
    },
    {
      id: "relation",
      done: relationCount > 0,
      label: t("stepRelation"),
      cta: (
        <Link
          href="/ontology/edit/"
          data-testid="checklist-cta-relation"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          <GitBranch size={11} aria-hidden />
          {t("ctaBuilder")}
        </Link>
      ),
    },
    {
      id: "agent",
      done: false,
      label: t("stepAgent"),
      cta: onOpenAgentConnect ? (
        <button
          type="button"
          onClick={onOpenAgentConnect}
          data-testid="checklist-cta-agent"
          className="inline-flex h-7 items-center gap-1 rounded-md border border-[color:var(--color-overlay-3)] px-2.5 text-label text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          <Cable size={11} aria-hidden />
          {t("ctaAgent")}
        </button>
      ) : null,
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
        className="pointer-events-auto w-[min(400px,calc(100vw-2rem))] rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 shadow-[0_10px_28px_var(--color-shadow-a25)]"
      >
        <p className="font-mono text-caption uppercase tracking-[0.18em] text-[color:var(--color-text-quaternary)]">
          {t("kicker", { done: doneCount, total: 3 })}
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
