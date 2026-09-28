import type { RoundUndoReason, RoundUndone } from '@/entities/library-round';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { isNotFoundError } from '@/shared/lib/vault-sidecar';

export type RoundDraftProblem = Pick<RoundUndone, 'reason' | 'key'>;

export interface PassPages {
  current(path: string): string | null;
  conflict(path: string): boolean;
  node(path: string): boolean;
  commit(path: string, text: string): void;
  land(path: string, text: string): void;
  touched(): { path: string; start: string | null; own: string }[];
}

export interface PassScan {
  pages: Iterable<{ path: string; text: string | null }>;
  complete?: boolean;
  nodes?: Iterable<string>;
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

const normalized = (text: string) => text.replace(/^﻿/, '').replace(/\r\n/g, '\n');

function frontmatterKeys(text: string): { key: string; line: string }[] | null {
  const raw = normalized(text);
  const end = raw.startsWith('---') ? raw.indexOf('\n---', 3) : -1;
  if (end === -1) return null;
  const keys: { key: string; line: string }[] = [];
  for (const line of raw.slice(4, end).split('\n')) {
    if (/^\s*(-(\s|$)|#)/.test(line)) continue;
    const at = line.indexOf(':');
    const key = at < 0 ? '' : line.slice(0, at).trim().normalize('NFC').toLowerCase();
    if (key) keys.push({ key, line });
  }
  return keys;
}

export function roundDraftProblem(text: string): RoundDraftProblem | null {
  const keys = frontmatterKeys(text);
  if (!keys) return { reason: 'no-frontmatter' };
  const seen = new Set<string>();
  let status: string | null = null;
  for (const { key, line } of keys) {
    if (seen.has(key)) return { reason: 'duplicate-key', key };
    seen.add(key);
    if (FORBIDDEN_KEYS.has(key)) return { reason: 'forbidden-key', key };
    if (key === 'status') status = line.trimEnd();
  }
  return status === 'status: draft' && parseFrontmatter(normalized(text)).frontmatter.status === 'draft' ? null : { reason: 'not-draft' };
}

const carriesKind = (text: string) => frontmatterKeys(text)?.some(({ key }) => key === 'kind') ?? false;

interface KnownPage {
  path: string;
  start: string | null;
  text: string | null;
  landed: string | null;
}

export function createPassPages(scan: PassScan | Iterable<{ path: string; text: string | null }>): PassPages {
  const input: PassScan = 'pages' in scan ? scan : { pages: scan };
  const known = new Map<string, KnownPage>();
  const blocked = new Set<string>();
  const nodes = new Set<string>();
  for (const path of input.nodes ?? []) nodes.add(pageIdentity(path));
  for (const page of input.pages) {
    const id = pageIdentity(page.path);
    if (page.text !== null && carriesKind(page.text)) nodes.add(id);
    if (known.has(id) || page.text === null) blocked.add(id);
    if (!known.has(id)) known.set(id, { path: page.path, start: page.text, text: page.text, landed: null });
  }
  const complete = input.complete === true;
  const touched = new Set<string>();
  return {
    current: (path) => known.get(pageIdentity(path))?.text ?? null,
    conflict: (path) => {
      const id = pageIdentity(path);
      const page = known.get(id);
      if (blocked.has(id) || nodes.has(id)) return true;
      return page === undefined ? !complete : page.path !== path;
    },
    node: (path) => nodes.has(pageIdentity(path)),
    commit: (path, text) => {
      const id = pageIdentity(path);
      const page = known.get(id);
      if (page) Object.assign(page, { text, landed: null });
      else known.set(id, { path, start: null, text, landed: null });
      touched.add(id);
    },
    land: (path, text) => {
      const page = known.get(pageIdentity(path));
      if (page && touched.has(pageIdentity(path))) Object.assign(page, { text, landed: text });
    },
    touched: () => [...touched].map((id) => {
      const page = known.get(id)!;
      return { path: page.path, start: page.start, own: page.landed ?? page.text ?? '' };
    }),
  };
}

export function createLandings(pages: PassPages, read: (path: string) => Promise<string | null>) {
  const expected = new Map<string, string>();
  const reads: Promise<void>[] = [];
  return {
    expect(toolCallId: unknown, path: string) {
      if (typeof toolCallId === 'string') expected.set(toolCallId, path);
    },
    settled(toolCallId: string, status: string) {
      const path = expected.get(toolCallId);
      if (path === undefined) return;
      expected.delete(toolCallId);
      if (status !== 'completed') return;
      reads.push(read(path).then((text) => {
        if (text !== null) pages.land(path, text);
      }, () => undefined));
    },
    done: () => Promise.all(reads).then(() => undefined),
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

export async function scanWikiFolder(vault: FileSystemDirectoryHandle): Promise<{ path: string; text: string | null }[]> {
  const pages: { path: string; text: string | null }[] = [];
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string) => {
    for await (const [name, entry] of (directory as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (name.startsWith('.')) continue;
      const path = `${prefix}/${name}`;
      if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path);
      else if (name.toLowerCase().endsWith('.md')) {
        pages.push({ path, text: await (entry as FileSystemFileHandle).getFile().then((file) => file.text(), () => null) });
      }
    }
  };
  let wiki: FileSystemDirectoryHandle;
  try {
    wiki = await vault.getDirectoryHandle('wiki');
  } catch (error) {
    if (isNotFoundError(error)) return pages;
    throw error;
  }
  await walk(wiki, 'wiki');
  return pages;
}

export interface SettleInput {
  pages: PassPages;
  read(path: string): Promise<string | null>;
  keep(path: string, text: string): Promise<string>;
  restore(path: string, text: string): Promise<void>;
  remove(path: string): Promise<void>;
}

export async function settlePassPages({ pages, read, keep, restore, remove }: SettleInput): Promise<{ undone: RoundUndone[]; leftAsIs: string[] }> {
  const undone: RoundUndone[] = [];
  const leftAsIs: string[] = [];
  for (const { path, start, own } of pages.touched()) {
    let now: string | null;
    try {
      now = await read(path);
    } catch {
      undone.push({ path, reason: 'unreadable', action: 'failed' });
      continue;
    }
    if (now === null || now === start) continue;
    if (now !== own) {
      leftAsIs.push(path);
      continue;
    }
    const problem = roundDraftProblem(now);
    if (!problem) continue;
    const item: RoundUndone = { path, ...problem, action: 'failed' };
    undone.push(item);
    try {
      item.copy = await keep(path, now);
      if (start !== null) await restore(path, start);
      else await remove(path);
      const after = await read(path);
      if (start !== null ? after === start : after === null) item.action = start !== null ? 'restored' : 'removed';
    } catch {
      item.action = 'failed';
    }
  }
  return { undone, leftAsIs };
}
