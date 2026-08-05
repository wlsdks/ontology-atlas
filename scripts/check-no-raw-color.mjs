#!/usr/bin/env node
// 색 토큰화 회귀 가드 (Phase 2, 2026-07-20).
//
// design.md 헌장 — "모든 색은 CSS 변수를 통해 참조. hardcoded hex 금지." —
// 를 이 프로젝트가 지금까지 토큰화한 모든 채색 hue 에 대해 기계적으로
// 강제한다. `check-no-raw-indigo.mjs` (indigo 2종만 커버)를 대체 — 신호
// 톤(success emerald / amber warning·source) + kind-tone hue 를 포함한
// 전체 채색 인벤토리로 스코프를 넓혔다.
//
// 배경: .qa-scratch/audit-2026-07/guardian-color-verdict.md +
// .qa-scratch/audit-2026-07/remaining-color-map.md (Phase 2 마이그레이션).
//
// 스코프: src/**/*.tsx, src/**/*.ts 의 각 hue별 rgba(...) 리터럴.
// 캔버스/WebGL/OpenGraph 처럼 CSS 변수가 닿지 않는 컨텍스트의 JS 상수
// 원천(ALLOWLIST)만 예외 — 파일 docstring에 이유가 명시돼 있다.
//
// 사용: node scripts/check-no-raw-color.mjs
//   pnpm check:tokens 로도 등록.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
export const SRC_DIR = join(ROOT, "src");

// 각 항목: [family 이름, RGB 튜플들, 예외 설명]. 하나의 hue 에 여러
// rgb 튜플이 매핑되는 경우(드리프트 → 단일 hue 로 수렴된 케이스)도 전부
// 리터럴로 재등장하면 잡아야 회귀를 막는다 — 수렴 이전 hue 도 함께 감시.
const HUE_FAMILIES = [
  { name: "indigo", rgbs: [[94, 106, 210]] },
  { name: "indigo-line", rgbs: [[139, 151, 255]] },
  // 2026-08-04 등재 — 아래 셋은 감사에서 리터럴로 손으로 적혀 있던 값이고,
  // 이제 전부 토큰이 있다. 여기 적어 두는 것은 **어느 토큰을 쓰라고 이름을
  // 불러 주기 위해서**다(판정은 위의 무채색 규칙이 이미 한다).
  { name: "indigo-accent → var(--color-indigo-accent-a32/-a50)", rgbs: [[113, 112, 255]] },
  { name: "indigo-text-strong → var(--color-indigo-text-strong)", rgbs: [[159, 170, 235]] },
  { name: "search-mark → var(--color-search-mark-text)", rgbs: [[210, 218, 255]] },
  { name: "indigo-pale", rgbs: [[200, 210, 255], [205, 212, 255], [211, 215, 255]] },
  { name: "danger", rgbs: [[229, 72, 77], [236, 116, 116]] },
  {
    name: "success",
    rgbs: [
      [50, 185, 125],
      [73, 190, 146],
      [130, 230, 180],
      [151, 230, 198],
      [180, 235, 205],
      [165, 232, 200],
      [120, 190, 150],
      [139, 200, 180],
      [94, 180, 160],
      [180, 230, 210],
    ],
  },
  { name: "amber-source-warning", rgbs: [[244, 183, 49], [239, 180, 120], [239, 200, 150]] },
  { name: "amber-signal", rgbs: [[255, 179, 71]] },
  { name: "amber-hub", rgbs: [[212, 180, 120]] },
  {
    name: "amber-docs",
    rgbs: [
      [234, 198, 138],
      [224, 196, 140],
      [232, 200, 148],
      [238, 198, 128],
      [244, 196, 130],
    ],
  },
  { name: "surface-deep", rgbs: [[12, 14, 20], [14, 16, 22]] },
  {
    name: "kind-tone",
    rgbs: [
      [126, 134, 216],
      [74, 177, 196],
      [211, 159, 73],
      [105, 177, 121],
      [196, 92, 92],
    ],
  },
];

