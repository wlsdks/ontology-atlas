'use client';

import { useCallback, useContext, useEffect, useMemo, useState, useSyncExternalStore } from 'react';
import { bundledSamples, type DocumentRef, type VaultDocDetail } from '@/entities/docs-vault';
import { useLatestRef } from '@/shared/lib/use-latest-ref';
import { LocalVaultContext } from '../local-vault-context';
import { documentStoreFor, type LocalFolderFiles, type ResolvedDocumentStore } from './document-store-for';

/** `null`: the document cannot be read. */
export type DocumentDetailAnswer = VaultDocDetail | null;
/** For a surface that shows no outline: a bundled sample then never fetches its headings chunk. */
export type DocumentSummaryAnswer = Omit<VaultDocDetail, 'headings'> | null;

interface DetailOptions {
  headings?: boolean;
}

interface Answered {
  key: string;
  paths: string;
  resolved: ResolvedDocumentStore;
  value: DocumentDetailAnswer[];
}

const getServerSample = () => null;

function useLocalFolderFiles(): LocalFolderFiles | null {
  // The context itself, so a surface mounted outside the provider reads bundled detail only.
  const vault = useContext(LocalVaultContext);
  const root = vault && (vault.status === 'loaded' || vault.isReloadingSameVault) ? vault.handle : null;
  const fileHandles = vault?.fileHandles;
  return useMemo(() => (root && fileHandles ? { root, fileHandles } : null), [root, fileHandles]);
}

function useResolvedStore(doc: DocumentRef | undefined, headings: boolean): ResolvedDocumentStore | null {
  const local = useLocalFolderFiles();
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
  const [answered, setAnswered] = useState<Answered | null>(null);
  const cached = docs && resolved ? docs.map((doc) => resolved.store.peek(doc)) : undefined;
  const allCached = cached !== undefined && cached.every((detail) => detail !== undefined);
  // `key` stands for the documents: the same documents at the same stamps need no new read.
  const latestDocs = useLatestRef(docs);

  useEffect(() => {
    const asked = latestDocs.current;
    if (!asked || asked.length === 0 || !resolved || allCached) return undefined;
    let live = true;
    // After every effect of this commit, so a reader that adopts the text it reads is joined, not repeated.
    queueMicrotask(() => {
      if (!live) return;
      void resolved.store.details(asked).then((value) => {
        if (live) setAnswered({ key, paths, resolved, value });
      });
    });
    return () => {
      live = false;
    };
  }, [key, paths, resolved, allCached, latestDocs]);

  if (!docs) return undefined;
  if (!resolved) return docs.map(() => null);
  if (allCached) return cached as VaultDocDetail[];
  if (answered && answered.resolved === resolved && answered.key === key) return answered.value;
  if (answered && answered.resolved.origin === resolved.origin && answered.paths === paths) return answered.value;
  return undefined;
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
  const local = useLocalFolderFiles();
  return useCallback(
    (doc: DocumentRef, text: Promise<string>) => {
      documentStoreFor(doc, local, [], { headings: true })?.store.adoptText(doc, text);
    },
    [local],
  );
}
