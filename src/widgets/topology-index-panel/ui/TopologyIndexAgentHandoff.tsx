"use client";

import { useCallback, useState } from "react";
import { ChevronUp } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import { CompactCopyButton } from "@/shared/ui";
import { copyText } from "@/shared/lib/copy-text";

export interface TopologyIndexAgentHandoffLabels {
  menuLabel: string;
  menuAria: string;
  briefCopy: string;
  briefCopied: string;
  briefCopyAriaLabel: string;
  briefCopiedAriaLabel: string;
  reanalyzeCopy: string;
  reanalyzeCopied: string;
  reanalyzeCopyAriaLabel: string;
  reanalyzeCopiedAriaLabel: string;
  syncCopy: string;
  syncCopied: string;
  syncCopyAriaLabel: string;
  syncCopiedAriaLabel: string;
}

export interface TopologyIndexAgentHandoffProps {
  /** 이미 포맷된 3종 핸드오프 텍스트 — 실제 문자열 조립(vault 요약/재분석
   *  지시/포스트체인지 동기화 게이트)은 `views/home/lib/topology-analysis.ts`
   *  + `shared/lib/ontology-tree` 가 소유, 이 위젯은 클립보드 복사만 담당한다. */
  briefText: string;
  reanalyzeText: string;
  syncText: string;
  labels: TopologyIndexAgentHandoffLabels;
}

/**
 * INDEX 패널 푸터의 "인계" 메뉴 — brief/reanalysis/sync 3종 agent 핸드오프
 * 복사를 단일 버튼 뒤 컴팩트 disclosure 로 묶는다 (W3 분석 보기 은퇴 —
 * 이전엔 `TopologyAnalysisBar` overview 모드의 접힌 보조 액션이었다. INDEX
 * 폭(`--topology-index-width`, 300px) 안에서 3버튼을 나란히 두면 라벨이
 * 다 잘려 단일 진입점 + 위로 열리는 메뉴로 압축했다).
 */
export function TopologyIndexAgentHandoff({
  briefText,
  reanalyzeText,
  syncText,
  labels,
}: TopologyIndexAgentHandoffProps) {
  const [briefCopied, setBriefCopied] = useState(false);
  const [reanalyzeCopied, setReanalyzeCopied] = useState(false);
  const [syncCopied, setSyncCopied] = useState(false);

  const copyBrief = useCallback(async () => {
    const ok = await copyText(briefText);
    if (!ok) return;
    setBriefCopied(true);
    window.setTimeout(() => setBriefCopied(false), 1600);
  }, [briefText]);

  const copyReanalyze = useCallback(async () => {
    const ok = await copyText(reanalyzeText);
    if (!ok) return;
    setReanalyzeCopied(true);
    window.setTimeout(() => setReanalyzeCopied(false), 1600);
  }, [reanalyzeText]);

  const copySync = useCallback(async () => {
    const ok = await copyText(syncText);
    if (!ok) return;
    setSyncCopied(true);
    window.setTimeout(() => setSyncCopied(false), 1600);
  }, [syncText]);

  return (
    <details className="group relative" data-testid="topology-index-agent-handoff">
      <summary
        aria-label={labels.menuAria}
        data-testid="topology-index-agent-handoff-summary"
        className="inline-flex min-h-[26px] list-none items-center gap-1 rounded-micro border border-[color:var(--topology-v2-panel-border)] px-1.5 py-0.5 font-mono text-caption uppercase tracking-[var(--tracking-caps-10)] text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:border-[color:var(--topology-v2-panel-action-border)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
      >
        {labels.menuLabel}
        <ChevronUp
          size={ICON_SIZE.sm}
          aria-hidden
          className="shrink-0 rotate-180 transition-transform duration-[var(--motion-base)] group-open:rotate-0 motion-reduce:transition-none"
        />
      </summary>
      <div
        data-testid="topology-index-agent-handoff-menu"
        className="absolute bottom-full right-0 z-10 mb-1.5 hidden w-56 flex-col gap-1 rounded-chip border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-1.5 shadow-[var(--topology-v2-panel-shadow)] group-open:flex"
      >
        <CompactCopyButton
          copied={briefCopied}
          label={labels.briefCopy}
          ariaLabel={briefCopied ? labels.briefCopiedAriaLabel : labels.briefCopyAriaLabel}
          onClick={copyBrief}
          className="justify-start"
          data-testid="topology-index-brief-copy"
        />
        <CompactCopyButton
          copied={reanalyzeCopied}
          label={labels.reanalyzeCopy}
          ariaLabel={
            reanalyzeCopied ? labels.reanalyzeCopiedAriaLabel : labels.reanalyzeCopyAriaLabel
          }
          onClick={copyReanalyze}
          className="justify-start"
          data-testid="topology-index-reanalyze-copy"
        />
        <CompactCopyButton
          copied={syncCopied}
          label={labels.syncCopy}
          ariaLabel={syncCopied ? labels.syncCopiedAriaLabel : labels.syncCopyAriaLabel}
          onClick={copySync}
          className="justify-start"
          data-testid="topology-index-sync-copy"
        />
      </div>
    </details>
  );
}
