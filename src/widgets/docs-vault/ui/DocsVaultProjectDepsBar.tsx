'use client';

import { useMemo, useState } from 'react';
import { ChevronDown, Plus, X } from 'lucide-react';
import type { FolderTopologyBuild } from '@/entities/docs-vault';

interface Props {
  /** 현재 편집 중인 프로젝트 slug (folder-topology 범위 안, projects/ 접두사 제외). */
  currentSlug: string;
  /** folder-topology build — project 목록 참조. 없으면 패널 자체 숨김. */
  build: FolderTopologyBuild | null;
  canEdit: boolean;
  /** dependencies 배열 업데이트. frontmatter 에 쓰는 책임은 호출자. */
  onChange: (next: string[]) => Promise<void> | void;
  /** 같은 프로젝트 다른 슬러그로 이동할 때 사용. */
  onNavigateProject: (slug: string) => void;
}

/**
 * Folder-Topology 프로젝트 문서 열렸을 때 meta bar 아래에 뜨는 의존 관계
 * 에디터. 현재 dependencies 를 칩 리스트로, × 로 제거, + 로 드롭다운
 * 에서 다른 프로젝트 선택해 추가.
 *
 * - canEdit 이 false 면 읽기 전용 (× / + 숨김)
 * - 드롭다운은 자기 자신 + 이미 의존 중인 것 제외
 * - 순환 의존 감지 — B 가 A 에 의존하면 A 가 B 를 의존 추가할 때 경고
 */
