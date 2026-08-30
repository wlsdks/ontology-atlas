/**
 * Read the executable shell lines that make the Codex Run action a local dogfood path.
 * Comments and prefix lookalikes are intentionally not commands.
 */
export function inspectCodexRunContract(source) {
  const lines = String(source ?? "")
    .replace(/\r\n?/g, "\n")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.length > 0 && !line.startsWith("#"));
  const localBuildIndexes = lines
    .map((line, index) => line === "pnpm desktop:build:app:local" ? index : -1)
    .filter((index) => index >= 0);
  const releaseBuildIndexes = lines
    .map((line, index) => line === "pnpm desktop:build:app" ? index : -1)
    .filter((index) => index >= 0);
  const localBuildIndex = localBuildIndexes[0] ?? -1;
  const syncIndex = lines.indexOf("sync_existing_applications_copy");
  const verifyIndex = lines.findIndex((line) =>
    line.startsWith('pnpm desktop:verify-app -- "$DOGFOOD_APP_PATH"'),
  );
  return {
    exactLocalBuild: localBuildIndexes.length === 1 && releaseBuildIndexes.length === 0,
    ordered:
      localBuildIndex >= 0
      && localBuildIndex < syncIndex
      && syncIndex < verifyIndex,
  };
}
