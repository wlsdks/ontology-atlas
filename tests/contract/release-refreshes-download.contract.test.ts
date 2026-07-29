import { describe, expect, it } from "vitest";
import { readFileSync } from "node:fs";

/**
 * **릴리스가 나가면 다운로드 페이지가 따라온다** — 그 인과가 배선돼 있는가.
 *
 * ## 왜 이 게이트가 생겼나 (2026-07-29 실측)
 *
 * `v1.0.0-rc.3` 을 게시한 직후 `/download` 는 여전히 rc.2 를 광고하고 있었다.
 * 릴리스도, DMG 도, 서명·공증도 전부 성공한 뒤였다.
 *
 * 원인은 두 겹이었고 **둘 다 "될 것 같은데 안 되는" 모양**이었다:
 *
 * 1. 페이지의 크기·SHA-256·링크는 **커밋된 생성 파일**
 *    (`macos-release.generated.ts`)에서 온다. 그 파일을 만드는
 *    `download:release-facts` 를 **어떤 워크플로도 부르지 않았다** — 사람이
 *    손으로 돌리고 커밋해야 했는데, 그 사실이 어디에도 적혀 있지 않았다.
 * 2. `deploy-pages.yml` 에 `release: types: [published]` 트리거가 있어서
 *    자동으로 도는 것처럼 보였다. 그런데 그 워크플로는 `pnpm build` 만 하고
 *    사실 파일을 다시 만들지 않으며, 게다가 **기본 `GITHUB_TOKEN` 이 일으킨
 *    이벤트는 새 실행을 만들지 않는다**(GitHub 재귀 방지). 즉 그 트리거는
 *    워크플로가 게시한 릴리스에서는 원리적으로 발화하지 않는다.
 *
 * 이 저장소가 반복해서 싫어한 실패 모드와 같은 성질이다 — **죽은 안내**.
 * 트리거는 있는데 안 돌고, 스크립트는 있는데 아무도 안 부른다.
 *
 * ## 왜 lint 가 아니라 계약 테스트인가
 *
 * 위반이 사는 곳이 YAML 워크플로다. `no-restricted-syntax` 는 JS/TS AST 만
 * 본다 — `npm-channel-retired` 게이트가 마크다운을 맡는 것과 같은 이유다.
 */

const RELEASE_WORKFLOW = ".github/workflows/release-macos.yml";

function publishJobBody(): string {
  const text = readFileSync(RELEASE_WORKFLOW, "utf8");
  const start = text.indexOf("  publish-macos:");
  expect(start, `${RELEASE_WORKFLOW} 에 publish-macos job 이 없다`).toBeGreaterThan(-1);
  // 다음 최상위 job(2칸 들여쓰기) 직전까지가 이 job 의 몸통이다.
  const rest = text.slice(start + 1);
  const nextJob = rest.search(/\n {2}[a-z][a-z0-9-]*:\n/);
  return nextJob === -1 ? rest : rest.slice(0, nextJob);
}

describe("릴리스가 나가면 /download 가 따라온다", () => {
  it("regenerates the download release facts from the published release", () => {
    const body = publishJobBody();
    expect(
      body.includes("download:release-facts"),
      "게시 후 `pnpm download:release-facts` 를 부르지 않으면 /download 는 이전 판을\n" +
        "계속 광고한다. 그 파일은 커밋된 생성물이고, 릴리스가 저절로 고쳐 주지 않는다.",
    ).toBe(true);
  });

  it("commits the regenerated facts — a file only the workflow saw does not ship", () => {
    const body = publishJobBody();
    expect(
      body.includes("macos-release.generated.ts") && /git\s+commit/.test(body),
      "생성만 하고 커밋하지 않으면 러너 안에서만 참인 파일이 된다.",
    ).toBe(true);
  });

  /**
   * **릴리스가 남의 작업을 지우면 안 된다.** 이 잡은 태그를 체크아웃한
   * 상태인데, 승인 게이트 때문에 게시는 빌드보다 한참 뒤일 수 있고 그 사이
   * main 은 움직인다. 태그 커밋에서 그대로 `HEAD:main` 으로 밀면 그 커밋들을
   * 되감는다 — 초안에서 내가 정확히 그렇게 써 뒀다.
   */
  it("starts from current main before pushing to main", () => {
    const body = publishJobBody();
    expect(
      /git fetch[^\n]*origin main/.test(body) && /git switch[^\n]*origin\/main/.test(body),
      "main 을 새로 받아 그 위에서 만들지 않으면, 태그 시점으로 main 을 되감는다.",
    ).toBe(true);
    // 검사 대상은 **push 의 강제 여부**다. `--force` 를 문자열로 넓게 찾으면
    // `git switch --force-create` 같은 무관한 플래그까지 걸린다(초안에서 실제로
    // 걸렸다) — 게이트는 자기가 무엇을 보는지 정확해야 한다.
    expect(
      /git push[^\n]*(--force|--force-with-lease|\s\+)/.test(body),
      "강제 push 는 이 경로에 있으면 안 된다 — 겹치면 조용히 덮지 말고 실패해야 한다.",
    ).toBe(false);
  });

  /**
   * 기본 토큰이 일으킨 push 는 워크플로를 깨우지 않는다(재귀 방지). 그래서
   * 커밋만으로는 배포가 돌지 않는다 — **`workflow_dispatch` 는 그 규칙의 명시적
   * 예외**라 시크릿을 늘리지 않고 배포를 깨울 수 있다.
   */
  it("wakes the pages deploy explicitly — the token push will not", () => {
    const body = publishJobBody();
    expect(
      /gh workflow run deploy-pages\.yml/.test(body),
      "커밋 뒤 배포를 명시적으로 깨우지 않으면 페이지는 다음 사람의 push 를\n" +
        "기다린다 — 언제 올지 모르는 것에 릴리스를 묶는 셈이다.",
    ).toBe(true);
  });

  it("gives the job the permissions those two steps need", () => {
    const body = publishJobBody();
    expect(body).toMatch(/permissions:/);
    expect(body).toMatch(/contents:\s*write/);
    // 배포를 깨우려면 actions:write 가 필요하다 — 없으면 마지막 스텝이 403 이다.
    expect(body).toMatch(/actions:\s*write/);
  });

  /**
   * **탐지기가 조용히 무력화되는 것을 막는 프로브.** 위 검사들은 문자열이
   * 사라지면 터지지만, job 몸통을 잘라내는 함수가 망가지면 빈 문자열을 검사하며
   * 전부 실패하거나 전부 통과할 수 있다. 몸통이 실제로 이 job 의 것인지 본다.
   */
  it("probe: the extracted body is the publish job and nothing else", () => {
    const body = publishJobBody();
    expect(body).toContain("environment: release");
    // 이웃 job 의 스텝이 섞여 들어오면 안 된다.
    expect(body).not.toContain("Build macOS DMG");
    expect(body).not.toContain("Stage draft release");
  });
});
