"use client";

import { useTranslations } from "next-intl";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { Dialog, TopologyV2KindGlyph, controlClass } from "@/shared/ui";

/**
 * P5c — "새 문서" 가 generic `title:` 템플릿 대신 kind 선택을 먼저 받는다.
 * 문서함의 새 문서 생성이 kind 없는 메모장 문서를 양산하던 것을
 * (.qa-scratch/docs-identity-2026-07/verdict.md 더하기③) "이 vault 의
 * 문서는 노드다" 를 생성 순간에 강제하는 것으로 바꾼다.
 *
 * kind 4종만 노출 — project 는 `/project/new` 가 이미 전용 흐름을 갖고
 * 있어 여기서 중복하지 않는다(build-vault-markdown.ts 의
 * `vaultFolderForKind` 폴더 배치와 동일 규약).
 *
 * 모달 골격(스크림 · 트랩 · Esc · 포커스 복귀 · 스프링)은 `Dialog` 가
 * 소유한다 — 2026-08-15 「체계」석 비준의 첫 소비자. 종전의 손 트랩과
 * 지도 크롬 토큰 월경(`--chrome-radius`/`--chrome-shadow`)이 여기서 걷혔다.
 */
const KIND_OPTIONS = ["domain", "capability", "element", "document"] as const;
export type NewDocKind = (typeof KIND_OPTIONS)[number];

export function NewDocKindDialog({
  open,
  onSelect,
  onClose,
}: {
  open: boolean;
  onSelect: (kind: NewDocKind) => void;
  onClose: () => void;
}) {
  const t = useTranslations("docsVault.newDocDialog");
  const kindLabel = useOntologyKindLabel();

  return (
    <Dialog open={open} onClose={onClose} labelledBy="new-doc-kind-dialog-title">
      <p
        id="new-doc-kind-dialog-title"
        className="text-body-lg font-[var(--font-weight-strong)] text-[color:var(--color-text-primary)]"
      >
        {t("title")}
      </p>
      <p className="mt-1 text-label leading-label text-[color:var(--color-text-tertiary)]">
        {t("subtitle")}
      </p>
      <ul className="mt-3 grid grid-cols-2 gap-2">
        {KIND_OPTIONS.map((kind) => (
          <li key={kind}>
            <button
              type="button"
              onClick={() => onSelect(kind)}
              className={controlClass({ hoverBorder: 'strong',
                shape: "card",
                className: "w-full text-left",
              })}
            >
              <TopologyV2KindGlyph kind={kind} size={16} />
              <span className="text-body text-[color:var(--color-text-secondary)]">
                {kindLabel(kind)}
              </span>
            </button>
          </li>
        ))}
      </ul>
      <button
        type="button"
        onClick={onClose}
        className={controlClass({ hoverInk: 'secondary',
          shape: "link",
          tone: "muted",
          className: "touch-hit-expand mt-3",
        })}
      >
        {t("cancel")}
      </button>
    </Dialog>
  );
}
