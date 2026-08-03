import assert from "node:assert/strict";
import { mkdtempSync, mkdirSync, writeFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { findRawColorLiterals, ALLOWLIST } from "./check-no-raw-color.mjs";

function withTempSrc(files, run) {
  const dir = mkdtempSync(join(tmpdir(), "check-no-raw-color-"));
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
      const violations = findRawColorLiterals(dir);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].file, "src/Widget.tsx");
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
    (dir) => {
      const violations = findRawColorLiterals(dir);
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
    (dir) => {
      const violations = findRawColorLiterals(dir);
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
    (dir) => {
      const violations = findRawColorLiterals(dir);
      assert.equal(violations.length, 1);
      assert.equal(violations[0].family, "amber-source-warning");
    },
  );
});

test("flags a raw kind-tone hue rgba() literal outside tone.ts", () => {
  withTempSrc(
    {
      "Widget.tsx": `export const Widget = () => (
  <div className="text-[color:rgba(74,177,196,0.94)]" />
);
`,
    },
    (dir) => {
      const violations = findRawColorLiterals(dir);
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
    (dir) => {
      assert.deepEqual(findRawColorLiterals(dir), []);
    },
  );
});

test("skips .test. files", () => {
  withTempSrc(
    {
      "Widget.test.tsx": `const c = "rgba(94,106,210,0.24)";\n`,
    },
    (dir) => {
      assert.deepEqual(findRawColorLiterals(dir), []);
    },
  );
});

/*
 * 종전 이 자리에는 «topology-map-v2 디렉터리를 건너뛴다» 는 테스트가 있었다.
 * 그 디렉터리째 면제를 2026-08-04 감사가 걷어냈다 (`check-no-raw-color.mjs` 의
 * `shouldSkipDir` 주석 — 걷어낸 시점의 그 디렉터리 위반 전수는 0 이다).
 * 면제는 이제 파일 단위 `ALLOWLIST` 로만 존재한다.
 *
 * **이 테스트는 반대 방향을 못박는다** — 디렉터리 스킵이 되살아나면 여기가
 * 빨개진다. 이 단언이 없으면 「깨끗해서 0」과 「안 봐서 0」이 다시 같은 초록이
 * 된다.
 */
test("scans the topology-map-v2 canvas engine directory — no directory-wide exemption", () => {
  withTempSrc({}, (dir) => {
    const nested = join(dir, "widgets", "topology-map-v2", "lib");
    mkdirSync(nested, { recursive: true });
    writeFileSync(join(nested, "colors.ts"), `const c = "rgba(94,106,210,0.24)";\n`, "utf8");
    const found = findRawColorLiterals(dir);
    assert.equal(found.length, 1, "캔버스 디렉터리가 다시 통째로 면제됐다");
    assert.equal(found[0].family, "indigo");
    assert.match(found[0].file, /topology-map-v2/);
  });
});

test("documented ALLOWLIST entries stay clean of raw literals so future edits don't silently re-introduce drift", () => {
  assert.ok(ALLOWLIST.has("shared/config/indigo-tokens.ts"));
  assert.ok(ALLOWLIST.has("views/docs-vault/lib/popout-template.ts"));
  assert.ok(ALLOWLIST.has("entities/ontology-class/model/tone.ts"));
});
