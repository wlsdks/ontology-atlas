/**
 * Developer Activity Ingest — GitHub App webhook receiver.
 *
 * GitHub App webhook URL should include the owning workspace account:
 *   https://<region>-<project>.cloudfunctions.net/receiveGitHubActivity?accountId=<accountId>
 *
 * The function verifies X-Hub-Signature-256 with GITHUB_WEBHOOK_SECRET and
 * writes a compact activity record to accounts/{accountId}/developerActivityEvents.
 */
import {
  createHmac,
  createSign,
  randomUUID,
  timingSafeEqual,
} from "node:crypto";
import { FieldValue, Timestamp, getFirestore } from "firebase-admin/firestore";
import { getApps, initializeApp } from "firebase-admin/app";
import { HttpsError, onCall, onRequest } from "firebase-functions/v2/https";
import { onSchedule } from "firebase-functions/v2/scheduler";
import { logger } from "firebase-functions/v2";
import { defineSecret } from "firebase-functions/params";

const REGION = "asia-northeast3";
const GITHUB_WEBHOOK_SECRET = defineSecret("GITHUB_WEBHOOK_SECRET");
const GITHUB_APP_ID = defineSecret("GITHUB_APP_ID");
const GITHUB_PRIVATE_KEY = defineSecret("GITHUB_PRIVATE_KEY");
const MAX_TARGET_SLUGS = 12;
const DELIVERIES_COLLECTION = "developerActivityDeliveries";
const EVENTS_COLLECTION = "developerActivityEvents";
const GITHUB_API_BASE_URL = "https://api.github.com";
const GITHUB_API_VERSION = "2026-03-10";
const DELIVERY_RETENTION_DAYS = 30;
const DELIVERY_CLEANUP_LIMIT = 250;

function ensureApp() {
  if (getApps().length === 0) initializeApp();
}

function db() {
  ensureApp();
  return getFirestore();
}

function trimString(value) {
  return typeof value === "string" ? value.trim() : "";
}

function jsonError(res, status, message) {
  res.status(status).json({ status: "error", message });
}

function deliveryDoc(accountId, deliveryId) {
  return db()
    .collection("accounts")
    .doc(accountId)
    .collection(DELIVERIES_COLLECTION)
    .doc(deliveryId || `local__${randomUUID()}`);
}

