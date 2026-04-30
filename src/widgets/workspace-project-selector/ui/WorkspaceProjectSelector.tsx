"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { upsertWorkspaceProject } from "@/entities/workspace-project";
import { useToast } from "@/shared/ui";
import { useWorkspaceProjects } from "../model/use-workspace-projects";

export interface WorkspaceProjectSelectorProps {
  accountId: string | null | undefined;
  selectedId?: string | null;
  className?: string;
  /** 새 컨테이너 선택 시 콜백. 지정 안 하면 로컬 상태만 갱신. */
  onSelect?: (projectId: string) => void;
  /** dropdown open/close 변경 통지 — 부모가 다른 floating UI (Hub Rail 등) 와 겹침 방지에 사용. */
  onOpenChange?: (open: boolean) => void;
}

/**
 * P0-B Phase 6 (selector 확장) — 홈 상단 "프로젝트 컨테이너" 셀렉터.
 *
 * - 컨테이너 1개: read-only pill (예: "Project · General")
 * - 컨테이너 2+ 이거나 "새로 만들기" 허용: dropdown. 메뉴에 목록 + "+ 새
 *   컨테이너" 인라인 입력
 * - accountId 없으면 null. 에러·빈 projects 도 null.
 *
 * 접근성: aria-haspopup, aria-expanded. Esc 로 닫힘, outside click 도 닫힘.
 * 인라인 create 는 `upsertWorkspaceProject` 호출 — 실패 시 토스트로 안내.
 */
