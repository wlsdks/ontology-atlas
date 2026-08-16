"use client";

import { useMemo, useState } from "react";
import { useTranslations } from "next-intl";
import {
  Cable,
  CircleAlert,
  ClipboardCopy,
  Map as MapIcon,
  MessageSquare,
  Plus,
  Sparkles,
} from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { useCopyFeedback } from "@/shared/lib/use-copy-feedback";
import { Chip } from "@/shared/ui";

/**
 * 폴더를 연 직후의 **첫 걸음 셋** — 한 번에 하나씩, 설명을 갖고.
 *
 * ## 왜 체크리스트를 그만뒀나 (2026-08-16 소유자 실보고)
 *
 * 종전은 세 줄짜리 체크리스트였다. 화면에 셋이 동시에 있으니 각 줄이 가질 수
 * 있는 것은 **제목 한 줄**뿐이었고, 그래서 소유자가 실제로 겪은 것이 이것이다:
 *
 * - *"두번짼 뭔지도 모르겠고"* — 「AI가 이 코드를 읽고 지도 초안을 그리게 하기」는
 *   제목이지 설명이 아니다. 무엇이 일어나는지, 내 폴더에 뭘 쓰는지, 승인이
 *   필요한지가 어디에도 없었다
 * - *"복사해도 완료 체크도 안됨"* — 완료 판정이 **관계 수**였다. 사용자가 시킨
 *   대로 눌렀는데 화면은 아무 일도 안 일어난 것처럼 굴었다. 눌린 것을 안 세는
 *   진행 표시는 진행 표시가 아니다
 * - *"만들어 주기"* — 버튼 이름이 **무엇을** 만드는지 말하지 않았다
 * - *"첫번째는 에이전트 연결 안해도 사용은 가능해야하니 스킵하기 버튼"* —
 *   맞다. 1단은 권유이지 관문이 아닌데, 체크리스트에는 지나갈 문이 없었다
 *
 * 그래서 **한 번에 한 걸음**으로 바꾼다. 한 걸음이 화면을 독차지하면 설명할
 * 자리가 생기고, 「다음」과 「건너뛰기」가 생기면 지나갈 길이 생긴다.
 *
 * ## 지키는 것
 *
 * - **막지 않는다.** 모든 걸음에 건너뛰기가 있고, 마지막을 지나면 카드가 끝난다
 * - **누른 것은 진행이다.** 세상이 바뀌길 기다리지 않고, 사용자가 그 걸음을
 *   했으면 다음으로 간다
 * - **높이가 걸음마다 튀지 않는다.** 설명 자리를 세 줄로 미리 잡아 둔다 —
 *   이 저장소의 「치수는 우리가 정하지 내용물이 정하지 않는다」 규율이다
 */

export type StartStepId = "docs" | "agent" | "analyze" | "starter" | "manual";

