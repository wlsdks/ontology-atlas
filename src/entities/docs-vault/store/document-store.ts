import { createLruCache, detailCacheKey, DETAIL_CACHE_CAPACITY } from './detail-cache';
import { deriveDocumentDetail, type DocumentRef, type VaultDocDetail } from './document-detail';

/** The most files one read call asks for, so a bridge reply stays bounded. */
export const DETAIL_READ_BATCH = 64;

/** Reads each document's file, in order; `null` for a file the source cannot or will not read. */
export type ReadDocumentTexts = (docs: readonly DocumentRef[]) => Promise<readonly (string | null)[]>;
/** Answers details without a file, for a source that already holds them (the bundled samples). */
export type ReadDocumentDetails = (docs: readonly DocumentRef[]) => Promise<readonly (VaultDocDetail | null)[]>;

export type DocumentStoreSource = { readTexts: ReadDocumentTexts } | { readDetails: ReadDocumentDetails };

export interface DocumentStore {
  /** The cached answer, without reading or touching recency; `undefined` when not cached. */
  peek(doc: DocumentRef): VaultDocDetail | undefined;
  detail(doc: DocumentRef): Promise<VaultDocDetail | null>;
  /** One answer per document, in order; reads only the uncached, at most `DETAIL_READ_BATCH` per call. */
  details(docs: readonly DocumentRef[]): Promise<(VaultDocDetail | null)[]>;
  /** Derives from text a surface is already reading, so asking for this document starts no read. */
  adoptText(doc: DocumentRef, text: Promise<string>): void;
}

/** O(documents asked) per call; a document already being read joins that read. */
export function createDocumentStore(
  source: DocumentStoreSource,
  capacity: number = DETAIL_CACHE_CAPACITY,
): DocumentStore {
  const cache = createLruCache<VaultDocDetail>(capacity);
  const inflight = new Map<string, Promise<VaultDocDetail | null>>();

  const load = async (docs: readonly DocumentRef[]): Promise<readonly (VaultDocDetail | null)[]> => {
    if ('readDetails' in source) return source.readDetails(docs);
    const texts = await source.readTexts(docs);
    return docs.map((_, index) => {
      const text = texts[index];
      return typeof text === 'string' ? deriveDocumentDetail(text) : null;
    });
  };

  const settle = (key: string, pending: Promise<VaultDocDetail | null>) => {
    const answer = pending.then((detail) => {
      if (detail) cache.set(key, detail);
      if (inflight.get(key) === answer) inflight.delete(key);
      return detail;
    });
    inflight.set(key, answer);
  };

  const readBatch = (keys: readonly string[], docs: readonly DocumentRef[]) => {
    const answers = load(docs).catch(() => docs.map(() => null));
    keys.forEach((key, index) => settle(key, answers.then((all) => all[index] ?? null)));
  };

  const details = (docs: readonly DocumentRef[]): Promise<(VaultDocDetail | null)[]> => {
    const keys = docs.map((doc) => detailCacheKey(doc.path, doc.mtime));
    const unread: { key: string; doc: DocumentRef }[] = [];
    const queued = new Set<string>();
    keys.forEach((key, index) => {
      if (cache.peek(key) !== undefined || inflight.has(key) || queued.has(key)) return;
      queued.add(key);
      unread.push({ key, doc: docs[index] });
    });
    for (let start = 0; start < unread.length; start += DETAIL_READ_BATCH) {
      const batch = unread.slice(start, start + DETAIL_READ_BATCH);
      readBatch(batch.map((item) => item.key), batch.map((item) => item.doc));
    }
    return Promise.all(keys.map((key) => {
      const cached = cache.get(key);
      return cached !== undefined ? cached : (inflight.get(key) ?? Promise.resolve(null));
    }));
  };

  return {
    peek: (doc) => cache.peek(detailCacheKey(doc.path, doc.mtime)),
    detail: async (doc) => (await details([doc]))[0],
    details,
    adoptText(doc, text) {
      const key = detailCacheKey(doc.path, doc.mtime);
      if (cache.peek(key) !== undefined || inflight.has(key)) return;
      settle(key, text.then(deriveDocumentDetail, () => null));
    },
  };
}
