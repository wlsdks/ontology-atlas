"use client";

import { useTranslations } from "next-intl";
import { Button } from "@/shared/ui";
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
  onConnectSource,
}: {
  status: BuilderWriteConfirmStatus;
  draftNodes: number;
  draftEdges: number;
  pendingRelationSummary?: { source: string; target: string; key: string } | null;
  writeAriaLabel: string;
  writeDisabled: boolean;
  onDryRun: () => void;
  onWrite: () => void;
  /** 읽기 전용(샘플) 소스에서 "내 폴더 열기"(vault 픽커) 트리거 — 감사 #2. */
  onConnectSource?: () => void;
}) {
  const t = useTranslations("ontologyPages.edit.page.writeConfirmBar");
  const readOnlySource = status === "readOnlySource";
  const payload = readOnlySource
    ? t("readOnlySource")
    : status === "relationPending" && pendingRelationSummary
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
      <span className="shrink-0 text-label font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
        {t("label")}
      </span>
      <p className="min-w-0 flex-1 truncate font-mono text-label text-[color:var(--color-text-tertiary)]">
        {payload}
      </p>
      {/* 쓰기(주 액션)/미리보기(보조) 위계 — 로컬 alpha 톤을 손으로 반복하는
          대신 공유 `Button` variant(primary=인디고 solid · outline=중립)를
          재사용해 앱 전역 버튼 문법과 맞춘다. 밀도(h-8/text-label/rounded-md)
          는 size="sm" 사다리 + 이 바의 기존 컴팩트 크롬에 맞춘 최소 override. */}
      <div className="flex shrink-0 items-center gap-1.5">
        {readOnlySource ? (
          // 읽기 전용 소스 — dry-run/쓰기는 거짓 약속이라 단일 "내 폴더 열기"
          // (vault 픽커)만 노출한다(감사 #2).
          <Button
            type="button"
            variant="primary"
            size="sm"
            onClick={onConnectSource}
            aria-label={t("connectSourceAriaLabel")}
            className="rounded-md px-2.5 text-label focus-visible:ring-offset-[color:var(--color-panel)]"
          >
            {t("connectSourceButton")}
          </Button>
        ) : (
          <>
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={onDryRun}
              // 저장 상태 팝오버 토글 트리거 — 페이지의 외부-pointerdown dismiss
              // 가 이 버튼 클릭을 "외부"로 오인해 닫은 뒤 곧바로 다시 열지
              // 않도록 표시한다(감사 #1 ④).
              data-builder-popover-trigger=""
              aria-label={t("dryRunAriaLabel")}
              className="rounded-md px-2.5 text-label font-normal focus-visible:ring-offset-[color:var(--color-panel)]"
            >
              {t("dryRunButton")}
            </Button>
            <Button
              type="button"
              variant="primary"
              size="sm"
              onClick={onWrite}
              disabled={writeDisabled}
              aria-label={writeAriaLabel}
              className="rounded-md px-2.5 text-label focus-visible:ring-offset-[color:var(--color-panel)]"
            >
              {t("writeButton")}
            </Button>
          </>
        )}
      </div>
    </section>
  );
}
