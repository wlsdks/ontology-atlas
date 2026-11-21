/** Orders reads by folder tier (node folders first) and publishes a partial manifest as each tier completes. */

import type { BuiltVaultEntry } from './md-entry';
import { NATIVE_READ_BATCH } from './read-vault-files';
import type { WalkEntry } from './walk-vault';

export const PARTIAL_AFTER_MS = 200;
export const PARTIAL_INTERVAL_MS = 1000;
const PARTIAL_SPLIT_PUBLISHES = 3;
const PARTIAL_SPLIT_MIN = 400;
export const PARTIAL_VAULT_MIN = 400;
const READ_TIER_FOLDERS = ['projects', 'domains', 'capabilities', 'elements'];

export function readTier(entry: WalkEntry): number {
  if (entry.kind !== 'md') return READ_TIER_FOLDERS.length + 2;
  const slash = entry.relativePath.indexOf('/');
  if (slash < 0) return 0;
  const folder = READ_TIER_FOLDERS.indexOf(entry.relativePath.slice(0, slash));
  return folder < 0 ? READ_TIER_FOLDERS.length + 1 : folder + 1;
}

export function readUnits(files: readonly WalkEntry[], tiers: readonly number[], batched: boolean): number[][] {
  const order = files.map((_, index) => index).sort((a, b) => tiers[a] - tiers[b] || a - b);
  if (!batched) return order.map((index) => [index]);
  const units: number[][] = [];
  let batch: number[] = [];
  for (const index of order) {
    if (batch.length > 0 && (batch.length === NATIVE_READ_BATCH || tiers[batch[0]] !== tiers[index])) {
      units.push(batch);
      batch = [];
    }
    if (files[index].kind === 'md') batch.push(index);
    else units.push([index]);
  }
  if (batch.length > 0) units.push(batch);
  return units;
}

export function createPartialPublisher(
  tiers: readonly number[],
  files: readonly WalkEntry[],
  results: ReadonlyArray<BuiltVaultEntry | undefined>,
  publish: (entries: BuiltVaultEntry[]) => void,
  pacing: { afterMs: number; intervalMs: number },
) {
  const tierCount = READ_TIER_FOLDERS.length + 3;
  const size = new Array<number>(tierCount).fill(0);
  const done = new Array<number>(tierCount).fill(0);
  let lastMarkdownTier = -1;
  tiers.forEach((tier, index) => {
    size[tier] += 1;
    if (files[index].kind === 'md') lastMarkdownTier = Math.max(lastMarkdownTier, tier);
  });
  const startedAt = performance.now();
  let lastPublishedAt = Number.NEGATIVE_INFINITY;
  let publishes = 0;
  let published = -1;
  let quarter = 0;
  let timer: ReturnType<typeof setTimeout> | null = null;
  const attempt = () => {
    const now = performance.now();
    const wait = Math.max(startedAt + pacing.afterMs, lastPublishedAt + pacing.intervalMs) - now;
    if (wait > 0) {
      timer ??= setTimeout(() => {
        timer = null;
        attempt();
      }, wait);
      return;
    }
    let complete = published;
    while (complete + 1 < tierCount && done[complete + 1] === size[complete + 1]) complete += 1;
    if (complete >= lastMarkdownTier) return;
    let through = -1;
    if (complete > published) {
      published = complete;
      quarter = 0;
      through = complete;
    }
    const current = published + 1;
    if (publishes < PARTIAL_SPLIT_PUBLISHES && size[current] >= PARTIAL_SPLIT_MIN) {
      const reached = Math.floor((done[current] * 4) / size[current]);
      if (reached > quarter) {
        quarter = reached;
        through = current;
      }
    }
    if (through < 0) return;
    lastPublishedAt = now;
    publishes += 1;
    publish(results.filter((entry, index): entry is BuiltVaultEntry => entry !== undefined && tiers[index] <= through));
  };
  return {
    read(unit: readonly number[]) {
      for (const index of unit) done[tiers[index]] += 1;
      attempt();
    },
    stop() {
      if (timer !== null) clearTimeout(timer);
      timer = null;
    },
  };
}
