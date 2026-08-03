"use client";

import { useEffect, useRef } from "react";
import { motion, useReducedMotion } from "framer-motion";
import { useTranslations } from "next-intl";
import { useOntologyKindLabel } from "@/entities/ontology-class";
import { OVERLAY_SPRING, OVERLAY_SPRING_REDUCED, SCRIM_FADE, SCRIM_FADE_REDUCED } from "@/shared/motion";
import { TopologyV2KindGlyph, controlClass } from "@/shared/ui";

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
 * 설계협의회 batch B1 rank2/18 — GlobalSearch·SearchPalette 와 같은
 * 임계감쇠 오버레이 스프링(OVERLAY_SPRING) + focus-trap/ESC/트리거
 * 포커스복귀 계약. 호출부(DocsVaultPage)가 `AnimatePresence` 로 감싸야
 * 퇴장 애니메이션이 끝까지 재생된다.
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
  const previousFocusRef = useRef<HTMLElement | null>(null);
  const reducedMotion = useReducedMotion();
  const panelTransition = reducedMotion ? OVERLAY_SPRING_REDUCED : OVERLAY_SPRING;

  useEffect(() => {
    previousFocusRef.current = document.activeElement as HTMLElement | null;
    const handler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        onClose();
        return;
      }
      // rank18 — Tab 순환을 다이얼로그 내부에 가둔다 (SearchPalette 와
      // 동일한 trap 패턴, 신규 라이브러리 0).
      if (event.key !== "Tab") return;
      const dialog = dialogRef.current;
      if (!dialog) return;
      const items = Array.from(
        dialog.querySelectorAll<HTMLElement>(
          'button, [href], input, select, textarea, [tabindex]:not([tabindex="-1"])',
        ),
      ).filter((el) => !el.hasAttribute("disabled"));
      if (items.length === 0) return;
      const first = items[0];
      const last = items[items.length - 1];
      if (event.shiftKey) {
        if (document.activeElement === first) {
          event.preventDefault();
          last.focus();
        }
      } else if (document.activeElement === last) {
        event.preventDefault();
        first.focus();
      }
    };
    window.addEventListener("keydown", handler);
    // rank18 — 첫 focusable 엘리먼트(첫 kind 버튼)에 포커스, preventScroll.
    dialogRef.current
      ?.querySelector<HTMLElement>("button")
      ?.focus({ preventScroll: true });
    return () => {
      window.removeEventListener("keydown", handler);
      // rank18 — 트리거로 포커스 복귀.
      previousFocusRef.current?.focus?.({ preventScroll: true });
    };
  }, [onClose]);

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      transition={reducedMotion ? SCRIM_FADE_REDUCED : SCRIM_FADE}
      data-overlay-spring="true"
      className="fixed inset-0 z-40 flex items-center justify-center px-4"
      onClick={(event) => {
        if (event.target === event.currentTarget) onClose();
      }}
    >
      <div
        className="fixed inset-0 -z-10 bg-[color:var(--overlay-scrim)]"
        aria-hidden
      />
      {/*
       * rank2 — GlobalSearch/SearchPalette 와 같은 임계감쇠 스프링
       * (OVERLAY_SPRING, 오버슈트 0). 진입은 opacity 0→1 +
       * translateY 8px→0 만 — scale 없음(hover:scale-* 혼동 방지). 캔버스
       * 2-param 물리 모델과는 별도 튜닝(app/globals.css `--overlay-spring-*`
       * 토큰 주석의 변환식 참조, "동일 스프링 상속" 아님).
       */}
      <motion.div
        ref={dialogRef}
        initial={{ y: 8, opacity: 0 }}
        animate={{ y: 0, opacity: 1 }}
        exit={{ y: 8, opacity: 0 }}
        transition={panelTransition}
        data-overlay-spring="true"
        role="dialog"
        aria-modal="true"
        aria-labelledby="new-doc-kind-dialog-title"
        className="w-full max-w-[360px] rounded-[var(--chrome-radius)] border border-[color:var(--color-border-soft)] bg-[color:var(--color-elevated)] p-4 shadow-[var(--chrome-shadow)]"
      >
        <p
          id="new-doc-kind-dialog-title"
          className="text-body-lg font-[650] text-[color:var(--color-text-primary)]"
        >
          {t("title")}
        </p>
        <p className="mt-1 text-label leading-4 text-[color:var(--color-text-tertiary)]">
          {t("subtitle")}
        </p>
        <ul className="mt-3 grid grid-cols-2 gap-2">
          {KIND_OPTIONS.map((kind) => (
            <li key={kind}>
              <button
                type="button"
                onClick={() => onSelect(kind)}
                className={controlClass({
                  shape: "card",
                  className:
                    "w-full text-left hover:border-[color:var(--color-border-strong)]",
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
          className={controlClass({
            shape: "link",
            tone: "muted",
            className: "mt-3 hover:text-[color:var(--color-text-secondary)]",
          })}
        >
          {t("cancel")}
        </button>
      </motion.div>
    </motion.div>
  );
}
