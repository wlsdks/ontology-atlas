import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findRawIndigoLiterals, ALLOWLIST } from "./check-no-raw-indigo.mjs";

function withTempSrc(files, run) {
  const dir = mkdtempSync(join(tmpdir(), "check-no-raw-indigo-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(dir, name), content, "utf8");
    }
    run(dir);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
}

test("flags a raw indigo rgba() literal in a className string", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="bg-[color:rgba(94,106,210,0.24)]" />
);
`,
    },
    (dir) => {
      const violations = findRawIndigoLiterals(dir);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].file, "src/Widget.tsx");
      assert.equal(violations[0].line, 2);
    },
  );
});

test("flags a raw indigo-line rgba() literal", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="border-[color:rgba(139,151,255,0.35)]" />
);
`,
    },
    (dir) => {
      const violations = findRawIndigoLiterals(dir);
      assert.equal(violations.length, 1);
    },
  );
});

test("passes when the literal is already a var() token reference", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="bg-[color:var(--color-indigo-a24)]" />
);
`,
    },
    (dir) => {
      assert.deepEqual(findRawIndigoLiterals(dir), []);
    },
  );
});

test("skips .test. files", () => {
  withTempSrc(
    {
      "Widget.test.tsx": `const c = "rgba(94,106,210,0.24)";\n`,
    },
    (dir) => {
      assert.deepEqual(findRawIndigoLiterals(dir), []);
    },
  );
});

test("skips the topology-map-v2 canvas engine directory", () => {
  withTempSrc({}, (dir) => {
    const nested = join(dir, "widgets", "topology-map-v2", "lib");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "colors.ts"), `const c = "rgba(94,106,210,0.24)";\n`, "utf8");
    assert.deepEqual(findRawIndigoLiterals(dir), []);
  });
});

test("documented ALLOWLIST entries stay clean of raw literals so future edits don't silently re-introduce drift", () => {
  assert.ok(ALLOWLIST.has("shared/config/indigo-tokens.ts"));
  assert.ok(ALLOWLIST.has("views/docs-vault/lib/popout-template.ts"));
});
