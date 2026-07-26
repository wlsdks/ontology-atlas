import { readdirSync, readFileSync, statSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";
import koMessages from "../../messages/ko.json";
import enMessages from "../../messages/en.json";

/**
 * 진입 직후의 빈 화면을 막는 게이트 (2026-07-27, 감사 D1 · D2).
 *
 * 배경 — 이 앱의 전체 화면 라우트는 전부 `useSearchParams()` 를 쓰는 클라이언트
 * 뷰다. `output: 'export'` 는 그런 뷰를 프리렌더하지 못하고 **가장 가까운
 * Suspense fallback 을 대신 HTML 로 굽는다**. 그 fallback 이 `null` 이면 배포된
 * `index.html` 의 본문에는 아무것도 — `#main` 랜드마크조차 — 없다. 번들이
 * 내려와 하이드레이트할 때까지 사용자가 보는 것은 레일만 남은 검은 화면이고,
 * 그동안 "고장" 과 "빈 볼트" 와 "불러오는 중" 이 전부 같은 그림이다.
 *
 * 실측(정적 export, 2026-07-27): CPU 6× 스로틀에서 공방·인사이트 모두 진입
 * 500ms 시점에 50/50 빈 화면, fast3G 를 겹치면 3s 시점에도 30/30 빈 화면.
 * 타이밍 결함이라 조용히 돌아온다 — 그래서 소스 게이트로 잠근다.
 *
 * 이 테스트가 잠그는 계약:
 *  1. `app/` · `src/` 어디에도 `<Suspense fallback={null}>` 이 없다. 라우트
 *     page.tsx 뿐 아니라 **뷰 안쪽 경계**까지 본다 — 안쪽 경계가 더 가까우면
 *     HTML 에 구워지는 것은 그쪽 fallback 이라, 라우트만 고치면 문서함처럼
 *     조용히 빈 채로 남는다(2026-07-27 실측).
 *  2. Suspense 를 쓰는 파일은 공용 `RouteLoadingFallback` 을 fallback 으로 쓴다
 *     (자리표시자를 화면마다 손으로 만들면 하나가 빠져도 아무도 모른다).
 *  3. 자리표시자 문구는 두 로케일 모두에 있다.
 */

const SCAN_DIRS = [join(process.cwd(), "app"), join(process.cwd(), "src")];

function collectTsxFiles(dir: string, out: string[] = []): string[] {
  for (const entry of readdirSync(dir)) {
    if (entry === "node_modules" || entry.startsWith(".")) continue;
    const full = join(dir, entry);
    if (statSync(full).isDirectory()) {
      collectTsxFiles(full, out);
      continue;
    }
    if (entry.endsWith(".tsx") && !entry.endsWith(".test.tsx")) out.push(full);
  }
  return out;
}

describe("라우트 진입 빈 화면 게이트", () => {
  const files = collectTsxFiles(SCAN_DIRS[0]).concat(
    collectTsxFiles(SCAN_DIRS[1]),
  );
  const suspenseFiles = files.filter((p) =>
    readFileSync(p, "utf-8").includes("<Suspense"),
  );
  const rel = (p: string) => p.replace(process.cwd() + "/", "");

  it("스캔 대상 Suspense 경계를 찾는다", () => {
    expect(suspenseFiles.length).toBeGreaterThan(5);
  });

  it("어떤 Suspense 도 fallback 을 null 로 두지 않는다", () => {
    const offenders = suspenseFiles.filter((p) =>
      /fallback=\{\s*null\s*\}/.test(readFileSync(p, "utf-8")),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("Suspense 를 쓰는 파일은 공용 RouteLoadingFallback 을 쓴다", () => {
    const offenders = suspenseFiles.filter(
      (p) => !readFileSync(p, "utf-8").includes("RouteLoadingFallback"),
    );
    expect(offenders.map(rel)).toEqual([]);
  });

  it("자리표시자 문구가 ko · en 양쪽에 있다", () => {
    for (const messages of [koMessages, enMessages]) {
      const value = (messages as { nav: Record<string, unknown> }).nav
        .surfaceLoading;
      expect(typeof value).toBe("string");
      expect((value as string).trim().length).toBeGreaterThan(0);
    }
  });
});
