import { readFileSync, readdirSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * **소스 파일은 텍스트다** — NUL 바이트가 하나라도 있으면 그 파일은 사라진다.
 *
 * ## 무엇이 났나 (2026-08-08 검수)
 *
 * `DocsVaultEditor.tsx` 를 grep 했는데 **분명히 있는 문자열이 0건**으로 나왔다.
 * 원인은 그 파일 204줄의 합성 키였다:
 *
 * ```
 * `${autocomplete.query}` + NUL + `${autocomplete.active}`   // NUL = U+0000
 * ```
 *
 * 슬러그에 없는 글자를 구분자로 쓴다는 발상 자체는 합리적이다. 문제는 대가다 —
 * **NUL 이 하나라도 있으면 git 은 그 파일을 바이너리로 취급한다**:
 *
 * | 잃는 것 | 무슨 뜻인가 |
 * |---|---|
 * | `git diff` | PR 화면에 `Bin 38024 -> 38709 bytes` 만 뜬다 — **리뷰가 불가능하다** |
 * | `grep` · `ripgrep` | 기본값이 바이너리 건너뛰기라 **조용히 0건**을 답한다 |
 *
 * 두 번째가 특히 나쁘다. 실패가 «에러» 가 아니라 «없음» 으로 오기 때문에,
 * 사람도 에이전트도 "그런 코드는 없구나" 로 읽는다. 이 저장소의 감사와 규칙은
 * grep 을 전제로 서 있다.
 *
 * ## 이 게이트는 켜자마자 자기 저자를 잡았다
 *
 * 이 파일을 쓰면서 위 예시를 **원문에서 복사**했더니 그 NUL 이 주석에 그대로
 * 딸려 들어왔고, 게이트가 첫 실행에서 자기 자신을 위반으로 지목했다. 눈으로는
 * 공백과 구별되지 않으므로 «조심하면 된다» 는 대책이 아니라는 증거다 —
 * 그래서 이 규칙은 사람의 주의가 아니라 검사로 지킨다.
 *
 * ## 켜기 전 전수 (`design.md` 「룰을 켜기 전 반드시 측정한다」)
 *
 * 1,906 파일을 스캔해 **5개**가 걸렸다 — 전부 같은 패턴(합성 키/정렬 키의
 * 구분자): `DocsVaultEditor.tsx` · `duplicate-pairs.ts` · `interop-format.mjs` ·
 * `detect-drift.mjs` · `reconcile-imports.mjs`. 한 PR 로 다 치울 규모라 룰을
 * 켰다(소음이 되지 않는다).
 *
 * 대체 수단은 둘이다. **Set/Map 키**는 `JSON.stringify([...])` — 인쇄 가능하고
 * 애매하지 않다(공백 구분자는 `["a b","c"]` 와 `["a","b c"]` 를 같은 키로
 * 만든다). **정렬 키**는 이어 붙이지 말고 **필드 순서대로** 비교한다 — NUL 은
 * 모든 글자보다 작으므로 그것이 원래 의도한 순서이고, 실제로 도그푸드 볼트
 * (71 노드 · 154 관계) interop 내보내기가 수리 전후 **바이트 동일**이었다.
 */

const ROOTS = ["src", "app", "cli", "mcp", "scripts", "tests"] as const;
const EXTENSIONS = new Set([".ts", ".tsx", ".mjs", ".js", ".json", ".css", ".md"]);
const SKIP_DIRS = new Set(["node_modules", ".next", "dist", "output", ".codegraph"]);

function sourceFiles(): string[] {
  const found: string[] = [];
  const walk = (dir: string) => {
    for (const entry of readdirSync(dir)) {
      if (SKIP_DIRS.has(entry)) continue;
      const path = join(dir, entry);
      if (statSync(path).isDirectory()) walk(path);
      else if (EXTENSIONS.has(path.slice(path.lastIndexOf(".")))) found.push(path);
    }
  };
  for (const root of ROOTS) walk(root);
  return found;
}

describe("소스는 텍스트다 — git 과 grep 이 볼 수 있어야 한다", () => {
  it("어떤 소스 파일도 NUL 바이트를 갖지 않는다", () => {
    const files = sourceFiles();
    // 공회전 차단 — 목록이 비면 아래 «위반 0» 은 아무것도 증명하지 않는다.
    expect(files.length, "스캔한 파일이 없다 — 경로 목록이 낡았다").toBeGreaterThan(1_000);

    const offenders = files.filter((file) => readFileSync(file).includes(0x00));
    expect(
      offenders,
      "NUL 이 하나라도 있으면 git 이 그 파일을 바이너리로 본다 — PR 에서 diff 가 " +
        "안 보이고(리뷰 불가) grep 이 조용히 0건을 답한다. 합성 키는 " +
        "JSON.stringify([...]) 로, 정렬은 이어 붙이지 말고 필드 순서대로 비교하라.",
    ).toEqual([]);
  });
});
