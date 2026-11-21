import assert from "node:assert/strict";
import test from "node:test";

import { blocked, ok, skipped } from "./check-result.mjs";
import { buildStatusPayload, renderMarkdownChecklist } from "./status-report.mjs";

const options = { repo: "o/r", tag: "v1.2.3", pr: "9" };
const NOW = "2026-11-22T00:00:00.000Z";

test("a payload with no blocker is ready and records when", () => {
  const payload = buildStatusPayload(options, [ok("github_cli_auth", "GitHub CLI auth", "fine"), skipped("local_preflight", "Local release preflight", "n/a")], NOW);
  assert.equal(payload.ready, true);
  assert.equal(payload.status, "ready");
  assert.equal(payload.readyAt, NOW);
  assert.equal(payload.blockedAt, null);
  assert.deepEqual(payload.nextActions, []);
});

test("blockers are grouped by scope and by the owner who has to act", () => {
  const checks = [
    ok("github_cli_auth", "GitHub CLI auth", "fine"),
    blocked("version_alignment", "Version alignment", "drift", "Align the versions.", ["pnpm desktop:release-tag"]),
    blocked("apple_release_secrets", "Secrets", "missing", "Set them.", [], { missingSecrets: ["APPLE_API_KEY_ID"] }),
  ];
  const payload = buildStatusPayload(options, checks, NOW);
  assert.equal(payload.ready, false);
  assert.equal(payload.blockerCount, 2);
  assert.deepEqual(payload.localBlockerIds, ["version_alignment"]);
  assert.deepEqual(payload.externalBlockerIds, ["apple_release_secrets"]);
  assert.deepEqual(payload.blockersByOwner, { developer: ["version_alignment"], release_operator: ["apple_release_secrets"] });
  assert.deepEqual(payload.missingSecrets, ["APPLE_API_KEY_ID"]);
  assert.deepEqual(payload.nextActionsByOwner.developer.map((action) => action.commands), [["pnpm desktop:release-tag"]]);
});

test("the Markdown checklist hands each owner their first command and ticks only what passed", () => {
  const checks = [
    ok("github_cli_auth", "GitHub CLI auth", "fine"),
    skipped("local_preflight", "Local release preflight", "n/a"),
    blocked("version_alignment", "Version alignment", "drift", "Align the versions.", ["pnpm desktop:release-tag", "second"]),
  ];
  const text = renderMarkdownChecklist(buildStatusPayload(options, checks, NOW));
  assert.match(text, /^# macOS Release Status\n/);
  assert.match(text, /### developer\n\n- Version alignment \(`version_alignment`\): Align the versions\.\n {2}- First command:\n {4}- `pnpm desktop:release-tag`\n/);
  assert.doesNotMatch(text, /`second`\n {2}- First/);
  assert.match(text, /- \[x\] GitHub CLI auth \(`github_cli_auth`\) - fine/);
  assert.match(text, /- \[-\] Local release preflight/);
  assert.match(text, /- \[ \] Version alignment \(`version_alignment`\) - drift/);
});

test("the Markdown checklist says so when nothing blocks the release", () => {
  const text = renderMarkdownChecklist(buildStatusPayload(options, [ok("github_cli_auth", "GitHub CLI auth", "fine")], NOW));
  assert.match(text, /## Blockers\n\nNo blockers\.\n/);
  assert.match(text, /- PR: #9\n/);
});
