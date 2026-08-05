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
      // 2026-08-05: 보고 경로가 **저장소 기준**이 됐다 — `src/` 하나만 훑던
      // 시절엔 접두사를 손으로 붙여도 맞았지만, 이제 `app/` 도 훑으므로 어느
      // 뿌리인지 보여야 한다. 이 픽스처는 저장소 밖 임시 디렉터리라 뿌리 기준
      // 상대 경로를 그대로 쓴다.
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
  assert.ok(!ALLOWLIST.has("shared/config/indigo-tokens.ts"), "면제할 리터럴이 없으므로 목록에 없어야 한다");
  assert.ok(ALLOWLIST.has("views/docs-vault/lib/popout-template.ts"));
  assert.ok(ALLOWLIST.has("entities/ontology-class/model/tone.ts"));
  assert.ok(ALLOWLIST.has("widgets/topology-map-v2/render/starfield.ts"));
  assert.ok(ALLOWLIST.has("widgets/topology-map-v2/render/grid.ts"));
});

/* ════════════════════════════════════════════════════════════════════
 * 판정 뒤집기 (2026-08-04) — 「등록된 튜플 거부」 → 「무채색만 통과」
 * ════════════════════════════════════════════════════════════════════
 *
 * 위의 테스트들은 전부 **목록에 등재된 hue** 를 잡는지 물었다. 그 질문만으로는
 * 종전 게이트도 전부 통과했는데, 그때 실제로 새고 있던 것은 **목록에 없는 값**
 * 26건이었다. 아래 넷이 그 구멍을 못박는다.
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
 * 허용목록이 **헛돌고 있지 않은지** 잰다 (`/gate-probe` §"빈 집합 위에서 도는
 * 검출기"). 등재된 파일에 정작 리터럴이 하나도 없다면 그 줄은 면제가 아니라
 * 죽은 줄이고, 그런 줄이 쌓이면 목록이 무엇을 봐주고 있는지 아무도 모르게 된다.
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
