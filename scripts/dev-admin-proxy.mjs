#!/usr/bin/env node

import fs from 'node:fs/promises';
import { readFileSync } from 'node:fs';
import http from 'node:http';
import { createRequire } from 'node:module';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { getApps, initializeApp } from 'firebase-admin/app';

function readLocalEnvValue(key) {
  for (const fileName of ['.env.local', '.env']) {
    try {
      const content = readFileSync(path.join(process.cwd(), fileName), 'utf8');
      const line = content
        .split('\n')
        .map((entry) => entry.trim())
        .find((entry) => entry.startsWith(`${key}=`));
      if (line) {
        return line.slice(key.length + 1).trim();
      }
    } catch {}
  }

  return '';
}

function resolveProxyPort() {
  const explicitPort = process.env.DEV_ADMIN_PROXY_PORT?.trim();
  if (explicitPort) return explicitPort;

  const configuredOrigin =
    process.env.NEXT_PUBLIC_DEV_ADMIN_PROXY_ORIGIN?.trim() ||
    readLocalEnvValue('NEXT_PUBLIC_DEV_ADMIN_PROXY_ORIGIN');
  if (!configuredOrigin) return '4317';

  try {
    const url = new URL(configuredOrigin);
    return url.port || '4317';
  } catch {
    return '4317';
  }
}

const PORT = Number(resolveProxyPort());
const PROJECT_ID =
  process.env.NEXT_PUBLIC_FIREBASE_PROJECT_ID ||
  readLocalEnvValue('NEXT_PUBLIC_FIREBASE_PROJECT_ID') ||
  process.env.GCLOUD_PROJECT ||
  readLocalEnvValue('GCLOUD_PROJECT') ||
  'aslan-project-map';
const FIREBASE_CLI_CREDS = path.join(os.homedir(), '.config/configstore/firebase-tools.json');
const TAXONOMY_COLLECTIONS = new Set(['categories', 'statuses']);
const DEFAULT_ALLOWED_ORIGINS = [
  'http://localhost:3000',
  'http://127.0.0.1:3000',
  'http://localhost:3100',
  'http://127.0.0.1:3100',
];
const KNOWLEDGE_COLLECTIONS = {
  documents: 'knowledgeDocuments',
  versions: 'knowledgeDocumentVersions',
  jobs: 'knowledgeExtractionJobs',
  outputs: 'knowledgeExtractionOutputs',
  evidence: 'knowledgeEvidence',
  reviews: 'knowledgeReviews',
  approvalEvents: 'knowledgeApprovalEvents',
  approvedNodes: 'knowledgeApprovedNodes',
  approvedEdges: 'knowledgeApprovedEdges',
  publishes: 'knowledgePublishes',
  publicMeta: 'knowledgePublicMeta',
  publicNodes: 'knowledgePublicNodes',
  publicEdges: 'knowledgePublicEdges',
};
const ALLOWED_ORIGINS = new Set(
  (process.env.ADMIN_PROXY_ALLOWED_ORIGINS ?? DEFAULT_ALLOWED_ORIGINS.join(','))
    .split(',')
    .map((value) => value.trim())
    .filter(Boolean),
);
const require = createRequire(import.meta.url);
const { clientId, clientSecret } = require('firebase-tools/lib/api');

function normalizeAccountId(value) {
  const normalized = typeof value === 'string' ? value.trim() : '';
  return normalized || null;
}

process.env.GCLOUD_PROJECT ||= PROJECT_ID;
process.env.FIRESTORE_EMULATOR_HOST ||=
  readLocalEnvValue('FIRESTORE_EMULATOR_HOST') ||
  readLocalEnvValue('NEXT_PUBLIC_FIRESTORE_EMULATOR_HOST');
process.env.FIREBASE_STORAGE_EMULATOR_HOST ||=
  readLocalEnvValue('FIREBASE_STORAGE_EMULATOR_HOST') ||
  readLocalEnvValue('NEXT_PUBLIC_FIREBASE_STORAGE_EMULATOR_HOST');
process.env.FIREBASE_CONFIG ||= JSON.stringify({
  projectId: PROJECT_ID,
  storageBucket: getBucketName(),
});

