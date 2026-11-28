/**
 * The identity rule of a vault node, as repository scripts read it: `uid:` is a lowercase UUIDv4
 * minted once, and `merged_uids:` lists the identities a merge absorbed. The server enforces the
 * same rule when it writes; `node-uid.test.mjs` holds the cases both must agree on.
 */
import { randomUUID } from 'node:crypto';

export const NODE_UID_PATTERN =
  '^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$';
const NODE_UID_RE = new RegExp(NODE_UID_PATTERN);

export function generateNodeUid() {
  return randomUUID();
}

export function nodeUidIssue(uid) {
  if (typeof uid !== 'string' || !NODE_UID_RE.test(uid)) {
    return (
      '`uid:` must be a lowercase UUIDv4 generated once for this node ' +
      '(example: 01890f3e-7b5d-4c0a-8f14-123456789abc). It is immutable and must not be derived from slug, title, or path.'
    );
  }
  return null;
}

/** Lowercase hex of equal length and dash positions sorts the same by code unit as by locale. */
function byCodeUnit(a, b) {
  if (a === b) return 0;
  return a < b ? -1 : 1;
}

/** Identities absorbed by a merge: lookup aliases only, never endpoints, URLs, file names or graph ids. */
export function inspectMergedUids(uid, mergedUids) {
  if (mergedUids === undefined) return { canonical: [], invalidIssue: null, nonCanonical: false };
  if (!Array.isArray(mergedUids)) {
    return {
      canonical: [],
      invalidIssue: '`merged_uids:` must be an array of lowercase UUIDv4 values.',
      nonCanonical: false,
    };
  }
  for (const value of mergedUids) {
    if (nodeUidIssue(value)) {
      return {
        canonical: [],
        invalidIssue: '`merged_uids:` may contain only lowercase UUIDv4 values.',
        nonCanonical: false,
      };
    }
    if (value === uid) {
      return {
        canonical: [],
        invalidIssue: "`merged_uids:` must not repeat the surviving node's `uid:`.",
        nonCanonical: false,
      };
    }
  }
  const canonical = [...new Set(mergedUids)].sort(byCodeUnit);
  return {
    canonical,
    invalidIssue: null,
    nonCanonical:
      canonical.length !== mergedUids.length ||
      canonical.some((value, index) => value !== mergedUids[index]),
  };
}
