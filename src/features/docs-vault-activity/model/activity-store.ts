'use client';

import {
  collection,
  doc,
  limit,
  onSnapshot,
  orderBy,
  query,
  Timestamp,
  updateDoc,
  type DocumentData,
  type QueryDocumentSnapshot,
  type Unsubscribe,
} from 'firebase/firestore';
import { httpsCallable } from 'firebase/functions';
import type {
  DeveloperActivityEvent,
  DeveloperActivityInput,
} from '@/entities/docs-vault';
import { normalizeDeveloperActivityEvent } from '@/entities/docs-vault';
import { getDb, getFirebaseFunctions } from '@/shared/api';
import { normalizeAccountId } from '@/shared/lib/account-scope';
import { isDevAdminBypassActive } from '@/shared/lib/dev-admin-bypass';
import { hasDemoSession } from '@/shared/lib/demo-session';

const STORAGE_KEY = 'demo:docs-vault:developer-activity:v1';
export const DEVELOPER_ACTIVITY_APPEND_EVENT =
  'demo:docs-vault:activity:append';
const DEVELOPER_ACTIVITY_CHANGE_EVENT = 'demo:docs-vault:activity:change';
const MAX_EVENTS = 50;
const EMPTY_EVENTS: DeveloperActivityEvent[] = [];
let cachedRaw: string | null = null;
let cachedEvents: DeveloperActivityEvent[] = EMPTY_EVENTS;

export type DeveloperActivityDeliveryStatus =
  | 'received'
  | 'processed'
  | 'ignored'
  | 'failed';
export type DeveloperActivityGitHubRedeliveryStatus =
  | 'requested'
  | 'failed';

export interface DeveloperActivityDelivery {
  id: string;
  deliveryId: string | null;
  eventName: string;
  status: DeveloperActivityDeliveryStatus;
  repository?: string;
  actor?: string;
  href?: string;
  reason?: string;
  activityId?: string;
  targetSlugs: string[];
  receivedAt?: string;
  updatedAt?: string;
  replayedAt?: string;
  replayedBy?: string;
  githubDeliveryApiId?: number;
  githubRedeliveryStatus?: DeveloperActivityGitHubRedeliveryStatus;
  githubRedeliveryError?: string;
  githubRedeliveredAt?: string;
  githubRedeliveredBy?: string;
}

declare global {
  interface Window {
    demoDocsVaultActivityIngest?: (
      input: DeveloperActivityInput,
    ) => DeveloperActivityEvent | null;
  }
}

export function readDeveloperActivityEvents(): DeveloperActivityEvent[] {
  if (typeof window === 'undefined') return [];
  try {
    const raw = window.localStorage.getItem(STORAGE_KEY);
    if (!raw) {
      cachedRaw = null;
      cachedEvents = EMPTY_EVENTS;
      return cachedEvents;
    }
    if (raw === cachedRaw) return cachedEvents;
    const parsed: unknown = JSON.parse(raw);
    if (!Array.isArray(parsed)) {
      cachedRaw = raw;
      cachedEvents = EMPTY_EVENTS;
      return cachedEvents;
    }
    cachedRaw = raw;
    cachedEvents = parsed
      .filter(isDeveloperActivityEvent)
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, MAX_EVENTS);
    return cachedEvents;
  } catch {
    return EMPTY_EVENTS;
  }
}

export function appendDeveloperActivityEvent(
  input: DeveloperActivityInput,
): DeveloperActivityEvent | null {
  const event = normalizeDeveloperActivityEvent(input);
  if (!event || typeof window === 'undefined') return event;

  const events = readDeveloperActivityEvents();
  const next = [
    event,
    ...events.filter((item) => item.id !== event.id),
  ].slice(0, MAX_EVENTS);
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(DEVELOPER_ACTIVITY_CHANGE_EVENT));
  return event;
}

export function acknowledgeDeveloperActivityEvent(id: string): void {
  if (typeof window === 'undefined') return;
  const next = readDeveloperActivityEvents().map((event) =>
    event.id === id ? { ...event, unread: false } : event,
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(DEVELOPER_ACTIVITY_CHANGE_EVENT));
}

export function restoreDeveloperActivityEvent(id: string): void {
  if (typeof window === 'undefined') return;
  const next = readDeveloperActivityEvents().map((event) =>
    event.id === id ? { ...event, unread: true } : event,
  );
  window.localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  window.dispatchEvent(new Event(DEVELOPER_ACTIVITY_CHANGE_EVENT));
}

