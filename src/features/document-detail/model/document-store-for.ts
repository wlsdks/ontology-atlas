import {
  createDocumentStore,
  type DocumentRef,
  type DocumentStore,
  type StaticVaultSource,
} from '@/entities/docs-vault';
import type { GrantedVaultFiles } from '@/entities/vault-session';
import { bundledDocsBySlug, createBundledDetailReader } from './bundled-detail-reader';
import { createLocalTextReader } from './local-text-reader';

export interface ResolvedDocumentStore {
  store: DocumentStore;
  /** The folder handle or the bundled sample; a different origin never shows another's detail. */
  origin: object;
}

/*
 * Keyed weakly by the build's handle map: a folder switch or a rebuild leaves the old store, its
 * cache and its handles unreachable, so nothing of an earlier folder outlives it.
 */
const localStores = new WeakMap<ReadonlyMap<string, FileSystemFileHandle>, DocumentStore>();
const bundledStores = { withHeadings: new WeakMap<StaticVaultSource, DocumentStore>(), withoutHeadings: new WeakMap<StaticVaultSource, DocumentStore>() };

function localStoreFor({ root, fileHandles }: GrantedVaultFiles): DocumentStore {
  let store = localStores.get(fileHandles);
  if (!store) {
    store = createDocumentStore({ readTexts: createLocalTextReader(root, fileHandles) });
    localStores.set(fileHandles, store);
  }
  return store;
}

function bundledStoreFor(sample: StaticVaultSource, headings: boolean): DocumentStore {
  const stores = headings ? bundledStores.withHeadings : bundledStores.withoutHeadings;
  let store = stores.get(sample);
  if (!store) {
    store = createDocumentStore({ readDetails: createBundledDetailReader(sample, { headings }) });
    stores.set(sample, store);
  }
  return store;
}

function sampleHolding(doc: DocumentRef, samples: readonly (StaticVaultSource | null)[]): StaticVaultSource | null {
  const loaded = samples.filter((sample): sample is StaticVaultSource => sample !== null);
  return (
    loaded.find((sample) => bundledDocsBySlug(sample).get(doc.slug) === doc) ??
    loaded.find((sample) => bundledDocsBySlug(sample).get(doc.slug)?.path === doc.path) ??
    null
  );
}

/**
 * A local document carries the stamp it was read at; a bundled one has none. `null`: no source can
 * read this document now.
 */
export function documentStoreFor(
  doc: DocumentRef,
  local: GrantedVaultFiles | null,
  samples: readonly (StaticVaultSource | null)[],
  { headings }: { headings: boolean },
): ResolvedDocumentStore | null {
  if (doc.mtime !== undefined) {
    return local ? { store: localStoreFor(local), origin: local.root } : null;
  }
  const sample = sampleHolding(doc, samples);
  return sample ? { store: bundledStoreFor(sample, headings), origin: sample } : null;
}
