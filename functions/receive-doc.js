/**
 * M2 · POST /api/v1/docs — 외부 클라이언트 (CLI · CI · MCP) 가 워크스페이스
 * 컨테이너로 노드를 push 하는 HTTP endpoint.
 *
 * 인증: `Authorization: Bearer <api_key>` 헤더. 키는 `accounts/{accountId}/
 * apiKeys/{keyId}` 의 SHA-256(plaintext) 와 비교.
 *
 * Body (JSON):
 *   {
 *     "accountId": "stark",
 *     "projectId": "narnia",   // optional, default "general"
 *     "doc": {
 *       "slug": "iam-spec",
 *       "name": "IAM Spec",
 *       "isHub": false,        // optional, default false
 *       "description": "...",
 *       "detail": "...md...",
 *       "tags": [], "stack": [],
 *       "dependencies": [],
 *       "hubIds": ["iam-hub"],  // node 의 소속 hub
 *       "owner": "stark", "icon": "🛡",
 *       ...
 *     }
 *   }
 *
 * Response (200):
 *   {
 *     "status": "ok",
 *     "action": "created" | "updated",
 *     "path": "accounts/stark/workspaceProjects/narnia/hubs/iam-spec",
 *     "writtenAt": "2026-04-22T..."
 *   }
 *
 * Errors: 400 invalid_argument, 401 unauthorized, 403 forbidden, 500 internal.
 */
import { createHash } from "node:crypto";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { onRequest } from "firebase-functions/v2/https";
import { logger } from "firebase-functions/v2";

const REGION = "asia-northeast3";

// rate limit: API key 당 60 req / 60s (sliding minute, fixed window 구현).
// 모바일/CLI/CI batch sync 가 1초에 1건 수준이면 여유롭고, 실수/남용성 루프
// (fs.watch 무한, 버그 등) 는 확실히 차단되는 선.
const RATE_LIMIT_MAX = 60;
const RATE_LIMIT_WINDOW_MS = 60 * 1000;

function ensureApp() {
  if (getApps().length === 0) initializeApp();
}

function db() {
  ensureApp();
  return getFirestore();
}

function sha256Hex(input) {
  return createHash("sha256").update(input, "utf8").digest("hex");
}

function badRequest(res, code, message) {
  res.status(code).json({ status: "error", code: errorCodeFor(code), message });
}