const { FieldValue, getFirestore } = await import('firebase-admin/firestore');
const { getStorage } = await import('firebase-admin/storage');

function getFirestoreOrigin() {
  return process.env.FIRESTORE_EMULATOR_HOST
    ? `http://${process.env.FIRESTORE_EMULATOR_HOST}`
    : 'https://firestore.googleapis.com';
}

function writeJson(response, status, payload, origin) {
  response.writeHead(status, {
    'Content-Type': 'application/json',
    'Access-Control-Allow-Origin': origin && ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0],
    'Access-Control-Allow-Methods': 'GET, PUT, PATCH, DELETE, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type',
  });
  response.end(JSON.stringify(payload));
}

function getAdminDb() {
  const existing = getApps()[0];
  const app = existing ?? initializeApp({ projectId: PROJECT_ID });
  return getFirestore(app);
}

async function getAccessToken() {
  const raw = await fs.readFile(FIREBASE_CLI_CREDS, 'utf8');
  const credentials = JSON.parse(raw);
  const token = credentials.tokens?.access_token;
  const expiresAt = credentials.tokens?.expires_at;
  const refreshToken = credentials.tokens?.refresh_token;

  if (!token && !refreshToken) {
    throw new Error('Firebase CLI access token이 없습니다. `firebase login`을 먼저 실행하세요.');
  }
  if (!expiresAt || Date.now() < expiresAt) {
    return token;
  }

  if (!refreshToken) {
    throw new Error('Firebase CLI refresh token이 없습니다. `firebase login --reauth`로 갱신하세요.');
  }

  const refreshed = await refreshAccessToken(refreshToken);
  credentials.tokens = {
    ...credentials.tokens,
    access_token: refreshed.access_token,
    expires_at: Date.now() + refreshed.expires_in * 1000,
    expires_in: refreshed.expires_in,
    token_type: refreshed.token_type ?? credentials.tokens?.token_type,
  };
  await fs.writeFile(FIREBASE_CLI_CREDS, JSON.stringify(credentials, null, 2));
  return refreshed.access_token;
}

async function refreshAccessToken(refreshToken) {
  const body = new URLSearchParams({
    refresh_token: refreshToken,
    client_id: clientId(),
    client_secret: clientSecret(),
    grant_type: 'refresh_token',
  });

  const response = await fetch('https://www.googleapis.com/oauth2/v3/token', {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
    body,
  });

  if (!response.ok) {
    throw new Error(`Firebase CLI access token 갱신 실패 (${response.status})`);
  }

  return response.json();
}

function toValue(value) {
  if (value === null || value === undefined) return { nullValue: null };
  if (typeof value === 'string') return { stringValue: value };
  if (typeof value === 'boolean') return { booleanValue: value };
  if (typeof value === 'number') {
    return Number.isInteger(value) ? { integerValue: String(value) } : { doubleValue: value };
  }
  if (Array.isArray(value)) return { arrayValue: { values: value.map(toValue) } };
  if (typeof value === 'object') {
    return {
      mapValue: {
        fields: Object.fromEntries(Object.entries(value).map(([key, nested]) => [key, toValue(nested)])),
      },
    };
  }
  throw new Error(`Unsupported value type: ${typeof value}`);
}

function toFirestoreFields(fields) {
  return Object.fromEntries(
    Object.entries(fields).map(([key, value]) => {
      if (value && typeof value === 'object' && '_ts' in value) {
        return [key, { timestampValue: value._ts }];
      }
      return [key, toValue(value)];
    }),
  );
}

function inflateSpecialValues(value) {
  if (Array.isArray(value)) {
    return value.map((item) => inflateSpecialValues(item));
  }

  if (value && typeof value === 'object') {
    if (Object.keys(value).length === 1 && '_ts' in value) {
      return new Date(value._ts);
    }

    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        inflateSpecialValues(nested),
      ]),
    );
  }

  return value;
}