export function subscribeDeveloperActivityEvents(
  onStoreChange: () => void,
): () => void {
  if (typeof window === 'undefined') return () => undefined;
  const handleStorage = (event: StorageEvent) => {
    if (event.key === STORAGE_KEY) onStoreChange();
  };
  const handleAppend = (event: Event) => {
    const detail = (event as CustomEvent<DeveloperActivityInput>).detail;
    if (detail) appendDeveloperActivityEvent(detail);
    onStoreChange();
  };
  window.addEventListener('storage', handleStorage);
  window.addEventListener(DEVELOPER_ACTIVITY_CHANGE_EVENT, onStoreChange);
  window.addEventListener(DEVELOPER_ACTIVITY_APPEND_EVENT, handleAppend);
  window.demoDocsVaultActivityIngest = appendDeveloperActivityEvent;
  return () => {
    window.removeEventListener('storage', handleStorage);
    window.removeEventListener(DEVELOPER_ACTIVITY_CHANGE_EVENT, onStoreChange);
    window.removeEventListener(DEVELOPER_ACTIVITY_APPEND_EVENT, handleAppend);
    if (window.demoDocsVaultActivityIngest === appendDeveloperActivityEvent) {
      delete window.demoDocsVaultActivityIngest;
    }
  };
}

export function subscribeRemoteDeveloperActivityEvents(
  accountId: string | null | undefined,
  callback: (events: DeveloperActivityEvent[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId || hasDemoSession() || isDevAdminBypassActive()) {
    Promise.resolve().then(() => callback([]));
    return () => undefined;
  }

  const q = query(
    collection(
      getDb(),
      'accounts',
      normalizedAccountId,
      'developerActivityEvents',
    ),
    orderBy('createdAt', 'desc'),
    limit(MAX_EVENTS),
  );
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map(fromFirestore)),
    (err) => onError?.(err),
  );
}

export async function acknowledgeRemoteDeveloperActivityEvent(
  accountId: string | null | undefined,
  id: string,
): Promise<void> {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId || hasDemoSession() || isDevAdminBypassActive()) {
    return;
  }
  await updateDoc(
    doc(getDb(), 'accounts', normalizedAccountId, 'developerActivityEvents', id),
    {
      unread: false,
      acknowledgedAt: new Date().toISOString(),
    },
  );
}

export async function restoreRemoteDeveloperActivityEvent(
  accountId: string | null | undefined,
  id: string,
): Promise<void> {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId || hasDemoSession() || isDevAdminBypassActive()) {
    return;
  }
  await updateDoc(
    doc(getDb(), 'accounts', normalizedAccountId, 'developerActivityEvents', id),
    {
      unread: true,
      acknowledgedAt: null,
    },
  );
}

export function subscribeDeveloperActivityDeliveries(
  accountId: string | null | undefined,
  callback: (deliveries: DeveloperActivityDelivery[]) => void,
  onError?: (err: Error) => void,
): Unsubscribe {
  const normalizedAccountId = normalizeAccountId(accountId);
  if (!normalizedAccountId || hasDemoSession() || isDevAdminBypassActive()) {
    Promise.resolve().then(() => callback([]));
    return () => undefined;
  }

  const q = query(
    collection(
      getDb(),
      'accounts',
      normalizedAccountId,
      'developerActivityDeliveries',
    ),
    orderBy('updatedAt', 'desc'),
    limit(20),
  );
  return onSnapshot(
    q,
    (snapshot) => callback(snapshot.docs.map(fromDeliveryFirestore)),
    (err) => onError?.(err),
  );
}

export async function reprocessDeveloperActivityDelivery(input: {
  accountId: string | null | undefined;
  deliveryId: string;
}): Promise<{ status: string; id?: string; targetSlugs?: string[] }> {
  const normalizedAccountId = normalizeAccountId(input.accountId);
  if (!normalizedAccountId) {
    throw new Error('accountId 가 필요합니다.');
  }
  const callable = httpsCallable<
    { accountId: string; deliveryId: string },
    { status: string; id?: string; targetSlugs?: string[] }
  >(getFirebaseFunctions(), 'reprocessGitHubActivityDelivery');
  const response = await callable({
    accountId: normalizedAccountId,
    deliveryId: input.deliveryId,
  });
  return response.data;
}

