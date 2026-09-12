import { readFileSync, readdirSync } from "node:fs";
import { join } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * Gates against the paths by which an open-source repository loses its CI
 * credentials.
 *
 * This repository is public and its signing and notarisation credentials live in
 * Actions secrets. Anyone can read the code; nobody can read the secrets — and what
 * keeps that boundary is **how the workflows are written**. The three below are the
 * known ways it collapses, and all three are easy to miss in review (they open with
 * one line of YAML, not a setting).
 *
 * Baseline measured 2026-07-27: 0 violations. From here this blocks new ones.
 */

const WORKFLOW_DIR = join(process.cwd(), ".github/workflows");

function workflows(): { name: string; source: string }[] {
  return readdirSync(WORKFLOW_DIR)
    .filter((name) => name.endsWith(".yml") || name.endsWith(".yaml"))
    .map((name) => ({ name, source: readFileSync(join(WORKFLOW_DIR, name), "utf-8") }));
}

/** Does the `on:` block carry this trigger? Comments are not counted. */
function hasTrigger(source: string, trigger: string): boolean {
  return new RegExp(`^\\s{2}${trigger}:`, "m").test(source.replace(/^\s*#.*$/gm, ""));
}

function escapePattern(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** One job's exact indentation boundary. A YAML string check with the wrong range is a false green. */
function jobBlock(source: string, jobName: string): string {
  const marker = new RegExp(`^  ${escapePattern(jobName)}:\\s*$`, "m");
  const match = marker.exec(source);
  if (!match) throw new Error(`workflow job not found: ${jobName}`);
  const start = match.index;
  const afterStart = source.slice(start + match[0].length);
  const next = /^  [A-Za-z0-9_-]+:\s*$/m.exec(afterStart);
  return source.slice(start, next ? start + match[0].length + next.index : source.length);
}

/**
 * The part of a job that declares **who it runs as**, stopping before what it runs.
 *
 * Two body shapes end that header. A normal job's is `steps:`; a job that calls a
 * reusable workflow has no steps at all and opens with a job-level `uses:` (four
 * spaces — a step's `uses:` is six and lives inside `steps:`). Recognising only the
 * first was fail-closed rather than silently wrong: `list-mcp-registry` threw here
 * instead of passing unexamined. It still has to be recognised, because a permission
 * this helper cannot see is a permission `writePermissionsByJob` cannot audit.
 */
function jobHeader(source: string, jobName: string): string {
  const block = jobBlock(source, jobName);
  const body = /\n    (?:steps|uses):/.exec(block);
  if (!body) throw new Error(`workflow job body not found: ${jobName}`);
  return block.slice(0, body.index);
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
    // This is the canonical open-source secret-exfiltration path: it **runs the fork's
    // code** while handing it the base repository's secrets and a write-scoped token.
    // It precisely defeats GitHub's default protection that fork PRs receive no
    // secrets.
    const offenders = all.filter(({ source }) => hasTrigger(source, "pull_request_target"));
    expect(offenders.map((w) => w.name)).toEqual([]);
  });

  it("pull_request 로 도는 워크플로는 secret 을 참조하지 않는다", () => {
    // Fork PRs receive empty secrets, so the reference is meaningless — and worse, it
    // signals "this workflow touches credentials". Not touching them is the contract.
    const offenders = all
      .filter(({ source }) => hasTrigger(source, "pull_request"))
      .filter(({ source }) => /\$\{\{\s*secrets\./.test(source))
      .map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  it("공격자가 고칠 수 있는 문자열을 셸에 그대로 넣지 않는다", () => {
    // Script injection — PR title, body, branch name, and commit message are **chosen
    // by whoever opened the fork.** Expanding them directly inside `run:` turns them
    // into arbitrary shell commands. SHAs and numbers are generated by GitHub, so they
    // are safe, and those are what we use.
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
    // Apple certificates and the updater private key are needed only for releases. Once
    // another workflow references them, the exposure widens to that workflow's
    // triggers.
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
    // A tag push runs the workflow file from the commit that tag points at, so the
    // source gate itself becomes tag-selectable and stops being a trust boundary for
    // the signing secrets.
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
    // Blocks the structure where whoever pushes a tag also publishes. A release goes
    // public only after a person installs the draft and verifies it.
    const release = all.find((w) => w.name === "release-macos.yml")!;
    expect(release.source).toMatch(/environment:\s*release/);
  });

  it("릴리스 토큰 쓰기 권한은 실제로 쓰는 job 에만 있다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;

    // The workflow default is read-only. If one job's need to write grants
    // contents/checks write to the whole build, the checkout, install, and test actions
    // receive the same token.
    expect(release).toMatch(/^permissions:\n  contents: read\s*$/m);
    expect(jobBlock(release, "build-macos")).not.toMatch(/^    permissions:/m);
    expect(jobBlock(release, "build-windows")).toMatch(
      /^    permissions:\n      contents: read\n      checks: write\s*$/m,
    );
    expect(jobBlock(release, "stage-macos")).toMatch(
      /^    permissions:\n      contents: write\s*$/m,
    );
    expect(jobBlock(release, "publish-macos")).toMatch(
      /^    permissions:\n(?:      .+\n)*?      contents: write\s*$/m,
    );
    // `list-mcp-registry` is the one write that is not a write over this repository:
    // `id-token: write` mints the short-lived OIDC assertion the registry exchanges for
    // proof of namespace ownership. It is listed rather than exempted, so a job that
    // quietly gained `contents: write` beside it would still show up here.
    expect(writePermissionsByJob(release)).toEqual({
      "build-windows": ["checks"],
      "stage-macos": ["contents"],
      "publish-macos": ["contents"],
      "list-mcp-registry": ["id-token"],
    });

    // Pokes the helper itself so that a new job cannot slip past a check that only
    // knows the four existing names. The actual mapping assertions are just above.
    const synthetic = release.replace(
      "  build-macos:\n",
      "  unexpected-writer:\n    permissions:\n      contents: write\n    steps:\n      - run: true\n\n  build-macos:\n",
    );
    expect(writePermissionsByJob(synthetic)["unexpected-writer"]).toEqual(["contents"]);

    // The same poke in the reusable-workflow shape, which has no `steps:` to find.
    // Without this the helper could regress to steps-only and go green again, because
    // every job it then failed to read would simply be absent from the mapping.
    const syntheticCall = release.replace(
      "  build-macos:\n",
      "  unexpected-caller:\n    permissions:\n      contents: write\n    uses: ./.github/workflows/publish-mcp-registry.yml\n    with:\n      tag: v0.0.0\n\n  build-macos:\n",
    );
    expect(writePermissionsByJob(syntheticCall)["unexpected-caller"]).toEqual(["contents"]);
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
      APPLE_API_KEY_P8_BASE64: [
        "Require signed release credentials",
        "Build signed and notarized release artifact",
      ],
      APPLE_API_KEY_ID: [
        "Require signed release credentials",
        "Build signed and notarized release artifact",
      ],
      APPLE_API_ISSUER_ID: [
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
    for (const legacy of ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"]) {
      expect(stepNamesUsingSecret(release, legacy), `${legacy} must not remain in hosted release`).toEqual([]);
    }
  });

  it("쓰기 토큰 job은 생성 facts handoff 뒤 repo 코드나 main을 실행·변경하지 않는다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const publish = jobBlock(release, "publish-macos");
    const handoffAt = publish.indexOf(
      'cp src/views/download/model/macos-release.generated.ts "$RUNNER_TEMP/macos-release.generated.ts"',
    );
    expect(handoffAt).toBeGreaterThan(0);
    const afterHandoff = publish.slice(handoffAt);
    expect(afterHandoff).not.toMatch(/^\s*(?:pnpm|node)\b/m);
    expect(afterHandoff).not.toMatch(/\bgit\s+(?:switch|push)\b/);
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

/**
 * The landing contract, as YAML (2026-09-12).
 *
 * Two settings and four workflows have to agree, and none of them can see the
 * others. `main` requires eight status contexts; a pull request is opened as a
 * draft and runs nothing; `pnpm pr:land` merges main in, runs the local lanes
 * and marks it ready, and `ready_for_review` is what fires the one CI run.
 * Remove `ready_for_review` from a trigger and a draft can never run, so every
 * landing waits forever on contexts that will not report. Forget the draft
 * guard on one job and that job burns a runner on every draft push. Both are
 * one line of YAML, and neither shows up in a green pull request.
 *
 * `merge_group` is the same shape in reverse: it is wired for the day this
 * repository belongs to an organization and GitHub's own merge queue becomes
 * available (the queue is org-only, proven 2026-09-12 by a `422 Invalid rule
 * 'merge_queue'` on a ruleset and by `requiresMergeQueue` being absent from
 * this account's GraphQL schema). A required context that never reports on
 * `merge_group` would make a queue that can never merge, so the workflows that
 * produce one carry the trigger. `windows-beta-check.yml` must not: the event
 * supports no `paths` filter, so the trigger would run a 20-minute Windows job
 * on every merge group while gating nothing.
 */
describe("landing: draft, ready_for_review, and the merge group", () => {
  const all = workflows();

  /** The eight contexts `main` requires, as their job `name:` lines. */
  const REQUIRED_CONTEXT_JOB_NAMES = [
    "Types · Lint · Docs",
    "Unit · Contract",
    "MCP",
    "Playwright (static export)",
    "Playwright (web surface)",
    "Playwright (chromium ${{ matrix.shard }}/3)",
  ];

  const producesRequiredContext = (source: string): boolean =>
    REQUIRED_CONTEXT_JOB_NAMES.some((name) => source.includes(`    name: ${name}\n`));

  /** Job names in a workflow, in file order. */
  function jobNames(source: string): string[] {
    const jobsAt = source.indexOf("\njobs:\n");
    if (jobsAt < 0) throw new Error("workflow jobs block not found");
    return [...source.slice(jobsAt + 1).matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1]);
  }

  const DRAFT_GUARD = "github.event.pull_request.draft == false";

  it("finds exactly the two workflows that produce a required context", () => {
    // Idle-scan guard: if this pair ever reads empty, every assertion below
    // passes by measuring nothing.
    expect(all.filter((w) => producesRequiredContext(w.source)).map((w) => w.name).sort()).toEqual([
      "checks.yml",
      "e2e.yml",
    ]);
  });

  it("runs a required context on the merge group, and runs nothing else there", () => {
    for (const workflow of all) {
      expect(
        hasTrigger(workflow.source, "merge_group"),
        `${workflow.name}: a workflow that produces a required context must carry merge_group, `
          + "and one that produces none must not (merge_group takes no paths filter)",
      ).toBe(producesRequiredContext(workflow.source));
    }
  });

  it("lets a draft become ready, on every pull-request workflow", () => {
    const onPullRequest = all.filter(({ source }) => hasTrigger(source, "pull_request"));
    expect(onPullRequest.length).toBeGreaterThan(3);
    for (const workflow of onPullRequest) {
      // Without this activity type a draft marked ready fires nothing, and
      // `pnpm pr:land` waits out its whole timeout on contexts that will never
      // report.
      expect(workflow.source, `${workflow.name}: ready_for_review`).toMatch(
        /pull_request:\n(?:\s+#.*\n)*\s+types: \[[^\]]*ready_for_review[^\]]*\]/,
      );
    }
  });

  it("skips every job on a draft, so a draft costs no runner minute", () => {
    const onPullRequest = all.filter(({ source }) => hasTrigger(source, "pull_request"));
    for (const workflow of onPullRequest) {
      for (const job of jobNames(workflow.source)) {
        const header = jobHeader(workflow.source, job);
        expect(header, `${workflow.name}: job ${job} runs on a draft`).toContain(DRAFT_GUARD);
      }
    }
  });

  it("plans a merge group from the merge group's own base, never from a branch name", () => {
    for (const workflow of all.filter((w) => producesRequiredContext(w.source))) {
      expect(workflow.source, `${workflow.name}: merge-group base`).toContain(
        "MERGE_GROUP_BASE_SHA: ${{ github.event.merge_group.base_sha }}",
      );
      expect(workflow.source, `${workflow.name}: merge-group base is used`).toContain(
        '--base="${MERGE_GROUP_BASE_SHA:-origin/$BASE_REF}"',
      );
    }
  });
});
