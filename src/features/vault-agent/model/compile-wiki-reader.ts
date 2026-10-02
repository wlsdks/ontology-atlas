import { parseFrontmatter } from '@/shared/lib/parse-frontmatter';
import { isWikiFurnitureSlug, WIKI_DIR } from '@/shared/lib/wiki-page-schema';

import { wrapUntrusted } from './concept-evidence-pack';
import type { ToolExecution } from './tool-executor';
import { AGENT_TURN_VAULT_CHAR_CAP } from './types';

const WIKI_CHUNK_CHAR_CAP = 4_000;
const WIKI_BASENAME_PATTERN = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;

export type CompileWikiPageSnapshot = { text: string; mtime: number };

export interface CompileWikiTarget {
  slug: string;
  path: string;
}

export interface CompileWikiReadState {
  target: CompileWikiTarget;
  exists: boolean;
  snapshot: CompileWikiPageSnapshot | null;
  nextCursor: number | null;
  receipt: string | null;
  failed: boolean;
}

export interface CompileWikiReaderOptions {
  /** Counts only the untrusted page text that will cross the next model boundary. */
  reserveVaultChars?: (chars: number) => boolean;
  /** Reports the cumulative amount already transferred when a chunk is refused. */
  vaultCharsUsed?: () => number;
  /** Lets the executor revoke an already-ready proposal after a later read failure. */
  onFailure?: (slug: string, code: string, message: string) => void;
}

/** A reserved retained-answer path that Compile may never inspect or replace. */
function isReservedAnswerSlug(slug: string): boolean {
  return slug === `${WIKI_DIR}/answers` || slug.startsWith(`${WIKI_DIR}/answers/`);
}

/** Existing pages resolve only from the inventory, or a model string becomes an arbitrary file. */
function wikiAddress(value: unknown): string | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || /[\\#?\u0000-\u001f\u007f]/.test(raw)) return null;
  const slug = raw.replace(/\.md$/i, '');
  if (!slug.startsWith(`${WIKI_DIR}/`)) return null;
  const parts = slug.split('/');
  if (
    parts.length < 2 ||
    parts.some((part) => !part || part === '.' || part === '..' || part.startsWith('.') || part.startsWith('_'))
  ) {
    return null;
  }
  if (isReservedAnswerSlug(slug) || isWikiFurnitureSlug(slug)) return null;
  return slug;
}

export function isCompileWikiPath(value: string): boolean {
  return value.endsWith('.md') && wikiAddress(value) === value.slice(0, -'.md'.length);
}

