import {
  appendWorkspaceProjectQuery,
} from "../../../shared/lib/account-scope";

type KnowledgeHrefOptions = {
  /** knowledge 내부 "project" 라벨 — 워크스페이스 컨테이너 와는 다른 도메인. */
  projectId?: string | null;
  returnTo?: string | null;
  versionId?: string | null;
  jobStatus?: string | null;
  title?: string | null;
  /**
   * P0-B Phase 6 — workspaceProject 컨테이너 id. 명시 안 하면 현재 URL 의
   * `?pj=` 자동 상속. 외부에서 명시적으로 컨테이너 잠금 원할 때 사용.
   */
  workspaceProjectId?: string | null;
};

function appendKnowledgeParams(path: string, options?: KnowledgeHrefOptions): string {
  if (!options) return path;

  const url = new URL(path, "http://local.test");

  if (options.projectId) {
    url.searchParams.set("project", options.projectId);
  }
  if (options.returnTo) {
    url.searchParams.set("returnTo", options.returnTo);
  }
  if (options.versionId) {
    url.searchParams.set("version", options.versionId);
  }
  if (options.jobStatus) {
    url.searchParams.set("jobStatus", options.jobStatus);
  }
  if (options.title) {
    url.searchParams.set("title", options.title);
  }

  return `${url.pathname}?${url.searchParams.toString()}`;
}

function decorate(
  path: string,
  _accountId?: string | null,
  options?: KnowledgeHrefOptions,
): string {
  return appendWorkspaceProjectQuery(
    appendKnowledgeParams(path, options),
    options?.workspaceProjectId,
  );
}

export function getKnowledgeDocumentDetailHref(
  documentId: string,
  accountId?: string | null,
  options?: KnowledgeHrefOptions,
): string {
  return decorate(
    `/knowledge/documents/view/?id=${encodeURIComponent(documentId)}`,
    accountId,
    options,
  );
}

export function getKnowledgeDocumentListHref(
  accountId?: string | null,
  options?: KnowledgeHrefOptions,
): string {
  return decorate("/knowledge/documents/", accountId, options);
}

export function getKnowledgeDocumentNewHref(
  accountId?: string | null,
  options?: KnowledgeHrefOptions,
): string {
  return decorate("/knowledge/documents/new/", accountId, options);
}

export function getKnowledgeReviewWorkspaceHref(
  documentId?: string | null,
  accountId?: string | null,
  options?: KnowledgeHrefOptions,
): string {
  const base = "/review/knowledge/";
  if (!documentId) {
    return decorate(base, accountId, options);
  }
  return decorate(
    `${base}?id=${encodeURIComponent(documentId)}`,
    accountId,
    options,
  );
}
