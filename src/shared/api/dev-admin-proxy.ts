import { env } from '@/shared/config';
import { normalizeAccountId } from '@/shared/lib/account-scope';

const DEV_ADMIN_PROXY_ORIGIN =
  env.NEXT_PUBLIC_DEV_ADMIN_PROXY_ORIGIN?.trim() || 'http://127.0.0.1:4317';

function serializeSpecialValues(value: unknown): unknown {
  if (value instanceof Date) {
    return { _ts: value.toISOString() };
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeSpecialValues(item));
  }

  if (value && typeof value === "object") {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeSpecialValues(nested),
      ]),
    );
  }

  return value;
}

async function requestDevAdmin(
  path: string,
  init: RequestInit,
): Promise<void> {
  let response: Response;
  try {
    response = await fetch(`${DEV_ADMIN_PROXY_ORIGIN}${path}`, init);
  } catch {
    throw new Error('개발 데이터 프록시 (`pnpm dev:admin-proxy`) 가 꺼져 있어 연결할 수 없습니다.');
  }

  if (response.ok) return;

  let message = `HTTP ${response.status}`;
  try {
    const data = (await response.json()) as { error?: string };
    if (data.error) message = data.error;
  } catch {}
  throw new Error(message);
}

function withAccountQuery(path: string, accountId?: string | null) {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId) return path;

  const url = new URL(path, "http://local.test");
  url.searchParams.set("account", normalizedAccountId);
  const query = url.searchParams.toString();
  return query ? `${url.pathname}?${query}` : url.pathname;
}

async function requestDevAdminJson<T>(
  path: string,
  init?: RequestInit,
): Promise<T> {
  let response: Response;
  try {
    response = await fetch(`${DEV_ADMIN_PROXY_ORIGIN}${path}`, init);
  } catch {
    throw new Error('개발 데이터 프록시 (`pnpm dev:admin-proxy`) 가 꺼져 있어 연결할 수 없습니다.');
  }

  let data: T | { error?: string };
  try {
    data = (await response.json()) as T | { error?: string };
  } catch {
    throw new Error(`HTTP ${response.status}`);
  }

  if (response.ok) {
    return data as T;
  }

  if (
    data &&
    typeof data === "object" &&
    "error" in data &&
    typeof data.error === "string"
  ) {
    throw new Error(data.error);
  }

  throw new Error(`HTTP ${response.status}`);
}