/** New pages remain root pages with the strict, portable basename contract. */
function newWikiTarget(value: unknown): CompileWikiTarget | null {
  if (typeof value !== 'string') return null;
  const raw = value.trim();
  if (!raw || /[\\#?\u0000-\u001f\u007f]/.test(raw)) return null;

  let basename = raw;
  if (raw.startsWith(`${WIKI_DIR}/`)) {
    if (!raw.endsWith('.md') || raw.slice(`${WIKI_DIR}/`.length, -'.md'.length).includes('/')) return null;
    basename = raw.slice(`${WIKI_DIR}/`.length, -'.md'.length);
  } else if (raw.includes('/')) {
    return null;
  }

  if (basename.length > 80 || !WIKI_BASENAME_PATTERN.test(basename)) return null;
  const slug = `${WIKI_DIR}/${basename}`;
  if (isWikiFurnitureSlug(slug) || isReservedAnswerSlug(slug)) return null;
  return { slug, path: `${slug}.md` };
}

function mintWikiReceipt(): string | null {
  const crypto = globalThis.crypto;
  try {
    if (crypto?.randomUUID) return crypto.randomUUID();
  } catch {
    // Fall through to the other Web Crypto primitive, if one is available.
  }
  if (crypto?.getRandomValues) {
    try {
      const bytes = new Uint8Array(18);
      crypto.getRandomValues(bytes);
      return [...bytes].map((byte) => byte.toString(16).padStart(2, '0')).join('');
    } catch {
      // Refuse below when the runtime cannot provide an unpredictable token.
    }
  }
  return null;
}

function finiteCursor(value: unknown): value is number {
  return typeof value === 'number' && Number.isSafeInteger(value) && value >= 0;
}

/** The one owner of addresses, inventory, snapshots, cursors and receipts for Compile's wiki reads. */
export function createCompileWikiReader(
  slugs: readonly string[],
  readPage: (slug: string) => Promise<CompileWikiPageSnapshot | null>,
  options: CompileWikiReaderOptions = {},
) {
  const inventory = new Set(
    slugs
      .map((slug) => wikiAddress(slug))
      .filter((slug): slug is string => slug !== null),
  );
  const states = new Map<string, CompileWikiReadState>();
  const reserveVaultChars = options.reserveVaultChars ?? (() => true);

  const target = (value: unknown): CompileWikiTarget | null => {
    const existing = resolve(value);
    if (existing) return { slug: existing, path: `${existing}.md` };
    return newWikiTarget(value);
  };

  function resolve(value: unknown): string | null {
    const exact = wikiAddress(value);
    if (exact && inventory.has(exact)) return exact;
    const root = newWikiTarget(value);
    return root && inventory.has(root.slug) ? root.slug : null;
  }

  function state(slug: string): CompileWikiReadState | null {
    const current = states.get(slug);
    if (!current) return null;
    return {
      ...current,
      target: { ...current.target },
      snapshot: current.snapshot ? { ...current.snapshot } : null,
    };
  }

  function invalidate(slug: string, code: string, message: string): void {
    const current = states.get(slug);
    if (current) current.failed = true;
    options.onFailure?.(slug, code, message);
  }

  function reportFailure(slug: string, code: string, message: string): void {
    options.onFailure?.(slug, code, message);
  }

  function failure(
    pageTarget: CompileWikiTarget | null,
    rawSlug: unknown,
    reason: string,
    summary: string,
    extra: Record<string, unknown> = {},
  ): ToolExecution {
    const path = pageTarget?.path ?? String(rawSlug ?? '');
    return {
      content: JSON.stringify({
        path,
        ...(pageTarget ? { slug: pageTarget.slug } : {}),
        readable: false,
        reason,
        refusal: reason,
        complete: false,
        ...extra,
      }),
      isError: true,
      outcome: 'error',
      target: path,
      summary,
      readSlugs: [],
      vaultChars: 0,
    };
  }

  function chunk(current: CompileWikiReadState): ToolExecution {
    const snapshot = current.snapshot;
    if (!snapshot) {
      return failure(current.target, current.target.slug, 'not-found', 'No Wiki page exists at this path', {
        exists: false,
        cursor: 0,
        nextCursor: null,
        coverage: { start: 0, end: 0, total: 0, complete: true },
      });
    }

    const cursor = current.nextCursor ?? 0;
    const end = Math.min(cursor + WIKI_CHUNK_CHAR_CAP, snapshot.text.length);
    const text = snapshot.text.slice(cursor, end);
    const complete = end === snapshot.text.length;
    const receipt = complete ? mintWikiReceipt() : null;
    if (complete && !receipt) {
      invalidate(
        current.target.slug,
        'wiki-receipt-unavailable',
        'The runtime could not mint an unpredictable Wiki replacement receipt.',
      );
      return failure(
        current.target,
        current.target.slug,
        'receipt-unavailable',
        'The complete Wiki read cannot authorize a replacement on this runtime',
        {
          exists: true,
          cursor,
          nextCursor: null,
          coverage: { start: cursor, end, total: snapshot.text.length, complete: false },
          remainingChars: 0,
        },
      );
    }
    if (!reserveVaultChars(text.length)) {
      invalidate(
        current.target.slug,
        'wiki-read-over-budget',
        'The current Wiki page could not be read within the 40,000-character turn budget.',
      );
      return failure(
        current.target,
        current.target.slug,
        'over-budget',
        'The Wiki read stopped before this chunk could be returned',
        {
          exists: true,
          cursor,
          nextCursor: cursor,
          coverage: { start: cursor, end: cursor, total: snapshot.text.length, complete: false },
          remainingChars: snapshot.text.length - cursor,
          budget: AGENT_TURN_VAULT_CHAR_CAP,
          used: options.vaultCharsUsed?.(),
        },
      );
    }

    current.nextCursor = complete ? null : end;
    current.receipt = receipt;
    return {
      content: JSON.stringify({
        path: current.target.path,
        slug: current.target.slug,
        exists: true,
        readable: true,
        cursor,
        // `from`/`next` stay as aliases for older local runners.
        from: cursor,
        nextCursor: current.nextCursor,
        ...(current.nextCursor === null ? {} : { next: current.nextCursor }),
        complete,
        truncated: !complete,
        coverage: { start: cursor, end, total: snapshot.text.length, complete },
        totalChars: snapshot.text.length,
        remainingChars: snapshot.text.length - end,
        text: wrapUntrusted(text),
        ...(current.receipt ? { receipt: current.receipt } : {}),
      }),
      isError: false,
      outcome: 'ok',
      target: current.target.path,
      summary: complete
        ? `Read ${current.target.path} completely; the replacement receipt is ready`
        : `Read ${current.target.path} characters ${cursor.toLocaleString('en-US')}–${end.toLocaleString('en-US')}`,
      readSlugs: [],
      vaultChars: text.length,
    };
  }

  return {
    resolve,
    target,
    newTarget: newWikiTarget,
    invalidate,
    state,
    snapshot(slug: string): CompileWikiPageSnapshot | null {
      const current = states.get(slug);
      if (!current || current.failed || !current.exists || current.nextCursor !== null || !current.receipt) return null;
      return current.snapshot ? { ...current.snapshot } : null;
    },
    async execute(args: Record<string, unknown>): Promise<ToolExecution> {
      const rawSlug = args.slug;
      const pageTarget = target(rawSlug);
      if (!pageTarget) {
        return failure(
          null,
          rawSlug,
          'path-refused',
          'Refused the Wiki path before opening the vault',
          { detail: 'Use a safe basename for a new page or an exact listed Wiki address for an existing page.' },
        );
      }

      const hasCursor = Object.prototype.hasOwnProperty.call(args, 'cursor');
      const hasFrom = Object.prototype.hasOwnProperty.call(args, 'from');
      const cursorProvided = hasCursor || hasFrom;
      const rawCursor = hasCursor ? args.cursor : args.from;
      if (cursorProvided && rawCursor !== undefined && !finiteCursor(rawCursor)) {
        invalidate(
          pageTarget.slug,
          'wiki-cursor-invalid',
          'The Wiki continuation cursor was not a non-negative integer.',
        );
        return failure(pageTarget, rawSlug, 'invalid-cursor', 'The Wiki continuation cursor is invalid', {
          cursor: rawCursor,
        });
      }

      const previous = states.get(pageTarget.slug);
      // A zero cursor may restart a failed or complete read, never skip an in-progress one.
      const initial =
        !cursorProvided ||
        rawCursor === undefined ||
        (rawCursor === 0 && (!previous || previous.failed || previous.nextCursor === null));
      if (initial) {
        if (previous && !previous.failed && previous.nextCursor !== null && !cursorProvided) {
          reportFailure(
            pageTarget.slug,
            'wiki-read-restarted',
            'The Wiki read was restarted before its previous cursor was consumed.',
          );
          return failure(pageTarget, rawSlug, 'cursor-required', 'Continue the existing Wiki read with its returned cursor');
        }
        if (previous) {
          invalidate(
            pageTarget.slug,
            'wiki-read-restarted',
            'The previous Wiki receipt is no longer valid; the page is being read again.',
          );
        }

        let page: CompileWikiPageSnapshot | null;
        try {
          page = await readPage(pageTarget.slug);
        } catch {
          if (previous) previous.failed = true;
          invalidate(pageTarget.slug, 'wiki-unreadable', `Could not read ${pageTarget.path} on this turn.`);
          return failure(pageTarget, rawSlug, 'unreadable', `Could not read ${pageTarget.path} on this turn`, {
            exists: previous?.exists ?? null,
            cursor: 0,
            nextCursor: null,
          });
        }

        if (!page) {
          if (previous?.exists) {
            previous.failed = true;
            invalidate(pageTarget.slug, 'wiki-page-deleted', `${pageTarget.path} disappeared while it was being read.`);
            return failure(pageTarget, rawSlug, 'page-deleted', `${pageTarget.path} disappeared while it was being read`, {
              exists: false,
              cursor: 0,
              nextCursor: null,
            });
          }
          const absent: CompileWikiReadState = {
            target: pageTarget,
            exists: false,
            snapshot: null,
            nextCursor: null,
            receipt: null,
            failed: false,
          };
          states.set(pageTarget.slug, absent);
          return {
            content: JSON.stringify({
              path: pageTarget.path,
              slug: pageTarget.slug,
              exists: false,
              readable: false,
              cursor: 0,
              from: 0,
              nextCursor: null,
              complete: true,
              truncated: false,
              coverage: { start: 0, end: 0, total: 0, complete: true },
              totalChars: 0,
              remainingChars: 0,
              text: '',
            }),
            isError: false,
            outcome: 'ok',
            target: pageTarget.path,
            summary: `${pageTarget.path} does not exist; a create-only proposal is allowed`,
            readSlugs: [],
            vaultChars: 0,
          };
        }

        const { frontmatter } = parseFrontmatter(page.text);
        if (typeof frontmatter.kind === 'string' && frontmatter.kind.trim()) {
          invalidate(pageTarget.slug, 'wiki-kind-present', `${pageTarget.slug} is an ontology node and cannot be compiled.`);
          return failure(pageTarget, rawSlug, 'wiki-kind-present', `${pageTarget.slug} is an ontology node and cannot be read or rewritten by Compile.`);
        }
        const current: CompileWikiReadState = {
          target: pageTarget,
          exists: true,
          snapshot: { text: page.text, mtime: page.mtime },
          nextCursor: 0,
          receipt: null,
          failed: false,
        };
        states.set(pageTarget.slug, current);
        return chunk(current);
      }

      if (!previous) {
        invalidate(pageTarget.slug, 'wiki-read-missing', 'The Wiki read must start at cursor 0 before a continuation.');
        return failure(pageTarget, rawSlug, 'missing-read', 'No prior Wiki read exists for this continuation');
      }
      if (previous.failed) return failure(pageTarget, rawSlug, 'read-invalidated', 'The previous Wiki read was invalidated; start a new turn');
      if (previous.nextCursor === null) {
        reportFailure(pageTarget.slug, 'wiki-read-complete', 'The Wiki page was already read completely; use its receipt for replacement.');
        return failure(pageTarget, rawSlug, 'read-complete', 'The Wiki page was already read completely');
      }
      if (rawCursor !== previous.nextCursor) {
        previous.failed = true;
        invalidate(pageTarget.slug, 'wiki-cursor-mismatch', 'The Wiki continuation cursor did not match the returned next cursor.');
        return failure(pageTarget, rawSlug, 'cursor-mismatch', 'The Wiki continuation cursor did not match the returned next cursor', {
          cursor: rawCursor,
          expectedCursor: previous.nextCursor,
        });
      }

      let current: CompileWikiPageSnapshot | null;
      try {
        current = await readPage(pageTarget.slug);
      } catch {
        previous.failed = true;
        invalidate(pageTarget.slug, 'wiki-unreadable', `Could not re-read ${pageTarget.path} on this turn.`);
        return failure(pageTarget, rawSlug, 'unreadable', `Could not re-read ${pageTarget.path} on this turn`, {
          exists: true,
          cursor: rawCursor,
        });
      }
      if (!current) {
        previous.failed = true;
        invalidate(pageTarget.slug, 'wiki-page-deleted', `${pageTarget.path} disappeared while it was being read.`);
        return failure(pageTarget, rawSlug, 'page-deleted', `${pageTarget.path} disappeared while it was being read`, {
          exists: false,
          cursor: rawCursor,
        });
      }
      if (current.text !== previous.snapshot?.text || !Object.is(current.mtime, previous.snapshot?.mtime)) {
        previous.failed = true;
        invalidate(pageTarget.slug, 'wiki-page-changed', `${pageTarget.path} changed while it was being read.`);
        return failure(pageTarget, rawSlug, 'page-changed', `${pageTarget.path} changed while it was being read`, {
          exists: true,
          cursor: rawCursor,
        });
      }
      return chunk(previous);
    },
  };
}
