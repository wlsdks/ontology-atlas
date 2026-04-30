/**
 * Narnia HTTP API client — 외부 도구가 워크스페이스에 노드/허브를 push.
 *
 * 사용:
 * ```ts
 * import { Narnia } from "project-narnia-client";
 *
 * const narnia = new Narnia({
 *   apiKey: process.env.NARNIA_API_KEY!,
 *   accountId: "stark",
 *   // baseUrl 미지정 시 기본 ASIA-NORTHEAST3 Cloud Function URL 자동 구성
 *   baseUrl: "https://asia-northeast3-<project>.cloudfunctions.net",
 * });
 *
 * await narnia.pushDoc({
 *   projectId: "narnia",
 *   doc: {
 *     slug: "iam-spec",
 *     name: "IAM Spec",
 *     description: "통합 인증 명세서",
 *     isHub: false,
 *     hubIds: ["iam-hub"],
 *     detail: "...markdown...",
 *   },
 * });
 * ```
 */

export interface NarniaConfig {
  /** Bearer 토큰 (`/admin/api-keys/` 에서 발급한 평문 키). */
  apiKey: string;
  /** 워크스페이스 (account) id. */
  accountId: string;
  /**
   * Cloud Function 베이스 URL — `https://<region>-<project>.cloudfunctions.net`.
   * 미지정 시 throw (사용자 환경별 URL 이라 기본값 안 잡음).
   */
  baseUrl: string;
  /** 기본 컨테이너 — 모든 push 가 이걸로 갈 곳. 호출 시 override 가능. 미지정 시 "general". */
  defaultProjectId?: string;
  /** fetch 구현체 (테스트용). 미지정 시 globalThis.fetch. */
  fetch?: typeof fetch;
}

export interface NarniaLink {
  label: string;
  url: string;
}

export interface NarniaPosition {
  x: number;
  y: number;
}

export interface NarniaTimeline {
  startedAt?: string | Date;
  launchedAt?: string | Date;
}

export interface NarniaDoc {
  /** kebab-case unique slug (컨테이너 안에서 unique). */
  slug: string;
  /** 표시 이름 — 한글/공백 허용. */
  name: string;
  nameEn?: string;
  /** 분류 (taxonomy). 미지정 시 서버가 "in-progress" fallback. */
  category?: string;
  /** 상태 (lifecycle). 미지정 시 서버가 "developing" fallback. */
  status?: string;
  /** 한 줄 설명. */
  description?: string;
  /** 본문 markdown. */
  detail?: string;
  tags?: string[];
  stack?: string[];
  links?: NarniaLink[];
  /** 다른 노드 slug 의존. */
  dependencies?: string[];
  screenshots?: string[];
  /** true → hubs/{slug}, 아니면 nodes/{slug}. */
  isHub?: boolean;
  /** node 의 소속 hub 배열 (0~N). */
  hubIds?: string[];
  position?: NarniaPosition;
  timeline?: NarniaTimeline;
  owner?: string;
  icon?: string;
  /** 0~100. */
  progress?: number;
  /** presence 등 자유 메타. */
  metadata?: Record<string, unknown>;
}

export interface PushDocOptions {
  /** 컨테이너 id. 미지정 시 config.defaultProjectId 또는 "general". */
  projectId?: string;
  doc: NarniaDoc;
}

export interface PushDocResult {
  status: "ok";
  /** 서버가 새로 만든지 update 한지. */
  action: "created" | "updated";
  /** Firestore 절대 경로. */
  path: string;
  /** ISO timestamp. */
  writtenAt: string;
}

export class NarniaError extends Error {
  public readonly status: number;
  public readonly code: string;

  constructor(status: number, code: string, message: string) {
    super(message);
    this.name = "NarniaError";
    this.status = status;
    this.code = code;
  }
}

export class Narnia {
  private readonly config: Required<Pick<NarniaConfig, "apiKey" | "accountId" | "baseUrl" | "defaultProjectId">> & {
    fetchImpl: typeof fetch;
  };

  constructor(config: NarniaConfig) {
    if (!config.apiKey) throw new Error("NarniaConfig.apiKey 가 필요합니다.");
    if (!config.accountId) throw new Error("NarniaConfig.accountId 가 필요합니다.");
    if (!config.baseUrl) throw new Error("NarniaConfig.baseUrl 가 필요합니다.");
    const fetchImpl = config.fetch ?? globalThis.fetch?.bind(globalThis);
    if (!fetchImpl) {
      throw new Error("fetch 구현체가 없습니다. node>=18 또는 폴리필 필요.");
    }
    this.config = {
      apiKey: config.apiKey,
      accountId: config.accountId,
      baseUrl: config.baseUrl.replace(/\/$/, ""),
      defaultProjectId: config.defaultProjectId ?? "general",
      fetchImpl,
    };
  }

  /**
   * 컨테이너에 hub 또는 node 한 건 push (upsert). 같은 slug 가 있으면 update.
   */
  async pushDoc(options: PushDocOptions): Promise<PushDocResult> {
    if (!options?.doc) throw new Error("PushDocOptions.doc 가 필요합니다.");
    const projectId = options.projectId ?? this.config.defaultProjectId;
    const url = `${this.config.baseUrl}/receiveDoc`;
    const response = await this.config.fetchImpl(url, {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        Authorization: `Bearer ${this.config.apiKey}`,
      },
      body: JSON.stringify({
        accountId: this.config.accountId,
        projectId,
        doc: options.doc,
      }),
    });

    let payload: unknown = null;
    try {
      payload = await response.json();
    } catch {
      // ignore — 서버가 JSON 안 줄 때
    }

    if (!response.ok) {
      const body = (payload ?? {}) as {
        code?: string;
        message?: string;
      };
      throw new NarniaError(
        response.status,
        body.code ?? "internal",
        body.message ?? `push 실패 (HTTP ${response.status})`,
      );
    }

    return payload as PushDocResult;
  }
}
