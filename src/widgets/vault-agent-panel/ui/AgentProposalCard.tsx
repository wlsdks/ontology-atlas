'use client';

import { useMemo, useState } from 'react';
import { FileText } from 'lucide-react';
import { ICON_SIZE } from '@/shared/ui/icon-size';

import type { AgentProposal, ProposalChange } from '@/features/vault-agent';
import { summarizeChangeVolume } from '@/features/vault-agent/model/proposal-applier';
import { Checkbox, controlClass } from '@/shared/ui';

/**
 * 제안 카드 — #688 동의 문법의 일반화.
 *
 * 바뀔 파일 경로를 전부 밝히고, 한 번 묻고, **취소하면 파일 0개 변경**이다.
 *
 * 세 가지가 접힌 diff 에 도장 찍는 것을 막는다:
 * ① 헤더가 총량을 말한다 ("파일 3개 · +42줄 −3줄")
 * ② 행 요약이 필드 수준까지 구체적이다
 * ③ **세션 첫 적용은 diff 가 펼쳐진 상태로 시작한다**
 *
 * 그리고 이 턴에 읽지 않은 파일을 고치는 제안에는 경고 행이 붙는다 —
 * 볼트 본문에 심긴 지시가 "그럴듯한 제안" 으로 세탁되는 길을 좁힌다.
 * (완전 방어가 아니다. 인젝션은 산업 미해결이다.)
 */

export interface AgentProposalLabels {
  title: (count: number) => string;
  volume: (args: { files: number; added: number; removed: number }) => string;
  apply: (count: number) => string;
  /** 쓰기가 도는 동안의 라벨 — 화면이 "지금 무슨 일이 일어나는가" 를 말한다. */
  applying: string;
  cancel: string;
  copy: string;
  copied: string;
  snapshot: string;
  snapshotUnavailable: string;
  applied: (sha: string) => string;
  appliedNoSnapshot: string;
  cancelled: string;
  conflict: string;
  unreadWarning: string;
  showOnMap: string;
  expandHint: string;
  readOnlyTitle: string;
}

