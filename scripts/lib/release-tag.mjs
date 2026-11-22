/**
 * The one reader of a desktop release tag. Two shapes exist: `vX.Y.Z` is a stable release, which the
 * updater feed and `/download` follow; `vX.Y.Z-beta.N` (N from 1) is a beta release, a GitHub
 * pre-release only someone who installs it by hand receives. Version files say `X.Y.Z` in both
 * cases, because promotion publishes the beta's bytes unchanged under the stable tag.
 */

const NUMBER = '(0|[1-9][0-9]*)';
const RELEASE_TAG = new RegExp(`^v${NUMBER}\\.${NUMBER}\\.${NUMBER}(?:-beta\\.([1-9][0-9]*))?$`);

export const RELEASE_TAG_SHAPES = 'vMAJOR.MINOR.PATCH or vMAJOR.MINOR.PATCH-beta.N (N from 1)';

/**
 * @param {unknown} tag
 * @returns {{ tag: string, version: string, channel: 'stable' | 'beta', beta: number | null, stableTag: string }}
 */
export function parseReleaseTag(tag) {
  if (typeof tag !== 'string' || tag.length === 0) {
    throw new Error(`release tag is empty; expected ${RELEASE_TAG_SHAPES}.`);
  }
  const match = RELEASE_TAG.exec(tag);
  if (!match) {
    throw new Error(`release tag ${tag} is not ${RELEASE_TAG_SHAPES}; every other suffix is refused.`);
  }
  const version = `${match[1]}.${match[2]}.${match[3]}`;
  const beta = match[4] === undefined ? null : Number(match[4]);
  return {
    tag,
    version,
    channel: beta === null ? 'stable' : 'beta',
    beta,
    stableTag: `v${version}`,
  };
}

/** True only for a tag `parseReleaseTag` accepts; for callers that branch rather than refuse. */
export function isReleaseTag(tag) {
  try {
    parseReleaseTag(tag);
    return true;
  } catch {
    return false;
  }
}