function serializeForJson(value) {
  if (value instanceof Date) {
    return value.toISOString();
  }

  if (
    value &&
    typeof value === 'object' &&
    'toDate' in value &&
    typeof value.toDate === 'function'
  ) {
    return value.toDate().toISOString();
  }

  if (Array.isArray(value)) {
    return value.map((item) => serializeForJson(item));
  }

  if (value && typeof value === 'object') {
    return Object.fromEntries(
      Object.entries(value).map(([key, nested]) => [
        key,
        serializeForJson(nested),
      ]),
    );
  }

  return value;
}

function fromFirestoreValue(value) {
  if ('nullValue' in value) return null;
  if ('stringValue' in value) return value.stringValue;
  if ('booleanValue' in value) return value.booleanValue;
  if ('integerValue' in value) return Number(value.integerValue);
  if ('doubleValue' in value) return value.doubleValue;
  if ('timestampValue' in value) return value.timestampValue;
  if ('arrayValue' in value) {
    return (value.arrayValue.values ?? []).map((item) => fromFirestoreValue(item));
  }
  if ('mapValue' in value) {
    return Object.fromEntries(
      Object.entries(value.mapValue.fields ?? {}).map(([key, nested]) => [
        key,
        fromFirestoreValue(nested),
      ]),
    );
  }
  return undefined;
}

async function remoteDocumentExists(token, collection, id) {
  const url = `${getFirestoreOrigin()}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`문서 확인 실패 (${response.status})`);
  }
  return true;
}

async function upsertDocumentRemote(token, collection, id, payload) {
  const exists = await remoteDocumentExists(token, collection, id);
  const now = new Date().toISOString();
  const url = `${getFirestoreOrigin()}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: 'PATCH',
    headers: {
      Authorization: `Bearer ${token}`,
      'Content-Type': 'application/json',
    },
    body: JSON.stringify({
      fields: toFirestoreFields({
        ...payload,
        ...(exists ? {} : { createdAt: { _ts: now } }),
        updatedAt: { _ts: now },
      }),
    }),
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function deleteDocumentRemote(token, collection, id) {
  const url = `${getFirestoreOrigin()}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${collection}/${encodeURIComponent(id)}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function deleteDocumentRemoteByPath(token, path) {
  const url = `${getFirestoreOrigin()}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`;
  const response = await fetch(url, {
    method: 'DELETE',
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

function getProjectsCollectionPath(accountId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? `accounts/${encodeURIComponent(normalizedAccountId)}/projects`
    : 'projects';
}

function getProjectDocumentPath(accountId, slug) {
  return `${getProjectsCollectionPath(accountId)}/${encodeURIComponent(slug)}`;
}

function projectsCollectionAdmin(accountId) {
  const db = getAdminDb();
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? db.collection('accounts').doc(normalizedAccountId).collection('projects')
    : db.collection('projects');
}

async function upsertProjectRemote(token, slug, payload, accountId) {
  const path = getProjectDocumentPath(accountId, slug);
  const exists = await remoteDocumentExistsByPath(token, path);
  const now = new Date().toISOString();
  const response = await fetch(
    `${getFirestoreOrigin()}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
    {
      method: 'PATCH',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        fields: toFirestoreFields({
          ...payload,
          ...(normalizeAccountId(accountId) ? { accountId: normalizeAccountId(accountId) } : {}),
          ...(exists ? {} : { createdAt: { _ts: now } }),
          updatedAt: { _ts: now },
        }),
      }),
    },
  );
  if (!response.ok) {
    throw new Error(await response.text());
  }
}

async function remoteDocumentExistsByPath(token, path) {
  const response = await fetch(
    `${getFirestoreOrigin()}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${path}`,
    {
      headers: { Authorization: `Bearer ${token}` },
    },
  );
  if (response.status === 404) return false;
  if (!response.ok) {
    throw new Error(`문서 확인 실패 (${response.status})`);
  }
  return true;
}

async function updateProjectPositionsRemote(token, positions, accountId) {
  for (const update of positions) {
    await upsertProjectRemote(token, update.slug, {
      position: update.position,
    }, accountId);
  }
}

async function upsertDocumentAdmin(collection, id, payload) {
  const db = getAdminDb();
  const ref = db.collection(collection).doc(id);
  const snapshot = await ref.get();
  const normalizedPayload = inflateSpecialValues(payload);
  await ref.set(
    {
      ...normalizedPayload,
      updatedAt: FieldValue.serverTimestamp(),
      ...(snapshot.exists ? {} : { createdAt: FieldValue.serverTimestamp() }),
    },
    { merge: true },
  );
}