/**
 * `HUE_FAMILIES` 는 이제 **판정 기준이 아니라 이름표**다 (2026-08-04 뒤집음).
 *
 * ## 왜 뒤집었나 — 등록된 튜플만 보는 게이트는 새 값을 못 본다
 *
 * 종전 판정은 «위 목록에 있는 rgb 튜플과 정확히 일치하는 리터럴» 이었다. 그
 * 구조에서는 **목록에 없는 값이 전부 통과한다** — 그게 남의 새 색이든, 이미
 * 있는 토큰을 손으로 베낀 것이든 똑같이 통과한다. 감사 실측(2026-08-04):
 * `pnpm check:tokens` 가 OK 인 상태에서 raw rgba **26건**이 살아 있었고
 * 그중에는
 *
 *   - `rgba(113,112,255,·)` ×3 — `--color-indigo-accent`(#7170ff) 를 손으로 적음
 *   - `rgba(159,170,235,0.95)` ×2 — `--color-indigo-text-strong` 과 **완전히 같은 값**
 *   - `rgba(210,218,255,0.98)` ×3 — 대응 토큰이 **아예 없는** 창백한 인디고
 *
 * 가 있었다. 토큰이 움직여도 이것들은 안 따라간다. 게이트가 잡아 줄 거라는
 * 기대가 여기선 틀렸던 것이다.
 *
 * ## 현행 판정 — 거부목록이 아니라 「무채색만 통과」
 *
 * `r === g === b` 인 rgba 만 통과한다. 그런 값은 팔레트 색이 아니라 그림자·
 * 오버레이(검정/흰색/회색)이고, 그쪽은 **다른 게이트**(그림자 사다리 ·
 * `--color-overlay-*`)가 맡는다. 조금이라도 색이 섞였으면 — `rgba(15,16,17)`
 * 처럼 눈으로는 회색이어도 — 토큰을 거쳐야 한다. 종전 규칙이 놓친 무채색
 * 표면 리터럴(`rgba(11,12,14,0.98)` 등)이 정확히 이 틈에 있었다.
 *
 * ⚠️ **켜기 전 전수**(`/gate-probe`): 뒤집은 판정으로 재니 위반은
 * `starfield.ts` 2건 · `grid.ts` 2건뿐이고 넷 다 canvas 라 `ALLOWLIST` 로
 * 간다. 즉 이 변경은 픽셀 0 · 잔여 위반 0 이고, 막는 것은 **앞으로 새로 손으로
 * 적히는 색 전부**다.
 */
const FAMILY_BY_TUPLE = new Map(
  HUE_FAMILIES.flatMap(({ name, rgbs }) => rgbs.map((rgb) => [rgb.join(","), name])),
);

/** 순수 무채색(r=g=b)만 이 게이트를 통과한다 — 그림자·오버레이의 몫. */
function isAchromatic(r, g, b) {
  return r === g && g === b;
}