function errorCodeFor(httpStatus) {
  switch (httpStatus) {
    case 400:
      return "invalid_argument";
    case 401:
      return "unauthorized";
    case 403:
      return "forbidden";
    case 404:
      return "not_found";
    case 429:
      return "rate_limited";
    default:
      return "internal";
  }
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

/**
 * API key 별 rate limit. fixed-window 60 req / 60s.
 *
 * 트랜잭션으로 읽기·증분을 원자화해서 두 요청이 동시에 읽어 같이 통과하는
 * race 를 막는다. Admin SDK 라 firestore.rules 의 필드 단위 update 제한
 * (iter 24 에서 revokedAt 만 허용하도록 좁힌 것) 은 여기 적용되지 않음.
 */
async function checkRateLimit(keyRef) {
  const now = Date.now();
  return db().runTransaction(async (tx) => {
    const snap = await tx.get(keyRef);
    const data = snap.data() ?? {};
    const windowStart =
      typeof data.rateWindowStart?.toMillis === "function"
        ? data.rateWindowStart.toMillis()
        : 0;
    const isNewWindow = now - windowStart > RATE_LIMIT_WINDOW_MS;
    const currentCount = isNewWindow ? 0 : Number(data.rateWindowCount) || 0;

    if (currentCount >= RATE_LIMIT_MAX) {
      const retryAfterMs = Math.max(0, windowStart + RATE_LIMIT_WINDOW_MS - now);
      return { limited: true, retryAfterMs };
    }

    if (isNewWindow) {
      tx.update(keyRef, {
        rateWindowStart: Timestamp.fromMillis(now),
        rateWindowCount: 1,
      });
    } else {
      tx.update(keyRef, {
        rateWindowCount: FieldValue.increment(1),
      });
    }
    return { limited: false };
  });
}

/**
 * Authorization 헤더 검증. 일치하는 키가 있고 revoke 안 됐으면 keyDoc 반환.
 * 일치 후 lastUsedAt / usageCount 갱신은 fire-and-forget.
 */
async function authenticateBearer(req, expectedAccountId) {
  const authHeader = req.get("Authorization") || req.get("authorization") || "";
  const match = authHeader.match(/^Bearer\s+(.+)$/i);
  if (!match) return { error: { status: 401, message: "Bearer 토큰 누락" } };
  const plaintext = match[1].trim();
  if (!plaintext) return { error: { status: 401, message: "Bearer 토큰 누락" } };

  const expectedHash = sha256Hex(plaintext);
  const snapshot = await db()
    .collection("accounts")
    .doc(expectedAccountId)
    .collection("apiKeys")
    .where("keyHash", "==", expectedHash)
    .limit(1)
    .get();

  if (snapshot.empty) {
    return { error: { status: 401, message: "유효하지 않은 키" } };
  }
  const keyDoc = snapshot.docs[0];
  const data = keyDoc.data();
  if (data.revokedAt) {
    return { error: { status: 401, message: "revoke 된 키" } };
  }

  // 사용량 갱신 — 실패해도 본 요청 영향 없음
  void keyDoc.ref
    .update({
      lastUsedAt: FieldValue.serverTimestamp(),
      usageCount: FieldValue.increment(1),
    })
    .catch((err) => logger.warn("apiKey usage update failed", err));

  return { keyDoc };
}

function buildPayload(doc, isHub) {
  // toFirestore 와 동일 shape — slug / createdAt / updatedAt 은 호출자가 부여
  const payload = {
    accountId: trimString(doc.accountId) || null,
    name: trimString(doc.name),
    nameEn: trimString(doc.nameEn) || undefined,
    category: trimString(doc.category) || "in-progress",
    status: trimString(doc.status) || "developing",
    description: trimString(doc.description),
    detail: typeof doc.detail === "string" ? doc.detail : undefined,
    tags: Array.isArray(doc.tags) ? doc.tags : [],
    stack: Array.isArray(doc.stack) ? doc.stack : [],
    links: Array.isArray(doc.links) ? doc.links : [],
    dependencies: Array.isArray(doc.dependencies) ? doc.dependencies : [],
    screenshots: Array.isArray(doc.screenshots) ? doc.screenshots : [],
    isHub,
    position: doc.position && typeof doc.position === "object"
      ? { x: Number(doc.position.x) || 0, y: Number(doc.position.y) || 0 }
      : { x: 0, y: 0 },
    timeline: doc.timeline && typeof doc.timeline === "object" ? doc.timeline : {},
    owner: trimString(doc.owner) || undefined,
    icon: trimString(doc.icon) || undefined,
    progress: typeof doc.progress === "number" ? doc.progress : undefined,
  };
  // Node 일 때만 hubIds
  if (!isHub && Array.isArray(doc.hubIds)) {
    payload.hubIds = doc.hubIds;
  }
  // metadata 는 자유 키 (presence 확장 등)
  if (doc.metadata && typeof doc.metadata === "object") {
    payload.metadata = doc.metadata;
  }
  // undefined 제거 (Firestore 가 거부)
  for (const key of Object.keys(payload)) {
    if (payload[key] === undefined) delete payload[key];
  }
  return payload;
}

export const receiveDoc = onRequest(
  { region: REGION, cors: true, maxInstances: 10 },
  async (req, res) => {
    if (req.method === "OPTIONS") {
      res.status(204).send("");
      return;
    }
    if (req.method !== "POST") {
      badRequest(res, 400, "POST 만 허용");
      return;
    }

    const body = req.body || {};
    const accountId = trimString(body.accountId);
    if (!accountId) {
      badRequest(res, 400, "accountId 필요");
      return;
    }
    const projectId = trimString(body.projectId) || "general";
    const doc = body.doc;
    if (!doc || typeof doc !== "object") {
      badRequest(res, 400, "doc 객체 필요");
      return;
    }
    const slug = trimString(doc.slug);
    const name = trimString(doc.name);
    if (!slug) {
      badRequest(res, 400, "doc.slug 필요");
      return;
    }
    if (!name) {
      badRequest(res, 400, "doc.name 필요");
      return;
    }

    // 인증
    const auth = await authenticateBearer(req, accountId);
    if (auth.error) {
      badRequest(res, auth.error.status, auth.error.message);
      return;
    }

    // rate limit — 인증 통과 후, write 전. 429 시 Retry-After 초 단위 힌트.
    const rateCheck = await checkRateLimit(auth.keyDoc.ref);
    if (rateCheck.limited) {
      const retryAfterSec = Math.ceil(rateCheck.retryAfterMs / 1000);
      res.set("Retry-After", String(retryAfterSec));
      logger.warn("receiveDoc rate-limited", {
        accountId,
        keyId: auth.keyDoc.id,
        retryAfterSec,
      });
      badRequest(
        res,
        429,
        `API 키 ${RATE_LIMIT_MAX} req/분 한도 초과. ${retryAfterSec}초 후 재시도.`,
      );
      return;
    }

    const isHub = doc.isHub === true;
    const subcollection = isHub ? "hubs" : "nodes";

    const ref = db()
      .collection("accounts")
      .doc(accountId)
      .collection("workspaceProjects")
      .doc(projectId)
      .collection(subcollection)
      .doc(slug);

    try {
      const existing = await ref.get();
      const action = existing.exists ? "updated" : "created";
      const payload = {
        ...buildPayload(doc, isHub),
        updatedAt: FieldValue.serverTimestamp(),
      };
      if (!existing.exists) {
        payload.createdAt = FieldValue.serverTimestamp();
      }
      await ref.set(payload, { merge: true });

      const path = `accounts/${accountId}/workspaceProjects/${projectId}/${subcollection}/${slug}`;
      logger.info("receiveDoc", {
        accountId,
        projectId,
        slug,
        isHub,
        action,
        keyId: auth.keyDoc.id,
      });

      res.status(200).json({
        status: "ok",
        action,
        path,
        writtenAt: new Date().toISOString(),
      });
    } catch (err) {
      logger.error("receiveDoc failed", {
        accountId,
        projectId,
        slug,
        error: err instanceof Error ? err.message : String(err),
      });
      badRequest(res, 500, err instanceof Error ? err.message : "internal error");
    }
  },
);
