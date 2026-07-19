#!/usr/bin/env node
// 색 토큰화 회귀 가드 (B안, 2026-07-20).
//
// design.md 헌장 — "모든 색은 CSS 변수를 통해 참조. hardcoded hex 금지." —
// 를 인디고 계열 rgba() 리터럴에 대해 기계적으로 강제한다. `app/globals.css`
// 의 `--color-indigo-a*` / `--color-indigo-line-a*` 사다리로 이미 토큰화된
// 값을 새 코드가 다시 리터럴로 흩뿌리는 회귀를 잡는다.
//
// 스코프: src/**/*.tsx, src/**/*.ts 의 rgba(94,106,210,*) / rgba(139,151,255,*).
// 캔버스/WebGL/OpenGraph 처럼 CSS 변수가 닿지 않는 컨텍스트의 JS 상수
// 원천(ALLOWLIST)만 예외 — `src/shared/config/indigo-tokens.ts` 가 그 값의
// 단일 진실원이고, `src/views/docs-vault/lib/popout-template.ts` 는 :root
// 토큰이 없는 standalone export HTML 이라 리터럴이 의도적이다.
//
// 사용: node scripts/check-no-raw-indigo.mjs
//   pnpm check:tokens 로도 등록.

import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, extname } from "node:path";

const ROOT = new URL("..", import.meta.url).pathname.replace(/\/$/, "");
export const SRC_DIR = join(ROOT, "src");

const RAW_INDIGO_RE = /rgba\(\s*94,\s*106,\s*210,\s*[\d.]+\s*\)/;
const RAW_INDIGO_LINE_RE = /rgba\(\s*139,\s*151,\s*255,\s*[\d.]+\s*\)/;

// 캔버스/WebGL/OG-image처럼 CSS 변수가 닿지 않는 컨텍스트의 단일 진실원 —
// 파일 docstring에 그 이유가 명시돼 있다. 새 예외를 추가할 때도 같은 근거를
// 파일 상단에 남길 것.
export const ALLOWLIST = new Set([
  "shared/config/indigo-tokens.ts",
  "views/docs-vault/lib/popout-template.ts",
]);

function shouldSkipDir(name) {
  return name === "node_modules" || name === "topology-map-v2";
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

export function findRawIndigoLiterals(srcDir = SRC_DIR) {
  const violations = [];
  for (const file of walk(srcDir)) {
    const rel = relative(srcDir, file);
    if (ALLOWLIST.has(rel)) continue;
    const content = readFileSync(file, "utf8");
    const lines = content.split("\n");
    lines.forEach((line, i) => {
      if (RAW_INDIGO_RE.test(line) || RAW_INDIGO_LINE_RE.test(line)) {
        violations.push({ file: `src/${rel}`, line: i + 1, text: line.trim() });
      }
    });
  }
  return violations;
}

function main() {
  const violations = findRawIndigoLiterals();
  if (violations.length === 0) {
    console.log("[check-no-raw-indigo] OK — no raw indigo rgba() literals found.");
    return;
  }
  console.error(
    `[check-no-raw-indigo] ${violations.length} raw indigo rgba() literal(s) found — use var(--color-indigo-a*) / var(--color-indigo-line-a*) instead:\n`,
  );
  for (const v of violations) {
    console.error(`  ${v.file}:${v.line}  ${v.text}`);
  }
  process.exitCode = 1;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  main();
}
