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

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** 한 job 의 정확한 들여쓰기 경계. YAML 문자열 검사는 범위를 잘못 잡으면 거짓 초록이다. */
function jobBlock(source: string, jobName: string): string {
  const marker = new RegExp(`^  ${escapePattern(jobName)}:\\s*$`, "m");
  const match = marker.exec(source);
  if (!match) throw new Error(`workflow job not found: ${jobName}`);
  const start = match.index;
  const afterStart = source.slice(start + match[0].length);
  const next = /^  [A-Za-z0-9_-]+:\s*$/m.exec(afterStart);
  return source.slice(start, next ? start + match[0].length + next.index : source.length);
}

function jobHeader(source: string, jobName: string): string {
  const block = jobBlock(source, jobName);
  const steps = block.indexOf("\n    steps:");
  if (steps < 0) throw new Error(`workflow steps not found: ${jobName}`);
  return block.slice(0, steps);
}

function stepNamesUsingSecret(source: string, secretName: string): string[] {
  const steps = source.split(/(?=^      - (?:name|uses):)/m);
  return steps
    .filter((step) => step.includes(`secrets.${secretName}`))
    .map((step) => {
      const named = /^      - name: (.+)$/m.exec(step)?.[1];
      const action = /^      - uses: (.+)$/m.exec(step)?.[1];
      return named ?? action ?? "<unscoped>";
    });
}

