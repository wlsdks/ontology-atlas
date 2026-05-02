"use client";

import {
  useCallback,
  useEffect,
  useMemo,
  useState,
  type MouseEvent,
} from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { ArrowLeft, Plus, SquareArrowOutUpRight, Trash2 } from "lucide-react";
import { PermissionGate } from "@/features/permissions";
import type { Category } from "@/entities/category";
import {
  deleteCategory,
  subscribeCategories,
  upsertCategory,
} from "@/entities/category/api";
import { projectToInput, type Project } from "@/entities/project";
import {
  subscribeProjects,
  upsertProject,
  upsertProjectPositions,
} from "@/entities/project/api";
import { findProjectPlacement } from "@/features/project-edit/model";
import { computeInitialLayout } from "@/features/topology-layout";
import { Button } from "@/shared/ui";
import { OperationsNav } from "@/widgets/operations-nav";
import { cn } from "@/shared/lib/cn";
import { CategoryCanvasEditor } from "./CategoryCanvasEditor";
import {
  BORDER_STYLE_OPTIONS,
  applyDraftToCategories,
  createEmptyDraft,
  getNextOrder,
  toDraft,
  toInput,
  validateDraft,
  type CategoryDraft,
} from "./category-draft";

const DEFAULT_RETURN_TO = "/settings/";

function normalizeReturnTo(returnTo?: string): string {
  if (!returnTo) return DEFAULT_RETURN_TO;
  if (!returnTo.startsWith("/projects") && !returnTo.startsWith("/settings/")) {
    return DEFAULT_RETURN_TO;
  }
  return returnTo;
}

function buildCategoriesHref(
  selectedId: string | null,
  returnTo: string,
  accountId: string | null,
): string {
  const params = new URLSearchParams();

  if (accountId) {
    params.set("account", accountId);
  }
  if (selectedId) {
    params.set("selected", selectedId);
  }
  if (returnTo !== DEFAULT_RETURN_TO) {
    params.set("returnTo", returnTo);
  }

  const query = params.toString();
  return query ? `/settings/categories/?${query}` : "/settings/categories/";
}

function buildCategoryMap(categories: Category[]) {
  return new Map(categories.map((category) => [category.id, category]));
}

function areDraftsEqual(a: CategoryDraft, b: CategoryDraft) {
  return JSON.stringify(a) === JSON.stringify(b);
}

function buildReflowUpdates(
  projects: Project[],
  categories: Category[],
  mode: "selected" | "all",
  selectedId: string | null,
) {
  const categoryMap = buildCategoryMap(categories);
  const layout = computeInitialLayout(projects, categoryMap);
  const targets =
    mode === "all"
      ? projects
      : projects.filter((project) => project.category === selectedId);

  return targets
    .map((project) => {
      const position = layout.get(project.slug);
      if (!position) return null;
      return {
        slug: project.slug,
        position,
      };
    })
    .filter(
      (value): value is { slug: string; position: { x: number; y: number } } =>
        value !== null,
    );
}

