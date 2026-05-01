"use client";

import { type ChangeEvent, useEffect, useMemo, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { PermissionGate, useGlobalAdmin } from "@/features/permissions";
import {
  KNOWLEDGE_DOCUMENT_KIND_OPTIONS,
  buildKnowledgeMetadataPreview,
  createKnowledgeDocumentWithInitialVersion,
  getKnowledgeDocumentDetailHref,
  getKnowledgeDocumentListHref,
  getKnowledgeMetadataFieldLabel,
  getKnowledgeDocumentKindLabel,
  parseKnowledgeFrontmatter,
} from "@/entities/knowledge-document";
import { type Project } from "@/entities/project";
import { useProjects } from "@/features/project-data-source";
import { Button, Card, CardContent, CardDescription, CardHeader, CardTitle, buttonVariants, useToast } from "@/shared/ui";
import { DocumentNewOntologyHints, FrontmatterGradeBadge } from "@/widgets/document-new-ontology-hints";
import { OperationsNav } from "@/widgets/operations-nav";
import { FrontmatterOnboarding } from "@/widgets/frontmatter-onboarding";
import { recommendDocumentSlug } from "@/shared/lib/ontology-tree";
import { } from "@/shared/lib/account-scope";
import { cn } from "@/shared/lib/cn";

function buildTemplateMarkdown({
  template,
  safeTitle,
  kind,
  projectIds,
}: {
  template: "spec" | "adr" | "workflow";
  safeTitle: string;
  kind: string;
  projectIds: string[];
}) {
  const joinedProjects =
    projectIds.length > 0
      ? projectIds.map((projectId) => `  - ${projectId}`).join("\n")
      : "  - project-slug";

  const nextMarkdownByTemplate = {
    spec: `---\ntitle: ${safeTitle}\nkind: ${kind}\nprojectIds:\n${joinedProjects}\ndomain: domain-name\ncapabilities:\n  - capability-name\nelements:\n  - element-name\nrelates:\n  - related-document-or-concept\n---\n# 요약\n\n이 문서가 해결하려는 문제와 범위를 한 문단으로 적습니다.\n\n# 핵심 개념\n\n- 개념 1\n- 개념 2\n\n# 기능\n\n- capability-name\n\n# 구성 요소\n\n- element-name\n`,
    adr: `---\ntitle: ${safeTitle}\nkind: decision\nprojectIds:\n${joinedProjects}\ndomain: domain-name\ncapabilities:\n  - affected-capability\nelements:\n  - impacted-element\nrelates:\n  - related-document-or-concept\n---\n# 결정\n\n이번에 결정한 내용을 한 문장으로 적습니다.\n\n# 배경\n\n왜 이 결정을 해야 했는지 적습니다.\n\n# 영향\n\n- 영향을 받는 기능\n- 바뀌는 운영 방식\n`,
    workflow: `---\ntitle: ${safeTitle}\nkind: workflow\nprojectIds:\n${joinedProjects}\ndomain: domain-name\ncapabilities:\n  - workflow-capability\nelements:\n  - runner\n  - gateway\nrelates:\n  - related-runbook\n---\n# 목적\n\n이 워크플로가 해결하는 운영 흐름을 적습니다.\n\n# 단계\n\n## 1. 시작\n\n## 2. 처리\n\n## 3. 종료\n\n# 연결 시스템\n\n- 어떤 시스템과 문서가 함께 움직이는지 적습니다.\n`,
  };

  return nextMarkdownByTemplate[template];
}

function NewDocumentContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const toast = useToast();
  const { user } = useGlobalAdmin();
  const seededProjectId = searchParams.get("project")?.trim() || "";
  const seededTitle = searchParams.get("title")?.trim() || "";
  const returnTo = searchParams.get("returnTo")?.trim() || "";
  const safeReturnTo =
    returnTo || getKnowledgeDocumentListHref(null, seededProjectId ? { projectId: seededProjectId } : undefined);
  const [title, setTitle] = useState("");
  const [kind, setKind] = useState("spec");
  const [projectIdsInput, setProjectIdsInput] = useState(seededProjectId);
  const [rawMarkdown, setRawMarkdown] = useState("");
  const [selectedFileName, setSelectedFileName] = useState<string | null>(null);
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { projects } = useProjects();
  const autoSeededTemplateRef = useRef(false);
  const rawMarkdownRef = useRef<HTMLTextAreaElement | null>(null);
  const titleInputRef = useRef<HTMLInputElement | null>(null);
  const projectIdsInputRef = useRef<HTMLInputElement | null>(null);
  const kindSelectRef = useRef<HTMLSelectElement | null>(null);
  const saveDetailsRef = useRef<HTMLDetailsElement | null>(null);

  const projectIds = useMemo(
    () =>
      [...new Set(projectIdsInput.split(",").map((item) => item.trim()).filter(Boolean))],
    [projectIdsInput],
  );
  const parsed = useMemo(() => parseKnowledgeFrontmatter(rawMarkdown), [rawMarkdown]);
  const metadataPreview = useMemo(
    () =>
      buildKnowledgeMetadataPreview(
        { title, kind, projectIds },
        parsed.frontmatter,
      ),
    [kind, parsed.frontmatter, projectIds, title],
  );
  const projectSuggestions = useMemo(
    () =>
      projects
        .filter((project) => !projectIds.includes(project.slug))
        .slice(0, 8),
    [projectIds, projects],
  );
  const selectedProjects = useMemo(
    () =>
      projectIds.map((projectId) => {
        const matched = projects.find((project) => project.slug === projectId);
        return {
          slug: projectId,
          name: matched?.name ?? projectId,
        };
      }),
    [projectIds, projects],
  );
  const seededProjectName =
    selectedProjects.find((project) => project.slug === seededProjectId)?.name ??
    seededProjectId;
  const metadataConflicts = useMemo(
    () => metadataPreview.filter((row) => row.isConflict),
    [metadataPreview],
  );
  const pageTitle = seededProjectId ? "문서 등록" : "새 문서 등록";


  // B-23 cont — 사용자 입력 (제목 / 원문 / 프로젝트) 이 채워졌을 때
  // 탭 닫기 / 새로고침 silent 손실 방지. cycle 33 ProjectForm 과 동일 패턴.
  // submit 중 (isSubmitting) 은 등록 직후 redirect 라 가드 X.
  useEffect(() => {
    const hasDraft =
      title.trim() !== "" ||
      rawMarkdown.trim() !== "" ||
      (projectIdsInput.trim() !== "" && projectIdsInput !== seededProjectId);
    if (!hasDraft || isSubmitting) return;
    const handler = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = "";
    };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [title, rawMarkdown, projectIdsInput, seededProjectId, isSubmitting]);

  useEffect(() => {
    if (!seededProjectId) return;
    queueMicrotask(() => {
      setProjectIdsInput((current) => (current.trim() ? current : seededProjectId));
    });
  }, [seededProjectId]);

  useEffect(() => {
    if (seededTitle) {
      queueMicrotask(() => {
        setTitle((current) => {
          const trimmed = current.trim();
          if (!trimmed || trimmed === `${seededProjectId} 명세`) {
            return seededTitle;
          }
          return current;
        });
      });
      return;
    }
    if (!seededProjectId || !seededProjectName) return;
    queueMicrotask(() => {
      setTitle((current) => {
        const trimmed = current.trim();
        if (!trimmed || trimmed === `${seededProjectId} 명세`) {
          return `${seededProjectName} 명세`;
        }
        return current;
      });
    });
  }, [seededProjectId, seededProjectName, seededTitle]);

  useEffect(() => {
    if (!seededProjectId || autoSeededTemplateRef.current) return;
    if (rawMarkdown.trim() || selectedFileName) return;

    autoSeededTemplateRef.current = true;
    const safeTitle = (title.trim() || `${seededProjectName || seededProjectId} 명세`).trim();
    queueMicrotask(() => {
      setRawMarkdown(
        buildTemplateMarkdown({
          template: "spec",
          safeTitle,
          kind,
          projectIds,
        }),
      );
    });
  }, [
    kind,
    projectIds,
    rawMarkdown,
    seededProjectId,
    seededProjectName,
    selectedFileName,
    title,
  ]);

  const applyTemplate = (template: "spec" | "adr" | "workflow") => {
    const safeTitle = title.trim() || "제목 없는 문서";
    setRawMarkdown(
      buildTemplateMarkdown({
        template,
        safeTitle,
        kind,
        projectIds,
      }),
    );
    setSelectedFileName(null);
  };

  const appendProjectSuggestion = (slug: string) => {
    setProjectIdsInput((current) => {
      const next = current
        .split(",")
        .map((item) => item.trim())
        .filter(Boolean);
      if (!next.includes(slug)) next.push(slug);
      return next.join(", ");
    });
  };

  const removeProjectSuggestion = (slug: string) => {
    setProjectIdsInput((current) =>
      current
        .split(",")
        .map((item) => item.trim())
        .filter((item) => item && item !== slug)
        .join(", "),
    );
  };

  const handleSubmit = async () => {
    if (!rawMarkdown.trim()) {
      setError("마크다운 원문을 입력해야 합니다.");
      rawMarkdownRef.current?.focus();
      return;
    }
    if (!title.trim()) {
      setError("문서 제목을 입력하거나 마크다운의 첫 H1 제목을 작성해야 합니다.");
      if (saveDetailsRef.current) saveDetailsRef.current.open = true;
      titleInputRef.current?.focus();
      return;
    }
    if (!kind.trim()) {
      setError("문서 유형을 선택해야 합니다.");
      if (saveDetailsRef.current) saveDetailsRef.current.open = true;
      kindSelectRef.current?.focus();
      return;
    }
    if (projectIds.length === 0) {
      setError("연결 프로젝트를 하나 이상 입력해야 합니다.");
      if (saveDetailsRef.current) saveDetailsRef.current.open = true;
      projectIdsInputRef.current?.focus();
      return;
    }

    setIsSubmitting(true);
    setError(null);
    try {
      const { documentId } = await createKnowledgeDocumentWithInitialVersion({
        accountId: null,
        title,
        kind,
        projectIds,
        rawMarkdown,
        sourceType: "manual",
        createdBy: user?.email ?? "unknown-admin",
      });
      // 등록 후 detail 라우팅. jobStatus=autostart 는 detail 페이지의 activePanel
      // 을 result 탭으로 자동 전환만 한다 (mission v2 에서 cloud LLM 추출 큐
      // enqueueExtractionJob 흐름 제거 — 추출 자체가 사라진 자리에 결과 탭 자동
      // 노출만 남음). ontology 노드 자체는 vault frontmatter 또는 빌더에서 직접
      // 추가.
      toast.show(`"${title.trim()}" 등록 완료`, "success");
      router.push(
        getKnowledgeDocumentDetailHref(documentId, null, {
          projectId: seededProjectId || projectIds[0] || undefined,
          returnTo: safeReturnTo,
          jobStatus: "autostart",
        }),
      );
    } catch (nextError) {
      const message = nextError instanceof Error ? nextError.message : "문서 등록 실패";
      setError(message);
      toast.show(`등록 실패: ${message}`, "error");
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleFileChange = async (event: ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    if (!file) return;
    const text = await file.text();
    setSelectedFileName(file.name);
    setRawMarkdown(text);
  };

  return (
    <main className="min-h-screen bg-[color:var(--color-canvas)]">
      <OperationsNav accountId={null} />
      <div className="mx-auto grid max-w-6xl gap-6 px-5 py-6 md:px-12 md:py-10 lg:grid-cols-[minmax(0,1.16fr)_360px]">
        <div>
          <h1 className="text-2xl font-[var(--font-weight-signature)] tracking-[var(--tracking-section)] text-[color:var(--color-text-primary)] md:text-4xl">
            {pageTitle}
          </h1>
          <p className="mt-3 max-w-xl text-sm leading-6 text-[color:var(--color-text-secondary)]">
            제목, 프로젝트, 원문만 넣고 먼저 등록할 수 있습니다.
          </p>
          {/* 워크플로 컨텍스트 — 첫 사용자가 등록 후 무엇이 일어나는지 알 수 있게.
              검수 큐 stepper (B-2) 와 동일한 4단계 모델. 현재는 1단계 ('올리기'). */}
          <ol
            aria-label="문서 라이프사이클 4단계 — 현재 1. 올리기"
            className="mt-4 flex flex-wrap items-center gap-x-3 gap-y-1.5 font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]"
          >
            <li>
              <span className="rounded-full border border-[color:rgba(94,106,210,0.46)] bg-[color:rgba(94,106,210,0.18)] px-2 py-0.5 text-[color:var(--color-text-primary)]">
                1. 올리기
              </span>{" "}
              <span className="text-[color:var(--color-text-tertiary)]">지금</span>
            </li>
            <li aria-hidden>→</li>
            <li>2. 분석 <span className="text-[color:var(--color-text-quaternary)]">(자동)</span></li>
            <li aria-hidden>→</li>
            <li>3. 골라내기</li>
            <li aria-hidden>→</li>
            <li>4. 공개</li>
          </ol>
          {seededProjectId ? (
            <p className="mt-2 inline-flex rounded-full border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 text-sm text-[color:var(--color-text-secondary)]">
              <span className="font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">{seededProjectId}</span>
              <span className="ml-2">프로젝트에 바로 연결됩니다.</span>
            </p>
          ) : null}

          <details className="mt-6 rounded-xl border border-[color:rgba(94,106,210,0.18)] bg-[color:rgba(94,106,210,0.06)] px-5 py-4">
            <summary className="cursor-pointer list-none">
              <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                입력 도움말
              </p>
              <p className="mt-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                frontmatter를 완벽히 쓰지 않아도 됩니다. 제목과 프로젝트만 먼저 맞춰도 후보 연결을 만들 수 있습니다.
              </p>
            </summary>
            <ol className="mt-4 space-y-2 border-t border-[color:var(--color-divider)] pt-4 text-sm leading-6 text-[color:var(--color-text-secondary)]">
              <li>1. 문서 유형을 고릅니다.</li>
              <li>2. 연결할 프로젝트를 하나 이상 넣습니다.</li>
              <li>3. 템플릿을 눌러 문서 틀을 채웁니다.</li>
              <li>4. 요약과 핵심 개념만 적고 먼저 등록합니다.</li>
            </ol>
          </details>

          <Card className="mt-8">
            <CardHeader>
              <CardTitle>문서 입력</CardTitle>
              <CardDescription>
                제목, 문서 유형, 연결 프로젝트, 마크다운 원문만 넣어도 시작할 수 있게 구성합니다.
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-4">
              {/* 템플릿 영역 — 사용자가 이미 작성을 시작한 뒤엔 방해가 되므로
                  rawMarkdown 이 비어 있을 때만 노출. 한 번 내용 들어가면 자동
                  숨김. (Obsidian 식 "빈 문서에만 도우미 등장" 패턴) */}
              {!rawMarkdown.trim() ? (
                <Field
                  id="knowledge-template"
                  label="빠른 시작 템플릿"
                  description="빈 문서에서 바로 시작할 수 있는 기본 구조입니다."
                  labelAsText
                >
                  <div className="flex flex-wrap gap-2">
                    {seededProjectId ? (
                      <Button type="button" size="sm" onClick={() => applyTemplate("spec")}>
                        첫 문서 틀 채우기
                      </Button>
                    ) : null}
                    <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("spec")}>
                      명세서 템플릿
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("adr")}>
                      결정 기록 템플릿
                    </Button>
                    <Button type="button" variant="outline" size="sm" onClick={() => applyTemplate("workflow")}>
                      워크플로 템플릿
                    </Button>
                  </div>
                </Field>
              ) : null}
              {/* editor-first: 마크다운 원문을 제목·메타 위로 올린다.
                  에디터 중심 노트 앱처럼 먼저 글을 쓰고 메타는 아래에서 다듬는다.
                  제목은 첫 `# H1` 자동 추출 (onChange 에서) 되므로 아래로
                  밀려도 이중 입력 부담 없음. */}
              <Field
                id="knowledge-raw-markdown"
                label="마크다운 원문"
                description="본문과 frontmatter를 그대로 붙여넣습니다. 첫 H1은 제목 후보로 자동 반영됩니다."
                required
              >
                <textarea
                  id="knowledge-raw-markdown"
                  ref={rawMarkdownRef}
                  name="rawMarkdown"
                  autoFocus
                  value={rawMarkdown}
                  onChange={(event) => {
                    const next = event.target.value;
                    setRawMarkdown(next);
                    // 제목 입력이 비어 있으면 md 의 첫 `# H1` 을 자동 추출.
                    // 사용자가 수동으로 제목을 넣었으면 그대로 둔다 (seed
                    // title · 템플릿 적용 로직과 동일한 "빈 값일 때만" 규칙).
                    if (!title.trim()) {
                      const match = next.match(/^\s*#\s+(.+)$/m);
                      const candidate = match?.[1]?.trim();
                      if (candidate) setTitle(candidate);
                    }
                  }}
                  // UX-5: textarea 가 viewport 전체를 잡아먹으면 아래 "저장 세부"
                  // 가 fold-below 로 깔려 사용자가 제목/프로젝트 메타를 어떻게
                  // 만져야 할지 단서를 잃음. 데스크톱 60vh, 모바일 320px max-h
                  // 로 자연스럽게 다음 영역이 보이게. textarea 자체는 overflow
                  // 스크롤로 무한 입력 보존.
                  className={`${inputClassName} min-h-[280px] max-h-[60vh] py-3 font-mono text-xs leading-6`}
                  placeholder={"# 제목을 여기에\n\n내용을 자유롭게 적으세요. frontmatter (---) 가 있으면 상단 메타가 우선 적용됩니다."}
                  aria-describedby="knowledge-raw-markdown-description"
                />
              </Field>

              {/* 저장 세부 — 기본 접힘. editor 에 집중하다가 필요한 때만
                  펼쳐서 메타 조정. URL 의 seededProjectId / markdown frontmatter
                  가 대부분 값을 채워주므로 일반 케이스에서는 건드릴 필요 없음. */}
              <details
                ref={saveDetailsRef}
                className="group rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3 transition-colors hover:border-[color:rgba(94,106,210,0.32)]"
              >
                <summary className="cursor-pointer list-none">
                  <div className="flex items-center justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-mono text-[10px] uppercase tracking-[0.14em] text-[color:var(--color-text-quaternary)]">
                        저장 세부
                      </p>
                      <p className="mt-1 text-sm text-[color:var(--color-text-tertiary)]">
                        제목 · 연결 프로젝트 · 문서 유형 · 파일 업로드 — 필요할 때만 펼치세요.
                      </p>
                    </div>
                    {/* UX-5 — fold-below 단서 강화. summary 가 펼침 가능
                        하다는 신호를 더 명확하게. group-open 으로 회전. */}
                    <span
                      aria-hidden
                      className="shrink-0 font-mono text-[10px] text-[color:var(--color-text-tertiary)] transition-transform group-open:rotate-90"
                    >
                      ▶
                    </span>
                  </div>
                </summary>
                <div className="mt-4 space-y-4 border-t border-[color:var(--color-border-soft)] pt-4">
              <Field
                id="knowledge-title"
                label="제목"
                description="저장되는 문서의 대표 제목입니다. 비워두면 마크다운 첫 H1에서 가져옵니다."
                required
              >
                <input
                  id="knowledge-title"
                  ref={titleInputRef}
                  name="title"
                  autoComplete="off"
                  value={title}
                  onChange={(event) => setTitle(event.target.value)}
                  className={inputClassName}
                  placeholder="비우면 md 의 # 제목에서 자동으로 가져옵니다"
                  aria-describedby="knowledge-title-description"
                />
                {(() => {
                  const slug = recommendDocumentSlug(title);
                  if (!slug) return null;
                  return (
                    <p className="mt-1.5 font-mono text-[10px] text-[color:var(--color-text-quaternary)]">
                      ID 추천: <span className="text-[color:var(--color-text-tertiary)]">{slug}</span>
                      {" — frontmatter "}
                      <code className="rounded bg-[color:var(--color-overlay-2)] px-1 py-0.5 text-[10px]">id: {slug}</code>
                      {" 로 박으면 등급 ↑"}
                    </p>
                  );
                })()}
                <FrontmatterGradeBadge
                  frontmatter={parsed.frontmatter}
                  pageTitle={title}
                  pageKind={kind}
                  pageProjectIds={projectIds}
                />
                <DocumentNewOntologyHints accountId={null} title={title} kind={kind} />
              </Field>
              <Field
                id="knowledge-project-ids"
                label="연결 프로젝트"
                description="프로젝트 slug를 쉼표로 구분합니다. 연결 프로젝트가 있어야 분석 후보를 프로젝트 맥락에 붙일 수 있어요."
                required
              >
                <input
                  id="knowledge-project-ids"
                  ref={projectIdsInputRef}
                  name="projectIds"
                  autoComplete="off"
                  value={projectIdsInput}
                  onChange={(event) => setProjectIdsInput(event.target.value)}
                  className={inputClassName}
                  placeholder="reactor, iam 처럼 쉼표로 구분…"
                  aria-describedby="knowledge-project-ids-description"
                />
                {selectedProjects.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {selectedProjects.map((project) => (
                      <button
                        key={project.slug}
                        type="button"
                        onClick={() => removeProjectSuggestion(project.slug)}
                        className="inline-flex items-center gap-2 rounded-full border border-[color:rgba(94,106,210,0.26)] bg-[color:rgba(94,106,210,0.08)] px-3 py-1.5 text-xs text-[color:var(--color-text-primary)] transition-colors hover:border-[color:rgba(94,106,210,0.4)]"
                        aria-label={`${project.name} 연결 프로젝트 제거`}
                      >
                        <span>{project.name}</span>
                        <span className="font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-tertiary)]">
                          {project.slug}
                        </span>
                        <span aria-hidden>×</span>
                      </button>
                    ))}
                  </div>
                )}
                {projectSuggestions.length > 0 && (
                  <div className="mt-2 flex flex-wrap gap-2">
                    {projectSuggestions.map((project) => (
                      <button
                        key={project.slug}
                        type="button"
                        onClick={() => appendProjectSuggestion(project.slug)}
                        className="rounded-full border border-[color:var(--color-divider)] px-3 py-1.5 text-left text-xs text-[color:var(--color-text-secondary)] transition-colors hover:border-[color:rgba(94,106,210,0.34)] hover:text-[color:var(--color-text-primary)]"
                      >
                        <span className="block text-[color:var(--color-text-primary)]">{project.name}</span>
                        <span className="mt-1 block font-mono text-[10px] uppercase tracking-[0.08em] text-[color:var(--color-text-quaternary)]">
                          {project.slug}
                        </span>
                      </button>
                    ))}
                  </div>
                )}
              </Field>
              <Field
                id="knowledge-kind"
                label="문서 유형"
                description="문서 확인 화면에서 분류할 기준입니다."
                required
              >
                <select
                  id="knowledge-kind"
                  ref={kindSelectRef}
                  value={kind}
                  onChange={(event) => setKind(event.target.value)}
                  className={inputClassName}
                  aria-describedby="knowledge-kind-description"
                >
                  {KNOWLEDGE_DOCUMENT_KIND_OPTIONS.map((option) => (
                    <option key={option.value} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
                <p className="text-xs text-[color:var(--color-text-tertiary)]">
                  현재 선택: {getKnowledgeDocumentKindLabel(kind)}
                </p>
              </Field>
              <Field
                id="knowledge-document-file"
                label="마크다운 파일"
                description="로컬 .md 파일을 불러오면 원문 입력란을 채웁니다."
              >
                <div className="flex flex-wrap items-center gap-3">
                  <label
                    htmlFor="knowledge-document-file"
                    className={cn(buttonVariants({ variant: "outline", size: "sm" }), "cursor-pointer")}
                  >
                    파일 선택
                  </label>
                  <input
                    id="knowledge-document-file"
                    type="file"
                    accept=".md,text/markdown,text/plain"
                    onChange={handleFileChange}
                    className="sr-only"
                  />
                  <p className="text-sm text-[color:var(--color-text-tertiary)]">
                    {selectedFileName ?? "선택한 파일이 없습니다."}
                  </p>
                </div>
              </Field>
                </div>
              </details>
              {error && (
                <p
                  role="alert"
                  className="text-sm text-[color:var(--color-status-danger)]"
                >
                  {error}
                </p>
              )}
              <p
                aria-live="polite"
                className="text-sm text-[color:var(--color-text-secondary)]"
              >
                {isSubmitting
                  ? "문서를 저장하고 분석 화면으로 이동하는 중이에요."
                  : "저장하면 문서 상세로 가고 자동으로 분석이 시작돼요."}
              </p>

              <div className="flex flex-wrap items-center gap-2">
                <Button type="button" onClick={() => void handleSubmit()} disabled={isSubmitting}>
                  {isSubmitting ? "등록 중…" : "등록하고 분해 시작"}
                </Button>
                <Button
                  type="button"
                  variant="outline"
                  onClick={() => {
                    setRawMarkdown("");
                    setSelectedFileName(null);
                    setError(null);
                  }}
                  disabled={isSubmitting}
                >
                  {selectedFileName ? "업로드 취소" : "원문 비우기"}
                </Button>
                <Button
                  type="button"
                  variant="ghost"
                  onClick={() => setRawMarkdown(`# ${title || "제목 없는 문서"}\n\n`)}
                  disabled={isSubmitting}
                >
                  메타 없는 새 문서 초안 넣기
                </Button>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="space-y-6 lg:sticky lg:top-8 lg:self-start">
          <Card>
            <CardHeader>
              <CardTitle>이 문서 한눈에</CardTitle>
              <CardDescription>
                {parsed.hasFrontmatter || metadataConflicts.length > 0
                  ? "상단 메타와 입력 값을 비교해 최종 저장값을 미리 보여드립니다."
                  : "제목·프로젝트·원문만 확인하면 바로 등록됩니다."}
              </CardDescription>
            </CardHeader>
            <CardContent className="space-y-3">
              {/* 항상 보여줘야 맥락이 사는 2개 — 문서 유형, 연결 프로젝트 수.
                  상단 메타·충돌 타일은 frontmatter 나 충돌이 있을 때만 노출해
                  "뭔지 모르겠는" 정보 노이즈를 줄인다. */}
              <div className="grid grid-cols-2 gap-3">
                <div className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    문서 유형
                  </p>
                  <p className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {getKnowledgeDocumentKindLabel(
                      metadataPreview.find((row) => row.field === "kind")
                        ?.canonicalValue || kind,
                    )}
                  </p>
                </div>
                <div className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3">
                  <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                    연결 프로젝트
                  </p>
                  <p className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                    {projectIds.length}개
                  </p>
                </div>
                {parsed.hasFrontmatter ? (
                  <div className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                      상단 메타
                    </p>
                    <p className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-text-primary)]">
                      포함됨
                    </p>
                  </div>
                ) : null}
                {metadataConflicts.length > 0 ? (
                  <div className="rounded-lg border border-[color:rgba(139,151,255,0.35)] bg-[color:rgba(94,106,210,0.08)] px-4 py-3">
                    <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-indigo-accent)]">
                      충돌
                    </p>
                    <p className="mt-2 text-sm font-[var(--font-weight-signature)] text-[color:var(--color-indigo-accent)]">
                      {metadataConflicts.length}개
                    </p>
                  </div>
                ) : null}
              </div>
              {/* 상세 details — frontmatter 나 충돌 있을 때만. 빈 문서에는
                  혼란만 주던 3개 접이식 영역을 조건부로 숨김. */}
              {parsed.hasFrontmatter || metadataConflicts.length > 0 ? (
              <>
              <details className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3">
                <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  메타 비교 보기
                </summary>
                <div className="mt-3 space-y-3 border-t border-[color:var(--color-border-soft)] pt-3">
                  {metadataPreview.map((row) => (
                    <div
                      key={row.field}
                      className="rounded-lg border border-[color:var(--color-border-soft)] px-4 py-3"
                    >
                      <div className="flex items-center justify-between gap-3">
                        <p className="font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                          {getKnowledgeMetadataFieldLabel(row.field)}
                        </p>
                        {row.isConflict && (
                          <span className="rounded-full border border-[color:var(--color-indigo-brand)] px-2 py-0.5 text-[10px] text-[color:var(--color-indigo-accent)]">
                            충돌
                          </span>
                        )}
                      </div>
                      <dl className="mt-3 grid gap-2 text-sm text-[color:var(--color-text-secondary)]">
                        <div className="grid gap-1">
                          <dt className="text-[11px] text-[color:var(--color-text-quaternary)]">최종 적용 값</dt>
                          <dd className="text-[color:var(--color-text-primary)]">{row.canonicalValue || "—"}</dd>
                        </div>
                        {row.isConflict && (
                          <>
                            <div className="grid gap-1">
                              <dt className="text-[11px] text-[color:var(--color-text-quaternary)]">입력한 값</dt>
                              <dd>{row.uiValue || "—"}</dd>
                            </div>
                            <div className="grid gap-1">
                              <dt className="text-[11px] text-[color:var(--color-text-quaternary)]">문서 상단 메타 값</dt>
                              <dd>{row.frontmatterValue || "—"}</dd>
                            </div>
                          </>
                        )}
                      </dl>
                    </div>
                  ))}
                </div>
              </details>
              <details className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
                <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  입력 규칙 보기
                </summary>
                <ul className="mt-3 space-y-2 text-sm leading-6 text-[color:var(--color-text-secondary)]">
                  <li>문서 제목과 프로젝트 연결이 정확할수록 후보 연결이 더 안정적으로 생성됩니다.</li>
                  <li>`domain`, `capabilities`, `elements`, `relates`를 채우면 병합 가능한 ontology 후보가 더 풍부해집니다.</li>
                  <li>문서 안의 제목과 bullet list도 분석에 함께 사용됩니다.</li>
                </ul>
              </details>
              <details className="rounded-lg border border-[color:var(--color-border-soft)] bg-[color:var(--color-overlay-1)] px-4 py-3">
                <summary className="cursor-pointer list-none font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]">
                  상단 메타 원문 보기
                </summary>
                <pre className="mt-3 overflow-x-auto text-xs text-[color:var(--color-text-tertiary)]">
                  {JSON.stringify(parsed.frontmatter, null, 2)}
                </pre>
              </details>
              </>
              ) : null}
            </CardContent>
          </Card>
        </div>
        {/* Fire 3 — O-10 한국어 frontmatter 인라인 onboarding. 신규 사용자가
            처음 문서 작성 시 등급 A/B/C + 필수/권장 필드 + 예시 markdown 을
            바로 옆에서 볼 수 있게. lg+ 에서만 우측 360px 컬럼 노출, 모바일은
            본문 아래로 stack. */}
        <div className="lg:sticky lg:top-6 lg:self-start">
          <FrontmatterOnboarding />
        </div>
      </div>
    </main>
  );
}

