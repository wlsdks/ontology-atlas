"use client";

import { useEffect, useRef, useState } from "react";
import { FileText, X } from "lucide-react";
import { ICON_SIZE } from "@/shared/ui/icon-size";
import type { CreateNodeKind } from "../lib/build-create-node";
import type { StudioWriteTarget } from "../lib/resolve-write-target";
import { Dialog, controlClass } from "@/shared/ui";
import { useRovingRadioGroup } from "@/shared/lib/use-roving-radio-group";

/**
 * "이 개념은 아직 문서가 없어요" — 문서를 만들어도 되는지 묻는 동의 표면.
 *
 * 왜 이 화면이 존재하는가 — 다른 문서의 관계 키에서 이름만 불린 개념은 자기
 * `.md` 가 없다. 그런 개념에 관계를 이으려면 그 개념의 문서를 만드는 수밖에
 * 없고(관계는 개념에 속하니까), 사용자 디스크에 파일을 만드는 일은 사용자가
 * 요청한 적 없는 일이라 **명시적 동의 없이는 하지 않는다**. 그래서 저장 순간에
 * 딱 한 번, 만들 파일 경로까지 밝히고 묻는다.
 *
 * 모달 골격(스크림 · 트랩 · Esc · 복귀 · 스프링)은 `Dialog` 가 소유한다
 * (2026-08-15 체계석 비준의 첫 소비자 — 종전 440px/elevated/border-strong 은
 * 비준된 420/panel/divider 로 수렴했다). 초점만 이 컴포넌트가 준다:
 * 주 행동(confirm)이 기본 초점이라 `initialFocus="none"` + 자체 effect.
 */

export interface StudioMaterializeLabels {
  title: string;
  /** 왜 문서가 없는지 — 개념 이름을 넣은 한 문장. */
  reason: string;
  /** 무엇을 할 것인지 — 쓰기 가능 / 읽기 전용에 따라 다르다. */
  action: string;
  fileLabel: string;
  kindLabel: string;
  kindPrompt: string;
  scopeNote: string;
  confirm: string;
  cancel: string;
  closeAria: string;
  kindOptionLabel: (kind: CreateNodeKind) => string;
}

const KIND_CHOICES: CreateNodeKind[] = ["domain", "capability", "element"];

const FOCUS_RING =
  "focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:var(--color-indigo-a46)] focus-visible:ring-inset";

