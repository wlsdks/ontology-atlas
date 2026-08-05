"use client";

import { useTranslations } from "next-intl";
import { Cable, Check, CircleAlert, ClipboardCopy, Map as MapIcon, Plus, Sparkles } from "lucide-react";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Chip } from "@/shared/ui";

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
  /**
   * "시작 문서 만들기" (2026-07-24) — '기존 폴더 선택'으로 **빈 폴더**를 연
   * 사용자는 '빈 폴더로 새로 시작' 경로가 주는 스타터 5문서 + `.mcp.json`
   * 을 못 받는다(local-first 원칙상 남의 폴더에 자동으로 쓰지 않는다).
   * 그래서 자동 실행 대신 **버튼**으로 같은 스캐폴드를 제공한다. 이미
   * 문서가 있는 vault 에서는 HomePage 가 이 콜백을 넘기지 않는다.
   */
  onScaffoldStarter?: (() => void) | null;
  scaffolding?: boolean;
  /** "AI 에이전트 연결" 시트 열기 — 1단계 주 CTA. */
  onOpenAgentConnect?: (() => void) | null;
  /**
   * 지도 위 노드 생성 composer 열기 — ③ 직접 만들기 보조 경로("첫 프로젝트
   * 만들기" CTA 가 역량 기본값 폼을 여는 어긋남 방지, kind 의도 전달).
   */
  onCreateNode: (kind: "project" | "domain") => void;
  /** ② 첫 분석 맡기기 — 에이전트 채팅에 붙여넣을 지시문. */
  analyzePrompt: string;
  /**
   * C9 — 이 폴더에 실제로 `.mcp.json` 이 존재하는지(`agentConfigStatus.mcpJson`).
   * 힌트 문구가 "이미 준비됨" 을 무조건 단언하지 않고 실파일 상태를 반영한다.
   * undefined 면(상태 미확인) 단언 대신 pending 문구로 안전하게 표기.
   */
  mcpConfigReady?: boolean;
  /**
   * 이 폴더에서 찾은, 아직 지도에 없는 문서 수 (2026-08-03 게이트 확장).
   * 0 보다 크면 **1단이 부트스트랩으로 바뀐다** — 빈 폴더의 1순위(에이전트
   * 연결)는 빈 폴더 맥락의 지시였고, 이미 문서를 가진 사람에게 첫 걸음은
   * 그 문서다.
   */
  docsFoundCount?: number;
  onStartFromDocs?: (() => void) | null;
}