function Field({
  id,
  label,
  description,
  required = false,
  labelAsText = false,
  children,
}: {
  id: string;
  label: string;
  description?: string;
  required?: boolean;
  labelAsText?: boolean;
  children: React.ReactNode;
}) {
  const descriptionId = description ? `${id}-description` : undefined;
  const labelClassName =
    "flex items-center gap-2 font-mono text-[10px] uppercase tracking-[0.12em] text-[color:var(--color-text-quaternary)]";
  const labelContent = (
    <>
      <span>{label}</span>
      {required ? (
        <span className="rounded-full border border-[color:rgba(94,106,210,0.24)] px-1.5 py-0.5 text-[9px] text-[color:var(--color-indigo-accent)]">
          필수
        </span>
      ) : null}
    </>
  );

  return (
    <div className="flex flex-col gap-2">
      {labelAsText ? (
        <div className={labelClassName}>{labelContent}</div>
      ) : (
        <label htmlFor={id} className={labelClassName}>
          {labelContent}
        </label>
      )}
      {description ? (
        <p
          id={descriptionId}
          className="text-xs leading-5 text-[color:var(--color-text-tertiary)]"
        >
          {description}
        </p>
      ) : null}
      {children}
    </div>
  );
}

const inputClassName =
  "rounded-lg border border-[color:var(--color-divider)] bg-[color:var(--color-overlay-1)] px-3 py-2 text-sm text-[color:var(--color-text-primary)] outline-none transition-colors placeholder:text-[color:var(--color-text-quaternary)] focus:border-[color:var(--color-indigo-accent)]";

export function KnowledgeDocumentNewPage() {
  return (
    <PermissionGate>
      <NewDocumentContent />
    </PermissionGate>
  );
}