const RGBA_LITERAL = /rgba\(\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,\s*(\d{1,3})\s*,/g;

// 캔버스/WebGL/OG-image/tone.ts 처럼 CSS 변수가 닿지 않는 컨텍스트의 단일
// 진실원 — 파일 docstring에 그 이유가 명시돼 있다. 새 예외를 추가할 때도
// 같은 근거를 파일 상단에 남길 것.
export const ALLOWLIST = new Set([
  // `shared/config/indigo-tokens.ts` 는 2026-08-04 에 **목록에서 빠졌다**.
  // 뒤집힌 판정에서 이 파일은 면제가 필요 없다 — rgb 삼중항을 `"94, 106, 210"`
  // 같은 맨 문자열로 갖고 `rgba(` 는 템플릿으로 합성하므로 검사식에 안 걸린다.
  // 면제할 것이 없는 줄을 남겨 두면 목록이 무엇을 봐주는지 흐려진다
  // (게이트: 아래 "every ALLOWLIST entry actually contains a literal").
  "views/docs-vault/lib/popout-template.ts",
  // tone.ts — kind 데이터마크 단일 진실원. canvas fillStyle 이 계산된 rgba
  // 문자열을 그대로 소비해 var() 로 못 바꾼다(Design Guardian verdict §②
  // "kind-tone: CLEAN — tone.ts is already the sanctioned kind-tone source").
  "entities/ontology-class/model/tone.ts",
  // 아래 둘은 2026-08-04 판정 뒤집기(무채색만 통과)로 처음 이 게이트에 걸린
  // 캔버스 파일이다. `ctx.fillStyle` 과 `CanvasGradient.addColorStop` 은
  // **문자열만** 받고 `var()` 를 해석하지 않는다 — DOM 이 아니라 2D 컨텍스트라
  // 캐스케이드가 없다. 알파가 프레임마다 계산돼서 토큰 하나로도 못 접는다.
  // 둘 다 값이 무채색에 아주 가깝지만 정확히 r=g=b 는 아니라(별 236,236,240 ·
  // 비네트 3,3,4) 자동 면제에 안 걸린다. 파일 상단 docstring 에 같은 사유가 있다.
  "widgets/topology-map-v2/render/starfield.ts",
  "widgets/topology-map-v2/render/grid.ts",
]);

/**
 * **디렉터리째 면제는 이 저장소의 규격이 아니다** — 면제는 «파일 단위 + 사유
 * 주석»이고, 그것이 `ALLOWLIST` 다.
 *
 * 종전엔 `topology-map-v2`(캔버스 엔진) 전체를 건너뛰었다. 이유는 정당했다 —
 * canvas `fillStyle` 은 `var()` 를 못 먹는다. 하지만 **디렉터리 하나를 통째로
 * 면제하면 그 안에서 무엇이 자라는지 아무도 모른다**: 59개 파일이 이 검사를
 * 한 번도 받은 적이 없었고, 게이트가 «깨끗해서 0» 인지 «안 봐서 0» 인지 구별할
 * 방법이 없었다.
 *
 * ⚠️ **켜기 전 전수 측정**(`/gate-probe` · `design-system-audit` §4): 이 스킵을
 * 걷어낸 뒤 그 디렉터리의 위반은 **0** 이다(2026-08-04 실측 — 비-테스트 파일의
 * rgba 리터럴은 `rgba(3,3,4)` 2건과 `rgba(236,236,240)` 2건뿐이고 넷 다 어느
 * `HUE_FAMILIES` 에도 없다). 그래서 이 변경은 픽셀도 0, 위반도 0이고, 막는 것은
 * **앞으로의 재유입**뿐이다.
 *
 * 캔버스가 정말 raw 리터럴을 요구하는 파일이 생기면 `ALLOWLIST` 에 **파일 하나
 * + 그 파일 상단 docstring 의 사유**로 등재한다 — `tone.ts` 가 그 선례다.
 */
function shouldSkipDir(name) {
  return name === "node_modules";
}

/**
 * **`.css` 도 본다** (2026-08-05).
 *
 * 종전엔 `.ts`/`.tsx` 만 봤고, 그 틈에서 `app/globals.css` 의 `::selection` 이
 * `--color-indigo-a40` 과 **바이트 동일한** rgba 를 손으로 적고 있었다 — 이름이
 * 3,600줄 위에 이미 있는데. 토큰이 움직여도 그 한 줄만 안 따라온다.
 *
 * 스타일시트에서 리터럴이 **정당한 자리는 토큰 선언부 하나뿐**이라, 아래
 * `findRawColorLiterals` 가 `--token:` 로 시작하는 줄을 건너뛴다.
 */
function isTargetFile(name) {
  const ext = extname(name);
  if (ext !== ".ts" && ext !== ".tsx" && ext !== ".css") return false;
  return !name.includes(".test.");
}

function walk(dir, out = []) {
  for (const entry of readdirSync(dir)) {
    const full = join(dir, entry);
    const stat = statSync(full);
    if (stat.isDirectory()) {
      if (shouldSkipDir(entry)) continue;
      walk(full, out);
    } else if (isTargetFile(entry)) {
      out.push(full);
    }
  }
  return out;
}

/**
 * **`app/` 도 본다** (2026-08-05).
 *
 * 종전엔 `src/` 하나만 훑었다. `app/` 에는 `layout.tsx` · `global-error.tsx`
 * (루트 레이아웃을 **대체**하는 파일) · `opengraph-image.tsx` · 라우트 10개가
 * 산다 — 구조상 색을 손으로 박기 가장 쉬운 자리들이 통째로 밖에 있었다.
 * 자매 게이트인 `design-forbidden-class-guard` 는 이미 `['src','app']` 을
 * 훑고 있었으므로, 이 비대칭은 결정이 아니라 누락이었다.
 */
export const SCAN_ROOTS = [SRC_DIR, join(ROOT, "app")];

export function findRawColorLiterals(roots = SCAN_ROOTS) {
  const violations = [];
  const dirs = Array.isArray(roots) ? roots : [roots];
  const files = dirs.flatMap((d) => walk(d).map((f) => ({ file: f, root: d })));
  for (const { file, root } of files) {
    const rel = relative(root, file);
    if (ALLOWLIST.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    /*
     * **블록 주석을 통째로 지운다** (2026-08-05 정정).
     *
     * 종전엔 줄이 `//`·`*`·`/*` 로 **시작하는지**만 봤다. 그래서 여러 줄짜리
     * 주석의 **가운데 줄**(들여쓰기가 없거나 한글로 시작하는 줄)은 코드로
     * 취급됐다. 이 파일 자신이 「왜 이 값을 쓰면 안 되나」를 적으며 그 값을
     * 인용하므로, 사정거리를 `.css` 로 넓히는 순간 **자기 설명문 3건이
     * 위반으로** 잡혔다.
     *
     * 같은 병을 이 라운드에서만 네 번 만났다(`unused-token-ratchet` 과소 ·
     * `implicit-bold-weight` 과대 · `named-offramp` 과대 · 여기). 줄 단위
     * 접두사 판정으로는 블록 주석을 못 이긴다 — 지운 다음 세야 한다. 줄
     * 번호를 보존해야 하므로 개행은 남긴다.
     */
    const scanned = content
      .replace(/\/\*[\s\S]*?\*\//g, (m) => m.replace(/[^\n]/g, " "))
      .replace(/(^|[^:])\/\/.*$/gm, "$1")
      /*
       * **커스텀 프로퍼티 «선언의 값» 은 리터럴이 사는 정당한 자리다** — 거기까지
       * 막으면 값을 어디에도 못 적는다. 다만 선언은 **여러 줄에 걸친다**
       * (`--x: linear-gradient(\n  rgba(...),\n  ...\n);`), 그래서 줄 접두사
       * 판정으로는 둘째 줄부터 놓친다. 선언 시작(`--name:`)부터 `;` 까지를
       * 통째로 비운다. 줄 번호는 보존한다.
       */
      .replace(/--[a-zA-Z0-9-]+\s*:[^;]*;/g, (m) => m.replace(/[^\n]/g, " "));
    const lines = scanned.split("\n");
    /*
     * 보고 경로는 **저장소 기준**이다 — `src/` 하나만 훑던 시절엔 `src/` 를
     * 손으로 붙여도 맞았지만, 이제 `app/` 도 훑으므로 어느 뿌리인지 보여야
     * 한다. 저장소 밖(단위 테스트의 임시 디렉터리)이면 뿌리 기준 상대 경로를
     * 그대로 쓴다 — `../../..` 로 시작하는 쓰레기를 찍지 않는다.
     */
    const repoRel = relative(ROOT, file);
    const label = repoRel.startsWith("..") ? rel : repoRel;
    lines.forEach((line, i) => {
      /*
       * 블록 제거에 **더해** 줄 접두사도 그대로 본다 — 없앤 게 아니라 얹은
       * 것이다. 여는 `/*` 없이 ` * ` 로만 이어지는 JSDoc 연속 줄은 블록
       * 정규식이 못 잡는데, 이 저장소의 주석이 실제로 그렇게 쓰인다.
       */
      if (/^\s*(\/\/|\*|\/\*)/.test(line)) return;
      // 스타일시트에서 리터럴이 **정당한 자리는 토큰 선언부 하나뿐**이다.
      // `--color-indigo-a40: rgba(94,106,210,0.4);` 가 값이 사는 곳이고,
      // 그 밖의 모든 자리는 그 이름을 `var()` 로 불러야 한다.
      if (/^\s*--[a-zA-Z0-9-]+\s*:/.test(line)) return;
      for (const m of line.matchAll(RGBA_LITERAL)) {
        const [r, g, b] = [Number(m[1]), Number(m[2]), Number(m[3])];
        if (isAchromatic(r, g, b)) continue;
        violations.push({
          file: label,
          line: i + 1,
          family: FAMILY_BY_TUPLE.get(`${r},${g},${b}`) ?? "unregistered",
          text: line.trim(),
        });
        break;
      }
    });
  }
  return violations;
}

function main() {
  const violations = findRawColorLiterals();
  if (violations.length === 0) {
    console.log("[check-no-raw-color] OK — no raw color rgba() literals found.");
    return;
  }
  console.error(
    `[check-no-raw-color] ${violations.length} raw color rgba() literal(s) found — use the matching var(--color-*) token instead:\n`,
  );
  for (const v of violations) {
    console.error(`  [${v.family}] ${v.file}:${v.line}  ${v.text}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
