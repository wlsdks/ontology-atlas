import assert from "node:assert/strict";
import test from "node:test";

import {
  formatElapsed,
  prChecksPassed,
  prCheckSummary,
  prMerged,
  prNextAction,
  prNextCommands,
  prReviewSatisfied,
} from "./pull-request-check.mjs";

const passed = { name: "Unit", status: "COMPLETED", conclusion: "SUCCESS" };
const failed = { name: "Lint", status: "COMPLETED", conclusion: "FAILURE", detailsUrl: "https://example.invalid/run/1" };

test("a pull request passes its checks only when it has some and every one succeeded", () => {
  assert.equal(prChecksPassed({ statusCheckRollup: [passed, passed] }), true);
  assert.equal(prChecksPassed({ statusCheckRollup: [passed, failed] }), false);
  assert.equal(prChecksPassed({ statusCheckRollup: [{ status: "IN_PROGRESS" }] }), false);
  assert.equal(prChecksPassed({ statusCheckRollup: [] }), false);
  assert.equal(prChecksPassed({}), false);
});

test("the check summary counts the successes and names every check that is not one", () => {
  assert.equal(prCheckSummary({ statusCheckRollup: [passed, passed] }), "2/2 checks successful");
  assert.equal(
    prCheckSummary({ statusCheckRollup: [passed, failed] }),
    "1/2 checks successful; blocked checks: Lint=FAILURE (https://example.invalid/run/1)",
  );
});

test("elapsed time reads in minutes, hours or days, whichever is the largest whole unit", () => {
  assert.equal(formatElapsed(0), "0m");
  assert.equal(formatElapsed(59 * 60_000), "59m");
  assert.equal(formatElapsed(60 * 60_000), "1h");
  assert.equal(formatElapsed(135 * 60_000), "2h 15m");
  assert.equal(formatElapsed(13 * 60 * 60_000), "13h");
  assert.equal(formatElapsed(24 * 60 * 60_000), "1d");
  assert.equal(formatElapsed(30 * 60 * 60_000), "1d 6h");
});

test("the next action lists a rerun of the checks and marking ready only when they apply", () => {
  const base = { prNumber: "12", repo: "o/r", url: "https://example.invalid/pr/12" };
  assert.equal(
    prNextAction({ ...base, checksOk: false, isDraft: true }),
    "Run gh pr checks 12 --repo o/r, then Run gh pr ready 12 --repo o/r, then Resolve PR review/merge blockers: https://example.invalid/pr/12",
  );
  assert.equal(
    prNextAction({ prNumber: "12", repo: "o/r", checksOk: true, isDraft: false }),
    "Resolve PR review/merge blockers: https://github.com/o/r/pull/12",
  );
  assert.deepEqual(prNextCommands({ ...base, checksOk: true, isDraft: false }), [
    "gh pr view 12 --repo o/r --json reviewDecision,mergeStateStatus,statusCheckRollup,url",
  ]);
  assert.deepEqual(prNextCommands({ ...base, checksOk: false, isDraft: true }), [
    "gh pr checks 12 --repo o/r",
    "gh pr view 12 --repo o/r --json reviewDecision,mergeStateStatus,statusCheckRollup,url",
    "gh pr ready 12 --repo o/r",
  ]);
});

test("review is satisfied without a decision or with an approval, and merged is read from state or date", () => {
  assert.equal(prReviewSatisfied({}), true);
  assert.equal(prReviewSatisfied({ reviewDecision: "APPROVED" }), true);
  assert.equal(prReviewSatisfied({ reviewDecision: "CHANGES_REQUESTED" }), false);
  assert.equal(prMerged(null), false);
  assert.equal(prMerged({ state: "MERGED" }), true);
  assert.equal(prMerged({ state: "OPEN", mergedAt: "2026-11-01T00:00:00Z" }), true);
  assert.equal(prMerged({ state: "OPEN" }), false);
});