async function deleteDocumentAdmin(collection, id) {
  const db = getAdminDb();
  await db.collection(collection).doc(id).delete();
}

async function updateProjectPositionsAdmin(positions, accountId) {
  const batch = getAdminDb().batch();
  const collectionRef = projectsCollectionAdmin(accountId);
  for (const update of positions) {
    batch.set(
      collectionRef.doc(update.slug),
      {
        ...(normalizeAccountId(accountId) ? { accountId: normalizeAccountId(accountId) } : {}),
        position: update.position,
        updatedAt: FieldValue.serverTimestamp(),
      },
      { merge: true },
    );
  }
  await batch.commit();
}

async function listProjectsAdmin(accountId) {
  const snapshot = await projectsCollectionAdmin(accountId).get();
  return snapshot.docs.map((doc) => ({
    slug: doc.id,
    ...serializeForJson(doc.data()),
  }));
}

async function listProjectsRemote(token, accountId) {
  const projects = [];
  let pageToken = '';

  while (true) {
    const url = new URL(
      `${getFirestoreOrigin()}/v1/projects/${PROJECT_ID}/databases/(default)/documents/${getProjectsCollectionPath(accountId)}`,
    );
    url.searchParams.set('pageSize', '500');
    if (pageToken) {
      url.searchParams.set('pageToken', pageToken);
    }

    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!response.ok) {
      throw new Error(`프로젝트 목록 조회 실패 (${response.status})`);
    }

    const data = await response.json();
    for (const doc of data.documents ?? []) {
      projects.push({
        slug: doc.name.split('/').pop(),
        ...Object.fromEntries(
          Object.entries(doc.fields ?? {}).map(([key, value]) => [
            key,
            fromFirestoreValue(value),
          ]),
        ),
      });
    }

    if (!data.nextPageToken) {
      break;
    }
    pageToken = data.nextPageToken;
  }

  return projects;
}

function getBucketName() {
  return (
    process.env.NEXT_PUBLIC_FIREBASE_STORAGE_BUCKET ||
    `${PROJECT_ID}.firebasestorage.app`
  );
}

async function writeKnowledgeMarkdown(storagePath, markdown) {
  const bucket = getStorage().bucket(getBucketName());
  await bucket.file(storagePath).save(markdown, {
    contentType: 'text/markdown; charset=utf-8',
  });
}

async function readKnowledgeMarkdown(storagePath) {
  const bucket = getStorage().bucket(getBucketName());
  const [contents] = await bucket.file(storagePath).download();
  return contents.toString('utf8');
}

function normalizeKnowledgeJobStatus(status) {
  return typeof status === 'string' ? status.trim() : '';
}

function buildKnowledgeIdempotencyKey(documentVersionId, extractorVersion) {
  return `${documentVersionId}:${extractorVersion}`;
}

function knowledgeDocumentsCollectionAdmin(accountId) {
  const db = getAdminDb();
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? db.collection('accounts').doc(normalizedAccountId).collection(KNOWLEDGE_COLLECTIONS.documents)
    : db.collection(KNOWLEDGE_COLLECTIONS.documents);
}

function knowledgeVersionsCollectionAdmin(accountId) {
  const db = getAdminDb();
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? db.collection('accounts').doc(normalizedAccountId).collection(KNOWLEDGE_COLLECTIONS.versions)
    : db.collection(KNOWLEDGE_COLLECTIONS.versions);
}

function buildKnowledgeStoragePath(accountId, documentId, versionId) {
  const normalizedAccountId = normalizeAccountId(accountId);
  return normalizedAccountId
    ? `accounts/${normalizedAccountId}/knowledge-documents/${documentId}/${versionId}.md`
    : `knowledge-documents/${documentId}/${versionId}.md`;
}

