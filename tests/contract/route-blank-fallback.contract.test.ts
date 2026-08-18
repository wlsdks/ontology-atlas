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
 *  2. Suspense 를 쓰는 파일은 **승인된 공용 fallback** 만 쓴다
 *     (자리표시자를 화면마다 손으로 만들면 하나가 빠져도 아무도 모른다).
 *  3. 자리표시자 문구는 두 로케일 모두에 있다.
 *  4. 지도 진입 라우트(`/`, `/topology`)의 fallback 은 로딩 자막이 아니라 **내용**
 *     을 담는다. 이 두 라우트는 정적 export 에서 HTML 본문이 fallback 이 전부인데,
 *     그중 `/topology` 는 README·런치 자산이 가리키는 **데모 URL** 이다 —
 *     2026-07-27 실측에서 197KB 를 내려주고 사람이 읽을 수 있는 글자가 142자,
 *     그 핵심 문장이 "화면을 불러오는 중이에요" 였다. 링크 미리보기 카드와
 *     크롤러가 본 페이지 내용이 그게 전부였다는 뜻이다. 이 행이 그 회귀를 잠근다.
 */

const SCAN_DIRS = [join(process.cwd(), "app"), join(process.cwd(), "src")];

/**
 * 승인된 공용 fallback 은 둘뿐이고, 둘의 일이 다르다.
 *
 * - `RouteLoadingFallback` — 기본값. "이 화면은 아직 오는 중" 한 문장만 쓴다.
 * - `MapEntryFallback` — 지도 진입 라우트(`/topology`) 전용.
 * - `GatewayEntryFallback` — 루트 `/` 전용.
 *
 * **세 번째가 생긴 이유**(2026-07-30): `/` 가 지도에서 관문(얼굴)으로 바뀌었다
 * (원장: 「root-first-open」 뒤집기 구현). 두 자리는 "HTML 본문이 fallback 이
 * 전부" 라는 성질을 공유하지만 **말해야 할 내용이 다르다** — 하나는 지도를,
 * 하나는 제품의 얼굴을 설명한다. 하나로 합치면 대표 주소의 링크 미리보기가
 * 실제로 열리는 화면과 다른 말을 한다.
 *
 * 이 배열이 짧게 유지되는 것이 계약이다. 네 번째를 추가하려면 그 화면만의
 * 자리표시자가 왜 필요한지가 먼저 서야 한다.
 */
const APPROVED_FALLBACKS = [
  "RouteLoadingFallback",
  "MapEntryFallback",
  "GatewayEntryFallback",
] as const;

/**
 * fallback 이 곧 페이지 내용인 자리 — [라우트, 그 자리가 써야 할 fallback].
 *
 * **짝이 중요하다.** 전에는 "둘 다 `MapEntryFallback`" 이었는데, `/` 가 얼굴이
 * 된 뒤에도 그 검사가 통과하면 게이트가 정확히 틀린 것을 지키게 된다.
 */
const CONTENT_FALLBACK_ROUTES = [
  [join(process.cwd(), "app/[locale]/page.tsx"), "GatewayEntryFallback"],
  [join(process.cwd(), "app/[locale]/topology/page.tsx"), "MapEntryFallback"],
] as const;

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

  it("Suspense 를 쓰는 파일은 승인된 공용 fallback 만 쓴다", () => {
    const offenders = suspenseFiles.filter((p) => {
      const source = readFileSync(p, "utf-8");
      return !APPROVED_FALLBACKS.some((name) => source.includes(name));
    });
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

  it("내용이 곧 fallback 인 라우트는 각자 자기 자리의 fallback 을 쓴다", () => {
    for (const [route, expected] of CONTENT_FALLBACK_ROUTES) {
      const source = readFileSync(route, "utf-8");
      expect(source, `${route} 가 ${expected} 를 안 쓴다`).toContain(expected);
      // 짝이 아닌 쪽을 쓰면 그 주소가 다른 화면을 설명하게 된다.
      const other = expected === "MapEntryFallback" ? "GatewayEntryFallback" : "MapEntryFallback";
      expect(source, `${route} 가 ${other} 를 쓴다 — 그 주소의 화면이 아니다`).not.toContain(other);
    }
  });

  it("관문 fallback 도 로딩 자막이 아니라 제품 문장을 싣는다", () => {
    const source = readFileSync(
      join(process.cwd(), "src/shared/ui/gateway-entry-fallback.tsx"),
      "utf-8",
    );
    // 얼굴이 말해야 하는 것: 무엇인지(헤드라인) + 갈 수 있는 두 곳.
    // 2026-08-18 리메이크: 헤드라인 키가 `stageTitle` → `heroTitleLine1/2` 로
    // 옮겨갔다(fallback 은 실제 화면과 같은 문장을 실어야 한다는 이 파일의
    // 계약 그대로 — 옛 키는 카탈로그에서 사라졌는데 이 소스가 계속 불러서
    // `/ko/` 가 MISSING_MESSAGE 를 찍었다).
    expect(source).toContain("heroTitleLine1");
    expect(source).toContain("heroTitleLine2");
    expect(source).toContain("heroLead");
    expect(source).toContain("download/");
    expect(source).toContain("topology/");
  });

  it("그 fallback 은 로딩 자막이 아니라 제품 문장을 싣는다", () => {
    const source = readFileSync(
      join(process.cwd(), "src/shared/ui/map-entry-fallback.tsx"),
      "utf-8",
    );
    // 헤드라인과 리드가 있어야 데모 URL 이 읽을 것 없는 페이지로 되돌아가지 않는다.
    for (const key of ["headline", "lede"]) {
      expect(source).toContain(`t('${key}')`);
    }

    for (const messages of [koMessages, enMessages]) {
      const mapEntry = (messages as { mapEntry: Record<string, string> })
        .mapEntry;
      // 자막 한 줄(대략 40자)보다 확실히 긴 실제 문장이어야 한다.
      expect(mapEntry.headline.trim().length).toBeGreaterThan(10);
      expect(mapEntry.lede.trim().length).toBeGreaterThan(40);
    }
  });
});
