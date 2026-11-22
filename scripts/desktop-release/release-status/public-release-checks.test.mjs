import assert from "node:assert/strict";
import test from "node:test";

import { isNotFound, releaseMissingNext, releasePublishCommands } from "./public-release-checks.mjs";

test("a gh failure counts as not found only when it says 404 or names a missing release", () => {
  assert.equal(isNotFound("gh: Not Found (HTTP 404)"), true);
  assert.equal(isNotFound("release not found"), true);
  assert.equal(isNotFound("HTTP 500: server error"), false);
  assert.equal(isNotFound("a1404b"), false);
});

test("the missing-release next step asks for a merge only while the pull request is open", () => {
  assert.match(releaseMissingNext({ prMerged: false, tag: "v1.2.3" }), /^Merge the desktop PR, configure/);
  assert.match(releaseMissingNext({ prMerged: true, tag: "v1.2.3" }), /^Configure the protected release-signing environment, create v1\.2\.3 /);
});

test("the publish commands run in order and begin with the pull request lookup only when one is named", () => {
  const without = releasePublishCommands({ repo: "o/r", tag: "v1.2.3", prNumber: "" });
  assert.equal(without[0], "pnpm desktop:release-github -- --repo=o/r --tag=v1.2.3");
  assert.equal(without.at(-1), "pnpm desktop:verify-download -- --repo=o/r --tag=v1.2.3");
  const withPr = releasePublishCommands({ repo: "o/r", tag: "v1.2.3", prNumber: "9" });
  assert.equal(withPr.length, without.length + 1);
  assert.match(withPr[0], /^gh pr view 9 --repo o\/r /);
});