export function WorkspaceProjectSelector({
  accountId,
  selectedId = "general",
  className,
  onSelect,
  onOpenChange,
}: WorkspaceProjectSelectorProps) {
  const { projects, loading, error } = useWorkspaceProjects(accountId);
  const [open, setOpen] = useState(false);
  // open 변경 시 부모 통지. setState 콜백 안에서 직접 호출하면
  // "set state during render" 오류가 나므로 useEffect 로 분리.
  useEffect(() => {
    onOpenChange?.(open);
  }, [open, onOpenChange]);
  const [creating, setCreating] = useState(false);
  const [newName, setNewName] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const rootRef = useRef<HTMLDivElement | null>(null);
  const toast = useToast();

  // 트리거 pill 본체는 "eyebrow + 한글 컨테이너 이름" 두 종류 텍스트를
  // 함께 담는다. font-mono uppercase tracking 트리오를 wrapper 에 걸면
  // 한글 이름까지 letter-spacing 12-15% 가 적용돼 어색해진다. wrapper 는
  // 깨끗한 inline-flex 만 두고, mono/uppercase 는 영문 "Project / Workspace"
  // span 안에 한정해 적용.
  const baseClass =
    "inline-flex items-center gap-2 rounded-full border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-3 py-1 text-[12px] text-[color:var(--color-text-tertiary)]";
  const className_ = className ? `${baseClass} ${className}` : baseClass;

  useEffect(() => {
    if (!open) return;
    const handler = (event: MouseEvent) => {
      if (!rootRef.current) return;
      if (!rootRef.current.contains(event.target as Node)) {
        setOpen(false);
        setCreating(false);
      }
    };
    const keyHandler = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        setOpen(false);
        setCreating(false);
      }
    };
    window.addEventListener("mousedown", handler);
    window.addEventListener("keydown", keyHandler);
    return () => {
      window.removeEventListener("mousedown", handler);
      window.removeEventListener("keydown", keyHandler);
    };
  }, [open]);

  // selectedId 가 명시적으로 일치하는 컨테이너만 active. 매칭 없으면 null →
  // pill 라벨이 "Workspace 지도" 로 폴백 (zoom-out 상태 정직하게 표현).
  const active = useMemo(
    () => projects.find((project) => project.id === selectedId) ?? null,
    [projects, selectedId],
  );

  const handleCreate = useCallback(async () => {
    if (!accountId || !newName.trim() || submitting) return;
    const trimmed = newName.trim();
    const id = trimmed
      .toLowerCase()
      .replace(/[^\p{L}\p{N}]+/gu, "-")
      .replace(/^-+|-+$/g, "")
      .slice(0, 48) || `p-${Date.now().toString(36)}`;
    setSubmitting(true);
    try {
      await upsertWorkspaceProject(accountId, {
        id,
        accountId,
        name: trimmed,
        order: projects.length,
      });
      toast.show(`"${trimmed}" 컨테이너 생성됨`, "success");
      setNewName("");
      setCreating(false);
      setOpen(false);
      onSelect?.(id);
    } catch (err) {
      const message = err instanceof Error ? err.message : "알 수 없는 오류";
      toast.show(`생성 실패: ${message}`, "error");
    } finally {
      setSubmitting(false);
    }
  }, [accountId, newName, onSelect, projects.length, submitting, toast]);

  if (!accountId) return null;
  if (error) return null;

  if (loading) {
    return (
      <div className={className_} role="status" aria-live="polite">
        <span className="inline-block h-1.5 w-1.5 animate-pulse rounded-full bg-[color:rgba(139,151,255,0.8)]" />
        <span>Project …</span>
      </div>
    );
  }

  if (projects.length === 0) return null;

  return (
    <div ref={rootRef} className="relative inline-flex">
      <button
        type="button"
        onClick={() => setOpen((v) => !v)}
        className={`${className_} cursor-pointer transition-colors hover:border-[color:var(--color-border-strong)]`}
        data-testid="workspace-project-selector"
        data-project-id={active?.id ?? ""}
        aria-haspopup="menu"
        aria-expanded={open}
      >
        <span className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
          {active ? "Project" : "Workspace"}
        </span>
        <span className="break-keep text-[12px] font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
          {active ? active.name : "지도 (전체)"}
        </span>
        <ChevronDown size={11} className="text-[color:var(--color-text-quaternary)]" />
      </button>
      {open ? (
        <div
          role="menu"
          data-testid="workspace-project-selector-menu"
          className="absolute left-0 top-full z-40 mt-2 min-w-[220px] rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-1.5 py-1.5 shadow-[0_12px_28px_rgba(0,0,0,0.45)]"
        >
          <ul className="flex max-h-48 flex-col gap-0.5 overflow-y-auto [&::-webkit-scrollbar]:hidden [scrollbar-width:none]">
            {projects.map((project) => {
              const isActive = project.id === active?.id;
              return (
                <li key={project.id}>
                  <button
                    type="button"
                    role="menuitem"
                    onClick={() => {
                      onSelect?.(project.id);
                      setOpen(false);
                    }}
                    className={`flex w-full items-center justify-between gap-3 rounded-md px-2.5 py-1.5 text-left font-[var(--font-weight-signature)] text-[12px] transition-colors ${
                      isActive
                        ? "bg-[color:rgba(94,106,210,0.14)] text-[color:var(--color-text-primary)]"
                        : "text-[color:var(--color-text-secondary)] hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                    }`}
                  >
                    <span className="truncate">{project.name}</span>
                    {isActive ? (
                      <span className="font-mono text-[9px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                        active
                      </span>
                    ) : null}
                  </button>
                </li>
              );
            })}
          </ul>
          <div className="mt-1 border-t border-[color:var(--color-border-soft)] pt-1">
            {creating ? (
              <form
                onSubmit={(event) => {
                  event.preventDefault();
                  void handleCreate();
                }}
                className="flex items-center gap-1.5 px-1 py-1"
              >
                <input
                  autoFocus
                  type="text"
                  value={newName}
                  onChange={(event) => setNewName(event.target.value)}
                  placeholder="새 컨테이너 이름"
                  maxLength={48}
                  disabled={submitting}
                  className="flex-1 rounded-md border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] px-2 py-1 text-[12px] text-[color:var(--color-text-primary)] placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:rgba(94,106,210,0.46)] focus:outline-none"
                />
                <button
                  type="submit"
                  disabled={submitting || !newName.trim()}
                  className="break-keep rounded-md border border-[color:rgba(94,106,210,0.35)] bg-[color:rgba(94,106,210,0.12)] px-2.5 py-1 text-[12px] text-[color:rgba(139,151,255,0.95)] transition-colors hover:bg-[color:rgba(94,106,210,0.2)] disabled:opacity-40"
                >
                  {submitting ? "…" : "만들기"}
                </button>
              </form>
            ) : (
              <button
                type="button"
                role="menuitem"
                onClick={() => setCreating(true)}
                className="flex w-full items-center gap-2 break-keep rounded-md px-2.5 py-1.5 text-left text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:var(--color-text-primary)]"
                data-testid="workspace-project-selector-create"
              >
                <Plus size={12} />
                새 컨테이너
              </button>
            )}
          </div>
        </div>
      ) : null}
    </div>
  );
}
