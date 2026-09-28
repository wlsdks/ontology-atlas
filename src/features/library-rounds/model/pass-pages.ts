import type { RoundUndoReason, RoundUndone } from '@/entities/library-round';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { isNotFoundError } from '@/shared/lib/vault-sidecar';

export type RoundDraftProblem = Pick<RoundUndone, 'reason' | 'key'>;

export interface PassPages {
  current(path: string): string | null;
  conflict(path: string): boolean;
  commit(path: string, text: string): void;
  touched(): { path: string; start: string | null }[];
}

const FORBIDDEN_KEYS = new Set(['describes', 'kind']);

const REASON_KEYS = {
  'not-draft': 'notDraft',
  'duplicate-key': 'duplicateKey',
  'forbidden-key': 'forbiddenKey',
  'no-frontmatter': 'noFrontmatter',
  unreadable: 'unreadable',
} as const;

export const undoneReasonKey = (reason: RoundUndoReason) => REASON_KEYS[reason];

export function pageIdentity(path: string): string {
  return path.normalize('NFC').toLowerCase().toUpperCase().toLowerCase().normalize('NFC');
}

export function roundDraftProblem(text: string): RoundDraftProblem | null {
  const raw = text.replace(/^﻿/, '').replace(/\r\n/g, '\n');
  const end = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1;
  if (end === -1) return { reason: 'no-frontmatter' };
  const seen = new Set<string>();
  let status: string | null = null;
  for (const line of raw.slice(4, end).split('\n')) {
    if (/^\s*(-(\s|$)|#)/.test(line)) continue;
    const at = line.indexOf(':');
    const key = at < 0 ? '' : line.slice(0, at).trim().normalize('NFC').toLowerCase();
    if (!key) continue;
    if (seen.has(key)) return { reason: 'duplicate-key', key };
    seen.add(key);
    if (FORBIDDEN_KEYS.has(key)) return { reason: 'forbidden-key', key };
    if (key === 'status') status = line.trimEnd();
  }
  return status === 'status: draft' && parseFrontmatter(raw).frontmatter.status === 'draft' ? null : { reason: 'not-draft' };
}

interface KnownPage {
  path: string;
  start: string | null;
  text: string | null;
}

export function createPassPages(start: Iterable<{ path: string; text: string | null }>): PassPages {
  const known = new Map<string, KnownPage>();
  const blocked = new Set<string>();
  for (const page of start) {
    const id = pageIdentity(page.path);
    if (known.has(id) || page.text === null) blocked.add(id);
    if (!known.has(id)) known.set(id, { path: page.path, start: page.text, text: page.text });
  }
  const touched = new Set<string>();
  return {
    current: (path) => known.get(pageIdentity(path))?.text ?? null,
    conflict: (path) => {
      const id = pageIdentity(path);
      const page = known.get(id);
      return blocked.has(id) || (page !== undefined && page.path !== path);
    },
    commit: (path, text) => {
      const id = pageIdentity(path);
      const page = known.get(id);
      if (page) page.text = text;
      else known.set(id, { path, start: null, text });
      touched.add(id);
    },
    touched: () => [...touched].map((id) => ({ path: known.get(id)!.path, start: known.get(id)!.start })),
  };
}

async function isMissing(vault: FileSystemDirectoryHandle, path: string): Promise<boolean> {
  try {
    const parts = path.split('/');
    const name = parts.pop() ?? '';
    let directory = vault;
    for (const part of parts) directory = await directory.getDirectoryHandle(part);
    await directory.getFileHandle(name);
    return false;
  } catch (error) {
    return isNotFoundError(error);
  }
}

export function readOrMissing(vault: FileSystemDirectoryHandle, read: (path: string) => Promise<string | null>) {
  return async (path: string): Promise<string | null> => {
    try {
      return await read(path);
    } catch (error) {
      if (await isMissing(vault, path)) return null;
      throw error;
    }
  };
}

export interface SettleInput {
  pages: PassPages;
  read(path: string): Promise<string | null>;
  restore(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export async function settlePassPages({ pages, read, restore, remove }: SettleInput): Promise<RoundUndone[]> {
  const undone: RoundUndone[] = [];
  for (const { path, start } of pages.touched()) {
    let problem: RoundDraftProblem | null;
    try {
      const now = await read(path);
      if (now === null || now === start) continue;
      problem = roundDraftProblem(now);
    } catch {
      problem = { reason: 'unreadable' };
    }
    if (!problem) continue;
    let action: RoundUndone['action'] = 'failed';
    try {
      if (start !== null) await restore(path, start);
      else await remove(path);
      const after = await read(path);
      if (start !== null ? after === start : after === null) action = start !== null ? 'restored' : 'removed';
    } catch {
      action = 'failed';
    }
    undone.push({ path, ...problem, action });
  }
  return undone;
}