async function listCollectionByFieldAdmin(collection, field, value, accountId) {
  const db = getAdminDb();
  let ref = db.collection(collection).where(field, '==', value);
  const normalizedAccountId = normalizeAccountId(accountId);
  if (normalizedAccountId) {
    ref = ref.where('accountId', '==', normalizedAccountId);
  }
  const snapshot = await ref.get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...serializeForJson(doc.data()),
  }));
}

async function getKnowledgeDocumentAdmin(id, accountId) {
  const snapshot = await knowledgeDocumentsCollectionAdmin(accountId).doc(id).get();
  if (!snapshot.exists) return null;
  return {
    id: snapshot.id,
    ...serializeForJson(snapshot.data()),
  };
}

async function listKnowledgeDocumentsAdmin(accountId) {
  const snapshot = await knowledgeDocumentsCollectionAdmin(accountId)
    .orderBy('updatedAt', 'desc')
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...serializeForJson(doc.data()),
  }));
}

async function listKnowledgeVersionsAdmin(documentId, accountId) {
  const snapshot = await knowledgeVersionsCollectionAdmin(accountId)
    .where('documentId', '==', documentId)
    .get();
  return snapshot.docs.map((doc) => ({
    id: doc.id,
    ...serializeForJson(doc.data()),
  }));
}

async function listKnowledgeJobsAdmin(documentId, accountId) {
  return listCollectionByFieldAdmin(
    KNOWLEDGE_COLLECTIONS.jobs,
    'documentId',
    documentId,
    accountId,
  );
}

async function listKnowledgeOutputsAdmin(documentId, accountId) {
  return listCollectionByFieldAdmin(
    KNOWLEDGE_COLLECTIONS.outputs,
    'documentId',
    documentId,
    accountId,
  );
}

async function listKnowledgeEvidenceAdmin(documentId, accountId) {
  return listCollectionByFieldAdmin(
    KNOWLEDGE_COLLECTIONS.evidence,
    'documentId',
    documentId,
    accountId,
  );
}

