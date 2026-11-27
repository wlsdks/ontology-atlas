import type { Page } from '@playwright/test';
import { installBriefingRuntime } from './change-briefing-fixture';

/** A tag on the read branch at `position` (0 is its tip), or off it on a commit whose parent is that position. */
export interface FixtureTag { position: number; names: string[]; offBranch?: boolean }
export interface ReleaseHistory {
  commits: number;
  tags: FixtureTag[];
  /** Line positions whose change edits the fixture vault's checkout capability. */
  checkout: number[];
}

/** Sixty changes, a beta before its final, two names on one commit, a hotfix off the branch, and a name without a version. */
export const SMALL_HISTORY: ReleaseHistory = {
  commits: 60,
  tags: [
    { position: 5, names: ['v2.0.0-rc.1'] },
    { position: 9, names: ['nightly'] },
    { position: 12, names: ['v1.2.0', 'latest'] },
    { position: 22, names: ['v1.1.1'] },
    { position: 30, names: ['v1.1.0'] },
    { position: 38, names: ['v1.1.0-beta.1'] },
    { position: 45, names: ['v1.0.1-hotfix'], offBranch: true },
    { position: 50, names: ['v1.0.0'] },
  ],
  checkout: [31, 33, 40],
};

/** 30,000 changes with a tag every sixth: 5,000 releases. */
export const LARGE_HISTORY: ReleaseHistory = {
  commits: 30_000,
  tags: Array.from({ length: 5_000 }, (_, index) => ({ position: 3 + index * 6, names: [`v${49 - Math.floor(index / 100)}.${99 - (index % 100)}.0`] })),
  checkout: [],
};

export interface ReleaseProbe { calls: { command: string; args: Record<string, unknown> }[]; holdWalks: boolean; releaseWalks: () => void }

/**
 * Answers the release reads from `history` in the page, after the Changes runtime; every other
 * command reaches that runtime. `holdWalks` keeps each walk step until `releaseWalks()`.
 */
