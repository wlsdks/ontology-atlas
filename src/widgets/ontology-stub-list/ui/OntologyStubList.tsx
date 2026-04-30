"use client";

import { useState } from "react";
import type { StubNode } from "@/entities/knowledge-graph";

export interface OntologyStubListProps {
  stubs: ReadonlyArray<StubNode>;
  busyNodeId?: string | null;
  /** kind 선택 모달이 promote 결정. */
  onPromote: (
    nodeId: string,
    newKind: "project" | "domain" | "capability" | "element" | "document",
  ) => void;
  /** 단일 confirm 후 dismiss. */
  onDismiss: (nodeId: string) => void;
}

const PROMOTE_KINDS: ReadonlyArray<{
  id: "project" | "domain" | "capability" | "element" | "document";
  label: string;
}> = [
  { id: "project", label: "프로젝트" },
  { id: "domain", label: "도메인" },
  { id: "capability", label: "역량" },
  { id: "element", label: "요소" },
  { id: "document", label: "문서" },
];

const TYPE_LABEL: Record<string, string> = {
  contains: "포함",
  belongs_to: "소속",
  depends_on: "의존",
  implements: "구현",
  uses: "사용",
  describes: "설명",
  related_to: "연관",
};

/**
 * stub placeholder 검수 위젯 (T-13).
 *
 * frontmatter relates 가 미존재 노드를 가리킬 때 자동 생성된 stub 들을
 * 표시한다. 검수자는 각 stub 에 대해:
 *   - **promote** — kind 를 선택해 진짜 노드로 승격. 원본 edge type 복원.
 *   - **dismiss** — 잘못된 reference 로 판단 → stub + 참조 edges 모두 삭제.
 */
export function OntologyStubList({
  stubs,
  busyNodeId,
  onPromote,
  onDismiss,
}: OntologyStubListProps) {
  if (stubs.length === 0) {
    return (
      <div
        data-testid="ontology-stub-list-empty"
        className="rounded-2xl border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-5 py-6 text-sm text-[color:var(--color-text-tertiary)]"
      >
        <p className="break-keep">미해결 참조 가 없어요.</p>
        <p className="mt-1 break-keep text-xs text-[color:var(--color-text-quaternary)]">
          frontmatter <code>relates.target</code> 이 가리킨 노드들이 모두 진짜 노드로 매칭됐다는 뜻이에요.
        </p>
      </div>
    );
  }
  return (
    <div className="space-y-3">
      <div className="rounded-xl border border-[color:rgba(255,179,71,0.20)] bg-[color:rgba(255,179,71,0.06)] px-4 py-3 text-xs text-[color:var(--color-text-secondary)]">
        <p className="break-keep font-[var(--font-weight-signature)] text-[color:rgba(238,198,128,0.95)]">
          미해결 참조 {stubs.length} 건
        </p>
        <p className="mt-1 break-keep">
          frontmatter <code>relates.target</code> 이 가리킨 미존재 노드들 (placeholder). 승격(promote)하면 진짜 노드로
          올라가고 원본 edge type 이 복원돼요. 폐기(dismiss)하면 잘못된 reference 로 보고 삭제.
        </p>
      </div>
      <ul className="space-y-2" data-testid="ontology-stub-list">
        {stubs.map((stub) => (
          <StubRow
            key={stub.id}
            stub={stub}
            isBusy={busyNodeId === stub.id}
            onPromote={onPromote}
            onDismiss={onDismiss}
          />
        ))}
      </ul>
    </div>
  );
}

function StubRow({
  stub,
  isBusy,
  onPromote,
  onDismiss,
}: {
  stub: StubNode;
  isBusy: boolean;
  onPromote: OntologyStubListProps["onPromote"];
  onDismiss: OntologyStubListProps["onDismiss"];
}) {
  const [pickerOpen, setPickerOpen] = useState(false);
  const typeLabel = stub.pendingType ? TYPE_LABEL[stub.pendingType] ?? stub.pendingType : null;

  return (
    <li
      data-testid="ontology-stub-row"
      data-node-id={stub.id}
      className="rounded-2xl border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-4 py-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="break-keep text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
            {stub.title}
          </p>
          <p className="mt-1 break-keep text-xs text-[color:var(--color-text-tertiary)]">
            {stub.pendingFromId ? (
              <>
                <span className="font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                  {stub.pendingFromId}
                </span>
                {typeLabel ? (
                  <>
                    {" "}
                    →{" "}
                    <span className="font-mono text-[10px] uppercase tracking-[0.10em] text-[color:rgba(238,198,128,0.95)]">
                      {typeLabel}
                    </span>{" "}
                    →{" "}
                  </>
                ) : (
                  " → "
                )}
                <span className="font-mono text-[10px] text-[color:var(--color-text-tertiary)]">
                  {stub.id}
                </span>
              </>
            ) : (
              <span className="font-mono text-[10px]">{stub.id}</span>
            )}
          </p>
          <p className="mt-1 text-[10px] uppercase tracking-[0.10em] text-[color:var(--color-text-quaternary)]">
            근거 문서 {stub.evidenceIds.length}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-1.5">
          {pickerOpen ? (
            <KindPicker
              onPick={(kind) => {
                setPickerOpen(false);
                onPromote(stub.id, kind);
              }}
              onCancel={() => setPickerOpen(false)}
              disabled={isBusy}
            />
          ) : (
            <>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => setPickerOpen(true)}
                className="rounded-md border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.10)] px-2.5 py-1 text-[11px] text-[color:rgba(159,170,235,0.95)] hover:bg-[color:rgba(94,106,210,0.18)] disabled:opacity-40"
              >
                {isBusy ? "처리 중..." : "promote"}
              </button>
              <button
                type="button"
                disabled={isBusy}
                onClick={() => {
                  if (
                    typeof window !== "undefined"
                    && window.confirm(`stub "${stub.title}" 을 정말 삭제할까요? 참조 edges 도 함께 사라져요.`)
                  ) {
                    onDismiss(stub.id);
                  }
                }}
                className="rounded-md border border-[color:var(--color-overlay-3)] px-2.5 py-1 text-[11px] text-[color:var(--color-text-tertiary)] hover:border-[color:rgba(229,72,77,0.32)] hover:text-[color:var(--color-status-danger)] disabled:opacity-40"
              >
                dismiss
              </button>
            </>
          )}
        </div>
      </div>
    </li>
  );
}

function KindPicker({
  onPick,
  onCancel,
  disabled,
}: {
  onPick: (
    kind: "project" | "domain" | "capability" | "element" | "document",
  ) => void;
  onCancel: () => void;
  disabled?: boolean;
}) {
  return (
    <div
      data-testid="ontology-stub-kind-picker"
      className="flex flex-wrap items-center gap-1 rounded-md border border-[color:rgba(94,106,210,0.35)] bg-[color:var(--color-panel)] p-1"
      role="menu"
    >
      {PROMOTE_KINDS.map((kind) => (
        <button
          key={kind.id}
          type="button"
          role="menuitem"
          disabled={disabled}
          onClick={() => onPick(kind.id)}
          className="rounded px-2 py-0.5 text-[10px] text-[color:var(--color-text-secondary)] hover:bg-[color:rgba(94,106,210,0.18)] hover:text-[color:rgba(159,170,235,0.95)] disabled:opacity-40"
        >
          {kind.label}
        </button>
      ))}
      <button
        type="button"
        onClick={onCancel}
        className="rounded px-1.5 py-0.5 text-[10px] text-[color:var(--color-text-quaternary)] hover:text-[color:var(--color-text-secondary)]"
      >
        ✕
      </button>
    </div>
  );
}
