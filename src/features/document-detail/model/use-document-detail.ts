'use client';

import { useCallback, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { bundledSamples, type DocumentRef, type VaultDocDetail } from '@/entities/docs-vault';
import { useGrantedVaultFiles } from '@/entities/vault-session';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { documentStoreFor, type ResolvedDocumentStore } from './document-store-for';

/** `null`: the document cannot be read. */
export type DocumentDetailAnswer = VaultDocDetail | null;
/** For a surface that shows no outline: a bundled sample then never fetches its headings chunk. */
export type DocumentSummaryAnswer = Omit<VaultDocDetail, 'headings'> | null;

interface DetailOptions {
  headings?: boolean;
}

/** The answer last shown: data and the source's identity only, never a store or its handles. */
interface Shown {
  origin: object;
  paths: string;
  key: string;
  value: DocumentDetailAnswer[];
}

function sameAnswers(a: readonly DocumentDetailAnswer[], b: readonly DocumentDetailAnswer[]): boolean {
  return a.length === b.length && a.every((detail, index) => detail === b[index]);
}

const getServerSample = () => null;

function useResolvedStore(doc: DocumentRef | undefined, headings: boolean): ResolvedDocumentStore | null {
  const local = useGrantedVaultFiles();
  const dogfood = useSyncExternalStore(bundledSamples.subscribe, () => bundledSamples.peek('dogfood'), getServerSample);
  const storefront = useSyncExternalStore(bundledSamples.subscribe, () => bundledSamples.peek('storefront'), getServerSample);
  return useMemo(
    () => (doc ? documentStoreFor(doc, local, [dogfood, storefront], { headings }) : null),
    [doc, local, dogfood, storefront, headings],
  );
}

function stampedKey(docs: readonly DocumentRef[]): string {
  return docs.map((doc) => `${doc.mtime ?? ''}\u0000${doc.path}`).join('\n');
}

/**
 * Detail for the documents a surface shows, all from one source: `undefined` until every answer
 * is known. While a newer version of the same documents is read, the answer for the version
 * already shown stays, so a save never empties a surface.
 */
export function useDocumentDetails(docs: readonly DocumentRef[] | null | undefined): DocumentDetailAnswer[] | undefined;
export function useDocumentDetails(
  docs: readonly DocumentRef[] | null | undefined,
  options: { headings: false },
): DocumentSummaryAnswer[] | undefined;
export function useDocumentDetails(
  docs: readonly DocumentRef[] | null | undefined,
  { headings = true }: DetailOptions = {},
): DocumentDetailAnswer[] | undefined {
  return useDetailsFrom(docs, headings);
}

function useDetailsFrom(docs: readonly DocumentRef[] | null | undefined, headings: boolean): DocumentDetailAnswer[] | undefined {
  const resolved = useResolvedStore(docs?.[0], headings);
  const key = docs ? stampedKey(docs) : '';
  const paths = docs ? docs.map((doc) => doc.path).join('\n') : '';
  const [shown, setShown] = useState<Shown | null>(null);
  const origin = resolved?.origin ?? null;
  // An answer from another source, or for no documents, is forgotten so it holds nothing of that folder.
  const kept = shown && docs && shown.origin === origin ? shown : null;
  const cached = docs && resolved ? docs.map((doc) => resolved.store.peek(doc)) : undefined;
  const allCached = cached !== undefined && cached.every((detail) => detail !== undefined);
  const current = allCached ? (cached as VaultDocDetail[]) : kept?.key === key ? kept.value : undefined;
  const readNeeded = Boolean(docs && docs.length > 0 && resolved && current === undefined);
  // `key` stands for the documents: the same documents at the same stamps need no new read.
  const latestDocs = useLatestRef(docs);

  useEffect(() => {
    const asked = latestDocs.current;
    if (!asked || !resolved || !readNeeded) return undefined;
    let live = true;
    // After every effect of this commit, so a reader that adopts the text it reads is joined, not repeated.
    queueMicrotask(() => {
      if (!live) return;
      void resolved.store.details(asked).then((value) => {
        if (live) setShown({ origin: resolved.origin, paths, key, value });
      });
    });
    return () => {
      live = false;
    };
  }, [key, paths, resolved, readNeeded, latestDocs]);

  // Whatever is shown is remembered, cache-served or read, so a rebuild that empties the cache
  // keeps it on screen until the new version arrives.
  const next = current !== undefined && origin ? { origin, paths, key, value: current } : kept;
  if (next !== shown && !(next && shown && next.key === shown.key && next.origin === shown.origin && sameAnswers(next.value, shown.value))) {
    setShown(next);
  }

  if (!docs) return undefined;
  if (!resolved) return docs.map(() => null);
  if (current !== undefined) return current;
  return kept && kept.paths === paths ? kept.value : undefined;
}

export function useDocumentDetail(doc: DocumentRef | null | undefined): DocumentDetailAnswer | undefined;
export function useDocumentDetail(
  doc: DocumentRef | null | undefined,
  options: { headings: false },
): DocumentSummaryAnswer | undefined;
export function useDocumentDetail(
  doc: DocumentRef | null | undefined,
  { headings = true }: DetailOptions = {},
): DocumentDetailAnswer | undefined {
  const docs = useMemo(() => (doc ? [doc] : null), [doc]);
  return useDetailsFrom(docs, headings)?.[0];
}

/**
 * For a surface that reads a document's text itself (the open document): hand that read over, and
 * its detail derives from the same text, arriving with the body instead of after it.
 */
export function useAdoptDocumentText(): (doc: DocumentRef, text: Promise<string>) => void {
  const local = useGrantedVaultFiles();
  return useCallback(
    (doc: DocumentRef, text: Promise<string>) => {
      documentStoreFor(doc, local, [], { headings: true })?.store.adoptText(doc, text);
    },
    [local],
  );
}
