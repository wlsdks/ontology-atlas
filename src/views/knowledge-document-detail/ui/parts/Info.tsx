import type { ReactNode } from "react";

/**
 * 좌측 정보 박스 — 라벨 + 값 1쌍을 한 카드 안에 표시. 디자인 헌장 §11 의
 * 무채색 outline + soft 텍스트 위계만 사용.
 *
 * 호출자: `KnowledgeDocumentDetailPage` 의 메타 그리드 (분석 버전 / 모델 /
 * 토큰 사용량 등 KV display).
 */
export function Info({
  label,
  children,
}: {
  label: string;
  children: ReactNode;
}) {
  return (
    <div className="rounded-lg border border-[color:var(--color-border-soft)] px-3 py-3">
      <p className="text-[11px] text-[color:var(--color-text-quaternary)]">
        {label}
      </p>
      <p className="mt-2 text-sm text-[color:var(--color-text-primary)]">
        {children}
      </p>
    </div>
  );
}
