"use client";

import { useEffect, useRef } from "react";
import { useTranslations } from "next-intl";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { TopologyV2KindGlyph } from "@/shared/ui";

/**
 * P5c — "새 문서" 가 generic `title:` 템플릿 대신 kind 선택을 먼저 받는다.
 * 문서함의 새 문서 생성이 kind 없는 메모장 문서를 양산하던 것을
 * (.qa-scratch/docs-identity-2026-07/verdict.md 더하기③) "이 vault 의
 * 문서는 노드다" 를 생성 순간에 강제하는 것으로 바꾼다.
 *
 * kind 4종만 노출 — project 는 `/project/new` 가 이미 전용 흐름을 갖고
 * 있어 여기서 중복하지 않는다(build-vault-markdown.ts 의
 * `vaultFolderForKind` 폴더 배치와 동일 규약).
 */
const KIND_OPTIONS = ["domain", "capability", "element", "document"] as const;
export type NewDocKind = (typeof KIND_OPTIONS)[number];

export function NewDocKindDialog({
  onSelect,
  onClose,
}: {
  onSelect: (kind: NewDocKind) => void;
  onClose: () => void;
}) {
  const t = useTranslations("docsVault.newDocDialog");
  const kindLabel = useOntologyKindLabel();
  const dialogRef = useRef<HTMLDivElement | null>(null);

  useEffect(() => {
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handler);
    dialogRef.current?.querySelector<HTMLElement>("button")?.focus();
    return () => window.removeEventListener("keydown", handler);
  }, [onClose]);

  return (
    <div
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div className="fixed inset-0 -z-10 bg-[color:var(--docs-scrim)]" aria-hidden />
      <div
        ref={dialogRef}
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-doc-kind-dialog-title"
        className="w-full max-w-[360px] rounded-[var(--chrome-radius)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-4 shadow-[var(--chrome-shadow)]"
      >
        <p
          id="new-doc-kind-dialog-title"
          className="text-[13.5px] font-[650] text-[color:var(--color-text-primary)]"
        >
          {t("title")}
        </p>
        <p className="mt-1 text-[11.5px] leading-4 text-[color:var(--color-text-tertiary)]">
          {t("subtitle")}
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map((kind) => (
            <li key={kind}>
              <button
                type="button"
                onClick={() => onSelect(kind)}
                className="flex w-full items-center gap-2 rounded-md border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-2.5 py-2 text-left transition-colors hover:border-[color:var(--color-border-strong)]"
              >
                <TopologyV2KindGlyph kind={kind} size={16} />
                <span className="text-[12px] text-[color:var(--color-text-secondary)]">
                  {kindLabel(kind)}
                </span>
              </button>
            </li>
          ))}
        </ul>
        <button
          type="button"
          onClick={onClose}
          className="mt-3 text-[11px] text-[color:var(--color-text-quaternary)] transition-colors hover:text-[color:var(--color-text-secondary)]"
        >
          {t("cancel")}
        </button>
      </div>
    </div>
  );
}
