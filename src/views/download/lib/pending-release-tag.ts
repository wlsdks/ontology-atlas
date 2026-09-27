/**
 * Only a published release takes its tag from the generated file, which lags a version bump;
 * an unpublished one is named from `RELEASE_VERSION`, or title and body disagree.
 */
export function resolveDisplayReleaseTag({
  published,
  publishedTag,
  releaseVersion,
}: {
  published: boolean;
  publishedTag: string;
  releaseVersion: string;
}): string {
  return published ? publishedTag : `v${releaseVersion}`;
}
