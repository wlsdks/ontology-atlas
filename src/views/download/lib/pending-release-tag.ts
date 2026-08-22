/**
 * What an unpublished release should **call itself**.
 *
 * Measured in QA 2026-07-28: one `/download` screen showed `v1.0.0-rc.3` (the title) and
 * "v1.0.0-rc.2 is not published yet" (the body) **at the same time**.
 *
 * The cause was two sources. The title branches on publication and uses `RELEASE_VERSION`
 * (= `package.json`) while unpublished; the body used the generated file's
 * (`macos-release.generated.ts`) `tag` **regardless of publication**. That generated file updates
 * only when a release actually ships, so in the window after a version bump and before a release
 * **a generation-old tag** survives.
 *
 * The rule: **only what is published is stated by the generated file.** The name of what has not
 * shipped comes from what the repository knows about itself right now (`RELEASE_VERSION`) — so a
 * version bump alone moves the screen, and there is nowhere for the two sentences to diverge.
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
