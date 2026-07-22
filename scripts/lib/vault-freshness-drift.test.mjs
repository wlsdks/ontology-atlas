import { strict as assert } from "node:assert";
import test from "node:test";
import {
  FRESHNESS_COMMENT_MARKER,
  buildFreshnessCommentMarkdown,
  computeTouchedNodeSlugs,
  computeVaultFreshnessDrift,
  matchChangedFilesToVaultNodes,
} from "./vault-freshness-drift.mjs";

function doc(slug, frontmatter) {
  return { slug, frontmatter };
}

test("computeTouchedNodeSlugs — maps vault .md changes to slugs, ignores everything else", () => {
  const slugs = computeTouchedNodeSlugs(
    ["docs/ontology/capabilities/foo.md", "src/features/foo/index.ts", "docs/README.md"],
    "docs/ontology",
  );
  assert.deepEqual([...slugs], ["capabilities/foo"]);
});

test("matchChangedFilesToVaultNodes — element path: exact match", () => {
  const docs = [doc("elements/token", { kind: "element", title: "Token", path: "src/token.ts" })];
  const matches = matchChangedFilesToVaultNodes(docs, ["src/token.ts"]);
  assert.equal(matches.length, 1);
  assert.equal(matches[0].slug, "elements/token");
});

test("matchChangedFilesToVaultNodes — capability elements[] directory containment", () => {
  const docs = [doc("capabilities/auth", { kind: "capability", elements: ["src/features/auth/"] })];
  const matches = matchChangedFilesToVaultNodes(docs, ["src/features/auth/token.ts"]);
  assert.equal(matches.length, 1);
  assert.deepEqual(matches[0].matchedFiles, ["src/features/auth/token.ts"]);
});

test("computeVaultFreshnessDrift — flags a node whose source changed but whose .md did not", () => {
  const docs = [
    doc("capabilities/auth", {
      kind: "capability",
      title: "Auth",
      domain: "auth",
      elements: ["src/features/auth/"],
    }),
  ];
  const result = computeVaultFreshnessDrift({
    docs,
    changedFiles: ["src/features/auth/token.ts"],
    vaultDir: "docs/ontology",
  });
  assert.equal(result.matchedTotal, 1);
  assert.equal(result.staleNodes.length, 1);
  assert.equal(result.staleNodes[0].slug, "capabilities/auth");
  assert.deepEqual(result.touchedNodeSlugs, []);
});

test("computeVaultFreshnessDrift — a node is NOT stale when its own .md changed in the same PR", () => {
  const docs = [
    doc("capabilities/auth", { kind: "capability", title: "Auth", elements: ["src/features/auth/"] }),
  ];
  const result = computeVaultFreshnessDrift({
    docs,
    changedFiles: ["src/features/auth/token.ts", "docs/ontology/capabilities/auth.md"],
    vaultDir: "docs/ontology",
  });
  assert.equal(result.matchedTotal, 1);
  assert.deepEqual(result.staleNodes, []);
  assert.deepEqual(result.touchedNodeSlugs, ["capabilities/auth"]);
});

test("computeVaultFreshnessDrift — no changed files touching any node returns empty, 0 noise", () => {
  const docs = [doc("elements/x", { kind: "element", path: "src/x.ts" })];
  const result = computeVaultFreshnessDrift({
    docs,
    changedFiles: ["README.md"],
    vaultDir: "docs/ontology",
  });
  assert.deepEqual(result.staleNodes, []);
  assert.equal(result.matchedTotal, 0);
});

test("computeVaultFreshnessDrift — the vault's own .md changes are never matched as source paths", () => {
  // A capability's `elements:` referencing an ontology slug (not a path) must
  // never accidentally match the vault doc's own changed .md file.
  const docs = [
    doc("capabilities/auth", { kind: "capability", elements: ["elements/token-issue"] }),
  ];
  const result = computeVaultFreshnessDrift({
    docs,
    changedFiles: ["docs/ontology/elements/token-issue.md"],
    vaultDir: "docs/ontology",
  });
  assert.deepEqual(result.staleNodes, []);
  assert.equal(result.matchedTotal, 0);
});

test("buildFreshnessCommentMarkdown — returns null for an empty stale list (no comment, no noise)", () => {
  assert.equal(buildFreshnessCommentMarkdown([]), null);
  assert.equal(buildFreshnessCommentMarkdown(undefined), null);
});

test("buildFreshnessCommentMarkdown — includes the stable marker and one row per stale node", () => {
  const markdown = buildFreshnessCommentMarkdown([
    { slug: "capabilities/auth", kind: "capability", matchedFiles: ["src/features/auth/token.ts"] },
    { slug: "elements/token", kind: "element", matchedFiles: ["src/token.ts"] },
  ]);
  assert.ok(markdown.startsWith(FRESHNESS_COMMENT_MARKER));
  assert.match(markdown, /2 node\(s\) may go stale/);
  assert.match(markdown, /`capabilities\/auth`/);
  assert.match(markdown, /`src\/features\/auth\/token\.ts`/);
  assert.match(markdown, /ontology-atlas node capabilities\/auth/);
  assert.match(markdown, /ontology-atlas node elements\/token/);
});