export function StudioMaterializeDialog({
  target,
  labels,
  onConfirm,
  onCancel,
}: {
  target: Extract<StudioWriteTarget, { status: "missing" }>;
  labels: StudioMaterializeLabels;
  onConfirm: (kind: CreateNodeKind) => void;
  onCancel: () => void;
}) {
  // 종류를 못 정한 개념(예: 이름만 적힌 `relates:` 항목)은 우리가 지어내지
  // 않는다 — 사용자가 고른다. 아는 경우엔 묻지 않는다.
  const [kind, setKind] = useState<CreateNodeKind>(target.kind ?? "element");

  /*
   * kind 칩 — **배타 단일선택**이다(초기값이 항상 있어 하나가 참이고, 재클릭으로
   * 해제되지 않는다). 종전엔 형제에 `aria-pressed` 를 나란히 걸어 배타성이
   * 접근성 트리에 안 실렸다.
   *
   * ⚠️ 그릇은 자리에 남는다 — 이 칩들은 값 층이 안 내는 것 셋을 진다(`flex-1`
   * 균등폭 · `tracking-body` · 비활성 hover). 특히 hover 는 값 층에 칩 hover 가
   * 아예 없어서 생긴 것이고(전수 312곳/칩 88), 이주하면 그 피드백이 사라진다.
   */
  const kindGroup = useRovingRadioGroup<CreateNodeKind>({
    value: kind,
    values: KIND_CHOICES,
    onChange: setKind,
  });
  const confirmRef = useRef<HTMLButtonElement>(null);

  useEffect(() => {
    // 첫 focusable 은 닫기 X 다 — 이 동의 화면의 기본 초점은 주 행동(confirm).
    confirmRef.current?.focus({ preventScroll: true });
  }, []);

  return (
    <Dialog
      open
      onClose={onCancel}
      aria-label={labels.title}
      initialFocus="none"
      testId="studio-materialize-dialog"
      className="flex flex-col overflow-hidden p-0"
    >
      <div className="flex items-center gap-2 border-b border-[color:var(--color-divider)] px-5 py-3">
        <span className="min-w-0 flex-1 text-body-lg tracking-body-lg font-[var(--font-weight-emphasis)] text-[color:var(--color-text-primary)] [word-break:keep-all]">
          {labels.title}
        </span>
        <button
          type="button"
          data-testid="studio-materialize-close"
          aria-label={labels.closeAria}
          onClick={onCancel}
          className={`-my-1 -mr-2 flex h-[var(--overlay-close-size)] w-[var(--overlay-close-size)] flex-none items-center justify-center rounded-chip text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-secondary)] ${FOCUS_RING}`}
        >
          <X size={ICON_SIZE.md} aria-hidden />
        </button>
      </div>

      <div className="flex flex-col gap-3 px-5 py-4">
        <p className="text-body tracking-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {labels.reason}
        </p>
        <p className="text-body tracking-body leading-body text-[color:var(--color-text-secondary)] [word-break:keep-all]">
          {labels.action}
        </p>

        {/* "무엇이 만들어지는가" 한 묶음 — 경로와 종류는 같은 사실이라
            그룹 안 간격(8px)을 그룹 사이 간격(12px)보다 좁게 둔다. */}
        <div className="flex flex-col gap-2">
          {/* 표면이 elevated→panel 로 수렴하면서 인셋 상자의 채움은 panel 동색이
              아니라 표준 인셋 wash(--color-overlay-1)로 — AgentConnectSheet 의
              인셋 문법과 같다. */}
          <div className="flex items-center gap-2 rounded-card border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2.5">
            <FileText size={ICON_SIZE.md} aria-hidden className="flex-none text-[color:var(--color-text-tertiary)]" />
            <span className="flex-none text-label tracking-label text-[color:var(--color-text-tertiary)]">
              {labels.fileLabel}
            </span>
            <span
              data-testid="studio-materialize-path"
              className="min-w-0 flex-1 truncate text-body tracking-body text-[color:var(--color-text-primary)]"
              title={`${target.slug}.md`}
            >
              {target.slug}.md
            </span>
          </div>

          {target.kind === null ? (
            <div className="flex flex-col gap-1.5">
              <span className="text-label tracking-label text-[color:var(--color-text-tertiary)]">
                {labels.kindPrompt}
              </span>
              <div {...kindGroup.groupProps} aria-label={labels.kindLabel} className="flex gap-1.5">
                {KIND_CHOICES.map((option, index) => {
                  const on = option === kind;
                  return (
                    <button
                      key={option}
                      {...kindGroup.itemProps(index)}
                      type="button"
                      data-testid={`studio-materialize-kind-${option}`}
                      className={controlClass({
                        shape: "chip",
                        size: "lg",
                        active: on,
                        className: `flex-1 justify-center tracking-body hover:border-[color:var(--color-border-strong)] hover:text-[color:var(--color-text-secondary)] ${FOCUS_RING}`,
                      })}
                    >
                      {labels.kindOptionLabel(option)}
                    </button>
                  );
                })}
              </div>
            </div>
          ) : (
            <p className="text-label tracking-label text-[color:var(--color-text-tertiary)]">
              {labels.kindLabel} · {labels.kindOptionLabel(target.kind)}
            </p>
          )}
        </div>

        <p className="text-label tracking-label leading-label text-[color:var(--color-text-tertiary)] [word-break:keep-all]">
          {labels.scopeNote}
        </p>
      </div>

      <div className="flex justify-end gap-2 border-t border-[color:var(--color-divider)] px-5 py-3">
        <button
          type="button"
          data-testid="studio-materialize-cancel"
          onClick={onCancel}
          className={controlClass({
            shape: "chip",
            size: "lg",
            className: `tracking-body hover:border-[color:var(--color-border-strong)] ${FOCUS_RING}`,
          })}
        >
          {labels.cancel}
        </button>
        <button
          type="button"
          ref={confirmRef}
          data-testid="studio-materialize-confirm"
          onClick={() => onConfirm(kind)}
          className={controlClass({
            shape: "chip",
            size: "lg",
            tone: "onAccent",
            className: `tracking-body hover:bg-[color:var(--color-indigo-brand-hover)] ${FOCUS_RING}`,
          })}
        >
          {labels.confirm}
        </button>
      </div>
    </Dialog>
  );
}
