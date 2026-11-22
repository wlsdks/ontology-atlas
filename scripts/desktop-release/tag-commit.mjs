/**
 * Peels a lightweight or annotated remote Git tag to its commit through the GitHub API. `readJson`
 * runs one `gh` argument list and returns its parsed JSON; `fail` throws or exits with a message.
 */

const MAX_TAG_PEEL_DEPTH = 8;
const FULL_SHA = /^[0-9a-f]{40}$/i;

function requireGitObject(object, context, fail) {
  if (!object || !["commit", "tag"].includes(object.type) || !FULL_SHA.test(object.sha ?? "")) {
    fail(`${context} did not resolve to a valid Git commit or tag object.`);
  }
  return { type: object.type, sha: object.sha.toLowerCase() };
}

export function resolveTagCommit({ repo, tag, readJson, fail }) {
  const ref = readJson(["api", `repos/${repo}/git/ref/tags/${tag}`]);
  let object = requireGitObject(ref?.object, `release tag ${tag}`, fail);
  const seen = new Set();
  for (let depth = 0; depth <= MAX_TAG_PEEL_DEPTH; depth += 1) {
    if (object.type === "commit") return object.sha;
    if (seen.has(object.sha)) fail(`release tag ${tag} contains an annotated-tag cycle at ${object.sha}.`);
    if (depth === MAX_TAG_PEEL_DEPTH) fail(`release tag ${tag} exceeds the ${MAX_TAG_PEEL_DEPTH}-object peel limit.`);
    seen.add(object.sha);
    const tagObject = readJson(["api", `repos/${repo}/git/tags/${object.sha}`]);
    object = requireGitObject(tagObject?.object, `annotated tag object ${object.sha}`, fail);
  }
  fail(`release tag ${tag} could not be peeled to a commit.`);
  return "";
}

export function requireDefaultBranchCommit({ repo, branch, readJson, fail }) {
  const ref = readJson(["api", `repos/${repo}/git/ref/heads/${branch}`]);
  const object = requireGitObject(ref?.object, `${repo} ${branch} head`, fail);
  if (object.type !== "commit") fail(`${repo} ${branch} head is not a commit.`);
  return object.sha;
}
