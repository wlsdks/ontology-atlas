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

const SECRETS = /\bsecrets\b/i;
const INPUTS = /\binputs\b/i;
const WHOLE_SECRET = /^secrets\.[A-Za-z_][A-Za-z0-9_]*$/;

function triggerShapeProblem(source: string): string | null {
  const lines = source.replace(/^\s*#.*$/gm, "").split("\n");
  const at = lines.findIndex((line) => /^on\b/.test(line));
  if (at < 0) return "no top-level on:";
  if (lines[at] !== "on:") return `not a bare on: line: ${lines[at]}`;
  const block: string[] = [];
  for (const line of lines.slice(at + 1)) {
    if (line.trim() === "") continue;
    if (!line.startsWith(" ")) break;
    block.push(line);
  }
  const bad = block.find((line, i) => !/^ {2}[a-z_]+:/.test(line) && (i === 0 || !/^ {4,}\S/.test(line)));
  if (block.length === 0) return "on: lists no trigger";
  return bad === undefined ? null : `not a two-space trigger key: ${bad.trim()}`;
}

function shellHeaderProblems(source: string): string[] {
  const lines = source.split("\n");
  const problems: string[] = [];
  lines.forEach((line, i) => {
    const key = /^( *)(- )?(?:run|script):(.*)$/.exec(line);
    if (!key) return;
    const value = key[3].trim();
    if (/^[|>]/.test(value)) {
      if (!/^[|>][+-]?(?:\s+#.*)?$/.test(value)) problems.push(line.trim());
      return;
    }
    const next = lines.slice(i + 1).find((later) => later.trim() !== "" && !/^\s*#/.test(later));
    const continued = next !== undefined && /^ */.exec(next)![0].length > key[1].length + (key[2] ? 2 : 0);
    const openQuote = /^["']/.test(value) && (value.length < 2 || !value.endsWith(value[0]));
    if (value === "" || continued || openQuote) problems.push(line.trim());
  });
  return problems;
}

const hexEscapes = (source: string): string[] => source.match(/\\[xuU][0-9A-Fa-f]+/g) ?? [];

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
 * The part of a job that declares **who it runs as**: everything before `steps:`, or
 * before the job-level `uses:` of a reusable-workflow call (four spaces; a step's is
 * six), so `writePermissionsByJob` audits callers too.
 */
function jobHeader(source: string, jobName: string): string {
  const block = jobBlock(source, jobName);
  const body = /\n    (?:steps|uses):/.exec(block);
  if (!body) throw new Error(`workflow job body not found: ${jobName}`);
  return block.slice(0, body.index);
}

/** Every `${{ … }}` body; literals blanked (they may hold `}}`), escapes read as spaces. */
function expressions(source: string): string[] {
  const found: string[] = [];
  let at = source.indexOf("${{");
  while (at >= 0) {
    let i = at + 3;
    let body = "";
    while (i < source.length && !source.startsWith("}}", i)) {
      if (source[i] === "\\") {
        body += " ";
        i += 2;
        continue;
      }
      if (source[i] !== "'") {
        body += source[i];
        i += 1;
        continue;
      }
      i += 1;
      while (i < source.length && !(source[i] === "'" && source[i + 1] !== "'")) i += source[i] === "'" ? 2 : 1;
      i += 1;
      body += "''";
    }
    found.push(body.trim());
    at = source.indexOf("${{", i + 2);
  }
  return found;
}

/** Each `run:` and `script:` value, inline or block. */
function shellScripts(source: string): string[] {
  const lines = source.split("\n");
  const scripts: string[] = [];
  for (let i = 0; i < lines.length; i += 1) {
    const key = /^( *)(- )?(?:run|script):\s*(.*)$/.exec(lines[i]);
    if (!key) continue;
    if (!/^[|>][+-]?\s*$/.test(key[3])) {
      scripts.push(key[3]);
      continue;
    }
    const indent = key[1].length + (key[2] ? 2 : 0);
    const body: string[] = [];
    while (i + 1 < lines.length && (lines[i + 1].trim() === "" || /^ */.exec(lines[i + 1])![0].length > indent)) {
      body.push(lines[i + 1]);
      i += 1;
    }
    scripts.push(body.join("\n"));
  }
  return scripts;
}

const readsSecretOnPullRequest = (source: string): boolean =>
  hasTrigger(source, "pull_request") &&
  (expressions(source).some((body) => SECRETS.test(body)) || /^\s+secrets:/m.test(source));
const readsSecretIndirectly = (source: string): boolean =>
  expressions(source).some((body) => SECRETS.test(body) && !WHOLE_SECRET.test(body)) ||
  /^\s+secrets:\s*inherit\b/m.test(source);
const interpolatesInputInShell = (source: string): boolean =>
  shellScripts(source).some((script) => expressions(script).some((body) => INPUTS.test(body)));

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

  it("reads every workflow only in the shapes these scans understand", () => {
    const problems = all.flatMap(({ name, source }) => [
      ...[triggerShapeProblem(source)].filter((problem) => problem !== null).map((problem) => `${name}: ${problem}`),
      ...shellHeaderProblems(source).map((header) => `${name}: shell header ${header}`),
      ...hexEscapes(source).map((escape) => `${name}: YAML escape ${escape}`),
    ]);
    expect(problems).toEqual([]);
  });

  it("flags each known way around these scans", () => {
    const shaped = (source: string) =>
      triggerShapeProblem(source) !== null || shellHeaderProblems(source).length > 0 || hexEscapes(source).length > 0;
    const secretStep = "jobs:\n  a:\n    steps:\n      - run: x\n        env:\n          T: ${{ secrets.T }}\n";
    const planted: [string, (source: string) => boolean, string][] = [
      ["toJSON(secrets)", readsSecretIndirectly, "env:\n  X: ${{ toJSON(secrets) }}\n"],
      ["an upper-case context", readsSecretIndirectly, "env:\n  X: ${{ toJSON(SECRETS) }}\n"],
      ["an escape before the name", readsSecretIndirectly, 'env:\n  X: "${{ toJSON(\\tsecrets) }}"\n'],
      ["a hex escape spelling the braces", shaped, 'on:\n  push:\nenv:\n  X: "$\\x7B{ toJSON(secrets) }}"\n'],
      ["a hex escape inside the name", shaped, 'on:\n  push:\nenv:\n  X: "${{ toJSON(\\x73ecrets) }}"\n'],
      ["a two-space pull_request trigger", readsSecretOnPullRequest, `on:\n  pull_request:\n${secretStep}`],
      ["four-space triggers", shaped, `on:\n    pull_request:\n${secretStep}`],
      ["triggers as a sequence", shaped, `on:\n  - push\n  - pull_request\n${secretStep}`],
      ["triggers as a flow mapping", shaped, `on: {pull_request: {branches: [main]}}\n${secretStep}`],
      ["inputs.tag", interpolatesInputInShell, '      - run: echo "${{ inputs.tag }}"\n'],
      ["an indexed input", interpolatesInputInShell, "      - run: echo \"${{ inputs['tag'] }}\"\n"],
      ["an indexed event input", interpolatesInputInShell, "      - run: echo \"${{ github.event.inputs['tag'] }}\"\n"],
      ["toJSON(inputs)", interpolatesInputInShell, "      - run: echo '${{ toJSON(inputs) }}'\n"],
      ["an upper-case input context", interpolatesInputInShell, '      - run: echo "${{ INPUTS.tag }}"\n'],
      ["an indentation indicator", shaped, 'on:\n  push:\n      - run: |2\n          echo "${{ inputs.tag }}"\n'],
      ["a value on the next line", shaped, 'on:\n  push:\n      - run:\n          echo "${{ inputs.tag }}"\n'],
      ["a plain value continued", shaped, 'on:\n  push:\n      - run: echo a\n          && echo "${{ inputs.tag }}"\n'],
    ];
    expect(planted.filter(([, caught, source]) => !caught(source)).map(([label]) => label)).toEqual([]);
    const clean = "on:\n  push:\njobs:\n  a:\n    steps:\n      - run: echo \"$TAG\"\n        env:\n          TAG: ${{ inputs.tag }}\n";
    expect([shaped(clean), readsSecretIndirectly(clean), interpolatesInputInShell(clean)]).toEqual([false, false, false]);
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
    const offenders = all.filter(({ source }) => readsSecretOnPullRequest(source)).map((w) => w.name);
    expect(offenders).toEqual([]);
  });

  it("names every secret whole, so each one a workflow reads is visible by name", () => {
    // Blocks toJSON(secrets), secrets['X'], format(…, secrets.X) and secrets: inherit.
    const bodies = all.flatMap(({ name, source }) => expressions(source).map((body) => ({ name, body })));
    expect(bodies.length, "no expression found: this scan would pass vacuously").toBeGreaterThan(100);
    const indirect = bodies
      .filter(({ body }) => SECRETS.test(body) && !WHOLE_SECRET.test(body))
      .map(({ name, body }) => `${name}: \${{ ${body} }}`);
    const inherited = all.filter(({ source }) => /^\s+secrets:\s*inherit\b/m.test(source)).map((w) => w.name);
    expect([...indirect, ...inherited]).toEqual([]);
    expect(expressions("${{ format('{0}}', secrets.X) }}")).toEqual(["format('', secrets.X)"]);
  });

  it("keeps workflow inputs out of shell source", () => {
    // An input is caller-chosen text: through `env:` it is an argument, inlined it is code.
    const scripts = all.flatMap(({ name, source }) => shellScripts(source).map((script) => ({ name, script })));
    expect(scripts.length, "no run: or script: body found").toBeGreaterThan(100);
    expect(shellScripts("      - run: |\n          a\n\n          b\n        env:\n")).toEqual(["          a\n\n          b"]);
    const offenders = scripts
      .filter(({ script }) => expressions(script).some((body) => INPUTS.test(body)))
      .map(({ name, script }) => `${name}: ${script.trim().split("\n")[0]}`);
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

    for (const jobName of ["build-macos", "sign-macos", "verify-macos", "build-windows"]) {
      const header = jobHeader(release, jobName);
      const block = jobBlock(release, jobName);
      expect(header, `${jobName} admission dependency`).toMatch(/needs:\s*(?:admit-release\b|\[[^\]]*\badmit-release\b[^\]]*\])/);
      expect(block, `${jobName} trusted checkout`).toContain(
        "ref: ${{ needs.admit-release.outputs.release_sha }}",
      );
    }
    for (const jobName of ["sign-macos", "build-windows"]) {
      expect(jobHeader(release, jobName), `${jobName} secret environment`).toMatch(/environment:\s*release-signing/);
    }
    for (const jobName of ["build-macos", "verify-macos"]) {
      expect(jobHeader(release, jobName), `${jobName} runs build or install code, so it enters no environment`).not.toMatch(
        /environment:/,
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

  it("keeps every signing secret out of the Windows job, which ships no in-app update", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const windows = jobBlock(release, "build-windows");
    expect(windows).toContain("- name: Build Windows NSIS installer\n        run: pnpm desktop:build:windows\n");
    expect(expressions(windows).filter((body) => SECRETS.test(body))).toEqual([]);
  });

  it("macOS 직접 다운로드 릴리스는 서명·공증 자격증명이 없으면 실패한다", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const macos = ["build-macos", "sign-macos", "verify-macos"].map((job) => jobBlock(release, job)).join("\n");
    const sign = jobBlock(release, "sign-macos");

    expect(sign).toMatch(
      /- name: Require signed release credentials\n(?:        env:[\s\S]*?)?        run: pnpm desktop:release-secrets/,
    );
    expect(sign).toMatch(
      /- name: Sign and notarize release artifact\n        run: pnpm desktop:release-artifact -- --phase=sign\n/,
    );
    expect(jobBlock(release, "verify-macos")).toContain("- name: Verify installed app\n        run: pnpm desktop:verify-install\n");
    expect(macos).not.toContain("desktop:release-artifact:unsigned");
    expect(macos).not.toContain("steps.signing.outputs.signed");
    expect(macos).not.toContain("UNSIGNED build");
  });

  it("builds the macOS app in a job with no secret, and imports the identity only in the signing job after it", () => {
    const release = all.find((w) => w.name === "release-macos.yml")!.source;
    const build = jobBlock(release, "build-macos");
    const sign = jobBlock(release, "sign-macos");
    const verify = jobBlock(release, "verify-macos");
    const at = (marker: string) => sign.indexOf(marker);

    expect(build).toContain("- name: Build release app bundle\n        run: pnpm desktop:release-artifact -- --phase=build\n");
    for (const [jobName, block] of [["build-macos", build], ["verify-macos", verify]] as const) {
      expect(expressions(block).filter((body) => SECRETS.test(body)), `${jobName} reads a secret`).toEqual([]);
      expect(block, `${jobName} imports an identity`).not.toContain("security import");
    }
    expect(jobHeader(release, "sign-macos"), "the signing job must wait for the build").toMatch(
      /needs:\s*\[[^\]]*\bbuild-macos\b[^\]]*\]/,
    );
    expect(sign, "build code would run beside the imported identity").not.toMatch(
      /--phase=build|desktop:build|mcp:build-binary|pnpm build\b|pnpm --dir mcp install/,
    );
    expect(sign, "an install in the signing job runs no lifecycle script").toContain(
      "run: pnpm install --frozen-lockfile --ignore-scripts\n",
    );
    expect(sign.match(/pnpm install\b/g)).toHaveLength(1);
    expect(at("run: pnpm desktop:release-secrets"), "the validator runs first").toBeLessThan(
      at("- name: Install dependencies without lifecycle scripts"),
    );
    expect(at("- name: Unpack unsigned app and symbols")).toBeLessThan(at("- name: Import Apple Developer ID certificate"));
    expect(at("- name: Import Apple Developer ID certificate")).toBeLessThan(at("--phase=sign"));
    expect(at("--phase=sign")).toBeLessThan(at("- name: Cleanup Apple signing keychain"));
    expect(sign).toMatch(/- name: Cleanup Apple signing keychain\n        if: \$\{\{ always\(\) \}\}\n/);

    const importStep = sign.slice(at("- name: Import Apple Developer ID certificate"), at("- name: Sign and notarize"));
    const importLine = importStep.split("\n").find((line) => line.includes("security import"))!;
    expect(importLine).toContain("-T /usr/bin/codesign");
    expect(importLine).not.toMatch(/\s-A\s/);
    const afterImport = importStep.slice(importStep.indexOf(importLine) + importLine.length).split("\n");
    expect(afterImport.find((line) => line.trim() !== "")?.trim(), "the .p12 outlives its import").toBe(
      'rm -f "$CERTIFICATE_PATH"',
    );
  });

  it("keeps the token out of git config wherever a job can write or holds a secret", () => {
    let guarded = 0;
    const offenders: string[] = [];
    for (const { name, source } of all) {
      const workflowWrites = /: write\s*$/m.test(/^permissions:\n((?: {2}.*\n?)*)/m.exec(source)?.[1] ?? "");
      const jobsSource = source.slice(source.indexOf("\njobs:\n") + 1);
      for (const job of [...jobsSource.matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map((match) => match[1])) {
        const header = jobHeader(source, job);
        const block = jobBlock(source, job);
        const writes = /^    permissions:/m.test(header) ? job in writePermissionsByJob(source) : workflowWrites;
        if (!writes && !expressions(block).some((body) => SECRETS.test(body))) continue;
        for (const step of block.split(/(?=^      - (?:name|uses):)/m).filter((s) => s.includes("actions/checkout@"))) {
          guarded += 1;
          if (!/^\s+persist-credentials: false$/m.test(step)) offenders.push(`${name}:${job}`);
        }
      }
    }
    expect(guarded, "no guarded checkout found").toBeGreaterThanOrEqual(6);
    expect(offenders).toEqual([]);
  });

  it("checks out only the lockfile where the audit's check-run token lives", () => {
    const checkWriters = all.flatMap(({ name, source }) =>
      Object.entries(writePermissionsByJob(source))
        .filter(([, keys]) => keys.includes("checks"))
        .map(([job]) => ({ name, block: jobBlock(source, job) })),
    );
    expect(checkWriters.map(({ name }) => name).sort()).toEqual(["release-macos.yml", "windows-beta-check.yml"]);
    for (const { name, block } of checkWriters) {
      expect(block, name).toMatch(/sparse-checkout: src-tauri\/Cargo\.lock\n\s+sparse-checkout-cone-mode: false\n/);
      expect(block, name).not.toMatch(/\bpnpm\b|\bnode\b/);
      expect(block, name).toMatch(/CARGO_AUDIT_SHA256: [a-f0-9]{64}\n[\s\S]*sha256sum --check --strict/);
    }
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
    for (const jobName of ["build-macos", "sign-macos", "verify-macos", "build-windows"]) {
      expect(jobBlock(release, jobName), jobName).not.toMatch(/^    permissions:/m);
    }
    expect(jobBlock(release, "audit-rust")).toMatch(
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
      "audit-rust": ["checks"],
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
    const jobs = [...release.slice(release.indexOf("\njobs:\n") + 1).matchAll(/^  ([A-Za-z0-9_-]+):\s*$/gm)].map(
      (match) => match[1],
    );
    expect(jobs.length, "no release job found: this scan would pass vacuously").toBeGreaterThan(8);
    expect(
      jobs.filter((jobName) => expressions(jobBlock(release, jobName)).some((body) => SECRETS.test(body))),
      "only the signing job may read a secret",
    ).toEqual(["sign-macos"]);
    for (const jobName of jobs) {
      expect(jobHeader(release, jobName), `${jobName} job env`).not.toMatch(
        /\$\{\{\s*secrets\.(?:APPLE_|TAURI_SIGNING_)/,
      );
    }

    const expectedSteps: Record<string, string[]> = {
      APPLE_CERTIFICATE_P12_BASE64: ["Require signed release credentials", "Import Apple Developer ID certificate"],
      APPLE_CERTIFICATE_PASSWORD: ["Require signed release credentials", "Import Apple Developer ID certificate"],
      APPLE_API_KEY_P8_BASE64: ["Require signed release credentials", "Sign and notarize release artifact"],
      APPLE_API_KEY_ID: ["Require signed release credentials", "Sign and notarize release artifact"],
      APPLE_API_ISSUER_ID: ["Require signed release credentials", "Sign and notarize release artifact"],
      TAURI_SIGNING_PRIVATE_KEY: ["Require signed release credentials", "Sign and notarize release artifact"],
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: ["Require signed release credentials", "Sign and notarize release artifact"],
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