export async function redeliverDeveloperActivityDelivery(input: {
  accountId: string | null | undefined;
  deliveryId: string;
}): Promise<{ status: string; githubDeliveryApiId?: number }> {
  const normalizedAccountId = normalizeAccountId(input.accountId);
  if (!normalizedAccountId) {
    throw new Error('accountId 가 필요합니다.');
  }
  const callable = httpsCallable<
    { accountId: string; deliveryId: string },
    { status: string; githubDeliveryApiId?: number }
  >(getFirebaseFunctions(), 'redeliverGitHubActivityDelivery');
  const response = await callable({
    accountId: normalizedAccountId,
    deliveryId: input.deliveryId,
  });
  return response.data;
}

function isDeveloperActivityEvent(
  value: unknown,
): value is DeveloperActivityEvent {
  if (!value || typeof value !== 'object') return false;
  const candidate = value as Partial<DeveloperActivityEvent>;
  return (
    typeof candidate.id === 'string' &&
    typeof candidate.source === 'string' &&
    typeof candidate.kind === 'string' &&
    typeof candidate.title === 'string' &&
    typeof candidate.createdAt === 'string'
  );
}

function fromFirestore(
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
): DeveloperActivityEvent {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    source: data.source === 'github' ? 'github' : data.source,
    kind: normalizeKind(data.kind),
    title: typeof data.title === 'string' ? data.title : 'Developer activity',
    createdAt: toIsoString(data.createdAt),
    summary: optionalString(data.summary),
    actor: optionalString(data.actor),
    docSlug: optionalString(data.docSlug),
    projectSlug: optionalString(data.projectSlug),
    targetSlugs: Array.isArray(data.targetSlugs)
      ? data.targetSlugs.filter((value: unknown): value is string => typeof value === 'string')
      : undefined,
    repository: optionalString(data.repository),
    branch: optionalString(data.branch),
    href: optionalString(data.href),
    unread: data.unread !== false,
  };
}

function fromDeliveryFirestore(
  docSnapshot: QueryDocumentSnapshot<DocumentData>,
): DeveloperActivityDelivery {
  const data = docSnapshot.data();
  return {
    id: docSnapshot.id,
    deliveryId: optionalString(data.deliveryId) ?? null,
    eventName: optionalString(data.eventName) ?? 'unknown',
    status: normalizeDeliveryStatus(data.status),
    repository: optionalString(data.repository),
    actor: optionalString(data.actor),
    href: optionalString(data.href),
    reason: optionalString(data.reason),
    activityId: optionalString(data.activityId),
    targetSlugs: Array.isArray(data.targetSlugs)
      ? data.targetSlugs.filter((value: unknown): value is string => typeof value === 'string')
      : [],
    receivedAt: optionalDateString(data.receivedAt),
    updatedAt: optionalDateString(data.updatedAt),
    replayedAt: optionalDateString(data.replayedAt),
    replayedBy: optionalString(data.replayedBy),
    githubDeliveryApiId: optionalNumber(data.githubDeliveryApiId),
    githubRedeliveryStatus: normalizeGitHubRedeliveryStatus(
      data.githubRedeliveryStatus,
    ),
    githubRedeliveryError: optionalString(data.githubRedeliveryError),
    githubRedeliveredAt: optionalDateString(data.githubRedeliveredAt),
    githubRedeliveredBy: optionalString(data.githubRedeliveredBy),
  };
}

function normalizeKind(value: unknown): DeveloperActivityEvent['kind'] {
  if (
    value === 'doc.created' ||
    value === 'doc.updated' ||
    value === 'doc.linked' ||
    value === 'github.push' ||
    value === 'github.pull_request' ||
    value === 'github.issue'
  ) {
    return value;
  }
  return 'github.push';
}

function optionalString(value: unknown): string | undefined {
  return typeof value === 'string' && value.trim() ? value.trim() : undefined;
}

function optionalDateString(value: unknown): string | undefined {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return undefined;
}

function optionalNumber(value: unknown): number | undefined {
  return typeof value === 'number' && Number.isFinite(value)
    ? value
    : undefined;
}

function toIsoString(value: unknown): string {
  if (value instanceof Timestamp) return value.toDate().toISOString();
  if (value instanceof Date) return value.toISOString();
  if (typeof value === 'string' && value.trim()) return value;
  return new Date().toISOString();
}

function normalizeDeliveryStatus(
  value: unknown,
): DeveloperActivityDeliveryStatus {
  if (
    value === 'received' ||
    value === 'processed' ||
    value === 'ignored' ||
    value === 'failed'
  ) {
    return value;
  }
  return 'received';
}

function normalizeGitHubRedeliveryStatus(
  value: unknown,
): DeveloperActivityGitHubRedeliveryStatus | undefined {
  if (value === 'requested' || value === 'failed') return value;
  return undefined;
}