function CategoriesContent() {
  const searchParams = useSearchParams();
  const initialSelectedId = searchParams.get("selected");
  const accountId = null;
  const safeReturnTo = normalizeReturnTo(
    searchParams.get("returnTo") ?? undefined,
  );
  const [categories, setCategories] = useState<Category[]>([]);
  const [projects, setProjects] = useState<Project[]>([]);
  const [selectedId, setSelectedId] = useState<string | null>(
    initialSelectedId,
  );
  const [draft, setDraft] = useState<CategoryDraft>(createEmptyDraft(0, []));
  const [saving, setSaving] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [replacementCategoryId, setReplacementCategoryId] = useState("");
  // 사용자가 실제로 입력하기 전까지는 isDirty 가 race 로 true 가 잠깐 떠도
  // beforeunload / 이탈 confirm 다이얼로그를 띄우지 않는다. categories 가
  // async 로 로드되면서 draftBaseline 만 먼저 갱신돼 draft 와 잠시 어긋나는
  // 구간 때문에 변경 안 했는데도 "저장 안 됨" 다이얼로그가 뜨던 문제 차단.
  const [userTouched, setUserTouched] = useState(false);
  // 사용자 입력으로 draft 를 갱신할 때만 호출. 프로그램틱 sync(useEffect 의
  // setDraft 등) 는 그대로 setDraft 사용해 userTouched 를 건드리지 않는다.
  const markDraft = useCallback(
    (updater: (current: CategoryDraft) => CategoryDraft) => {
      setUserTouched(true);
      setDraft(updater);
    },
    [],
  );

  useEffect(() => {
    const unsubCategories = subscribeCategories((list) => {
      setCategories(list);
      setSelectedId((current) => {
        if (current === null) return current;
        return list.some((category) => category.id === current)
          ? current
          : null;
      });
    });
    const unsubProjects = subscribeProjects((list) => setProjects(list));
    return () => {
      unsubCategories();
      unsubProjects();
    };
  }, []);

  useEffect(() => {
    if (selectedId === null) {
      queueMicrotask(() => {
        setDraft((current) => {
          if (current.id.trim() || current.label.trim()) {
            return current;
          }

          const nextOrder = getNextOrder(categories);
          return current.order === String(nextOrder)
            ? current
            : createEmptyDraft(nextOrder, categories);
        });
      });
      return;
    }
    const selected = categories.find((category) => category.id === selectedId);
    if (selected) {
      queueMicrotask(() => setDraft(toDraft(selected)));
    }
  }, [selectedId, categories]);

  const projectCountByCategory = useMemo(() => {
    const counts = new Map<string, number>();
    for (const project of projects) {
      counts.set(project.category, (counts.get(project.category) ?? 0) + 1);
    }
    return counts;
  }, [projects]);

  const handleNew = () => {
    if (!confirmDiscardChanges()) return;
    setSelectedId(null);
    setDraft(createEmptyDraft(getNextOrder(categories), categories));
    setError(null);
    setMessage(null);
  };

  const handleSave = async (reflowMode?: "selected" | "all") => {
    setError(null);
    setMessage(null);
    const validationError = validateDraft(draft, selectedId, categories);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    try {
      const input = toInput(draft);
      await upsertCategory(input);
      setSelectedId(input.id);
      const nextCategories = applyDraftToCategories(
        categories,
        selectedId,
        draft,
      );
      if (reflowMode) {
        const updates = buildReflowUpdates(
          projects,
          nextCategories,
          reflowMode,
          selectedId ?? input.id,
        );
        await upsertProjectPositions(updates);
        setMessage(
          reflowMode === "all"
            ? "카테고리를 저장하고 전체 프로젝트를 재배치했습니다."
            : "카테고리를 저장하고 이 영역의 프로젝트를 재배치했습니다.",
        );
      } else {
        setMessage(
          selectedId ? "카테고리를 저장했습니다." : "카테고리를 생성했습니다.",
        );
      }
    } catch (err) {
      setError(err instanceof Error ? err.message : "저장 실패");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!selectedId) return;
    const refCount = projectCountByCategory.get(selectedId) ?? 0;
    if (refCount > 0) {
      setError(`이 카테고리를 참조 중인 프로젝트가 ${refCount}개 있습니다.`);
      return;
    }

    setSaving(true);
    setError(null);
    setMessage(null);
    try {
      await deleteCategory(selectedId);
      setSelectedId(null);
      setDraft(
        createEmptyDraft(
          getNextOrder(
            categories.filter((category) => category.id !== selectedId),
          ),
          categories.filter((category) => category.id !== selectedId),
        ),
      );
      setMessage("카테고리를 삭제했습니다.");
    } catch (err) {
      setError(err instanceof Error ? err.message : "삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  const selectedReferenceCount = selectedId
    ? (projectCountByCategory.get(selectedId) ?? 0)
    : 0;
  const replacementCategories = useMemo(
    () => categories.filter((category) => category.id !== selectedId),
    [categories, selectedId],
  );
  const selectedProjects = useMemo(
    () =>
      selectedId
        ? projects
            .filter((project) => project.category === selectedId)
            .sort((a, b) => a.name.localeCompare(b.name))
        : [],
    [projects, selectedId],
  );

  useEffect(() => {
    queueMicrotask(() => {
      setReplacementCategoryId((current) => {
        if (
          current &&
          current !== selectedId &&
          replacementCategories.some((category) => category.id === current)
        ) {
          return current;
        }

        return replacementCategories[0]?.id ?? "";
      });
    });
  }, [replacementCategories, selectedId]);

  const categoriesHref = useMemo(
    () => buildCategoriesHref(selectedId, safeReturnTo, accountId),
    [accountId, safeReturnTo, selectedId],
  );
  const draftBaseline = useMemo(() => {
    if (selectedId) {
      const selected = categories.find((category) => category.id === selectedId);
      return selected ? toDraft(selected) : createEmptyDraft(0, categories);
    }

    return createEmptyDraft(getNextOrder(categories), categories);
  }, [categories, selectedId]);
  const isDirty = useMemo(
    () => userTouched && !areDraftsEqual(draft, draftBaseline),
    [userTouched, draft, draftBaseline],
  );
  const confirmDiscardChanges = useCallback(() => {
    if (!isDirty) return true;
    return window.confirm("저장하지 않은 변경사항이 있습니다. 정말 나갈까요?");
  }, [isDirty]);

  useEffect(() => {
    if (typeof window === "undefined") return;
    window.history.replaceState({}, "", categoriesHref);
  }, [categoriesHref]);

  useEffect(() => {
    if (!isDirty) return;

    const handleBeforeUnload = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };

    window.addEventListener("beforeunload", handleBeforeUnload);
    return () => window.removeEventListener("beforeunload", handleBeforeUnload);
  }, [isDirty]);

  const handleNavigateWithGuard = (
    event: MouseEvent<HTMLAnchorElement>,
    href: string,
  ) => {
    if (!confirmDiscardChanges()) {
      event.preventDefault();
      return;
    }

    event.preventDefault();
    window.location.assign(href);
  };

  const handleSelectCategory = (id: string) => {
    if (id === selectedId) return;
    if (!confirmDiscardChanges()) return;

    const nextCategory = categories.find((category) => category.id === id);
    setSelectedId(id);
    if (nextCategory) {
      setDraft(toDraft(nextCategory));
    }
    setError(null);
    setMessage(null);
  };

  const handleReassignAndDelete = async () => {
    if (!selectedId) return;
    if (selectedProjects.length === 0) {
      await handleDelete();
      return;
    }
    if (!replacementCategoryId || replacementCategoryId === selectedId) {
      setError("프로젝트를 옮길 대상 카테고리를 선택하세요.");
      return;
    }

    const targetCategory = categories.find(
      (category) => category.id === replacementCategoryId,
    );
    if (!targetCategory) {
      setError("대상 카테고리를 찾지 못했습니다.");
      return;
    }

    const remainingCategories = categories.filter(
      (category) => category.id !== selectedId,
    );
    const replacementLabel =
      targetCategory.label || replacementCategoryId;

    setSaving(true);
    setError(null);
    setMessage(null);

    try {
      let nextProjects = [...projects];
      for (const project of selectedProjects) {
        const position = findProjectPlacement(
          targetCategory,
          nextProjects.filter((candidate) => candidate.slug !== project.slug),
        );
        const updatedProject: Project = {
          ...project,
          category: replacementCategoryId,
          position,
        };

        await upsertProject(projectToInput(updatedProject));
        nextProjects = nextProjects.map((candidate) =>
          candidate.slug === project.slug ? updatedProject : candidate,
        );
      }

      await deleteCategory(selectedId);
      setSelectedId(null);
      setDraft(createEmptyDraft(getNextOrder(remainingCategories), remainingCategories));
      setMessage(
        `프로젝트 ${selectedProjects.length}개를 ${replacementLabel} 카테고리로 옮기고 카테고리를 삭제했습니다.`,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "재할당 삭제 실패");
    } finally {
      setSaving(false);
    }
  };

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <h1 className="sr-only">카테고리 관리</h1>
      <OperationsNav />
      <div className="mx-auto max-w-6xl px-5 py-6 md:px-12 md:py-10">
        <Link
          href={safeReturnTo}
          data-testid="category-back-link"
          onClick={(event) => handleNavigateWithGuard(event, safeReturnTo)}
          className="inline-flex items-center gap-1.5 break-keep text-[12px] text-[color:var(--color-text-tertiary)] transition-colors hover:text-[color:var(--color-text-primary)]"
        >
          <ArrowLeft size={14} />
          정리
        </Link>

        <header className="mt-8 flex flex-col gap-4 md:flex-row md:items-end md:justify-between">
          <div>
            <h1 className="break-keep text-[28px] font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-3xl">
              카테고리 관리
            </h1>
            <p className="mt-2 break-keep text-sm text-[color:var(--color-text-tertiary)]">
              토폴로지 클러스터의 라벨, 배치, 크기, 보더 스타일을 관리합니다.
            </p>
          </div>
          <div className="flex flex-wrap items-center gap-2">
            <Button
              data-testid="category-reflow-all"
              type="button"
              size="sm"
              variant="ghost"
              onClick={() => void handleSave("all")}
              disabled={saving}
            >
              전체 프로젝트 재배치
            </Button>
            <Button
              data-testid="category-new"
              type="button"
              size="sm"
              onClick={handleNew}
            >
              <Plus size={14} className="mr-1" />새 카테고리
            </Button>
          </div>
        </header>

        <div className="mt-8 grid gap-6 lg:grid-cols-[320px_minmax(0,1fr)]">
          <section className="rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-3">
            <div className="mb-3 flex items-center justify-between px-2">
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                Categories
              </span>
              <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                {categories.length}
              </span>
            </div>
            <div className="flex flex-col gap-2">
              {categories.map((category) => {
                const selected = category.id === selectedId;
                const refCount = projectCountByCategory.get(category.id) ?? 0;
                return (
                  <button
                    key={category.id}
                    data-testid={`category-item-${category.id}`}
                    type="button"
                    onClick={() => handleSelectCategory(category.id)}
                    className={cn(
                      "rounded-lg border px-3 py-3 text-left transition-colors",
                      selected
                        ? "border-[color:var(--color-indigo-brand)] bg-[color:rgba(94,106,210,0.12)]"
                        : "border-[color:var(--color-overlay-2)] hover:border-[color:var(--color-border-strong)]",
                    )}
                  >
                    <div className="flex items-start justify-between gap-3">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                          {category.label}
                        </p>
                        <p className="mt-1 font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                          {category.id}
                        </p>
                      </div>
                      <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                        {refCount} refs
                      </span>
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <div className="grid gap-6">
            <CategoryCanvasEditor
              categories={categories}
              draft={draft}
              selectedId={selectedId}
              projects={projects}
              onSelectCategory={handleSelectCategory}
              onDraftChange={(next) => markDraft(() => next)}
            />

            <section className="rounded-xl border border-[color:var(--color-divider)] bg-[color:var(--color-panel)] p-5">
              <div className="flex items-start justify-between gap-4">
                <div>
                  <h2 className="text-lg font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {selectedId ? draft.label || selectedId : "새 카테고리"}
                  </h2>
                  <p className="mt-1 text-sm text-[color:var(--color-text-tertiary)]">
                    {selectedId
                      ? `참조 프로젝트 ${selectedReferenceCount}개`
                      : "새 영역을 추가하면 프로젝트 폼과 토폴로지에 바로 반영됩니다."}
                  </p>
                </div>
                {selectedId && (
                  <div className="flex items-center gap-2">
                    <Link
                      href={`/project/new/?category=${encodeURIComponent(
                          selectedId,
                        )}&returnTo=${encodeURIComponent(categoriesHref)}`}
                      data-testid="category-create-project"
                      onClick={(event) =>
                        handleNavigateWithGuard(
                          event,
                          `/project/new/?category=${encodeURIComponent(
                              selectedId,
                            )}&returnTo=${encodeURIComponent(categoriesHref)}`,
                        )
                      }
                      className="inline-flex"
                    >
                      <Button type="button" size="sm" variant="ghost">
                        <SquareArrowOutUpRight size={14} className="mr-1" />
                        프로젝트 만들기
                      </Button>
                    </Link>
                    <Button
                      data-testid="category-delete"
                      type="button"
                      size="sm"
                      variant="ghost"
                      onClick={() => void handleDelete()}
                      disabled={saving}
                    >
                      <Trash2 size={14} className="mr-1" />
                      삭제
                    </Button>
                  </div>
                )}
              </div>

              <div className="mt-6 grid gap-4 md:grid-cols-2">
                <Field label="ID">
                  <input
                    data-testid="category-input-id"
                    value={draft.id}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        id: event.target.value,
                      }))
                    }
                    disabled={selectedId !== null}
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] disabled:opacity-60"
                  />
                  {selectedId && (
                    <p
                      data-testid="category-id-locked-hint"
                      className="mt-1 text-[11px] text-[color:var(--color-text-quaternary)]"
                    >
                      기존 카테고리 ID는 프로젝트 참조 때문에 변경할 수
                      없습니다.
                    </p>
                  )}
                </Field>
                <Field label="정렬 순서">
                  <input
                    data-testid="category-input-order"
                    type="number"
                    value={draft.order}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        order: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="라벨">
                  <input
                    data-testid="category-input-label"
                    value={draft.label}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        label: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="영문 라벨">
                  <input
                    data-testid="category-input-label-en"
                    value={draft.labelEn}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        labelEn: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="중심 X">
                  <input
                    data-testid="category-input-x"
                    type="number"
                    value={draft.positionX}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        positionX: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="중심 Y">
                  <input
                    data-testid="category-input-y"
                    type="number"
                    value={draft.positionY}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        positionY: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="너비">
                  <input
                    data-testid="category-input-width"
                    type="number"
                    value={draft.width}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        width: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="높이">
                  <input
                    data-testid="category-input-height"
                    type="number"
                    value={draft.height}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        height: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="반경">
                  <input
                    type="number"
                    value={draft.radius}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        radius: event.target.value,
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  />
                </Field>
                <Field label="보더 스타일">
                  <select
                    data-testid="category-input-border-style"
                    value={draft.borderStyle}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        borderStyle: event.target
                          .value as Category["borderStyle"],
                      }))
                    }
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)]"
                  >
                    {BORDER_STYLE_OPTIONS.map((option) => (
                      <option key={option.value} value={option.value}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </Field>
                <Field label="세로 라벨">
                  <input
                    data-testid="category-input-side-label"
                    value={draft.sideLabelText}
                    onChange={(event) =>
                      markDraft((current) => ({
                        ...current,
                        sideLabelText: event.target.value,
                      }))
                    }
                    disabled={draft.borderStyle !== "sideLabel"}
                    className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] disabled:opacity-60"
                  />
                </Field>
              </div>

              {(error || message) && (
                <div
                  role={error ? "alert" : "status"}
                  aria-live={error ? "assertive" : "polite"}
                  className={cn(
                    "mt-4 rounded-lg border px-3 py-2 text-sm",
                    error
                      ? "border-[color:rgba(229,72,77,0.32)] text-[color:var(--color-status-danger)]"
                      : "border-[color:rgba(94,106,210,0.28)] text-[color:var(--color-text-secondary)]",
                  )}
                >
                  {error ?? message}
                </div>
              )}

              <div className="mt-6 flex flex-wrap items-center justify-end gap-2">
                {selectedId && (
                  <Button
                    data-testid="category-reflow-selected"
                    type="button"
                    variant="ghost"
                    onClick={() => void handleSave("selected")}
                    disabled={saving}
                  >
                    저장 후 이 영역 재배치
                  </Button>
                )}
                <Button
                  data-testid="category-save"
                  type="button"
                  onClick={() => void handleSave()}
                  disabled={saving}
                >
                  {saving
                    ? "저장 중…"
                    : selectedId
                      ? "변경 저장"
                      : "카테고리 생성"}
                </Button>
              </div>

              {selectedId && (
                <section className="mt-6 border-t border-[color:var(--color-overlay-2)] pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      Referenced Projects
                    </h3>
                    <span
                      data-testid="category-linked-project-count"
                      className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]"
                    >
                      {selectedProjects.length}
                    </span>
                  </div>
                  {selectedProjects.length === 0 ? (
                    <p className="mt-3 text-sm text-[color:var(--color-text-tertiary)]">
                      아직 이 카테고리를 쓰는 프로젝트가 없습니다.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-wrap gap-2">
                      {selectedProjects.map((project) => (
                        <Link
                          key={project.slug}
                          href={`/project/${encodeURIComponent(project.slug)}/edit/?returnTo=${encodeURIComponent(categoriesHref)}`}
                          data-testid={`category-linked-project-${project.slug}`}
                          onClick={(event) =>
                            handleNavigateWithGuard(
                              event,
                              `/project/${encodeURIComponent(project.slug)}/edit/?returnTo=${encodeURIComponent(categoriesHref)}`,
                            )
                          }
                          className="rounded-md border border-[color:var(--color-divider)] px-3 py-1.5 text-sm text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:var(--color-indigo-brand)] hover:text-[color:var(--color-text-primary)]"
                        >
                          {project.name}
                        </Link>
                      ))}
                    </div>
                  )}
                </section>
              )}

              {selectedId && selectedProjects.length > 0 && (
                <section className="mt-6 border-t border-[color:var(--color-overlay-2)] pt-6">
                  <div className="flex items-center justify-between gap-3">
                    <h3 className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      Reassign and delete
                    </h3>
                    <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                      {selectedProjects.length} projects
                    </span>
                  </div>

                  {replacementCategories.length === 0 ? (
                    <p className="mt-3 text-sm text-[color:var(--color-text-tertiary)]">
                      이 카테고리를 삭제하려면 다른 카테고리를 하나 더 만들어야 합니다.
                    </p>
                  ) : (
                    <div className="mt-3 flex flex-col gap-3 md:flex-row md:items-center">
                      <select
                        data-testid="category-reassign-target"
                        value={replacementCategoryId}
                        onChange={(event) =>
                          setReplacementCategoryId(event.target.value)
                        }
                        className="w-full rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-canvas)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] md:max-w-xs"
                      >
                        {replacementCategories.map((category) => (
                          <option key={category.id} value={category.id}>
                            {category.label}
                          </option>
                        ))}
                      </select>
                      <Button
                        data-testid="category-reassign-delete"
                        type="button"
                        variant="ghost"
                        onClick={() => void handleReassignAndDelete()}
                        disabled={saving}
                      >
                        프로젝트 옮기고 삭제
                      </Button>
                    </div>
                  )}
                </section>
              )}
            </section>
          </div>
        </div>
      </div>
    </main>
  );
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="flex flex-col gap-2">
      <span className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
        {label}
      </span>
      {children}
    </label>
  );
}

export function CategoriesPage() {
  return (
    <PermissionGate>
      <CategoriesContent />
    </PermissionGate>
  );
}
