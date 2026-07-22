"use client";

import { useEffect, useRef } from "react";
import { X } from "lucide-react";
import { Link } from "@/i18n/navigation";

/**
 * P3b — 엣지 팝오버. 노드 데이터시트와 같은 재질(panel 토큰)로, 관계
 * 하나의 의미를 말한다: 평문 문장 → 타입·방향 → 선언 출처(.md) → 변경일
 * → 관계 편집 딥링크.
 *
 * 레퍼런스 판정: "온톨로지답다"의 분기점은 타입 이름이 아니라 문장화 +
 * 선언 출처다 — frontmatter 가 곧 그래프라 출처 표시 비용이 0 인 것이
 * 이 제품의 차별점. 문장/라벨은 관계 어휘 사전(P1a)을 쓰는 호출자가
 * 조립해 넘긴다 (이 위젯은 표시 전용).
 */
export interface TopologyV2EdgePanelProps {
  /** 평문 문장 — "A 가 B 에 기대요" (어휘 사전 plain 레지스터 기반). */
  sentence: string;
  /** formal 타입 라벨 — "의존". */
  typeLabel: string;
  fromTitle: string;
  toTitle: string;
  /** P6 — 관계의 근거 한 줄 (relation_notes). null 이면 생략. */
  why?: string | null;
  /** 선언한 vault 문서 — null 이면 출처 행 생략. */
  declaredBy: { slug: string; href: string } | null;
  /** 선언 문서의 변경 시점 라벨 (S-C1 사다리 재사용) — null 이면 생략. */
  updatedAtLabel: string | null;
  builderEditHref: string;
  labels: {
    kicker: string;
    declaredByLabel: string;
    editRelation: string;
    close: string;
    openDoc: string;
  };
  onSelectNode: (id: string) => void;
  fromId: string;
  toId: string;
  onClose: () => void;
  className?: string;
}

export function TopologyV2EdgePanel({
  sentence,
  typeLabel,
  fromTitle,
  toTitle,
  why = null,
  declaredBy,
  updatedAtLabel,
  builderEditHref,
  labels,
  onSelectNode,
  fromId,
  toId,
  onClose,
  className,
}: TopologyV2EdgePanelProps) {
  // H3 P1 — 엣지 팝오버 포커스 계약. 열릴 때 dialog 로 포커스를 들여
  // (role=dialog + aria-label 이 스크린리더에 발화되게), 닫힐 때는 팝오버를
  // 연 트리거(캔버스 등 직전 포커스 요소)로 되돌린다. 종전에는 아무 포커스
  // 관리가 없어 Esc 로 닫으면 dialog 언마운트 후 포커스가 body 로 유실됐다
  // (접근성 감사 P1).
  const dialogRef = useRef<HTMLElement>(null);
  useEffect(() => {
    const trigger = document.activeElement as HTMLElement | null;
    dialogRef.current?.focus();
    return () => {
      if (trigger && typeof trigger.focus === "function" && trigger.isConnected) {
        trigger.focus();
      }
    };
    // 마운트/언마운트 1회 — 열릴 때 포커스 진입, 닫힐 때 복귀.
  }, []);

  return (
    <aside
      ref={dialogRef}
      role="dialog"
      aria-label={sentence}
      tabIndex={-1}
      data-testid="topology-v2-edge-panel"
      className={`topology-chrome-in flex w-[300px] flex-col gap-3 rounded-[var(--topology-v2-panel-radius)] outline-none focus-visible:outline-none border border-[color:var(--topology-v2-panel-border)] bg-[color:var(--topology-v2-panel-surface)] p-4 shadow-[var(--topology-v2-panel-shadow)] ${className ?? ""}`}
    >
      <div className="flex items-start justify-between gap-2">
        <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--topology-v2-panel-text-tertiary)]">
          {labels.kicker} · {typeLabel}
        </p>
        <button
          type="button"
          onClick={onClose}
          aria-label={labels.close}
          data-testid="topology-v2-edge-panel-close"
          className="-mr-1 -mt-1 rounded p-1 text-[color:var(--topology-v2-panel-text-tertiary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-primary)]"
        >
          <X size={13} aria-hidden />
        </button>
      </div>

      {/* 문장이 주인공 — 의미의 평문화 */}
      <p
        data-testid="topology-v2-edge-sentence"
        className="text-[14px] font-medium leading-relaxed text-[color:var(--topology-v2-panel-text-primary)]"
      >
        {sentence}
      </p>
      {why ? (
        <p
          data-testid="topology-v2-edge-why"
          className="text-[12px] leading-relaxed text-[color:var(--topology-v2-panel-text-secondary)]"
        >
          {why}
        </p>
      ) : null}

      {/* 양 끝 노드 — 클릭 시 해당 노드 포커스 */}
      <div className="flex flex-col gap-0.5">
        {[
          { id: fromId, title: fromTitle },
          { id: toId, title: toTitle },
        ].map((n) => (
          <button
            key={n.id}
            type="button"
            onClick={() => onSelectNode(n.id)}
            className="rounded-[var(--topology-v2-panel-row-radius)] px-1.5 py-1 text-left text-[12.5px] text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {n.title}
          </button>
        ))}
      </div>

      {declaredBy ? (
        <div className="flex flex-col gap-1 border-t border-[color:var(--topology-v2-panel-divider)] pt-2.5">
          <span className="font-mono text-[9.5px] uppercase tracking-[0.12em] text-[color:var(--topology-v2-panel-text-quaternary)]">
            {labels.declaredByLabel}
            {updatedAtLabel ? ` · ${updatedAtLabel}` : ""}
          </span>
          <Link
            href={declaredBy.href}
            data-testid="topology-v2-edge-declared-by"
            className="truncate font-mono text-[11px] text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:text-[color:var(--topology-v2-panel-text-primary)]"
          >
            {declaredBy.slug}.md → {labels.openDoc}
          </Link>
        </div>
      ) : null}

      <Link
        href={builderEditHref}
        data-testid="topology-v2-edge-edit"
        className="inline-flex h-8 items-center justify-center rounded-md border border-[color:var(--topology-v2-panel-action-border)] bg-[color:var(--topology-v2-panel-action-surface)] text-[11.5px] text-[color:var(--topology-v2-panel-text-secondary)] transition-colors hover:bg-[color:var(--topology-v2-panel-row-hover)] hover:text-[color:var(--topology-v2-panel-text-primary)]"
      >
        {labels.editRelation}
      </Link>
    </aside>
  );
}
