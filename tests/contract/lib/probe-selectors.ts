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
/**
 * **런타임에 조립되는 testid** — 소스에 리터럴로 없지만 살아 있다.
 *
 * 이 게이트는 소스 텍스트에 그 문자열이 있는지로 「살아 있음」을 판정한다. 그런데
 * 일부 프리미티브는 부모가 받은 testid 에 접미사를 붙여 자식에 단다 — 예:
 * `src/shared/ui/select.tsx` 가 `data-testid={`${dataTestid}-listbox`}` 로 목록을
 * 표시한다. 그러면 `ai-local-model-listbox` 는 **DOM 에는 있고 소스에는 없다.**
 *
 * 그 셀렉터를 `KNOWN_STALE_OPTIONAL` 에 넣는 것은 틀린 처방이다 — 그 목록은
 * 「죽은 UI 를 가리키는 **선택적** 증거」용인데, 이건 살아 있고 프로브가 없으면
 * hard-fail 한다. 목록에 넣으면 진짜 죽었을 때도 조용히 통과한다.
 *
 * 그래서 접미사를 벗겨 **밑동이 실재하는지**로 판정한다. 밑동이 사라지면 여전히
 * 잡힌다 — 게이트가 약해지지 않는다. 새 접미사를 더할 때는 그것을 조립하는
 * 프리미티브 파일을 주석에 적어라.
 */
const COMPOSED_SUFFIXES = [
  // src/shared/ui/select.tsx — 열린 목록에 `-listbox` 를 붙인다.
  "-listbox",
] as const;

export function findDeadSelectors(selectors: readonly string[], cwd: string): string[] {
  const haystack = readSourceText(cwd);
  const alive = (id: string): boolean => {
    if (haystack.includes(id)) return true;
    for (const suffix of COMPOSED_SUFFIXES) {
      if (!id.endsWith(suffix)) continue;
      const base = id.slice(0, -suffix.length);
      // 밑동이 실재해야만 살아 있다고 본다 — 접미사만으로 면제하지 않는다.
      if (base && haystack.includes(base)) return true;
    }
    return false;
  };
  return selectors.filter((id) => !alive(id));
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
