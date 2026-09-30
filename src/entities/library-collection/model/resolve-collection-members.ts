import type { LibraryCollectionItem } from './library-collection';

export interface CollectionIdentityDocument {
  slug: string;
  title: string;
  frontmatter: Record<string, unknown>;
}

export type ResolvedCollectionMember =
  | {
      status: 'resolved';
      identityResolution: 'current' | 'merged';
      item: LibraryCollectionItem;
      document: CollectionIdentityDocument;
      currentUid: string;
    }
  | {
      status: 'unresolved';
      reason: 'missing' | 'ambiguous';
      item: LibraryCollectionItem;
    };

function mergedUids(value: unknown): string[] {
  return Array.isArray(value) ? value.filter((uid): uid is string => typeof uid === 'string') : [];
}

/** O(D + U + I) UID resolution; D documents, U merged claims, I items. Paths never recover identity. */
export function resolveCollectionMembers(
  items: readonly LibraryCollectionItem[],
  documents: readonly CollectionIdentityDocument[],
): ResolvedCollectionMember[] {
  const ontologyItems = items.filter((item): item is LibraryCollectionItem & {
    target: Extract<LibraryCollectionItem['target'], { kind: 'ontology' }>;
  } => item.target.kind === 'ontology');
  if (ontologyItems.length === 0) return [];
  const documentByUid = new Map<string, CollectionIdentityDocument | null>();
  for (const document of documents) {
    const claims = new Set(mergedUids(document.frontmatter.merged_uids));
    const uid = document.frontmatter.uid;
    if (typeof uid === 'string') claims.add(uid);
    for (const claim of claims) {
      documentByUid.set(claim, documentByUid.has(claim) ? null : document);
    }
  }
  return ontologyItems.map((item): ResolvedCollectionMember => {
    const targetUid = item.target.uid;
    const document = documentByUid.get(targetUid);
    if (!document) {
      return { status: 'unresolved', reason: document === null ? 'ambiguous' : 'missing', item };
    }
    const currentUid = document.frontmatter.uid;
    if (typeof currentUid !== 'string') return { status: 'unresolved', reason: 'ambiguous', item };
    return {
      status: 'resolved',
      identityResolution: currentUid === targetUid ? 'current' : 'merged',
      item,
      document,
      currentUid,
    };
  });
}