function writePermissionsByJob(source: string): Record<string, string[]> {
  const jobsStart = source.indexOf("\njobs:\n");
  if (jobsStart < 0) throw new Error("workflow jobs block not found");
  const jobsSource = source.slice(jobsStart + 1);
  const names = [...jobsSource.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]);
  const writes: Record<string, string[]> = {};
  for (const name of names) {
    const permissions = /^    permissions:\n((?:      .*\n?)*)/m.exec(jobHeader(source, name))?.[1];
    const keys = permissions
      ? [...permissions.matchAll(/^      ([A-Za-z0-9-]+): write$/gm)].map((match) => match[1])
      : [];
    if (keys.length > 0) writes[name] = keys;
  }
  return writes;
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

  it("서명 자격증명은 보호된 릴리스 워크플로 안에서만 쓰인다", () => {
    // Apple 인증서와 업데이터 개인키는 릴리스에만 필요하다. 다른 워크플로가
    // 참조하기 시작하면 그 워크플로의 트리거만큼 노출면이 넓어진다.
    const credentials = /\$\{\{\s*secrets\.(APPLE_|TAURI_SIGNING_)/;
    const offenders = all
      .filter(({ source }) => credentials.test(source))
      .filter(({ name }) => name !== "release-macos.yml")
      .map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  it("릴리스 워크플로는 보호된 기본 브랜치의 수동 dispatch 로만 시작한다", () => {
    const release = all.find((w) => w.name === "release-macos.yml");
    expect(release).toBeDefined();
    // tag push는 그 tag가 가리키는 commit의 workflow 파일을 실행한다. 그러면
    // source gate 자체도 tag가 고를 수 있어 signing secret의 신뢰 경계가 아니다.
    expect(hasTrigger(release!.source, "pull_request")).toBe(false);
    expect(hasTrigger(release!.source, "pull_request_target")).toBe(false);
    expect(hasTrigger(release!.source, "push")).toBe(false);
    expect(hasTrigger(release!.source, "workflow_dispatch")).toBe(true);
    expect(release!.source).toMatch(/workflow_dispatch:\n\s+inputs:\n\s+tag:/);
    expect(release!.source).toMatch(/^run-name: Release Desktop \$\{\{ inputs\.tag \}\}$/m);
  });

  it("서명 job은 release-signing 환경과 기본 브랜치에서 승인된 SHA만 사용한다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const admission = jobBlock(release, "admit-release");
    expect(jobHeader(release, "admit-release")).not.toMatch(/environment:/);
    expect(admission).toContain("DISPATCH_EVENT: ${{ github.event_name }}");
    expect(admission).toContain("DISPATCH_REF: ${{ github.ref }}");
    expect(admission).toContain("DISPATCH_REF_TYPE: ${{ github.ref_type }}");
    expect(admission).toContain("WORKFLOW_SHA: ${{ github.workflow_sha }}");
    expect(admission).toContain('[[ "$DISPATCH_REF" == "refs/heads/main" ]]');
    expect(admission).toContain('[[ "$WORKFLOW_SHA" == "$DISPATCH_SHA" ]]');
    expect(admission).toContain("ref: ${{ github.sha }}");
    expect(admission).toContain("persist-credentials: false");
    expect(admission).toContain("--mode=admit");
    expect(admission).toContain('--tag="$RELEASE_TAG"');
    expect(admission).toContain('--sha="$RELEASE_SHA"');
    expect(admission).toContain("release_sha=");
    expect(admission).toContain("release_tag=");
    expect(admission).not.toMatch(/\$\{\{\s*secrets\./);

    for (const jobName of ["build-macos", "build-windows"]) {
      const header = jobHeader(release, jobName);
      const block = jobBlock(release, jobName);
      expect(header, `${jobName} admission dependency`).toMatch(/needs:\s*admit-release/);
      expect(header, `${jobName} secret environment`).toMatch(/environment:\s*release-signing/);
      expect(block, `${jobName} trusted checkout`).toContain(
        "ref: ${{ needs.admit-release.outputs.release_sha }}",
      );
    }

    for (const jobName of ["stage-macos", "publish-macos"]) {
      expect(jobBlock(release, jobName), `${jobName} trusted checkout`).toContain(
        "ref: ${{ needs.admit-release.outputs.release_sha }}",
      );
    }

    const stage = jobBlock(release, "stage-macos");
    expect(stage).toContain("tag_name: ${{ needs.admit-release.outputs.release_tag }}");
    expect(stage).toContain("target_commitish: ${{ needs.admit-release.outputs.release_sha }}");
    expect(stage).toContain("--mode=pin");
    expect(jobBlock(release, "publish-macos")).toContain("--mode=pin");
  });

  it("Windows updater 개인키는 build 직전 별도 실패-폐쇄 게이트를 지난다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const windows = jobBlock(release, "build-windows");
    const gate = windows.indexOf("- name: Require updater signing credentials");
    const build = windows.indexOf("- name: Build Windows NSIS installer");
    expect(gate).toBeGreaterThan(0);
    expect(build).toBeGreaterThan(gate);
    expect(windows.slice(gate, build)).toContain("desktop:release-secrets -- --updater-only");
  });

  it("macOS 직접 다운로드 릴리스는 서명·공증 자격증명이 없으면 실패한다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const build = jobBlock(release, "build-macos");

    expect(build).toMatch(
      /- name: Require signed release credentials\n(?:        env:[\s\S]*?)?        run: pnpm desktop:release-secrets/,
    );
    expect(build).toMatch(
      /- name: Build signed and notarized release artifact\n        run: pnpm desktop:release-artifact/,
    );
    expect(build).not.toContain("desktop:release-artifact:unsigned");
    expect(build).not.toContain("steps.signing.outputs.signed");
    expect(build).not.toContain("UNSIGNED build");
  });

  it("발행은 승인 환경 뒤에 있다", () => {
    // 태그를 민 사람이 곧 공개까지 하는 구조를 막는다. 사람이 초안을 설치해
    // 확인한 뒤에만 공개된다.
    const release = all.find((w) => w.name === "release-macos.yml")!;
    expect(release.source).toMatch(/environment:\s*release/);
  });

  it("릴리스 토큰 쓰기 권한은 실제로 쓰는 job 에만 있다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;

    // workflow 기본은 읽기 전용이다. job 하나가 쓰기를 이유로 전체 빌드에
    // contents/checks write 를 물려주면 checkout·install·test 액션까지 같은
    // 토큰을 받는다.
    expect(release).toMatch(/^permissions:\n  contents: read\s*$/m);
    expect(jobBlock(release, "build-macos")).not.toMatch(/^    permissions:/m);
    expect(jobBlock(release, "build-windows")).toMatch(
      /^    permissions:\n      contents: read\n      checks: write\s*$/m,
    );
    expect(jobBlock(release, "stage-macos")).toMatch(
      /^    permissions:\n      contents: write\s*$/m,
    );
    expect(jobBlock(release, "publish-macos")).toMatch(
      /^    permissions:\n(?:      .+\n)*?      contents: write\n      actions: write\s*$/m,
    );
    expect(writePermissionsByJob(release)).toEqual({
      "build-windows": ["checks"],
      "stage-macos": ["contents"],
      "publish-macos": ["contents", "actions"],
    });

    // 새 job 이 생겨도 기존 네 이름만 검사하고 지나가지 않는지 helper 자체를
    // 한 번 찌른다. 실제 매핑 단언은 바로 위가 맡는다.
    const synthetic = release.replace(
      "  build-macos:\n",
      "  unexpected-writer:\n    permissions:\n      contents: write\n    steps:\n      - run: true\n\n  build-macos:\n",
    );
    expect(writePermissionsByJob(synthetic)["unexpected-writer"]).toEqual(["contents"]);
  });

  it("서명 secret 은 필요한 release step 에서만 보인다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    for (const jobName of ["admit-release", "build-macos", "build-windows", "stage-macos", "publish-macos"]) {
      expect(jobHeader(release, jobName), `${jobName} job env`).not.toMatch(
        /\$\{\{\s*secrets\.(?:APPLE_|TAURI_SIGNING_)/,
      );
    }

    const expectedSteps: Record<string, string[]> = {
      APPLE_CERTIFICATE_P12_BASE64: [
        "Require signed release credentials",
        "Import Apple Developer ID certificate",
        "Build signed and notarized release artifact",
      ],
      APPLE_CERTIFICATE_PASSWORD: [
        "Require signed release credentials",
        "Import Apple Developer ID certificate",
        "Build signed and notarized release artifact",
      ],
      APPLE_ID: ["Require signed release credentials", "Build signed and notarized release artifact"],
      APPLE_APP_SPECIFIC_PASSWORD: [
        "Require signed release credentials",
        "Build signed and notarized release artifact",
      ],
      APPLE_TEAM_ID: [
        "Require signed release credentials",
        "Build signed and notarized release artifact",
      ],
      TAURI_SIGNING_PRIVATE_KEY: [
        "Require signed release credentials",
        "Build signed and notarized release artifact",
        "Require updater signing credentials",
        "Build Windows NSIS installer",
      ],
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: [
        "Require signed release credentials",
        "Build signed and notarized release artifact",
        "Require updater signing credentials",
        "Build Windows NSIS installer",
      ],
    };

    for (const [secret, steps] of Object.entries(expectedSteps)) {
      expect(stepNamesUsingSecret(release, secret).sort(), secret).toEqual(steps.sort());
    }
  });

  it("쓰기 토큰 job은 움직인 main 코드에서 pnpm/node를 실행하지 않는다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const publish = jobBlock(release, "publish-macos");
    const switchAt = publish.indexOf("git switch -C release-facts-update origin/main");
    expect(switchAt).toBeGreaterThan(0);
    const afterSwitch = publish.slice(switchAt);
    expect(afterSwitch).not.toMatch(/^\s*(?:pnpm|node)\b/m);
    expect(publish.slice(0, switchAt)).toContain(
      'cp src/views/download/model/macos-release.generated.ts "$RUNNER_TEMP/macos-release.generated.ts"',
    );
  });

  it("Pages OIDC 와 배포 권한은 deploy job 에만 있다", () => {
    const pages = all.find((w) => w.name === "deploy-pages.yml")!.source;
    expect(pages).toMatch(/^permissions:\n  contents: read\s*$/m);
    expect(jobBlock(pages, "build")).not.toMatch(/^    permissions:/m);
    expect(jobBlock(pages, "verify-hosted")).not.toMatch(/^    permissions:/m);
    expect(jobBlock(pages, "deploy")).toMatch(
      /^    permissions:\n      pages: write\n      id-token: write\s*$/m,
    );
    expect(writePermissionsByJob(pages)).toEqual({ deploy: ["pages", "id-token"] });
  });
});
