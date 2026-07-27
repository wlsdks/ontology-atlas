import assert from "node:assert/strict";
import test from "node:test";
import { classify } from "./classify-change.mjs";

test("runs everything when shipped code changes", () => {
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(classify(["src/views/download/ui/DownloadPage.tsx"])),
  );
  assert.deepEqual({ runtime: true, browser: true }, pick(classify(["messages/ko.json"])));
  assert.deepEqual({ runtime: true, browser: true }, pick(classify(["package.json"])));
});

test("runs the unit suite but not a browser for non-rendering runtime code", () => {
  // MCP and CLI ship, but no rendered page depends on them.
  assert.deepEqual({ runtime: true, browser: false }, pick(classify(["mcp/src/index.js"])));
  assert.deepEqual({ runtime: true, browser: false }, pick(classify(["cli/src/lib/x.mjs"])));
  assert.deepEqual({ runtime: true, browser: false }, pick(classify(["src-tauri/src/lib.rs"])));
});

test("skips both for governance and prose — the case that motivated this", () => {
  // A session spent editing agent briefs booted a browser every time.
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(classify([".claude/agents/po-wedge.md", ".claude/skills/po-pass/SKILL.md"])),
  );
  assert.deepEqual({ runtime: false, browser: false }, pick(classify(["docs/DECISIONS.md"])));
  assert.deepEqual({ runtime: false, browser: false }, pick(classify(["AGENTS.md"])));
  // Contract tests read .claude/** — they still run, they are just not the
  // 270-second suite.
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(classify(["tests/contract/po-council.contract.test.ts"])),
  );
});

test("ignores generated doc bundles, or every prose edit looks like runtime", () => {
  assert.deepEqual(
    { runtime: false, browser: false },
    pick(classify(["docs/FEATURES.md", "public/docs-vault/FEATURES.md", "src/entities/docs-vault/data/content.json"])),
  );
});

test("a real runtime change still wins even when bundled with prose", () => {
  assert.deepEqual(
    { runtime: true, browser: true },
    pick(classify(["docs/FEATURES.md", "public/docs-vault/FEATURES.md", "src/app/providers.tsx"])),
  );
});

test("fails open — an empty or unknown diff never silently disables CI", () => {
  assert.deepEqual({ runtime: false, browser: false }, pick(classify([])));
  // Anything unrecognised outside the runtime list is prose-shaped by
  // definition; the fast gates still run and catch governance drift.
  assert.deepEqual({ runtime: false, browser: false }, pick(classify(["README.md"])));
});

function pick({ runtime, browser }) {
  return { runtime, browser };
}
