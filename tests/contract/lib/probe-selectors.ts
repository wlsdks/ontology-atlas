import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * `src-tauri/src/lib.rs` 의 WebView 프로브 문자열에서 조회 대상 `data-testid` 를
 * 뽑아낸다. 프로브는 Rust raw string 안의 JS 라 정적 파싱이 불가능하므로
 * 텍스트에서 셀렉터 리터럴만 걷는다 — 이 목적에는 그게 정확하다.
 */
export function collectProbeSelectors(rustSource: string): string[] {
  const found = new Set<string>();
  // `[data-testid="foo"]` / `[data-testid='foo']` 둘 다.
  const pattern = /\[data-testid=["']([^"']+)["']\]/g;
  for (const match of rustSource.matchAll(pattern)) {
    found.add(match[1]);
  }
  return [...found].sort();
}

/**
 * 주어진 testid 중 `src/`·`app/` 소스에 **정의가 없는** 것을 돌려준다.
 *
 * 외부 바이너리(`rg` 등)를 쓰지 않는다 — 초안에서 `execFileSync("rg", …)` 를
 * 썼다가 그 호출이 조용히 실패해 **모든 셀렉터가 죽은 것으로 보고**됐다.
 * 이 테스트가 잡으려는 결함(외부 의존이 조용히 죽고 catch 가 삼킴)과 정확히
 * 같은 종류라, 파일을 직접 읽는다.
 *
 * `data/` 아래 JSON(문서 볼트 매니페스트)은 제외한다 — 거긴 과거 기획 문서 본문이라
 * 지워진 셀렉터 이름이 산문으로 남아 있고, 그걸 "살아 있다" 로 세면 이 게이트가
 * 무력해진다.
 */
export function findDeadSelectors(selectors: readonly string[], cwd: string): string[] {
  const haystack = readSourceText(cwd);
  return selectors.filter((id) => !haystack.includes(id));
}

const SOURCE_ROOTS = ["src", "app"] as const;
const SOURCE_EXTENSIONS = [".ts", ".tsx"] as const;
const SKIP_DIRS = new Set(["node_modules", ".next", "out", "data"]);

/** `src/`·`app/` 의 모든 `.ts`/`.tsx` 를 한 문자열로 합친다(테스트 1회 비용). */
function readSourceText(cwd: string): string {
  const chunks: string[] = [];
  for (const root of SOURCE_ROOTS) {
    walk(join(cwd, root), chunks);
  }
  return chunks.join("\n");
}

function walk(dir: string, out: string[]): void {
  let entries;
  try {
    entries = readdirSync(dir, { withFileTypes: true });
  } catch {
    return; // 루트가 없으면 조용히 넘어간다 (app/ 이 없는 패키지 등).
  }
  for (const entry of entries) {
    if (entry.isDirectory()) {
      if (SKIP_DIRS.has(entry.name)) continue;
      walk(join(dir, entry.name), out);
      continue;
    }
    if (!SOURCE_EXTENSIONS.some((ext) => entry.name.endsWith(ext))) continue;
    out.push(readFileSync(join(dir, entry.name), "utf8"));
  }
}
