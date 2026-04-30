"use client";

import { useMemo } from "react";
import { computeFrontmatterGrade, type KnowledgeDocumentFrontmatter } from "@/entities/knowledge-document";

export interface FrontmatterGradeBadgeProps {
  frontmatter: KnowledgeDocumentFrontmatter;
  pageTitle?: string;
  pageKind?: string;
  pageProjectIds?: string[];
}

const GRADE_LABEL: Record<"A" | "B" | "C", string> = {
  A: "A · 자동 승인",
  B: "B · 검수 후 승인",
  C: "C · 자동 반영 금지",
};

const GRADE_TONE: Record<"A" | "B" | "C", { border: string; bg: string; text: string }> = {
  A: {
    border: "rgba(94,106,210,0.32)",
    bg: "rgba(94,106,210,0.08)",
    text: "rgba(159,170,235,0.95)",
  },
  B: {
    border: "var(--color-overlay-3)",
    bg: "var(--color-overlay-1)",
    text: "var(--color-text-secondary)",
  },
  C: {
    border: "rgba(255,179,71,0.32)",
    bg: "rgba(255,179,71,0.08)",
    text: "rgba(238,198,128,0.95)",
  },
};

const KEY_LABEL: Record<string, string> = {
  id: "id",
  kind: "kind",
  project: "project",
  title: "title",
  version: "version",
  domain: "domain",
  status: "status",
  aliases: "aliases",
  tags: "tags",
};

/**
 * 새 문서 작성 페이지 inline badge — frontmatter 등급 (A/B/C) 추정 + 누락 키 표시.
 *
 * `ontology-frontmatter-contract.md` §2 기준 — 추출 워커가 매기는 등급과 1:1 일치.
 * 사용자가 폼·frontmatter 입력 중 실시간으로 "지금 입력으로 추출 신뢰도 cap 1.0
 * 받을 수 있나?" 답.
 *
 * tone:
 *   - A: 인디고 강조 ("자동 승인 가능")
 *   - B: 무채색 ("검수 후 승인")
 *   - C: amber 경고 ("자동 반영 금지 — 필수 누락")
 */
export function FrontmatterGradeBadge({
  frontmatter,
  pageTitle,
  pageKind,
  pageProjectIds,
}: FrontmatterGradeBadgeProps) {
  const result = useMemo(
    () => computeFrontmatterGrade({ frontmatter, pageTitle, pageKind, pageProjectIds }),
    [frontmatter, pageTitle, pageKind, pageProjectIds],
  );

  const tone = GRADE_TONE[result.grade];
  const label = GRADE_LABEL[result.grade];

  // 사용자에게 "왜 이 등급인지" 보여주는 메시지 — title attribute + 인라인 설명.
  const reasonParts: string[] = [];
  if (result.missingRequired.length > 0) {
    reasonParts.push(
      `필수 누락: ${result.missingRequired.map((k) => KEY_LABEL[k] ?? k).join(", ")}`,
    );
  }
  if (result.missingRecommended.length > 0) {
    reasonParts.push(
      `권장 누락: ${result.missingRecommended.map((k) => KEY_LABEL[k] ?? k).join(", ")}`,
    );
  }
  const reason = reasonParts.length > 0 ? reasonParts.join(" · ") : "필수 + 권장 모두 채워졌어요";

  return (
    <div
      className="mt-2 inline-flex max-w-full items-center gap-2 rounded-md border px-2.5 py-1.5"
      style={{ borderColor: tone.border, backgroundColor: tone.bg }}
      title={reason}
    >
      <span className="font-mono text-[10px] uppercase tracking-[0.14em]" style={{ color: tone.text }}>
        Grade {label}
      </span>
      <span className="min-w-0 truncate text-[11px] text-[color:var(--color-text-tertiary)]">
        {reason}
      </span>
    </div>
  );
}
