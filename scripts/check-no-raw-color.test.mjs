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
      // 2026-08-05: reported paths became **repo-relative**. Prefixing by hand was correct
      // while only `src/` was walked, but now that `app/` is walked too the root has to be
      // visible. This fixture lives in a temp directory outside the repository, so the
      // root-relative path is used as is.
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
 * This place used to hold a test asserting that the topology-map-v2 directory is
 * skipped. The 2026-08-04 audit removed that directory-wide exemption (see the
 * `shouldSkipDir` comment in `check-no-raw-color.mjs` — the directory's violation count
 * at removal was 0). Exemptions now exist only as the per-file `ALLOWLIST`.
 *
 * **This test pins the opposite direction** — a resurrected directory skip turns it
 * red. Without this assertion, "0 because clean" and "0 because not looked at" become
 * the same green again.
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
  assert.ok(!ALLOWLIST.has("shared/config/indigo-tokens.ts"), "면제할 리터럴이 없으므로 목록에 없어야 한다");
  assert.ok(ALLOWLIST.has("views/docs-vault/lib/popout-template.ts"));
  assert.ok(ALLOWLIST.has("entities/ontology-class/model/tone.ts"));
  assert.ok(ALLOWLIST.has("widgets/topology-map-v2/render/starfield.ts"));
  assert.ok(ALLOWLIST.has("widgets/topology-map-v2/render/grid.ts"));
});

/* ════════════════════════════════════════════════════════════════════
 * Verdict inversion (2026-08-04) — from "reject registered tuples" to "only achromatics pass"
 * ════════════════════════════════════════════════════════════════════
 *
 * Every test above asks whether a **registered hue** is caught. On that question
 * alone the old gate also passed everything, while what was actually leaking was 26
 * **values absent from the list**. The four below pin that hole.
 */

test("flags an rgba() the hue table has never heard of — 이것이 종전 게이트의 구멍이었다", () => {
  withTempSrc({ "New.tsx": `const c = "rgba(210,218,255,0.98)";\n` }, (dir) => {
    const found = findRawColorLiterals(dir);
    assert.equal(found.length, 1, "등록 안 된 색이 통과하면 게이트가 없는 것과 같다");
    assert.match(found[0].family, /search-mark/, "어느 토큰을 쓰라고 이름을 불러야 한다");
  });
});

test("flags a hand-copied duplicate of an existing token", () => {
  withTempSrc({ "Copy.tsx": `const c = "rgba(159, 170, 235, 0.95)";\n` }, (dir) => {
    const found = findRawColorLiterals(dir);
    assert.equal(found.length, 1, "토큰과 같은 값이어도 리터럴이면 토큰을 안 따라간다");
    assert.match(found[0].family, /indigo-text-strong/);
  });
});

test("passes pure achromatic rgba — 그림자·오버레이는 다른 게이트의 몫이다", () => {
  withTempSrc(
    {
      "Shadow.tsx": `const s = "0 12px 34px rgba(0,0,0,.5)";
const o = "rgba(255, 255, 255, 0.08)";
const g = "rgba(24,24,24,0.4)";
`,
    },
    (dir) => {
      assert.deepEqual(findRawColorLiterals(dir), [], "r=g=b 는 팔레트 색이 아니다");
    },
  );
});

test("passes rgba named inside a comment — 금지된 값을 설명하려면 이름을 불러야 한다", () => {
  withTempSrc(
    {
      "Doc.tsx": `// 예전엔 rgba(113, 112, 255, 0.5) 를 손으로 적었다.
 * 그리고 rgba(210,218,255,0.98) 도 그랬다.
const ok = "var(--color-indigo-accent-a50)";
`,
    },
    (dir) => {
      assert.deepEqual(findRawColorLiterals(dir), []);
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
    assert.ok(live, `${rel} 는 면제할 리터럴이 없다 — 죽은 예외이므로 목록에서 지운다`);
  }
});
