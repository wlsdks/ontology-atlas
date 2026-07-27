import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * 오픈소스 저장소가 CI 자격증명을 잃는 경로를 막는 게이트.
 *
 * 이 저장소는 공개고, 서명·공증 자격증명이 Actions secret 에 있다. 코드는 누구나
 * 읽지만 secret 은 못 읽는다 — 그 경계를 지키는 것은 **워크플로가 어떻게 쓰여
 * 있느냐**다. 아래 셋은 그 경계가 무너지는 알려진 방식이고, 셋 다 사람이
 * 리뷰에서 놓치기 쉽다(설정이 아니라 YAML 한 줄로 열린다).
 *
 * 실측(2026-07-27) 기준선: 위반 0. 여기서부터는 유입 차단이다.
 */

const WORKFLOW_DIR = join(process.cwd(), ".github/workflows");

function workflows(): { name: string; source: string }[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => ({ name, source: readFileSync(join(WORKFLOW_DIR, name), "utf-8") }));
}

/** `on:` 블록에 이 트리거가 있는가. 주석은 세지 않는다. */
function hasTrigger(source: string, trigger: string): boolean {
  return new RegExp(`^\\s{2}${trigger}:`, "m").test(source.replace(/^\s*#.*$/gm, ""));
}

describe("워크플로 보안 계약", () => {
  const all = workflows();

  it("스캔 대상 워크플로를 찾는다", () => {
    expect(all.length).toBeGreaterThan(3);
  });

  it("pull_request_target 을 쓰지 않는다", () => {
    // 이것이 오픈소스 secret 유출의 대표 경로다 — 포크의 **코드를 실행하면서**
    // 기반 저장소의 secret 과 쓰기 권한 토큰을 준다. 포크 PR 에 secret 이
    // 전달되지 않는다는 GitHub 의 기본 보호를 정확히 무력화한다.
    const offenders = all.filter(({ source }) => hasTrigger(source, "pull_request_target"));
    expect(offenders.map((w) => w.name)).toEqual([]);
  });

  it("pull_request 로 도는 워크플로는 secret 을 참조하지 않는다", () => {
    // 포크 PR 에는 secret 이 비어서 전달되므로 참조 자체가 무의미하고, 무엇보다
    // "이 워크플로는 자격증명을 만진다" 는 신호가 된다. 만지지 않는 것이 계약이다.
    const offenders = all
      .filter(({ source }) => hasTrigger(source, "pull_request"))
      .filter(({ source }) => /\$\{\{\s*secrets\./.test(source))
      .map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  it("공격자가 고칠 수 있는 문자열을 셸에 그대로 넣지 않는다", () => {
    // 스크립트 주입 — PR 제목·본문·브랜치 이름·커밋 메시지는 **포크를 연 사람이
    // 정한다.** 그걸 `run:` 안에 그대로 펼치면 임의 셸 명령이 된다. SHA 와 번호는
    // GitHub 이 만드는 값이라 안전하고, 실제로 우리가 쓰고 있다.
    const dangerous = [
      String.raw`github\.head_ref`,
      String.raw`github\.event\.pull_request\.title`,
      String.raw`github\.event\.pull_request\.body`,
      String.raw`github\.event\.pull_request\.head\.ref`,
      String.raw`github\.event\.pull_request\.head\.label`,
      String.raw`github\.event\.issue\.title`,
      String.raw`github\.event\.issue\.body`,
      String.raw`github\.event\.comment\.body`,
      String.raw`github\.event\.head_commit\.message`,
      String.raw`github\.event\.head_commit\.author`,
    ];
    const pattern = new RegExp(String.raw`\$\{\{\s*(${dangerous.join("|")})`, "m");

    const offenders = all
      .filter(({ source }) => pattern.test(source))
      .map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  it("서명 자격증명은 태그 워크플로 안에서만 쓰인다", () => {
    // Apple 인증서와 업데이터 개인키는 릴리스에만 필요하다. 다른 워크플로가
    // 참조하기 시작하면 그 워크플로의 트리거만큼 노출면이 넓어진다.
    const credentials = /\$\{\{\s*secrets\.(APPLE_|TAURI_SIGNING_)/;
    const offenders = all
      .filter(({ source }) => credentials.test(source))
      .filter(({ name }) => name !== "release-macos.yml")
      .map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  it("릴리스 워크플로는 태그 push 로만 시작한다", () => {
    const release = all.find((w) => w.name === "release-macos.yml");
    expect(release).toBeDefined();
    // 태그를 밀 수 있는 사람은 write 권한자뿐이다. `pull_request` 나
    // `workflow_dispatch` 가 붙으면 그 전제가 깨진다.
    expect(hasTrigger(release!.source, "pull_request")).toBe(false);
    expect(hasTrigger(release!.source, "pull_request_target")).toBe(false);
    expect(release!.source).toMatch(/tags:/);
  });

  it("발행은 승인 환경 뒤에 있다", () => {
    // 태그를 민 사람이 곧 공개까지 하는 구조를 막는다. 사람이 초안을 설치해
    // 확인한 뒤에만 공개된다.
    const release = all.find((w) => w.name === "release-macos.yml")!;
    expect(release.source).toMatch(/environment:\s*release/);
  });
});