export function VaultStartChecklist({
  projectCount,
  relationCount,
  agentConnected = false,
  onOpenAgentConnect = null,
  onCreateNode,
  onScaffoldStarter = null,
  scaffolding = false,
  analyzePrompt,
  mcpConfigReady,
  docsFoundCount = 0,
  onStartFromDocs = null,
}: VaultStartChecklistProps) {
  const t = useTranslations("topology.startChecklist");
  // 문서 갈래의 제목·CTA 는 빈 상태가 이미 가진 문구를 **재사용**한다 —
  // 같은 사실에 두 번째 문장을 만들면 그 순간부터 드리프트가 시작된다.
  const tEmpty = useTranslations("topology.empty");
  const hasDocs = docsFoundCount > 0 && onStartFromDocs !== null;
  const { state: copyState, copy: copyPrompt } = useCopyFeedback();

  const steps: ReadonlyArray<{
    id: "docs" | "agent" | "analyze" | "manual";
    done: boolean;
    label: string;
    cta: React.ReactNode;
  }> = [
    ...(hasDocs
      ? [
          {
            id: "docs" as const,
            done: false,
            label: t("stepDocs", { count: docsFoundCount }),
            /*
             * 승격은 **하나뿐**이고 그 차이가 위계다 — 이 CTA 만 칩 램프의
             * `lg`(`text-body`) · 인디고 면이고 나머지 단은 무채색 `md` 다.
             */
            cta: (
              <Chip
                size="lg"
                tone="accentOnTint"
                onClick={onStartFromDocs ?? undefined}
                data-testid="checklist-cta-docs"
                className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)]"
              >
                <MapIcon size={13} aria-hidden />
                {tEmpty("ctaStartFromDocs")}
              </Chip>
            ),
          },
        ]
      : []),
    {
      id: "agent",
      done: agentConnected,
      label: t("stepAgent"),
      cta: onOpenAgentConnect ? (
        <Chip
          size="md"
          tone={hasDocs ? "secondary" : "accent"}
          onClick={onOpenAgentConnect}
          data-testid="checklist-cta-agent"
          /*
           * 채움은 **한 화면에 하나**다. 문서가 있는 갈래에서는 1단(부트스트랩)이
           * 승자라, 여기까지 인디고 면을 주면 눈이 둘 사이에서 갈린다 — 위계는
           * 폭이 아니라 채움이 지는데 그 채움이 둘이면 위계가 없는 것이다.
           */
          className={
            hasDocs
              ? "shrink-0 border-[color:var(--color-overlay-3)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
              : "shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)]"
          }
        >
          <Cable size={11} aria-hidden />
          {t("ctaAgent")}
        </Chip>
      ) : null,
    },
    {
      id: "analyze",
      done: relationCount > 0,
      label: t("stepAnalyze"),
      /*
       * **done 이어도 CTA 를 지우지 않는다.** 완료 판정이 `relationCount > 0`
       * 이라 손으로 관계 하나만 만들어도 참이 되는데, 그 순간 지시문을 복사할
       * 유일한 문이 영구히 사라졌다 — 사용자가 한 번도 안 눌렀는데도.
       * done 이면 보조 톤 「다시 복사」로 남는다.
       *
       * **복사 실패도 말한다.** 클립보드 권한은 조용히 거절될 수 있고, 그때
       * 침묵은 성공처럼 읽힌다.
       */
      cta: (
        <Chip
          size="md"
          tone="secondary"
          onClick={() => void copyPrompt(analyzePrompt)}
          data-testid="checklist-cta-analyze"
          className="shrink-0 border-[color:var(--color-overlay-3)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          {copyState === "failed" ? (
            <CircleAlert size={11} aria-hidden />
          ) : (
            <ClipboardCopy size={11} aria-hidden />
          )}
          {copyState === "failed"
            ? t("ctaAnalyzeFailed")
            : copyState === "copied"
              ? t("ctaAnalyzeCopied")
              : relationCount > 0
                ? t("ctaAnalyzeAgain")
                : t("ctaAnalyze")}
        </Chip>
      ),
    },
    {
      id: "manual",
      done: projectCount > 0,
      label: onScaffoldStarter ? t("stepScaffold") : t("stepManual"),
      cta: onScaffoldStarter ? (
        <Chip
          size="md"
          tone="secondary"
          onClick={onScaffoldStarter}
          disabled={scaffolding}
          data-testid="checklist-cta-scaffold"
          className="border-[color:var(--color-overlay-3)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          <Sparkles size={11} aria-hidden />
          {scaffolding ? t("ctaScaffoldBusy") : t("ctaScaffold")}
        </Chip>
      ) : (
        <Chip
          size="md"
          tone="secondary"
          onClick={() => onCreateNode("project")}
          data-testid="checklist-cta-project"
          className="border-[color:var(--color-overlay-3)] hover:border-[color:var(--color-indigo-line-a35)] hover:text-[color:var(--color-text-primary)]"
        >
          <Plus size={11} aria-hidden />
          {t("ctaCreate")}
        </Chip>
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
        className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 shadow-[var(--shadow-elevation-1)]"
      >
        <p className="font-mono text-caption uppercase tracking-[var(--tracking-caps-16)] text-[color:var(--color-text-quaternary)]">
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
              <span className="flex min-w-0 flex-1 items-center gap-2.5">
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
              {/* 완료한 단은 CTA 를 접는다 — 다만 「지시 복사」는 완료 뒤에도
                  다시 필요하다(위 주석). */}
              {step.done && step.id !== "analyze" ? null : step.cta}
            </li>
          ))}
        </ol>
        {/* C9 — 실파일 상태 기반 정직한 문구. `.mcp.json` 이 실제로 있으면
            "준비됨", 없으면 "만들면 생김" — "이미 준비돼 있어요" 를 무조건
            단언하지 않는다. */}
        {/*
         * `agentHintPending` 은 「'시작 문서 만들기'를 누르면…」이라고 **버튼
         * 이름을 부른다.** 그 버튼은 빈 폴더에만 있으므로, 문서가 있는 갈래에서
         * 이 줄을 그대로 두면 화면에 없는 것을 가리키는 안내가 된다(실측).
         * 이미 준비됐다는 사실(`agentHintReady`)은 버튼과 무관하니 남는다.
         */}
        {mcpConfigReady || onScaffoldStarter ? (
          <p className="mt-3 text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
            {t(mcpConfigReady ? "agentHintReady" : "agentHintPending")}
          </p>
        ) : null}
        {/*
         * 지시문이 **무엇을 약속하는지**를 사람에게도 말한다. 프롬프트 본문은
         * 영어 한 벌이라(에이전트가 독자다) 사람이 읽는 창구는 이 한 줄뿐이고,
         * 그 약속(승인 전에는 아무것도 안 쓴다)이 이 제품의 서명이다.
         */}
        <p className="mt-1 text-label leading-relaxed text-[color:var(--color-text-quaternary)]">
          {t("analyzePromise")}
        </p>
        {/*
         * 아직 연결 안 한 사람에게 **막지 않고** 순서를 말한다 — 복사는 되지만
         * 붙여넣을 곳이 없으면 그 복사는 아무 데도 안 간다.
         */}
        {agentConnected ? null : (
          <p
            data-testid="checklist-analyze-needs-agent"
            className="mt-1 text-label leading-relaxed text-[color:var(--color-text-quaternary)]"
          >
            {t("analyzeNeedsAgent")}
          </p>
        )}
      </div>
    </div>
  );
}
