import type { RoundUndoReason, RoundUndone } from '@/entities/library-round';
import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { isNotFoundError } from '@/shared/lib/vault-sidecar';

export type RoundDraftProblem = Pick<RoundUndone, 'reason' | 'key'>;

export interface PassPages {
  current(path: string): string | null;
  conflict(path: string): boolean;
  node(path: string): boolean;
  unsafe(path: string): boolean;
  commit(path: string, text: string): void;
  sequence(path: string): number;
  land(path: string, text: string, sequence?: number): void;
  touched(): { path: string; start: string | null; own: string }[];
}

export interface PassScan {
  pages: Iterable<{ path: string; text: string | null }>;
  complete?: boolean;
  nodes?: Iterable<string>;
  dirs?: Iterable<string>;
  links?: Iterable<string>;
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
  sequence: number;
}

const parentsOf = (path: string) => {
  const parts = path.split('/').slice(0, -1);
  return parts.map((_, index) => parts.slice(0, index + 1).join('/'));
};

export function createPassPages(scan: PassScan | Iterable<{ path: string; text: string | null }>): PassPages {
  const input: PassScan = 'pages' in scan ? scan : { pages: scan };
  const known = new Map<string, KnownPage>();
  const blocked = new Set<string>();
  const nodes = new Set<string>();
  const scanned: string[] = [];
  for (const path of input.nodes ?? []) nodes.add(pageIdentity(path));
  for (const page of input.pages) {
    const id = pageIdentity(page.path);
    scanned.push(page.path);
    if (page.text !== null && carriesKind(page.text)) nodes.add(id);
    if (known.has(id) || page.text === null) blocked.add(id);
    if (!known.has(id)) known.set(id, { path: page.path, start: page.text, text: page.text, landed: null, sequence: 0 });
  }
  const dirs = new Set([...(input.dirs ?? scanned.flatMap(parentsOf))].map(pageIdentity));
  const links = new Set([...(input.links ?? [])].map(pageIdentity));
  const unsafe = (path: string) =>
    links.has(pageIdentity(path)) || parentsOf(path).some((parent) => links.has(pageIdentity(parent)) || !dirs.has(pageIdentity(parent)));
  const complete = input.complete === true;
  const touched = new Set<string>();
  return {
    current: (path) => known.get(pageIdentity(path))?.text ?? null,
    conflict: (path) => {
      const id = pageIdentity(path);
      const page = known.get(id);
      if (blocked.has(id) || nodes.has(id) || unsafe(path)) return true;
      return page === undefined ? !complete : page.path !== path;
    },
    node: (path) => nodes.has(pageIdentity(path)),
    unsafe,
    commit: (path, text) => {
      const id = pageIdentity(path);
      const page = known.get(id);
      if (page) Object.assign(page, { text, landed: null, sequence: page.sequence + 1 });
      else known.set(id, { path, start: null, text, landed: null, sequence: 1 });
      touched.add(id);
    },
    sequence: (path) => known.get(pageIdentity(path))?.sequence ?? 0,
    land: (path, text, sequence) => {
      const page = known.get(pageIdentity(path));
      if (!page || !touched.has(pageIdentity(path)) || (sequence !== undefined && sequence !== page.sequence)) return;
      Object.assign(page, { text, landed: text });
    },
    touched: () => [...touched].map((id) => {
      const page = known.get(id)!;
      return { path: page.path, start: page.start, own: page.landed ?? page.text ?? '' };
    }),
  };
}

export function createLandings(pages: PassPages, read: (path: string) => Promise<string | null>) {
  const expected = new Map<string, { path: string; sequence: number }>();
  const pending = new Set<Promise<void>>();
  return {
    expect(toolCallId: unknown, path: string) {
      if (typeof toolCallId === 'string') expected.set(toolCallId, { path, sequence: pages.sequence(path) });
    },
    settled(toolCallId: string, _status: string) {
      const write = expected.get(toolCallId);
      if (!write) return;
      expected.delete(toolCallId);
      const reading: Promise<void> = read(write.path)
        .then((text) => {
          if (text !== null) pages.land(write.path, text, write.sequence);
        }, () => undefined)
        .finally(() => pending.delete(reading));
      pending.add(reading);
    },
    async done() {
      while (pending.size > 0) await Promise.all([...pending]);
    },
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

export async function scanPassFolders(
  vault: FileSystemDirectoryHandle,
  linksIn: (directory: string) => Promise<string[]>,
): Promise<Required<Pick<PassScan, 'dirs' | 'links'>> & { pages: { path: string; text: string | null }[] }> {
  const pages: { path: string; text: string | null }[] = [];
  const dirs: string[] = [];
  const links: string[] = [];
  const walk = async (directory: FileSystemDirectoryHandle, prefix: string, readPages: boolean) => {
    dirs.push(prefix);
    for (const name of await linksIn(prefix)) links.push(`${prefix}/${name}`);
    for await (const [name, entry] of (directory as unknown as { entries(): AsyncIterable<[string, FileSystemHandle]> }).entries()) {
      if (name.startsWith('.')) continue;
      const path = `${prefix}/${name}`;
      if (entry.kind === 'directory') await walk(entry as FileSystemDirectoryHandle, path, readPages);
      else if (readPages && name.toLowerCase().endsWith('.md')) {
        pages.push({ path, text: await (entry as FileSystemFileHandle).getFile().then((file) => file.text(), () => null) });
      }
    }
  };
  const rootLinks = new Set((await linksIn('')).map(pageIdentity));
  for (const [folder, readPages] of [['wiki', true], ['sources', false]] as const) {
    if (rootLinks.has(pageIdentity(folder))) {
      links.push(folder);
      continue;
    }
    let directory: FileSystemDirectoryHandle;
    try {
      directory = await vault.getDirectoryHandle(folder);
    } catch (error) {
      if (isNotFoundError(error)) continue;
      throw error;
    }
    await walk(directory, folder, readPages);
  }
  return { pages, dirs, links };
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
      const changed = roundDraftProblem(now);
      if (changed) undone.push({ path, ...changed, action: 'left' });
      else leftAsIs.push(path);
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