export interface VaultStartStepsProps {
  /** 에이전트 heartbeat 연결 여부 (HomePage `useAgentConnectLauncher` 상태). */
  agentConnected?: boolean;
  /**
   * 이 기기에서 **바로 쓸 수 있는** 실행기의 이름 (없으면 null). 앱이 이미
   * 아는 사실을 설정 안에 숨겨 두면 그 사실은 찾아 들어간 사람에게만 존재한다.
   */
  acpRuntimeLabel?: string | null;
  /** 대화를 여는 문(실행기가 있을 때) 또는 도구를 고르는 화면(없을 때). */
  onOpenAgentConnect?: (() => void) | null;
  /**
   * 분석 지시를 **에이전트 작성 칸에 앉힌다** — 실행기가 있을 때만 넘어온다.
   * 있으면 복사-붙여넣기를 시키지 않는다: 붙여넣을 곳이 이 앱 안에 있다.
   */
  onSendAnalyzeToAgent?: (() => void) | null;
  /** ② 지시문 — 붙여넣을 곳이 밖에 있는 사람을 위한 복사본. */
  analyzePrompt: string;
  /** ③ 빈 폴더에 뼈대 문서 + 연결 설정을 만든다. 이미 문서가 있으면 null. */
  onScaffoldStarter?: (() => void) | null;
  scaffolding?: boolean;
  /** ③ 대안 — 손으로 첫 노드를 만든다. */
  onCreateNode: (kind: "project" | "domain") => void;
  /** 이 폴더에서 찾은, 아직 지도에 없는 문서 수. 0 보다 크면 걸음이 하나 는다. */
  docsFoundCount?: number;
  onStartFromDocs?: (() => void) | null;
  /** 마지막 걸음을 지났다 — 카드를 거둔다. */
  onFinish?: () => void;
  /**
   * INDEX 패널이 펼쳐져 있는가. INDEX 는 지도 칼럼 **위에 뜨므로**(오른쪽
   * 패널은 flex 형제라 칼럼을 실제로 줄인다) 중앙 계산에서 혼자 빠진다.
   */
  indexExpanded?: boolean;
}

