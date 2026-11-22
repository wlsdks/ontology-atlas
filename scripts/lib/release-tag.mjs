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

/** The commit identity a stable `latest.json` carries: the first twelve hex digits of the release commit. */
export const UPDATER_COMMIT_LENGTH = 12;
const FULL_COMMIT = /^[0-9a-f]{40}$/;
const UPDATER_VERSION = new RegExp(`^(${NUMBER}\\.${NUMBER}\\.${NUMBER})(?:\\+([0-9a-f]{${UPDATER_COMMIT_LENGTH}}))?$`);

/**
 * The `version` a stable `latest.json` carries: `X.Y.Z+<12 hex>`. A beta and the stable promoted from
 * it share `X.Y.Z`; the build metadata lets an installed app built from another commit of that
 * version be offered the stable (`src-tauri/src/update_offer.rs`). Precedence ignores it.
 */
export function updaterManifestVersion(version, commit) {
  if (typeof commit !== 'string' || !FULL_COMMIT.test(commit)) {
    throw new Error(`release commit ${String(commit)} is not a full lowercase 40-hex commit.`);
  }
  const parsed = splitUpdaterManifestVersion(version);
  if (parsed.commit !== null) throw new Error(`version ${version} already carries build metadata.`);
  return `${parsed.version}+${commit.slice(0, UPDATER_COMMIT_LENGTH)}`;
}

/**
 * Reads a `latest.json` version: `X.Y.Z`, or `X.Y.Z+<12 hex>` since releases name their commit.
 * Every other shape throws. `version` is what a person reads; `commit` is never shown.
 * @returns {{ version: string, commit: string | null }}
 */
export function splitUpdaterManifestVersion(value) {
  const match = typeof value === 'string' ? UPDATER_VERSION.exec(value) : null;
  if (!match) {
    throw new Error(`updater version ${String(value)} is neither X.Y.Z nor X.Y.Z+<${UPDATER_COMMIT_LENGTH} lowercase hex>.`);
  }
  return { version: match[1], commit: match[5] ?? null };
}