export async function installReleasesRuntime(page: Page, history: ReleaseHistory, options: { holdWalks?: boolean } = {}) {
  await installBriefingRuntime(page);
  await page.addInitScript(({ history, holdWalks }) => {
    type Target = { __TAURI_INTERNALS__: { invoke(command: string, args?: Record<string, unknown>): Promise<unknown> }; __releaseProbe: ReleaseProbe };
    type ReleaseProbe = { calls: { command: string; args: Record<string, unknown> }[]; holdWalks: boolean; releaseWalks: () => void };
    const target = window as unknown as Target;
    const previous = target.__TAURI_INTERNALS__.invoke;
    const waiting: (() => void)[] = [];
    const probe: ReleaseProbe = { calls: [], holdWalks, releaseWalks: () => { probe.holdWalks = false; waiting.splice(0).forEach(resolve => resolve()); } };
    target.__releaseProbe = probe;
    const hex = (value: number) => value.toString(16).padStart(40, '0');
    const lineHash = (position: number) => hex(0x100000 + position);
    const sideHash = (position: number) => hex(0x900000 + position);
    const now = Math.floor(Date.now() / 1000);
    const epochAt = (position: number) => now - 3_600 - position * 5_400;
    const TYPES = ['feat', 'fix', 'chore', 'docs', 'refactor'];
    const titleAt = (position: number) => position % 7 === 6 ? `Tidy step ${position}` : `${TYPES[position % TYPES.length]}(area-${position % 4}): step ${position}`;
    const checkout = new Set(history.checkout);
    const tags = history.tags.map(tag => ({ commit: tag.offBranch ? sideHash(tag.position) : lineHash(tag.position), committedAt: tag.offBranch ? epochAt(tag.position) + 2_700 : epochAt(tag.position), names: tag.names }));
    const tagged = new Set(tags.map(tag => tag.commit));
    const offParent = new Map(history.tags.filter(tag => tag.offBranch).map(tag => [sideHash(tag.position), tag.position]));
    const HEAD = lineHash(0);
    /** The first-parent history from `tip`, as line positions; an off-branch tip leads with -1. */
    const historyFrom = (tip: string) => {
      if (offParent.has(tip)) return { own: tip, from: offParent.get(tip)! };
      const at = Number.parseInt(tip, 16) - 0x100000;
      return { own: null, from: at };
    };
    const commitAt = (position: number) => ({
      hash: lineHash(position), subject: titleAt(position), message: `${titleAt(position)}\n\nWritten for the release fixture.`,
      committedAt: new Date(epochAt(position) * 1000).toISOString(),
      paths: [`src/area-${position % 4}/file-${position % 9}.ts`, ...(checkout.has(position) ? ['src/features/checkout/service.ts'] : [])],
    });
    const parseKey = (args: Record<string, unknown>) => String(args.snapshot ?? '');
    target.__TAURI_INTERNALS__.invoke = async (command, args = {}) => {
      if (!/^git_(change|source)_release/.test(command)) return previous(command, args);
      probe.calls.push({ command, args });
      const snapshot = `releases-${history.commits}-${tags.length}`;
      const base = { sourceRoot: '/source/storefront', head: HEAD, line: 'main' };
      if (command.endsWith('_releases')) return { ...base, status: 'measured', snapshot, tags, unreadableNames: 0, partialReasons: [], walkStep: 20_000, walkLimit: 100_000 };
      if (parseKey(args) !== snapshot) return { status: 'stale' };
      if (command.endsWith('_walk')) {
        if (probe.holdWalks) await new Promise<void>(resolve => waiting.push(resolve));
        const skip = Number(args.skip);
        const { own, from } = historyFrom(String(args.tip));
        const length = (own ? 1 : 0) + history.commits - from;
        const end = Math.min(length, skip + 20_000);
        const kinds: number[] = [];
        const marks: { position: number; commit: string }[] = [];
        for (let index = skip; index < end; index++) {
          const linePosition = own ? (index === 0 ? null : from + index - 1) : from + index;
          const commit = linePosition === null ? own! : lineHash(linePosition);
          const title = linePosition === null ? 'fix: hotfix' : titleAt(linePosition);
          const type = /^(\w+)\(/.exec(title)?.[1] ?? /^(\w+):/.exec(title)?.[1];
          kinds.push(type ? TYPES.indexOf(type) : -1);
          if (tagged.has(commit)) marks.push({ position: index, commit });
        }
        return { status: 'measured', skip, kinds, types: TYPES, marks, ended: end === length };
      }
      const tip = String(args.tip);
      const start = args.base === null ? null : String(args.base);
      const { own, from } = historyFrom(tip);
      const stop = start === null ? history.commits : Number.parseInt(start, 16) - 0x100000;
      const commits = [...(own ? [{ ...commitAt(from), hash: own, subject: 'fix: hotfix', message: 'fix: hotfix', paths: ['src/hotfix.ts'] }] : []),
        ...Array.from({ length: Math.max(0, stop - from) }, (_, index) => commitAt(from + index))];
      const limited = commits.length > 2_000;
      const kept = commits.slice(0, 2_000);
      return { ...base, status: limited ? 'partial' : 'measured', snapshot: `span-${tip}-${start}`, base: start, tip: kept[0]?.hash ?? null, commits: kept, netPaths: [], limit: 2_000, partialReasons: limited ? ['commit-limit'] : [] };
    };
  }, { history, holdWalks: options.holdWalks ?? false });
}

export async function releaseCalls(page: Page) {
  return page.evaluate(() => (window as unknown as { __releaseProbe: ReleaseProbe }).__releaseProbe.calls);
}

export async function releaseWalks(page: Page) {
  await page.evaluate(() => (window as unknown as { __releaseProbe: ReleaseProbe }).__releaseProbe.releaseWalks());
}