async function createKnowledgeDocumentAdmin(input) {
  const db = getAdminDb();
  const accountId = normalizeAccountId(input.accountId);
  const storagePath =
    input.version.storagePath ||
    buildKnowledgeStoragePath(accountId, input.documentId, input.versionId);
  await writeKnowledgeMarkdown(storagePath, input.rawMarkdown);

  const batch = db.batch();
  batch.set(knowledgeDocumentsCollectionAdmin(accountId).doc(input.documentId), {
    ...inflateSpecialValues(input.document),
    ...(accountId ? { accountId } : {}),
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  batch.set(knowledgeVersionsCollectionAdmin(accountId).doc(input.versionId), {
    ...inflateSpecialValues({
      ...input.version,
      storagePath,
      ...(accountId ? { accountId } : {}),
    }),
    createdAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

async function createKnowledgeDocumentVersionAdmin(input) {
  const db = getAdminDb();
  const accountId = normalizeAccountId(input.accountId);
  const storagePath =
    input.version.storagePath ||
    buildKnowledgeStoragePath(accountId, input.documentId, input.versionId);
  await writeKnowledgeMarkdown(storagePath, input.rawMarkdown);

  const batch = db.batch();
  batch.set(knowledgeVersionsCollectionAdmin(accountId).doc(input.versionId), {
    ...inflateSpecialValues({
      ...input.version,
      storagePath,
      ...(accountId ? { accountId } : {}),
    }),
    createdAt: FieldValue.serverTimestamp(),
  });
  batch.update(knowledgeDocumentsCollectionAdmin(accountId).doc(input.documentId), {
    updatedAt: FieldValue.serverTimestamp(),
  });
  await batch.commit();
}

async function setKnowledgeCurrentVersionAdmin(input) {
  const accountId = normalizeAccountId(input.accountId);
  await knowledgeDocumentsCollectionAdmin(accountId).doc(input.documentId).update({
    title: input.title,
    kind: input.kind,
    projectIds: input.projectIds,
    currentVersionId: input.currentVersionId,
    updatedAt: FieldValue.serverTimestamp(),
  });
}

async function enqueueKnowledgeExtractionJobAdmin(input) {
  const db = getAdminDb();
  const accountId = normalizeAccountId(input.accountId);
  const extractorVersion = input.extractorVersion || 'gemini-v1';
  const idempotencyKey = buildKnowledgeIdempotencyKey(
    input.documentVersionId,
    extractorVersion,
  );
  let existingQuery = db
    .collection(KNOWLEDGE_COLLECTIONS.jobs)
    .where('idempotencyKey', '==', idempotencyKey)
    .limit(5);
  if (accountId) {
    existingQuery = existingQuery.where('accountId', '==', accountId);
  }
  const existingSnapshot = await existingQuery.get();
  const existingReusable = existingSnapshot.docs
    .map((doc) => ({ id: doc.id, ...doc.data() }))
    .find((job) =>
      ['queued', 'leased', 'processing', 'succeeded'].includes(
        normalizeKnowledgeJobStatus(job.status),
      ),
    );

  if (existingReusable) {
    return {
      jobId: existingReusable.id,
      created: false,
      status: existingReusable.status,
      idempotencyKey,
    };
  }

  const jobId = `job-${randomUUID()}`;
  await db.collection(KNOWLEDGE_COLLECTIONS.jobs).doc(jobId).set({
    ...(accountId ? { accountId } : {}),
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    extractorVersion,
    idempotencyKey,
    status: 'queued',
    attemptCount: 0,
    maxAttempts: 3,
    retryable: true,
    generation: 0,
    requestedBy: input.requestedBy || 'dev-admin@local',
    createdAt: FieldValue.serverTimestamp(),
    updatedAt: FieldValue.serverTimestamp(),
  });
  await knowledgeDocumentsCollectionAdmin(accountId).doc(input.documentId).update({
    latestJobStatus: 'queued',
    status: 'processing',
    updatedAt: FieldValue.serverTimestamp(),
  });

  setTimeout(async () => {
    try {
      const { processExtractionJobCore } = await import('../functions/index.js');
      await processExtractionJobCore(jobId, accountId);
    } catch (error) {
      console.error('[dev-admin-proxy] knowledge processing failed', error);
    }
  }, 0);

  return {
    jobId,
    created: true,
    status: 'queued',
    idempotencyKey,
  };
}

async function approveKnowledgeOutputAdmin(input) {
  const { applyReviewActionCore } = await import('../functions/index.js');
  return applyReviewActionCore({
    accountId: normalizeAccountId(input.accountId),
    documentId: input.documentId,
    documentVersionId: input.documentVersionId,
    outputId: input.outputId,
    requestedBy: 'dev-admin@local',
  });
}

async function publishKnowledgeProjectionAdmin(input) {
  const { publishKnowledgeProjectionCore } = await import('../functions/index.js');
  return publishKnowledgeProjectionCore({
    accountId: normalizeAccountId(input.accountId),
    initiatedBy: 'dev-admin@local',
  });
}

async function withWriteBackend(fnAdmin, fnRemote) {
  if (process.env.FIRESTORE_EMULATOR_HOST) {
    return fnAdmin();
  }
  const token = await getAccessToken();
  return fnRemote(token);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) {
    chunks.push(chunk);
  }
  if (chunks.length === 0) return {};
  return JSON.parse(Buffer.concat(chunks).toString('utf8'));
}

const server = http.createServer(async (request, response) => {
  const origin = request.headers.origin;
  const parsedUrl = new URL(request.url ?? '/', 'http://127.0.0.1');
  const pathname = parsedUrl.pathname;
  const accountId = normalizeAccountId(parsedUrl.searchParams.get('account'));

  if (request.method === 'GET' && pathname === '/health') {
    writeJson(response, 200, { ok: true, projectId: PROJECT_ID }, origin);
    return;
  }

  if (request.method === 'OPTIONS') {
    writeJson(response, 204, {}, origin);
    return;
  }

  if (!origin || !ALLOWED_ORIGINS.has(origin)) {
    writeJson(response, 403, { error: 'Forbidden origin.' }, origin);
    return;
  }

  const taxonomyMatch = pathname.match(/^\/dev-admin\/taxonomy\/([^/]+)\/([^/]+)$/);
  const projectPositionsPath = pathname === '/dev-admin/projects/positions';
  const projectMatch = pathname.match(/^\/dev-admin\/projects\/([^/]+)$/);
  const knowledgeDocumentMatch = pathname.match(/^\/dev-admin\/knowledge\/documents\/([^/]+)$/);
  const knowledgeVersionsMatch = pathname.match(
    /^\/dev-admin\/knowledge\/documents\/([^/]+)\/versions$/,
  );
  const knowledgeCurrentVersionMatch = pathname.match(
    /^\/dev-admin\/knowledge\/documents\/([^/]+)\/current-version$/,
  );
  const knowledgeJobsMatch = pathname.match(
    /^\/dev-admin\/knowledge\/documents\/([^/]+)\/jobs$/,
  );
  const knowledgeOutputsMatch = pathname.match(
    /^\/dev-admin\/knowledge\/documents\/([^/]+)\/outputs$/,
  );
  const knowledgeEvidenceMatch = pathname.match(
    /^\/dev-admin\/knowledge\/documents\/([^/]+)\/evidence$/,
  );

  try {
    if (taxonomyMatch) {
      const [, collection, rawId] = taxonomyMatch;
      const id = decodeURIComponent(rawId);
      if (!TAXONOMY_COLLECTIONS.has(collection)) {
        writeJson(response, 404, { error: 'Unsupported collection.' }, origin);
        return;
      }

      if (request.method === 'PUT') {
        const payload = await readJsonBody(request);
        await withWriteBackend(
          () => upsertDocumentAdmin(collection, id, payload),
          (token) => upsertDocumentRemote(token, collection, id, payload),
        );
        writeJson(response, 200, { ok: true }, origin);
        return;
      }

      if (request.method === 'DELETE') {
        await withWriteBackend(
          () => deleteDocumentAdmin(collection, id),
          (token) => deleteDocumentRemote(token, collection, id),
        );
        writeJson(response, 200, { ok: true }, origin);
        return;
      }

      writeJson(response, 405, { error: 'Method not allowed.' }, origin);
      return;
    }

    if (projectPositionsPath) {
      if (request.method !== 'PATCH') {
        writeJson(response, 405, { error: 'Method not allowed.' }, origin);
        return;
      }
      const body = await readJsonBody(request);
      const positions = Array.isArray(body.positions) ? body.positions : [];
      await withWriteBackend(
        () => updateProjectPositionsAdmin(positions, accountId),
        (token) => updateProjectPositionsRemote(token, positions, accountId),
      );
      writeJson(response, 200, { ok: true }, origin);
      return;
    }

    if (pathname === '/dev-admin/projects' && request.method === 'GET') {
      const projects = await withWriteBackend(
        () => listProjectsAdmin(accountId),
        (token) => listProjectsRemote(token, accountId),
      );
      writeJson(response, 200, projects, origin);
      return;
    }

    if (pathname === '/dev-admin/knowledge/documents' && request.method === 'GET') {
      const documents = await listKnowledgeDocumentsAdmin(accountId);
      writeJson(response, 200, documents, origin);
      return;
    }

    if (pathname === '/dev-admin/knowledge/documents' && request.method === 'POST') {
      const payload = await readJsonBody(request);
      await createKnowledgeDocumentAdmin({ ...payload, accountId });
      writeJson(response, 200, { ok: true }, origin);
      return;
    }

    if (pathname === '/dev-admin/knowledge/jobs/enqueue' && request.method === 'POST') {
      const payload = await readJsonBody(request);
      const result = await enqueueKnowledgeExtractionJobAdmin({ ...payload, accountId });
      writeJson(response, 200, result, origin);
      return;
    }

    if (pathname === '/dev-admin/knowledge/reviews/approve' && request.method === 'POST') {
      const payload = await readJsonBody(request);
      const result = await approveKnowledgeOutputAdmin({ ...payload, accountId });
      writeJson(response, 200, result, origin);
      return;
    }

    if (pathname === '/dev-admin/knowledge/publish' && request.method === 'POST') {
      const payload = await readJsonBody(request);
      const result = await publishKnowledgeProjectionAdmin({ ...payload, accountId });
      writeJson(response, 200, result, origin);
      return;
    }

    if (pathname === '/dev-admin/knowledge/markdown' && request.method === 'GET') {
      const storagePath = new URL(request.url ?? '/', 'http://127.0.0.1')
        .searchParams.get('storagePath');
      if (!storagePath) {
        writeJson(response, 400, { error: 'storagePath is required.' }, origin);
        return;
      }
      const markdown = await readKnowledgeMarkdown(storagePath);
      response.writeHead(200, {
        'Content-Type': 'text/markdown; charset=utf-8',
        'Access-Control-Allow-Origin':
          origin && ALLOWED_ORIGINS.has(origin) ? origin : [...ALLOWED_ORIGINS][0],
      });
      response.end(markdown);
      return;
    }

    if (knowledgeDocumentMatch && request.method === 'GET') {
      const documentId = decodeURIComponent(knowledgeDocumentMatch[1]);
      const document = await getKnowledgeDocumentAdmin(documentId, accountId);
      writeJson(response, 200, document, origin);
      return;
    }

    if (knowledgeVersionsMatch) {
      const documentId = decodeURIComponent(knowledgeVersionsMatch[1]);
      if (request.method === 'GET') {
        const versions = await listKnowledgeVersionsAdmin(documentId, accountId);
        writeJson(response, 200, versions, origin);
        return;
      }
      if (request.method === 'POST') {
        const payload = await readJsonBody(request);
        await createKnowledgeDocumentVersionAdmin({ ...payload, accountId });
        writeJson(response, 200, { ok: true }, origin);
        return;
      }
      writeJson(response, 405, { error: 'Method not allowed.' }, origin);
      return;
    }

    if (knowledgeCurrentVersionMatch) {
      if (request.method !== 'PATCH') {
        writeJson(response, 405, { error: 'Method not allowed.' }, origin);
        return;
      }
      const payload = await readJsonBody(request);
      await setKnowledgeCurrentVersionAdmin({ ...payload, accountId });
      writeJson(response, 200, { ok: true }, origin);
      return;
    }

    if (knowledgeJobsMatch && request.method === 'GET') {
      const documentId = decodeURIComponent(knowledgeJobsMatch[1]);
      const jobs = await listKnowledgeJobsAdmin(documentId, accountId);
      writeJson(response, 200, jobs, origin);
      return;
    }

    if (knowledgeOutputsMatch && request.method === 'GET') {
      const documentId = decodeURIComponent(knowledgeOutputsMatch[1]);
      const outputs = await listKnowledgeOutputsAdmin(documentId, accountId);
      writeJson(response, 200, outputs, origin);
      return;
    }

    if (knowledgeEvidenceMatch && request.method === 'GET') {
      const documentId = decodeURIComponent(knowledgeEvidenceMatch[1]);
      const evidence = await listKnowledgeEvidenceAdmin(documentId, accountId);
      writeJson(response, 200, evidence, origin);
      return;
    }

    if (projectMatch) {
      const id = decodeURIComponent(projectMatch[1]);

      if (request.method === 'PUT') {
        const payload = await readJsonBody(request);
        await withWriteBackend(
          () =>
            upsertDocumentAdmin(getProjectsCollectionPath(accountId), id, {
              ...payload,
              ...(accountId ? { accountId } : {}),
            }),
          (token) => upsertProjectRemote(token, id, payload, accountId),
        );
        writeJson(response, 200, { ok: true }, origin);
        return;
      }

      if (request.method === 'DELETE') {
        await withWriteBackend(
          () => deleteDocumentAdmin(getProjectsCollectionPath(accountId), id),
          (token) => deleteDocumentRemoteByPath(token, getProjectDocumentPath(accountId, id)),
        );
        writeJson(response, 200, { ok: true }, origin);
        return;
      }

      writeJson(response, 405, { error: 'Method not allowed.' }, origin);
      return;
    }

    writeJson(response, 404, { error: 'Not found.' }, origin);
  } catch (error) {
    writeJson(
      response,
      500,
      { error: error instanceof Error ? error.message : 'Dev admin proxy failed.' },
      origin,
    );
  }
});

server.listen(PORT, '127.0.0.1', () => {
  console.log(`[dev-admin-proxy] listening on http://127.0.0.1:${PORT}`);
});
