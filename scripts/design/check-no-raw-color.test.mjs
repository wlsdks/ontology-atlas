import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findRawColorLiterals, ALLOWLIST } from "./check-no-raw-color.mjs";

function withTempSrc(files, run) {
  const directory = mkdtempSync(join(tmpdir(), "check-no-raw-color-"));
  try {
    for (const [name, content] of Object.entries(files)) {
      writeFileSync(join(directory, name), content, "utf8");
    }
    run(directory);
  } finally {
    rmSync(directory, { recursive: true, force: true });
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
    (directory) => {
      const violations = findRawColorLiterals(directory);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].file, "Widget.tsx");
      assert.equal(violations[0].line, 2);
      assert.equal(violations[0].family, "indigo");
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
    (directory) => {
      const violations = findRawColorLiterals(directory);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].family, "indigo-line");
    },
  );
});

test("flags a raw success-emerald rgba() literal (converged and pre-convergence hues)", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="bg-[color:rgba(50,185,125,0.12)] text-[color:rgba(73,190,146,0.9)]" />
);
`,
    },
    (directory) => {
      const violations = findRawColorLiterals(directory);
      assert.equal(violations.length, 1); // one violation per line, first match wins
      assert.equal(violations[0].family, "success");
    },
  );
});

test("flags a raw amber warning/source rgba() literal", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="border-[color:rgba(244,183,49,0.25)]" />
);
`,
    },
    (directory) => {
      const violations = findRawColorLiterals(directory);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].family, "amber-source-warning");
    },
  );
});

test("flags a raw kind-tone hue rgba() literal", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="text-[color:rgba(74,177,196,0.94)]" />
);
`,
    },
    (directory) => {
      const violations = findRawColorLiterals(directory);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].family, "kind-tone");
    },
  );
});

test("passes when the literal is already a var() token reference", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="bg-[color:var(--color-indigo-a24)] text-[color:var(--color-success-a12)]" />
);
`,
    },
    (directory) => {
      assert.deepEqual(findRawColorLiterals(directory), []);
    },
  );
});

test("skips .test. files", () => {
  withTempSrc(
    {
      "Widget.test.tsx": `const c = "rgba(94,106,210,0.24)";\n`,
    },
    (directory) => {
      assert.deepEqual(findRawColorLiterals(directory), []);
    },
  );
});

/*
 * Pins that the `ontology-map` directory is scanned: without it, "0 because clean" and "0 because
 * not looked at" look the same. Exemptions exist only as per-file `ALLOWLIST` entries.
 */
test("scans the ontology-map canvas engine directory — no directory-wide exemption", () => {
  withTempSrc({}, (directory) => {
    const nested = join(directory, "widgets", "ontology-map", "lib");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "colors.ts"), `const c = "rgba(94,106,210,0.24)";\n`, "utf8");
    const found = findRawColorLiterals(directory);
    assert.equal(found.length, 1, "the canvas directory is exempt as a whole again");
    assert.equal(found[0].family, "indigo");
    assert.match(found[0].file, /ontology-map/);
  });
});

test("documented ALLOWLIST entries stay clean of raw literals so future edits don't silently re-introduce drift", () => {
  assert.ok(!ALLOWLIST.has("shared/config/indigo-tokens.ts"), "has no literal to exempt, so it must not be on the list");
  assert.ok(ALLOWLIST.has("views/docs-vault/lib/doc-actions/popout-template.ts"));
  assert.ok(ALLOWLIST.has("widgets/ontology-map/render/starfield.ts"));
  assert.ok(ALLOWLIST.has("widgets/ontology-map/render/grid.ts"));
});

/*
 * Pass/fail inversion: only achromatics pass. The four tests below cover values absent from the
 * hue table, which a registered-tuple check lets through.
 */

test("flags an rgba() the hue table has never heard of, the hole in the earlier gate", () => {
  withTempSrc({ "New.tsx": `const c = "rgba(210,218,255,0.98)";\n` }, (directory) => {
    const found = findRawColorLiterals(directory);
    assert.equal(found.length, 1, "an unregistered color that passes makes the gate pointless");
    assert.match(found[0].family, /search-mark/, "the finding must name which token to use");
  });
});

test("flags a hand-copied duplicate of an existing token", () => {
  withTempSrc({ "Copy.tsx": `const c = "rgba(159, 170, 235, 0.95)";\n` }, (directory) => {
    const found = findRawColorLiterals(directory);
    assert.equal(found.length, 1, "a literal does not follow the token even when it has the same value");
    assert.match(found[0].family, /indigo-text-strong/);
  });
});

test("passes pure achromatic rgba because shadows and overlays belong to another gate", () => {
  withTempSrc(
    {
      "Shadow.tsx": `const s = "0 12px 34px rgba(0,0,0,.5)";
const o = "rgba(255, 255, 255, 0.08)";
const g = "rgba(24,24,24,0.4)";
`,
    },
    (directory) => {
      assert.deepEqual(findRawColorLiterals(directory), [], "r=g=b is not a palette color");
    },
  );
});

test("passes rgba named inside a comment because explaining a banned value needs its name", () => {
  withTempSrc(
    {
      "Doc.tsx": `// 예전엔 rgba(113, 112, 255, 0.5) 를 손으로 적었다.
 * 그리고 rgba(210,218,255,0.98) 도 그랬다.
const ok = "var(--color-indigo-accent-a50)";
`,
    },
    (directory) => {
      assert.deepEqual(findRawColorLiterals(directory), []);
    },
  );
});

/**
 * Measures whether the allowlist is **idling** (`/gate-probe`, "a detector running
 * over an empty set"). If a registered file contains no literal at all, that row is not
 * an exemption but a dead row, and once such rows accumulate nobody knows what the list
 * is forgiving.
 */
test("every ALLOWLIST entry actually contains a literal it is exempting", async () => {
  const { readFileSync } = await import("node:fs");
  const { SRC_DIR } = await import("./check-no-raw-color.mjs");
  for (const rel of ALLOWLIST) {
    const body = readFileSync(join(SRC_DIR, rel), "utf8");
    const live = body
      .split("\n")
      .filter((l) => !/^\s*(\/\/|\*|\/\*)/.test(l))
      .some((l) => /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,/.test(l));
    assert.ok(live, `${rel} has no literal to exempt; it is a dead exception, so remove it from the list`);
  }
});