export function DocsVaultProjectDepsBar({
  currentSlug,
  build,
  canEdit,
  onChange,
  onNavigateProject,
}: Props) {
  const [open, setOpen] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const current = useMemo(
    () => build?.projects.find((p) => p.slug === currentSlug) ?? null,
    [build, currentSlug],
  );

  const dependencies = useMemo(
    () => current?.dependencies ?? [],
    [current],
  );
  const addable = useMemo(() => {
    if (!build) return [];
    return build.projects
      .filter((p) => p.slug !== currentSlug)
      .filter((p) => !dependencies.includes(p.slug));
  }, [build, currentSlug, dependencies]);

  if (!build) return null;
  if (!current)
    return (
      <div className="mx-auto max-w-[760px] border-b border-[color:var(--color-overlay-2)] px-6 py-3 text-[11px] text-[color:var(--color-text-quaternary)] md:px-10">
        이 문서는 Folder-Topology 에 등록되지 않았어요 — projects/ 디렉터리로
        옮기고 frontmatter 에 `name` · `category` 를 채우면 토폴로지에
        노드로 등장합니다.
      </div>
    );

  const handleRemove = async (dep: string) => {
    const next = dependencies.filter((d) => d !== dep);
    setError(null);
    try {
      await onChange(next);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };
  const handleAdd = async (dep: string) => {
    // 순환 감지 — dep 이 currentSlug 를 (간접이든 직접이든) 의존하는지
    if (build && hasCircularDep(build, dep, currentSlug)) {
      const ok = window.confirm(
        `경고: ${dep} 가 이미 ${currentSlug} 를 의존하고 있습니다.\n` +
          `의존을 추가하면 순환이 생깁니다. 계속할까요?`,
      );
      if (!ok) return;
    }
    setError(null);
    try {
      await onChange([...dependencies, dep]);
      setOpen(false);
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e));
    }
  };

  return (
    <div className="mx-auto flex max-w-[760px] flex-wrap items-center gap-2 border-b border-[color:var(--color-overlay-2)] px-6 py-2 text-[11.5px] md:px-10">
      <span className="font-mono text-[9.5px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
        의존 · {dependencies.length}
      </span>
      {dependencies.length === 0 ? (
        <span className="text-[color:var(--color-text-quaternary)]">없음</span>
      ) : (
        <ul className="flex flex-wrap gap-1">
          {dependencies.map((dep) => {
            const depProject = build.projects.find((p) => p.slug === dep);
            const missing = !depProject;
            return (
              <li key={dep}>
                <span
                  className={`inline-flex items-center gap-1 rounded-sm border px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] ${
                    missing
                      ? 'border-dashed border-[color:var(--color-border-strong)] bg-[color:var(--color-overlay-1)] text-[color:var(--color-text-quaternary)]'
                      : 'border-[color:var(--color-overlay-3)] text-[color:var(--color-text-tertiary)]'
                  }`}
                >
                  <button
                    type="button"
                    onClick={() => onNavigateProject(dep)}
                    className="transition-colors hover:text-[color:var(--color-text-primary)]"
                    title={missing ? '볼트에 없는 의존' : dep}
                  >
                    {dep}
                  </button>
                  {canEdit ? (
                    <button
                      type="button"
                      onClick={() => void handleRemove(dep)}
                      aria-label={`${dep} 의존 제거`}
                      className="rounded-sm p-0.5 text-[color:var(--color-text-quaternary)] transition-colors hover:bg-[color:var(--color-overlay-2)] hover:text-[color:rgba(240,180,180,0.95)]"
                    >
                      <X size={10} aria-hidden />
                    </button>
                  ) : null}
                </span>
              </li>
            );
          })}
        </ul>
      )}
      {canEdit ? (
        <div className="relative">
          <button
            type="button"
            onClick={() => {
              setOpen((v) => !v);
              setError(null);
            }}
            disabled={addable.length === 0}
            className="inline-flex items-center gap-1 rounded-sm border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.08)] px-1.5 py-0.5 font-mono text-[10px] uppercase tracking-[0.1em] text-[color:rgba(200,210,255,0.92)] transition-colors hover:border-[color:rgba(139,151,255,0.55)] disabled:cursor-not-allowed disabled:opacity-40"
            title={addable.length === 0 ? '추가할 수 있는 프로젝트 없음' : '의존 추가'}
          >
            <Plus size={10} aria-hidden />
            추가
            <ChevronDown size={10} aria-hidden />
          </button>
          {open ? (
            <div className="absolute left-0 top-full z-20 mt-1 max-h-[280px] w-[240px] overflow-auto rounded-md border border-[color:var(--color-divider)] bg-[color:rgba(12,14,20,0.98)] shadow-[0_10px_30px_rgba(0,0,0,0.45)]">
              <ul className="py-1">
                {addable.map((p) => (
                  <li key={p.slug}>
                    <button
                      type="button"
                      onClick={() => void handleAdd(p.slug)}
                      className="flex w-full items-center gap-2 px-2 py-1 text-left transition-colors hover:bg-[color:var(--color-overlay-1)]"
                    >
                      <span className="flex-1 truncate text-[12px] text-[color:var(--color-text-primary)]">
                        {p.name}
                      </span>
                      <span className="truncate font-mono text-[9.5px] uppercase tracking-[0.1em] text-[color:var(--color-text-quaternary)]">
                        {p.slug}
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </div>
          ) : null}
        </div>
      ) : null}
      {error ? (
        <span className="font-mono text-[10px] text-[color:rgba(220,150,150,0.9)]">
          {error}
        </span>
      ) : null}
    </div>
  );
}

/**
 * candidate 의 의존 체인 안에 target 이 있으면 순환. BFS 로 탐색, 깊이
 * 제한 없음 (프로젝트 수 많지 않음).
 */
function hasCircularDep(
  build: FolderTopologyBuild,
  candidate: string,
  target: string,
): boolean {
  const bySlug = new Map(build.projects.map((p) => [p.slug, p]));
  const visited = new Set<string>();
  const queue = [candidate];
  while (queue.length > 0) {
    const cur = queue.shift()!;
    if (cur === target) return true;
    if (visited.has(cur)) continue;
    visited.add(cur);
    const p = bySlug.get(cur);
    if (!p) continue;
    for (const dep of p.dependencies) queue.push(dep);
  }
  return false;
}