export function AgentProposalCard({
  proposal,
  labels,
  canWrite,
  vaultIsGit,
  expandedByDefault,
  onApply,
  onCancel,
  onCopy,
  onToggleChange,
  onToggleSnapshot,
  onFocusNode,
}: {
  proposal: AgentProposal;
  labels: AgentProposalLabels;
  canWrite: boolean;
  vaultIsGit: boolean;
  expandedByDefault: boolean;
  onApply: () => void;
  onCancel: () => void;
  onCopy: () => void;
  onToggleChange: (changeId: string, selected: boolean) => void;
  onToggleSnapshot: (requested: boolean) => void;
  onFocusNode: (slug: string) => void;
}) {
  const selected = proposal.changes.filter((change) => change.selected);
  const volume = useMemo(() => summarizeChangeVolume(selected), [selected]);
  const [copied, setCopied] = useState(false);

  const unread = proposal.changes.filter((change) =>
    change.files.some(
      (file) =>
        file.kind === 'modify' &&
        !proposal.readNodesThisTurn.some((slug) => file.path === `${slug}.md`),
    ),
  );

  /**
   * 쓰기가 **도는 중** — 아직 끝나지 않았다. 초안에서 이 상태를 `settled` 에
   * 넣었더니 종료 문구 분기의 fallback 으로 떨어져 화면이 **"취소됨"** 이라고
   * 말했다. 쓰는 중인데 취소됐다고 하는 것은 잠그지 않은 것보다 나쁘다.
   *
   * 그래서 둘을 가른다: 동작 줄은 그대로 두되(사용자가 무엇을 눌렀는지 자리가
   * 유지된다) 두 버튼을 함께 잠그고 라벨만 "적용 중…" 으로 바꾼다 — 마무리
   * 대화상자의 `busy` 와 같은 문법이다.
   */
  const busy = proposal.status === 'applying';
  const settled = proposal.status !== 'pending' && !busy;

  return (
    <section
      data-testid="agent-proposal-card"
      data-proposal-status={proposal.status}
      className="mb-3 flex flex-col gap-2.5 rounded-card border border-[color:var(--color-border-strong)] bg-[color:var(--color-elevated)] p-3"
    >
      <header className="flex flex-col gap-1">
        <p className="text-body font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {canWrite ? labels.title(proposal.changes.length) : labels.readOnlyTitle}
        </p>
        <p
          data-testid="agent-proposal-volume"
          className="text-label tracking-label text-[color:var(--color-text-tertiary)]"
        >
          {labels.volume(volume)}
        </p>
      </header>

      {unread.length > 0 ? (
        <p
          data-testid="agent-proposal-unread-warning"
          className="rounded-chip border border-[color:var(--color-amber-signal-a60)] bg-[color:var(--color-amber-signal-a16)] px-2 py-1 text-label tracking-label text-[color:var(--color-text-secondary)] [word-break:keep-all]"
        >
          {labels.unreadWarning}
        </p>
      ) : null}

      <ul className="flex list-none flex-col gap-1">
        {proposal.changes.map((change) => (
          <ChangeRow
            key={change.id}
            change={change}
            disabled={settled || busy}
            expandedByDefault={expandedByDefault}
            expandHint={labels.expandHint}
            onToggle={(next) => onToggleChange(change.id, next)}
          />
        ))}
      </ul>

      {canWrite && !settled ? (
        <Checkbox
          className="tracking-label"
          data-testid="agent-proposal-snapshot"
          checked={proposal.snapshotRequested}
          disabled={!vaultIsGit}
          onChange={(event) => onToggleSnapshot(event.target.checked)}
          label={<span>{vaultIsGit ? labels.snapshot : labels.snapshotUnavailable}</span>}
        />
      ) : null}

      {settled ? (
        <p
          data-testid="agent-proposal-outcome"
          className="text-label tracking-label text-[color:var(--color-text-tertiary)]"
        >
          {proposal.status === 'applied'
            ? proposal.appliedSnapshotSha
              ? labels.applied(proposal.appliedSnapshotSha)
              : labels.appliedNoSnapshot
            : proposal.status === 'conflict'
              ? labels.conflict
              : labels.cancelled}
          {proposal.status === 'applied' ? (
            <>
              {' '}
              <button
                type="button"
                data-testid="agent-proposal-show-on-map"
                onClick={() =>
                  onFocusNode(proposal.changes[0]?.files[0]?.path.replace(/\.md$/, '') ?? '')
                }
                className={controlClass({ shape: "link", className: "underline decoration-dotted underline-offset-2 hover:text-[color:var(--color-text-primary)]" })}
              >
                {labels.showOnMap}
              </button>
            </>
          ) : null}
        </p>
      ) : (
        <div className="flex items-center justify-end gap-2">
          <button
            type="button"
            data-testid="agent-proposal-cancel"
            disabled={busy}
            onClick={onCancel}
            className={controlClass({
              shape: 'chip',
              size: 'md',
              tone: 'secondary',
              className:
                'tracking-label border-[color:var(--color-border-soft)] hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-primary)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
            })}
          >
            {labels.cancel}
          </button>
          {canWrite ? (
            <button
              type="button"
              data-testid="agent-proposal-apply"
              disabled={busy || selected.length === 0}
              onClick={onApply}
              className={controlClass({
                tone: 'onAccent',
                className:
                  'tracking-label hover:bg-[color:var(--color-indigo-brand-hover)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {proposal.status === 'applying' ? labels.applying : labels.apply(selected.length)}
            </button>
          ) : (
            <button
              type="button"
              data-testid="agent-proposal-copy"
              onClick={() => {
                onCopy();
                setCopied(true);
              }}
              className={controlClass({
                shape: 'chip',
                size: 'md',
                tone: 'strong',
                className:
                  'font-[var(--font-weight-emphasis)] tracking-label border-[color:var(--color-indigo-accent)] hover:bg-[color:var(--color-indigo-a16)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-accent)]',
              })}
            >
              {copied ? labels.copied : labels.copy}
            </button>
          )}
        </div>
      )}
    </section>
  );
}

function ChangeRow({
  change,
  disabled,
  expandedByDefault,
  expandHint,
  onToggle,
}: {
  change: ProposalChange;
  disabled: boolean;
  expandedByDefault: boolean;
  expandHint: string;
  onToggle: (selected: boolean) => void;
}) {
  const [open, setOpen] = useState(expandedByDefault);
  return (
    <li className="rounded-chip border border-[color:var(--color-divider)] bg-[color:var(--color-panel)]">
      <div className="flex items-center gap-2 px-2 py-1.5">
        {/*
         * 이 체크박스는 **라벨이 없었다.** 그래서 결함이 둘이었다 — 접근 이름이
         * 없어(스크린 리더가 "체크박스"라고만 읽는다) 무엇을 고르는지 알 수 없고,
         * 타깃이 14px 뿐이라 WCAG 2.5.8(AA, 24px)에 미달이었다. 파일 이름을 라벨로
         * 감싸면 **둘이 한 번에 풀린다** — 라벨이 접근 이름이 되고, 라벨 전체가
         * 하나의 타깃이 된다(라벨 클릭이 곧 토글이라는 네이티브 동작).
         *
         * 펼침 버튼은 라벨 **밖**에 남는다 — 안에 넣으면 「자세히」를 누를 때마다
         * 선택이 뒤집힌다.
         */}
        <Checkbox
          className="min-w-0 flex-1"
          data-testid={`agent-proposal-change-${change.id}`}
          checked={change.selected}
          disabled={disabled}
          onChange={(event) => onToggle(event.target.checked)}
          label={
            <>
              <FileText
                aria-hidden="true"
                size={ICON_SIZE.sm}
                className="shrink-0 text-[color:var(--color-text-quaternary)]"
              />
              <span
                className="min-w-0 flex-1 truncate text-label tracking-label text-[color:var(--color-text-secondary)]"
                title={change.summary}
              >
                {change.summary}
              </span>
            </>
          }
        />
        <button
          type="button"
          data-testid="agent-proposal-change-toggle"
          aria-expanded={open}
          onClick={() => setOpen((current) => !current)}
          className={controlClass({ shape: "link", tone: "muted", className: "shrink-0 tracking-label hover:text-[color:var(--color-text-primary)]" })}
        >
          {expandHint}
        </button>
      </div>
      {open ? (
        <div className="border-t border-[color:var(--color-divider)] px-2 py-1.5">
          {change.files.map((file) => (
            <div key={file.path} className="mb-1 last:mb-0">
              <p
                data-testid="agent-proposal-path"
                title={file.path}
                className="truncate text-caption text-[color:var(--color-text-quaternary)]"
              >
                {file.path}
              </p>
              <pre
                data-testid="agent-proposal-diff"
                className="mt-1 max-h-40 overflow-auto whitespace-pre-wrap break-words text-caption leading-caption"
              >
                {renderDiff(file.before, file.after)}
              </pre>
            </div>
          ))}
        </div>
      ) : null}
    </li>
  );
}

/**
 * 줄 단위 diff. +/- 는 **신호톤이 아니라 데이터**다 — 새 채색 시스템을
 * 만들지 않고 기존 텍스트 위계로만 구분한다.
 */
function renderDiff(before: string | null, after: string) {
  const beforeLines = before === null ? [] : before.split('\n');
  const afterLines = after.split('\n');
  const beforeSet = new Set(beforeLines);
  const afterSet = new Set(afterLines);
  const rows: React.ReactNode[] = [];
  let key = 0;
  for (const line of beforeLines) {
    if (afterSet.has(line)) continue;
    rows.push(
      <span key={`d-${key++}`} className="block text-[color:var(--color-text-quaternary)]">
        − {line}
      </span>,
    );
  }
  for (const line of afterLines) {
    if (beforeSet.has(line)) continue;
    rows.push(
      <span key={`a-${key++}`} className="block text-[color:var(--color-text-primary)]">
        + {line}
      </span>,
    );
  }
  return rows;
}