export function VaultStartSteps({
  agentConnected = false,
  acpRuntimeLabel = null,
  onOpenAgentConnect = null,
  onSendAnalyzeToAgent = null,
  analyzePrompt,
  onScaffoldStarter = null,
  scaffolding = false,
  onCreateNode,
  docsFoundCount = 0,
  onStartFromDocs = null,
  onFinish,
  indexExpanded = false,
}: VaultStartStepsProps) {
  const t = useTranslations("topology.startSteps");
  const { state: copyState, copy: copyPrompt } = useCopyFeedback();
  const [index, setIndex] = useState(0);
  /**
   * 사용자가 **실제로 한** 걸음. 세상이 바뀌길 기다려서 판정하면, 시킨 대로
   * 눌렀는데 화면이 가만히 있는 그 순간이 생긴다(소유자: *"복사해도 완료
   * 체크도 안됨"*). 누른 것은 누른 것으로 센다.
   */
  const [acted, setActed] = useState<ReadonlySet<StartStepId>>(new Set());

  const agentReady = agentConnected || acpRuntimeLabel !== null;
  const hasDocs = docsFoundCount > 0 && onStartFromDocs !== null;

  /**
   * 걸음의 **차례**. 문서가 있으면 그것이 첫 걸음이다 — 빈 폴더의 1순위(에이전트
   * 연결)는 빈 폴더 맥락의 순서였고, 이미 가진 것이 있는 사람에게 첫 걸음은
   * 그 가진 것이다.
   */
  const steps = useMemo<StartStepId[]>(
    () => [
      ...(hasDocs ? (["docs"] as StartStepId[]) : []),
      "agent",
      "analyze",
      onScaffoldStarter ? "starter" : "manual",
    ],
    [hasDocs, onScaffoldStarter],
  );

  const current = steps[Math.min(index, steps.length - 1)];
  const isLast = index >= steps.length - 1;

  /** 다음으로. 마지막을 지나면 이 카드는 할 일을 다 한 것이다. */
  const advance = () => {
    if (isLast) {
      onFinish?.();
      return;
    }
    setIndex((i) => i + 1);
  };

  /**
   * 이 걸음은 **이미 된 것인가** — 그러면 보조 버튼은 「건너뛰기」가 아니라
   * 「다음」이다. 건너뛴다는 말은 안 한 것을 두고 갈 때 쓰는 말이라, 이미 한
   * 걸음에서 그 단어를 쓰면 방금 한 일이 없던 일이 된다.
   */
  const currentDone = current === "agent" ? agentReady : acted.has(current);

  const body =
    current === "docs"
      ? t("docs.body", { count: docsFoundCount })
      : current === "agent"
        ? acpRuntimeLabel
          ? t("agent.bodyFound", { runtime: acpRuntimeLabel })
          : t("agent.bodyMissing")
        : current === "analyze"
          ? onSendAnalyzeToAgent
            ? t("analyze.bodyAgent")
            : t("analyze.bodyCopy")
          : current === "starter"
            ? t("starter.body")
            : t("manual.body");

  const title =
    current === "docs"
      ? t("docs.title")
      : current === "agent"
        ? t("agent.title")
        : current === "analyze"
          ? t("analyze.title")
          : current === "starter"
            ? t("starter.title")
            : t("manual.title");

  /**
   * 주 행동 — **누르면 일어날 일**을 이름으로 쓴다. 그리고 누르면 다음 걸음으로
   * 간다: 사용자가 그 걸음을 했는데 화면이 가만히 있으면, 그게 소유자가 겪은
   * *"복사해도 완료 체크도 안 됨"* 이다.
   */
  const primary = (() => {
    if (current === "docs") {
      return {
        label: t("docs.cta"),
        icon: <MapIcon size={ICON_SIZE.sm} aria-hidden />,
        testId: "start-step-cta-docs",
        disabled: false,
        run: () => {
          onStartFromDocs?.();
          advance();
        },
      };
    }
    if (current === "agent") {
      return {
        label: acpRuntimeLabel ? t("agent.ctaFound") : t("agent.ctaMissing"),
        icon: acpRuntimeLabel ? (
          <MessageSquare size={ICON_SIZE.sm} aria-hidden />
        ) : (
          <Cable size={ICON_SIZE.sm} aria-hidden />
        ),
        testId: "start-step-cta-agent",
        disabled: onOpenAgentConnect === null,
        run: () => {
          onOpenAgentConnect?.();
          advance();
        },
      };
    }
    if (current === "analyze") {
      if (onSendAnalyzeToAgent) {
        return {
          label: t("analyze.ctaAgent"),
          icon: <MessageSquare size={ICON_SIZE.sm} aria-hidden />,
          testId: "start-step-cta-analyze",
          disabled: false,
          run: () => {
            onSendAnalyzeToAgent();
            advance();
          },
        };
      }
      return {
        // 복사는 **실패할 수 있다**(클립보드 권한). 침묵은 성공처럼 읽히므로
        // 실패도 버튼이 말한다. 실패했으면 다음으로 넘기지 않는다.
        label:
          copyState === "failed"
            ? t("analyze.ctaFailed")
            : copyState === "copied"
              ? t("analyze.ctaCopied")
              : t("analyze.ctaCopy"),
        icon:
          copyState === "failed" ? (
            <CircleAlert size={ICON_SIZE.sm} aria-hidden />
          ) : (
            <ClipboardCopy size={ICON_SIZE.sm} aria-hidden />
          ),
        testId: "start-step-cta-analyze",
        disabled: false,
        /*
         * 여기만 **다음으로 안 넘어간다.** 복사한 사람은 이 앱을 떠나 다른 도구에
         * 붙여넣어야 하므로, 「복사됐다」를 눈으로 확인할 한 박자가 필요하다.
         * 대신 아래 보조 버튼이 「건너뛰기」에서 「다음」으로 바뀐다.
         */
        run: () => {
          void copyPrompt(analyzePrompt).then((ok) => {
            if (ok) setActed((prev) => new Set(prev).add("analyze"));
          });
        },
      };
    }
    if (current === "starter") {
      return {
        label: scaffolding ? t("starter.ctaBusy") : t("starter.cta"),
        icon: <Sparkles size={ICON_SIZE.sm} aria-hidden />,
        testId: "start-step-cta-starter",
        disabled: scaffolding,
        run: () => {
          onScaffoldStarter?.();
          advance();
        },
      };
    }
    return {
      label: t("manual.cta"),
      icon: <Plus size={ICON_SIZE.sm} aria-hidden />,
      testId: "start-step-cta-manual",
      disabled: false,
      run: () => {
        onCreateNode("project");
        advance();
      },
    };
  })();

  return (
    <div
      data-index-reserved={indexExpanded ? "true" : "false"}
      className={`pointer-events-none absolute inset-0 z-20 flex items-center justify-center px-4${
        indexExpanded
          ? " md:pl-[calc(var(--topology-index-inset)+var(--topology-index-width)+1rem)]"
          : ""
      }`}
    >
      <div
        data-testid="vault-start-steps"
        data-step={current}
        data-step-index={index}
        data-step-total={steps.length}
        data-agent-ready={agentReady ? "true" : "false"}
        role="status"
        aria-label={t("title")}
        aria-live="polite"
        className="pointer-events-auto w-[min(420px,calc(100vw-2rem))] rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-5 py-5 shadow-[var(--shadow-elevation-1)]"
      >
        {/*
          제목이 **걸음의 제목**이다. 종전에는 카드 제목(「시작 체크리스트」)과
          줄 제목이 따로 있어서 눈이 둘 사이에서 갈렸다 — 지금 이 카드가 말하는
          것은 하나뿐이므로 제목도 하나다. 진행은 그 곁다리라 옆에 둔다.
        */}
        <div className="flex items-baseline justify-between gap-3">
          <h2 className="min-w-0 break-keep text-title font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {title}
          </h2>
          <span
            data-testid="start-step-progress"
            className="shrink-0 font-mono text-label tabular-nums text-[color:var(--color-text-quaternary)]"
          >
            {t("progress", { current: index + 1, total: steps.length })}
          </span>
        </div>
        {/*
          설명 자리는 **세 줄로 고정**한다. 걸음마다 글이 짧고 길어서 그대로 두면
          카드가 걸음마다 위아래로 뛴다 — 같은 자리에서 내용만 바뀌는 화면에서
          그 흔들림은 「다른 카드가 왔다」로 읽힌다.
        */}
        <p
          data-testid="start-step-body"
          className="mt-2 min-h-[calc(3*var(--leading-body))] break-keep text-body leading-body text-[color:var(--color-text-tertiary)]"
        >
          {body}
        </p>
        <div className="mt-4 flex items-center justify-between gap-2">
          {/* 되돌아갈 길 — 첫 걸음에는 갈 데가 없으므로 자리만 지킨다. */}
          {index > 0 ? (
            <Chip
              size="md"
              tone="secondary"
              hoverInk="strong"
              hoverSurface="lift"
              data-testid="start-step-back"
              onClick={() => setIndex((i) => Math.max(0, i - 1))}
            >
              {t("back")}
            </Chip>
          ) : (
            <span />
          )}
          <span className="flex shrink-0 items-center gap-2">
            {/*
              **건너뛰기는 모든 걸음에 있다.** 1단(에이전트 연결)은 권유이지
              관문이 아니고, 나머지도 마찬가지다 — 이 카드가 막는 것은 하나도
              없어야 한다(소유자: *"에이전트 연결 안해도 사용은 가능해야 하니"*).
            */}
            <Chip
              size="md"
              tone="secondary"
              hoverInk="strong"
              hoverSurface="lift"
              data-testid="start-step-skip"
              onClick={advance}
            >
              {currentDone ? t("next") : t("skip")}
            </Chip>
            {/*
              채움은 **한 화면에 하나**다 — 이 카드에서 인디고 면을 갖는 것은
              지금 걸음의 주 행동뿐이다.
            */}
            <Chip
              size="lg"
              tone="accentOnTint"
              data-testid={primary.testId}
              disabled={primary.disabled}
              onClick={primary.run}
              className="shrink-0 border-[color:var(--color-indigo-a46)] bg-[color:var(--color-indigo-a16)] font-[var(--font-weight-signature)] hover:bg-[color:var(--color-indigo-a24)]"
            >
              {primary.icon}
              {primary.label}
            </Chip>
          </span>
        </div>
      </div>
    </div>
  );
}
