"use client";

import {
  type KeyboardEvent,
  type ReactNode,
  useEffect,
  useRef,
  useState,
} from "react";
import { cn } from "@/shared/lib/cn";

interface Props {
  /** 현재 값 (display + edit 모드 초기값). */
  value: string;
  /** 편집 가능 여부. false 면 클릭해도 편집 모드 진입 안 함. */
  editable: boolean;
  /** 편집 완료(Enter·blur) 시 호출. 값이 동일하면 호출 안 됨. */
  onSave: (next: string) => void | Promise<void>;
  /**
   * 렌더 태그. 편집 모드에선 input/textarea 로 전환되지만, view 모드의
   * 레이아웃을 유지하기 위해 같은 블록 레벨을 선택할 수 있다.
   */
  as?: "h1" | "h2" | "h3" | "p" | "span" | "div";
  /** true 면 textarea, false 면 input. */
  multiline?: boolean;
  className?: string;
  /** 값이 비어 있을 때 view 모드에 표시할 placeholder 텍스트. */
  placeholder?: string;
  /** 비어 있는 값 저장 허용 여부. false (기본) 면 빈 값 제출 시 취소 처리. */
  allowEmpty?: boolean;
  /** 접근성 라벨 (스크린리더). */
  ariaLabel?: string;
  /** E2E 식별자. view·edit 양쪽 element 에 그대로 부여. */
  dataTestId?: string;
}

/**
 * 클릭 → 인라인 편집 → Enter·blur 저장 · Esc 취소 의 얇은 컴포넌트.
 *
 * Notion / Obsidian 식 "내가 주인인 공간은 즉시 편집" UX 를 위한 기본 블록.
 * owner 가 자기 프로젝트 상세 페이지를 보면 h1·description 을 바로 고칠
 * 수 있도록 사용한다.
 *
 * 저장 실패 처리는 호출부(onSave) 책임 — 이 컴포넌트는 throw 를 그대로
 * 흘려보내지 않고 삼킨 뒤 view 모드로 복귀한다.
 */
export function InlineEditable({
  value,
  editable,
  onSave,
  as = "span",
  multiline = false,
  className,
  placeholder = "클릭해서 입력",
  allowEmpty = false,
  ariaLabel,
  dataTestId,
}: Props) {
  const [editing, setEditing] = useState(false);
  const [draft, setDraft] = useState(value);
  const [saving, setSaving] = useState(false);
  const inputRef = useRef<HTMLInputElement | null>(null);
  const textareaRef = useRef<HTMLTextAreaElement | null>(null);

  // 외부에서 value 가 바뀌면 (실시간 구독 등) 편집 중이 아닌 경우에만 동기화.
  useEffect(() => {
    if (!editing) queueMicrotask(() => setDraft(value));
  }, [value, editing]);

  useEffect(() => {
    if (!editing) return;
    const el = multiline ? textareaRef.current : inputRef.current;
    el?.focus();
    // select 는 input 에서만 동작하도록.
    if (el && "select" in el && typeof el.select === "function") {
      el.select();
    }
  }, [editing, multiline]);

  const enterEdit = () => {
    if (!editable || saving) return;
    setDraft(value);
    setEditing(true);
  };

  const cancel = () => {
    setDraft(value);
    setEditing(false);
  };

  const commit = async () => {
    const next = draft.trim();
    if (next === value) {
      setEditing(false);
      return;
    }
    if (!next && !allowEmpty) {
      cancel();
      return;
    }
    setSaving(true);
    try {
      await onSave(next);
    } catch {
      // 호출부가 토스트 등으로 안내. 이곳은 view 복귀만.
    } finally {
      setSaving(false);
      setEditing(false);
    }
  };

  const handleKeyDownEdit = (e: KeyboardEvent<HTMLInputElement | HTMLTextAreaElement>) => {
    if (e.key === "Escape") {
      e.preventDefault();
      cancel();
      return;
    }
    // single-line 은 Enter 로 바로 커밋. multiline 은 Cmd/Ctrl+Enter.
    if (e.key === "Enter") {
      if (multiline && !(e.metaKey || e.ctrlKey)) return;
      e.preventDefault();
      void commit();
    }
  };

  const handleKeyDownView = (e: KeyboardEvent<HTMLElement>) => {
    if (!editable) return;
    if (e.key === "Enter" || e.key === " ") {
      e.preventDefault();
      enterEdit();
    }
  };

  if (!editable) {
    return renderView({
      as,
      content: value || placeholder,
      isEmpty: !value,
      className,
      interactive: false,
      onClick: undefined,
      onKeyDown: undefined,
      ariaLabel,
      dataTestId,
    });
  }

  if (editing) {
    const sharedProps = {
      value: draft,
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) =>
        setDraft(e.target.value),
      onBlur: () => void commit(),
      onKeyDown: handleKeyDownEdit,
      "aria-label": ariaLabel,
      "data-testid": dataTestId,
      className: cn(
        "w-full rounded-md border border-[color:rgba(139,151,255,0.35)] bg-[color:var(--color-elevated)] px-2 py-1 outline-none transition-colors focus:border-[color:rgba(139,151,255,0.6)]",
        className,
      ),
    };
    if (multiline) {
      return (
        <textarea
          ref={textareaRef}
          rows={3}
          {...sharedProps}
          className={cn(sharedProps.className, "resize-y leading-7")}
        />
      );
    }
    return <input ref={inputRef} {...sharedProps} />;
  }

  return renderView({
    as,
    content: value || placeholder,
    isEmpty: !value,
    className: cn(
      "cursor-text rounded-md transition-colors hover:bg-[color:var(--color-overlay-1)] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-[color:rgba(139,151,255,0.35)]",
      className,
    ),
    interactive: true,
    onClick: enterEdit,
    onKeyDown: handleKeyDownView,
    ariaLabel,
    dataTestId,
  });
}

function renderView({
  as,
  content,
  isEmpty,
  className,
  interactive,
  onClick,
  onKeyDown,
  dataTestId,
}: {
  as: NonNullable<Props["as"]>;
  content: ReactNode;
  isEmpty: boolean;
  className?: string;
  interactive: boolean;
  onClick?: () => void;
  onKeyDown?: (e: KeyboardEvent<HTMLElement>) => void;
  ariaLabel?: string;
  dataTestId?: string;
}) {
  const commonProps = {
    className,
    "data-testid": dataTestId,
    ...(interactive
      ? {
          role: "button" as const,
          tabIndex: 0,
          onClick,
          onKeyDown,
          title: "클릭해서 편집",
        }
      : {}),
  };
  const rendered = isEmpty ? (
    <span className="text-[color:var(--color-text-quaternary)]">{content}</span>
  ) : (
    content
  );
  switch (as) {
    case "h1":
      return <h1 {...commonProps}>{rendered}</h1>;
    case "h2":
      return <h2 {...commonProps}>{rendered}</h2>;
    case "h3":
      return <h3 {...commonProps}>{rendered}</h3>;
    case "p":
      return <p {...commonProps}>{rendered}</p>;
    case "div":
      return <div {...commonProps}>{rendered}</div>;
    case "span":
    default:
      return <span {...commonProps}>{rendered}</span>;
  }
}
