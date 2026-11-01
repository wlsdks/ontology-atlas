import { invoke, isTauri } from '@tauri-apps/api/core';
import type { ChangeBriefing } from './tauri-change-briefing';

export interface PublicPullVersion {
  number: number;
  title: string;
  body: string;
  bodyPresent: boolean;
  url: string;
  updatedAt: string;
  fetchedAt: string;
  status: 'draft' | 'open' | 'closed' | 'merged' | 'unknown';
  digest: string;
}

export interface PublicPullOmission {
  number: number;
  updatedAt: string;
  digest: string;
  reason: string;
}

export interface PublicPullInventory {
  status: 'observed' | 'partial' | 'unavailable' | 'cancelled';
  reason: string | null;
  repository: string;
  startEpoch: number;
  endEpoch: number;
  scanned: number;
  observedDistinct: number;
  observedDistinctExact: boolean;
  versions: PublicPullVersion[];
  omitted: PublicPullOmission[];
  unlistedOmissions: number;
  conflicts: number[];
  cursor: string | null;
  canContinue: boolean;
  retrySmaller: boolean;
  pageSize: number;
  movingListUncertain: boolean;
  orderingUncertain: boolean;
  retryAt: string | null;
  restarted: boolean;
  attemptedRequests: number;
  parsedJsonBodyBytes: number;
}

type InventoryAction = { action: 'start'; cursor: null } | { action: 'more' | 'smaller'; cursor: string };
export type BriefingReceipt = Pick<ChangeBriefing, 'sourceRoot' | 'head' | 'snapshot'>;

const nativeOriginalScopes = new WeakMap<PublicPullVersion, string>();
let evidenceGeneration = 0;
const scopeKey = (data: BriefingReceipt, repository: string, generation = evidenceGeneration) => JSON.stringify([data.sourceRoot, data.head, data.snapshot, repository, generation]);

export function invalidateNativePublicPullOriginals(): void { evidenceGeneration++; }

export function isNativePublicPullOriginal(version: PublicPullVersion, data: BriefingReceipt, repository: string): boolean {
  return nativeOriginalScopes.get(version) === scopeKey(data, repository);
}

function nativeOriginal(version: PublicPullVersion, repository: string): PublicPullVersion {
  if (!version || !Number.isSafeInteger(version.number) || version.number <= 0 ||
    typeof version.title !== 'string' || typeof version.body !== 'string' || typeof version.bodyPresent !== 'boolean' ||
    !/^[a-f0-9]{64}$/.test(version.digest) || version.url !== `https://github.com/${repository}/pull/${version.number}` ||
    typeof version.updatedAt !== 'string' || typeof version.fetchedAt !== 'string' ||
    !['draft', 'open', 'closed', 'merged', 'unknown'].includes(version.status)) throw new Error('invalid-public-pull-original');
  return Object.freeze({ number: version.number, title: version.title, body: version.body, bodyPresent: version.bodyPresent,
    url: version.url, updatedAt: version.updatedAt, fetchedAt: version.fetchedAt, status: version.status, digest: version.digest });
}

function receipt(data: BriefingReceipt) {
  return { sourcePath: data.sourceRoot, head: data.head, snapshot: data.snapshot };
}

export async function publicPullRepositories(data: BriefingReceipt): Promise<string[]> {
  return typeof window !== 'undefined' && isTauri()
    ? invoke('git_briefing_public_repositories', receipt(data)) : [];
}

export async function readPublicPulls(
  data: BriefingReceipt, repository: string, next: InventoryAction, signal: AbortSignal,
): Promise<PublicPullInventory | null> {
  if (typeof window === 'undefined' || !isTauri()) return null;
  const identity: BriefingReceipt = { sourceRoot: data.sourceRoot, head: data.head, snapshot: data.snapshot };
  const generation = evidenceGeneration;
  const requestId = await invoke<string>('llm_chat_prepare');
  const cancel = () => { void invoke('llm_chat_cancel', { requestId }).catch(() => {}); };
  if (signal.aborted) { cancel(); throw new DOMException('Aborted', 'AbortError'); }
  signal.addEventListener('abort', cancel, { once: true });
  try {
    const result = await invoke<PublicPullInventory>('git_briefing_public_inventory', { ...receipt(identity), repository, ...next, requestId });
    if (result.repository !== repository || !Array.isArray(result.versions)) throw new Error('invalid-public-pull-scope');
    const key = scopeKey(identity, repository, generation);
    const versions = result.versions.map((version) => {
      const original = nativeOriginal(version, repository);
      nativeOriginalScopes.set(original, key);
      return original;
    });
    return { ...result, versions };
  } finally {
    signal.removeEventListener('abort', cancel);
  }
}
