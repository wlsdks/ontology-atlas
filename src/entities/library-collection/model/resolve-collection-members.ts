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

/** Resolves ontology collection members by immutable UID claims only; paths never recover identity. */
export function resolveCollectionMembers(
  items: readonly LibraryCollectionItem[],
  documents: readonly CollectionIdentityDocument[],
): ResolvedCollectionMember[] {
  return items.flatMap((item): ResolvedCollectionMember[] => {
    if (item.target.kind !== 'ontology') return [];
    const targetUid = item.target.uid;
    const claimants = documents.filter((document) =>
      document.frontmatter.uid === targetUid || mergedUids(document.frontmatter.merged_uids).includes(targetUid),
    );
    if (claimants.length !== 1) {
      return [{ status: 'unresolved', reason: claimants.length === 0 ? 'missing' : 'ambiguous', item }];
    }
    const document = claimants[0];
    const currentUid = document.frontmatter.uid;
    if (typeof currentUid !== 'string') return [{ status: 'unresolved', reason: 'ambiguous', item }];
    return [{
      status: 'resolved',
      identityResolution: currentUid === targetUid ? 'current' : 'merged',
      item,
      document,
      currentUid,
    }];
  });
}
