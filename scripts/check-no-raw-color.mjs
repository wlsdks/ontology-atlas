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

function buildRegexes() {
  const regexes = [];
  for (const { name, rgbs } of HUE_FAMILIES) {
    for (const [r, g, b] of rgbs) {
      regexes.push({
        family: name,
        re: new RegExp(`rgba\\(\\s*${r},\\s*${g},\\s*${b},\\s*[\\d.]+\\s*\\)`),
      });
    }
  }
  return regexes;
}
const RULES = buildRegexes();

// 캔버스/WebGL/OG-image/tone.ts 처럼 CSS 변수가 닿지 않는 컨텍스트의 단일
// 진실원 — 파일 docstring에 그 이유가 명시돼 있다. 새 예외를 추가할 때도
// 같은 근거를 파일 상단에 남길 것.
export const ALLOWLIST = new Set([
  "shared/config/indigo-tokens.ts",
  "views/docs-vault/lib/popout-template.ts",
  // tone.ts — kind 데이터마크 단일 진실원. canvas fillStyle 이 계산된 rgba
  // 문자열을 그대로 소비해 var() 로 못 바꾼다(Design Guardian verdict §②
  // "kind-tone: CLEAN — tone.ts is already the sanctioned kind-tone source").
  "entities/ontology-class/model/tone.ts",
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

function isTargetFile(name) {
  const ext = extname(name);
  if (ext !== ".ts" && ext !== ".tsx") return false;
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

export function findRawColorLiterals(srcDir = SRC_DIR) {
  const violations = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file);
    if (ALLOWLIST.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      for (const { family, re } of RULES) {
        if (re.test(line)) {
          violations.push({ file: `src/${rel}`, line: i + 1, family, text: line.trim() });
          break;
        }
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