async function requestDevAdminText(
  path: string,
  init?: RequestInit,
): Promise<string> {
  let response: Response;
  try {
    response = await fetch(`${DEV_ADMIN_PROXY_ORIGIN}${path}`, init);
  } catch {
    throw new Error('개발 데이터 프록시 (`pnpm dev:admin-proxy`) 가 꺼져 있어 연결할 수 없습니다.');
  }

  if (!response.ok) {
    let message = `HTTP ${response.status}`;
    try {
      const data = (await response.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {}
    throw new Error(message);
  }

  return response.text();
}

export function subscribeDevAdminPolling<T>(
  loader: () => Promise<T>,
  callback: (value: T) => void,
  onError?: (error: Error) => void,
  intervalMs = 1000,
): () => void {
  let active = true;
  let timer: ReturnType<typeof setTimeout> | null = null;

  const tick = async () => {
    try {
      const value = await loader();
      if (!active) return;
      callback(value);
    } catch (error) {
      if (!active) return;
      const normalized =
        error instanceof Error ? error : new Error("개발 데이터 프록시 polling 실패");
      if (onError) onError(normalized);
      else console.error("[subscribeDevAdminPolling]", normalized);
    } finally {
      if (active) {
        timer = setTimeout(() => {
          void tick();
        }, intervalMs);
      }
    }
  };

  void tick();

  return () => {
    active = false;
    if (timer) clearTimeout(timer);
  };
}

export async function upsertDevAdminDocument(
  collection: 'categories' | 'statuses',
  id: string,
  payload: Record<string, unknown>,
): Promise<void> {
  await requestDevAdmin(`/dev-admin/taxonomy/${collection}/${encodeURIComponent(id)}`, {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
}

export async function deleteDevAdminDocument(
  collection: 'categories' | 'statuses',
  id: string,
): Promise<void> {
  await requestDevAdmin(`/dev-admin/taxonomy/${collection}/${encodeURIComponent(id)}`, {
    method: 'DELETE',
  });
}

export async function upsertDevAdminProject(
  slug: string,
  payload: Record<string, unknown>,
  accountId?: string | null,
): Promise<void> {
  await requestDevAdmin(
    withAccountQuery(`/dev-admin/projects/${encodeURIComponent(slug)}`, accountId),
    {
    method: 'PUT',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(serializeSpecialValues(payload)),
    },
  );
}

export async function deleteDevAdminProject(
  slug: string,
  accountId?: string | null,
): Promise<void> {
  await requestDevAdmin(
    withAccountQuery(`/dev-admin/projects/${encodeURIComponent(slug)}`, accountId),
    {
      method: 'DELETE',
    },
  );
}

export async function upsertDevAdminProjectPositions(
  positions: Array<{ slug: string; position: { x: number; y: number } }>,
  accountId?: string | null,
): Promise<void> {
  await requestDevAdmin(
    withAccountQuery("/dev-admin/projects/positions", accountId),
    {
      method: 'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positions }),
    },
  );
}

export type DevAdminProjectRecord = {
  accountId?: string;
  slug: string;
  name?: string;
  nameEn?: string;
  category?: string;
  status?: string;
  description?: string;
  detail?: string;
  tags?: string[];
  stack?: string[];
  links?: Array<{ label: string; url: string }>;
  dependencies?: string[];
  owner?: string;
  icon?: string;
  screenshots?: string[];
  timeline?: {
    startedAt?: string | null;
    launchedAt?: string | null;
  };
  progress?: number;
  isHub?: boolean;
  position?: { x?: number; y?: number };
  createdAt?: string;
  updatedAt?: string;
};

export async function listDevAdminProjects(
  accountId?: string | null,
): Promise<DevAdminProjectRecord[]> {
  return requestDevAdminJson<DevAdminProjectRecord[]>(
    withAccountQuery("/dev-admin/projects", accountId),
    {
      method: 'GET',
    },
  );
}

export type DevAdminKnowledgeDocumentRecord = {
  id: string;
  accountId?: string;
  title?: string;
  kind?: string;
  projectIds?: string[];
  sourceType?: string;
  currentVersionId?: string;
  formatScore?: number;
  status?: string;
  latestJobStatus?: string;
  createdAt?: string;
  updatedAt?: string;
  createdBy?: string;
};

export type DevAdminKnowledgeVersionRecord = {
  id: string;
  accountId?: string;
  documentId: string;
  title?: string;
  kind?: string;
  projectIds?: string[];
  frontmatter?: Record<string, unknown>;
  storagePath: string;
  mimeType?: string;
  sizeBytes?: number;
  hash?: string;
  createdAt?: string;
  createdBy?: string;
};

export type DevAdminKnowledgeJobRecord = {
  id: string;
  accountId?: string;
  documentId: string;
  documentVersionId: string;
  extractorVersion?: string;
  idempotencyKey?: string;
  status?: string;
  attemptCount?: number;
  maxAttempts?: number;
  retryable?: boolean;
  nextAttemptAt?: string;
  leaseOwner?: string;
  leaseExpiresAt?: string;
  generation?: number;
  errorCode?: string;
  errorMessage?: string;
  supersededByJobId?: string;
  createdAt?: string;
  updatedAt?: string;
  requestedBy?: string;
};

export type DevAdminKnowledgeOutputRecord = {
  id: string;
  accountId?: string;
  jobId: string;
  documentId: string;
  documentVersionId: string;
  extractorVersion?: string;
  provider?: string;
  summary?: string;
  nodes?: unknown[];
  edges?: unknown[];
  warnings?: string[];
  createdAt?: string;
};

export type DevAdminKnowledgeEvidenceRecord = {
  id: string;
  accountId?: string;
  documentId: string;
  documentVersionId: string;
  versionHash?: string;
  chunkId?: string;
  chunkHash?: string;
  charStart?: number;
  charEnd?: number;
  excerpt?: string;
  locatorVersion?: string;
  extractorVersion?: string;
  sourceOutputId?: string;
  createdAt?: string;
};

export type DevAdminApproveKnowledgeOutputResult = {
  reviewId: string;
  approvalEventId: string;
  outputId: string;
  approvedNodeCount: number;
  approvedEdgeCount: number;
};

export type DevAdminPublishKnowledgeProjectionResult = {
  publishId: string;
  nodeCount: number;
  edgeCount: number;
  projectionVersion: string;
};

export async function listDevAdminKnowledgeDocuments(
  accountId?: string | null,
): Promise<
  DevAdminKnowledgeDocumentRecord[]
> {
  return requestDevAdminJson<DevAdminKnowledgeDocumentRecord[]>(
    withAccountQuery("/dev-admin/knowledge/documents", accountId),
    { method: "GET" },
  );
}

export async function getDevAdminKnowledgeDocument(
  documentId: string,
  accountId?: string | null,
): Promise<DevAdminKnowledgeDocumentRecord | null> {
  return requestDevAdminJson<DevAdminKnowledgeDocumentRecord | null>(
    withAccountQuery(
      `/dev-admin/knowledge/documents/${encodeURIComponent(documentId)}`,
      accountId,
    ),
    { method: "GET" },
  );
}

export async function createDevAdminKnowledgeDocument(input: {
  accountId?: string | null;
  documentId: string;
  versionId: string;
  document: Record<string, unknown>;
  version: Record<string, unknown>;
  rawMarkdown: string;
}): Promise<void> {
  await requestDevAdmin(withAccountQuery("/dev-admin/knowledge/documents", input.accountId), {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(serializeSpecialValues(input)),
  });
}

export async function createDevAdminKnowledgeDocumentVersion(input: {
  accountId?: string | null;
  documentId: string;
  versionId: string;
  version: Record<string, unknown>;
  rawMarkdown: string;
}): Promise<void> {
  await requestDevAdmin(
    withAccountQuery(
      `/dev-admin/knowledge/documents/${encodeURIComponent(input.documentId)}/versions`,
      input.accountId,
    ),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(serializeSpecialValues(input)),
    },
  );
}

export async function setDevAdminKnowledgeCurrentVersion(input: {
  accountId?: string | null;
  documentId: string;
  currentVersionId: string;
  title: string;
  kind: string;
  projectIds: string[];
}): Promise<void> {
  await requestDevAdmin(
    withAccountQuery(
      `/dev-admin/knowledge/documents/${encodeURIComponent(input.documentId)}/current-version`,
      input.accountId,
    ),
    {
      method: "PATCH",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function listDevAdminKnowledgeVersions(
  documentId: string,
  accountId?: string | null,
): Promise<DevAdminKnowledgeVersionRecord[]> {
  return requestDevAdminJson<DevAdminKnowledgeVersionRecord[]>(
    withAccountQuery(
      `/dev-admin/knowledge/documents/${encodeURIComponent(documentId)}/versions`,
      accountId,
    ),
    { method: "GET" },
  );
}

export async function listDevAdminKnowledgeJobs(
  documentId: string,
  accountId?: string | null,
): Promise<DevAdminKnowledgeJobRecord[]> {
  return requestDevAdminJson<DevAdminKnowledgeJobRecord[]>(
    withAccountQuery(
      `/dev-admin/knowledge/documents/${encodeURIComponent(documentId)}/jobs`,
      accountId,
    ),
    { method: "GET" },
  );
}

export async function enqueueDevAdminKnowledgeExtractionJob(input: {
  accountId?: string | null;
  documentId: string;
  documentVersionId: string;
  extractorVersion?: string;
}): Promise<{
  jobId: string;
  created: boolean;
  status: string;
  idempotencyKey: string;
}> {
  return requestDevAdminJson(
    withAccountQuery("/dev-admin/knowledge/jobs/enqueue", input.accountId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function requestDevAdminApproveKnowledgeOutput(input: {
  accountId?: string | null;
  documentId: string;
  documentVersionId: string;
  outputId?: string;
}): Promise<DevAdminApproveKnowledgeOutputResult> {
  return requestDevAdminJson<DevAdminApproveKnowledgeOutputResult>(
    withAccountQuery("/dev-admin/knowledge/reviews/approve", input.accountId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function requestDevAdminPublishKnowledgeProjection(input: {
  accountId?: string | null;
}): Promise<DevAdminPublishKnowledgeProjectionResult> {
  return requestDevAdminJson<DevAdminPublishKnowledgeProjectionResult>(
    withAccountQuery("/dev-admin/knowledge/publish", input.accountId),
    {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    },
  );
}

export async function listDevAdminKnowledgeOutputs(
  documentId: string,
  accountId?: string | null,
): Promise<DevAdminKnowledgeOutputRecord[]> {
  return requestDevAdminJson<DevAdminKnowledgeOutputRecord[]>(
    withAccountQuery(
      `/dev-admin/knowledge/documents/${encodeURIComponent(documentId)}/outputs`,
      accountId,
    ),
    { method: "GET" },
  );
}

export async function listDevAdminKnowledgeEvidence(
  documentId: string,
  accountId?: string | null,
): Promise<DevAdminKnowledgeEvidenceRecord[]> {
  return requestDevAdminJson<DevAdminKnowledgeEvidenceRecord[]>(
    withAccountQuery(
      `/dev-admin/knowledge/documents/${encodeURIComponent(documentId)}/evidence`,
      accountId,
    ),
    { method: "GET" },
  );
}

export async function downloadDevAdminKnowledgeMarkdown(
  storagePath: string,
): Promise<string> {
  return requestDevAdminText(
    `/dev-admin/knowledge/markdown?storagePath=${encodeURIComponent(storagePath)}`,
    { method: "GET" },
  );
}