function base64Url(value) {
  return Buffer.from(value)
    .toString("base64")
    .replace(/=/g, "")
    .replace(/\+/g, "-")
    .replace(/\//g, "_");
}

function base64UrlJson(value) {
  return base64Url(JSON.stringify(value));
}

function normalizePrivateKey(value) {
  return trimString(value).replace(/\\n/g, "\n");
}

export function createGitHubAppJwt({
  appId,
  privateKey,
  nowSeconds = Math.floor(Date.now() / 1000),
}) {
  const normalizedAppId = trimString(appId);
  const normalizedPrivateKey = normalizePrivateKey(privateKey);
  if (!normalizedAppId || !normalizedPrivateKey) {
    throw new Error("GITHUB_APP_ID and GITHUB_PRIVATE_KEY are required");
  }

  const header = base64UrlJson({ alg: "RS256", typ: "JWT" });
  const payload = base64UrlJson({
    iat: nowSeconds - 60,
    exp: nowSeconds + 9 * 60,
    iss: normalizedAppId,
  });
  const signingInput = `${header}.${payload}`;
  const signature = createSign("RSA-SHA256")
    .update(signingInput)
    .sign(normalizedPrivateKey);
  return `${signingInput}.${base64Url(signature)}`;
}

async function githubAppRequest(path, { jwt, method = "GET", body } = {}) {
  const response = await fetch(`${GITHUB_API_BASE_URL}${path}`, {
    method,
    headers: {
      Accept: "application/vnd.github+json",
      Authorization: `Bearer ${jwt}`,
      "X-GitHub-Api-Version": GITHUB_API_VERSION,
      ...(body ? { "Content-Type": "application/json" } : {}),
    },
    ...(body ? { body: JSON.stringify(body) } : {}),
  });
  const text = await response.text();
  const payload = text ? parseJsonOrText(text) : null;
  if (!response.ok) {
    const message =
      typeof payload === "object" && payload && "message" in payload
        ? payload.message
        : text;
    throw new Error(
      `GitHub API ${method} ${path} failed (${response.status}): ${message}`,
    );
  }
  return payload;
}

function parseJsonOrText(text) {
  try {
    return JSON.parse(text);
  } catch {
    return text;
  }
}

async function resolveGitHubDeliveryApiId({ jwt, deliveryId }) {
  const normalizedDeliveryId = trimString(deliveryId);
  if (!normalizedDeliveryId) {
    throw new Error("deliveryId is required");
  }
  if (/^\d+$/.test(normalizedDeliveryId)) {
    return Number(normalizedDeliveryId);
  }

  const deliveries = await githubAppRequest(
    "/app/hook/deliveries?per_page=100",
    { jwt },
  );
  const match = Array.isArray(deliveries)
    ? deliveries.find((delivery) => {
        const id = delivery?.id;
        const guid = delivery?.guid;
        return (
          String(id) === normalizedDeliveryId ||
          String(guid) === normalizedDeliveryId
        );
      })
    : null;
  if (!match?.id) {
    throw new Error("GitHub delivery 목록에서 matching delivery 를 찾지 못했습니다.");
  }
  return match.id;
}

export async function redeliverGitHubWebhookDelivery({
  appId,
  privateKey,
  deliveryId,
}) {
  const jwt = createGitHubAppJwt({ appId, privateKey });
  const githubDeliveryApiId = await resolveGitHubDeliveryApiId({
    jwt,
    deliveryId,
  });
  await githubAppRequest(`/app/hook/deliveries/${githubDeliveryApiId}/attempts`, {
    jwt,
    method: "POST",
  });
  return { status: "requested", githubDeliveryApiId };
}

async function assertCanOperateAccount(request, accountId) {
  const email = trimString(request.auth?.token?.email);
  const uid = trimString(request.auth?.uid);
  if (!email || !uid) {
    throw new HttpsError("unauthenticated", "로그인이 필요합니다.");
  }

  const adminSnapshot = await db().collection("admins").doc(email).get();
  if (adminSnapshot.exists) return;

  const membershipSnapshot = await db()
    .collection("accountMemberships")
    .doc(`${uid}__${accountId}`)
    .get();
  if (!membershipSnapshot.exists) {
    throw new HttpsError(
      "permission-denied",
      "이 workspace 의 멤버만 실행할 수 있습니다.",
    );
  }
}

export function verifyGitHubSignature(rawBody, signatureHeader, secret) {
  const signature = trimString(signatureHeader);
  const webhookSecret = trimString(secret);
  if (!signature || !webhookSecret || !signature.startsWith("sha256=")) {
    return false;
  }

  const expected = `sha256=${createHmac("sha256", webhookSecret)
    .update(rawBody)
    .digest("hex")}`;
  const signatureBuffer = Buffer.from(signature, "utf8");
  const expectedBuffer = Buffer.from(expected, "utf8");
  return (
    signatureBuffer.length === expectedBuffer.length &&
    timingSafeEqual(signatureBuffer, expectedBuffer)
  );
}

export function docsVaultSlugFromPath(path) {
  const normalized = trimString(path).replace(/^\/+/, "");
  if (!normalized) return null;

  const withoutPrefix = normalized
    .replace(/^public\/docs-vault\//, "")
    .replace(/^docs\//, "");
  if (!withoutPrefix.endsWith(".md")) return null;

  const withoutExtension = withoutPrefix.replace(/\.md$/, "");
  if (withoutExtension === "README") return "README";
  return withoutExtension || null;
}

export function buildDeveloperActivityFromGitHub({
  eventName,
  payload,
  deliveryId,
}) {
  const repository = payload.repository?.full_name ?? payload.repository?.name;
  const sender = payload.sender?.login;
  const targetSlugs = targetSlugsFromPayload(eventName, payload);
  const primaryTarget = targetSlugs[0];

  if (eventName === "push") {
    const branch = trimString(payload.ref).replace(/^refs\/heads\//, "");
    const commitCount = Array.isArray(payload.commits) ? payload.commits.length : 0;
    return {
      id: deliveryId ? `github__${deliveryId}` : `github__${randomUUID()}`,
      source: "github",
      kind: "github.push",
      title: `${repository ?? "GitHub"} push${branch ? ` · ${branch}` : ""}`,
      summary:
        commitCount > 0
          ? `${commitCount} commit(s) touched ${targetSlugs.length} Docs Vault document(s).`
          : `${targetSlugs.length} Docs Vault document(s) touched.`,
      actor: sender,
      repository,
      branch: branch || undefined,
      href: payload.compare || payload.head_commit?.url,
      docSlug: primaryTarget,
      targetSlugs,
      unread: true,
    };
  }

  if (eventName === "pull_request") {
    const action = trimString(payload.action) || "updated";
    return {
      id: deliveryId ? `github__${deliveryId}` : `github__${randomUUID()}`,
      source: "github",
      kind: "github.pull_request",
      title: `PR ${action}: ${payload.pull_request?.title ?? repository ?? "GitHub"}`,
      summary: `${targetSlugs.length} Docs Vault document(s) may be affected.`,
      actor: sender,
      repository,
      branch: payload.pull_request?.head?.ref,
      href: payload.pull_request?.html_url,
      docSlug: primaryTarget,
      targetSlugs,
      unread: true,
    };
  }

  if (eventName === "issues" || eventName === "issue_comment") {
    const issue = payload.issue;
    return {
      id: deliveryId ? `github__${deliveryId}` : `github__${randomUUID()}`,
      source: "github",
      kind: "github.issue",
      title: `Issue ${payload.action ?? "updated"}: ${issue?.title ?? repository ?? "GitHub"}`,
      summary: `${targetSlugs.length} Docs Vault document(s) referenced.`,
      actor: sender,
      repository,
      href: issue?.html_url,
      docSlug: primaryTarget,
      targetSlugs,
      unread: true,
    };
  }

  return null;
}

export async function writeDeveloperActivityFromDelivery({
  accountId,
  eventName,
  deliveryId,
  payload,
  replayedBy,
}) {
  const activity = buildDeveloperActivityFromGitHub({
    eventName,
    payload,
    deliveryId,
  });

  if (!activity || activity.targetSlugs.length === 0) {
    await deliveryDoc(accountId, deliveryId).set(
      {
        accountId,
        eventName,
        deliveryId: deliveryId || null,
        status: "ignored",
        reason: "no Docs Vault document target",
        targetSlugs: [],
        repository: payload.repository?.full_name ?? payload.repository?.name ?? null,
        payload,
        updatedAt: FieldValue.serverTimestamp(),
        ...(replayedBy ? { replayedBy, replayedAt: FieldValue.serverTimestamp() } : {}),
      },
      { merge: true },
    );
    return {
      status: "ignored",
      reason: "no Docs Vault document target",
      targetSlugs: [],
    };
  }

  await db()
    .collection("accounts")
    .doc(accountId)
    .collection(EVENTS_COLLECTION)
    .doc(activity.id)
    .set({
      ...activity,
      accountId,
      eventName,
      deliveryId: deliveryId || null,
      createdAt: FieldValue.serverTimestamp(),
      receivedAt: FieldValue.serverTimestamp(),
      ...(replayedBy ? { replayedBy, replayedAt: FieldValue.serverTimestamp() } : {}),
    });

  await deliveryDoc(accountId, deliveryId).set(
    {
      accountId,
      eventName,
      deliveryId: deliveryId || null,
      status: "processed",
      reason: null,
      activityId: activity.id,
      targetSlugs: activity.targetSlugs,
      repository: activity.repository ?? null,
      actor: activity.actor ?? null,
      href: activity.href ?? null,
      payload,
      updatedAt: FieldValue.serverTimestamp(),
      ...(replayedBy ? { replayedBy, replayedAt: FieldValue.serverTimestamp() } : {}),
    },
    { merge: true },
  );

  return {
    status: "processed",
    id: activity.id,
    targetSlugs: activity.targetSlugs,
  };
}

function targetSlugsFromPayload(eventName, payload) {
  const paths = new Set();
  if (eventName === "push") {
    for (const commit of payload.commits ?? []) {
      for (const key of ["added", "modified", "removed"]) {
        for (const path of commit?.[key] ?? []) paths.add(path);
      }
    }
  }

  if (eventName === "pull_request") {
    const body = `${payload.pull_request?.title ?? ""}\n${payload.pull_request?.body ?? ""}`;
    for (const match of body.matchAll(/(?:docs|public\/docs-vault)\/[^\s)]+?\.md/g)) {
      paths.add(match[0]);
    }
  }

  if (eventName === "issues" || eventName === "issue_comment") {
    const body = `${payload.issue?.title ?? ""}\n${payload.issue?.body ?? ""}\n${payload.comment?.body ?? ""}`;
    for (const match of body.matchAll(/(?:docs|public\/docs-vault)\/[^\s)]+?\.md/g)) {
      paths.add(match[0]);
    }
  }

  return [...paths]
    .map(docsVaultSlugFromPath)
    .filter(Boolean)
    .filter((slug, index, list) => list.indexOf(slug) === index)
    .slice(0, MAX_TARGET_SLUGS);
}

export const receiveGitHubActivity = onRequest(
  {
    region: REGION,
    cors: false,
    maxInstances: 10,
    secrets: [GITHUB_WEBHOOK_SECRET],
  },
  async (req, res) => {
    if (req.method !== "POST") {
      jsonError(res, 405, "POST only");
      return;
    }

    const accountId =
      trimString(req.query.accountId) || trimString(req.get("X-Aslan-Account-Id"));
    if (!accountId) {
      jsonError(res, 400, "accountId required");
      return;
    }

    const rawBody = req.rawBody ?? Buffer.from(JSON.stringify(req.body ?? {}));
    const signature = req.get("X-Hub-Signature-256");
    if (!verifyGitHubSignature(rawBody, signature, GITHUB_WEBHOOK_SECRET.value())) {
      jsonError(res, 401, "invalid signature");
      return;
    }

    const eventName = trimString(req.get("X-GitHub-Event"));
    const deliveryId = trimString(req.get("X-GitHub-Delivery"));
    const payload = req.body ?? {};

    try {
      await deliveryDoc(accountId, deliveryId).set(
        {
          accountId,
          eventName,
          deliveryId: deliveryId || null,
          status: "received",
          repository: payload.repository?.full_name ?? payload.repository?.name ?? null,
          actor: payload.sender?.login ?? null,
          payload,
          receivedAt: FieldValue.serverTimestamp(),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
    } catch (err) {
      logger.warn("receiveGitHubActivity delivery log write failed", {
        accountId,
        eventName,
        deliveryId,
        error: err instanceof Error ? err.message : String(err),
      });
    }

    try {
      const result = await writeDeveloperActivityFromDelivery({
        accountId,
        eventName,
        deliveryId,
        payload,
      });

      res.status(result.status === "processed" ? 200 : 202).json(result);
    } catch (err) {
      await deliveryDoc(accountId, deliveryId).set(
        {
          accountId,
          eventName,
          deliveryId: deliveryId || null,
          status: "failed",
          reason: err instanceof Error ? err.message : String(err),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      logger.error("receiveGitHubActivity failed", {
        accountId,
        eventName,
        deliveryId,
        error: err instanceof Error ? err.message : String(err),
      });
      jsonError(res, 500, "internal error");
    }
  },
);

export const reprocessGitHubActivityDelivery = onCall(
  { region: REGION },
  async (request) => {
    ensureApp();

    const accountId = trimString(request.data?.accountId);
    const deliveryId = trimString(request.data?.deliveryId);
    if (!accountId || !deliveryId) {
      throw new HttpsError(
        "invalid-argument",
        "accountId 와 deliveryId 가 필요합니다.",
      );
    }

    await assertCanOperateAccount(request, accountId);

    const deliverySnapshot = await deliveryDoc(accountId, deliveryId).get();
    if (!deliverySnapshot.exists) {
      throw new HttpsError("not-found", "delivery 로그를 찾을 수 없습니다.");
    }

    const delivery = deliverySnapshot.data() ?? {};
    const eventName = trimString(delivery.eventName);
    const payload = delivery.payload;
    if (!eventName || !payload || typeof payload !== "object") {
      throw new HttpsError(
        "failed-precondition",
        "재처리할 payload 가 없습니다.",
      );
    }

    return writeDeveloperActivityFromDelivery({
      accountId,
      eventName,
      deliveryId,
      payload,
      replayedBy: trimString(request.auth?.token?.email),
    });
  },
);

export const redeliverGitHubActivityDelivery = onCall(
  {
    region: REGION,
    secrets: [GITHUB_APP_ID, GITHUB_PRIVATE_KEY],
  },
  async (request) => {
    ensureApp();

    const accountId = trimString(request.data?.accountId);
    const deliveryId = trimString(request.data?.deliveryId);
    if (!accountId || !deliveryId) {
      throw new HttpsError(
        "invalid-argument",
        "accountId 와 deliveryId 가 필요합니다.",
      );
    }

    await assertCanOperateAccount(request, accountId);

    const ref = deliveryDoc(accountId, deliveryId);
    const deliverySnapshot = await ref.get();
    if (!deliverySnapshot.exists) {
      throw new HttpsError("not-found", "delivery 로그를 찾을 수 없습니다.");
    }

    const delivery = deliverySnapshot.data() ?? {};
    const githubDeliveryId = trimString(delivery.deliveryId) || deliveryId;
    const requestedBy = trimString(request.auth?.token?.email);
    try {
      const result = await redeliverGitHubWebhookDelivery({
        appId: GITHUB_APP_ID.value(),
        privateKey: GITHUB_PRIVATE_KEY.value(),
        deliveryId: githubDeliveryId,
      });
      await ref.set(
        {
          githubDeliveryApiId: result.githubDeliveryApiId,
          githubRedeliveryStatus: "requested",
          githubRedeliveryError: null,
          githubRedeliveredAt: FieldValue.serverTimestamp(),
          ...(requestedBy ? { githubRedeliveredBy: requestedBy } : {}),
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      return result;
    } catch (err) {
      const message = err instanceof Error ? err.message : String(err);
      await ref.set(
        {
          githubRedeliveryStatus: "failed",
          githubRedeliveryError: message,
          updatedAt: FieldValue.serverTimestamp(),
        },
        { merge: true },
      );
      logger.warn("redeliverGitHubActivityDelivery failed", {
        accountId,
        deliveryId,
        error: message,
      });
      throw new HttpsError("internal", message);
    }
  },
);

export const pruneDeveloperActivityDeliveries = onSchedule(
  {
    region: REGION,
    schedule: "every 24 hours",
    timeZone: "Asia/Seoul",
  },
  async () => {
    ensureApp();
    const cutoff = Timestamp.fromMillis(
      Date.now() - DELIVERY_RETENTION_DAYS * 24 * 60 * 60 * 1000,
    );
    const snapshot = await db()
      .collectionGroup(DELIVERIES_COLLECTION)
      .where("updatedAt", "<", cutoff)
      .limit(DELIVERY_CLEANUP_LIMIT)
      .get();

    if (snapshot.empty) {
      logger.info("pruneDeveloperActivityDeliveries skipped: no stale docs");
      return;
    }

    const batch = db().batch();
    snapshot.docs.forEach((docSnapshot) => batch.delete(docSnapshot.ref));
    await batch.commit();
    logger.info("pruneDeveloperActivityDeliveries deleted stale deliveries", {
      deleted: snapshot.size,
      retentionDays: DELIVERY_RETENTION_DAYS,
    });
  },
);
