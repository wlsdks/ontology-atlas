#!/usr/bin/env node
/**
 * Walks the release runner's steps on this machine, in order, **before** a tag is
 * pushed.
 *
 * **Why this exists.** `v1.0.0-rc.2` was tagged four times and stopped in the build
 * all four times. Each fix moved the failure to **the very next step**:
 *
 *   1st  Desktop readiness            gate demanded yesterday's doc sentence (#743)
 *   2nd  Native vault bridge tests    externalBin sidecar built too late      (#744)
 *   3rd  Build bundled MCP sidecar    bun, the build tool, absent on runner   (#745)
 *   4th  Build bundled MCP sidecar    mcp/ dependencies absent on runner      (#746)
 *
 * All four **passed locally**, because a person's machine already has everything.
 * And these steps are wired nowhere outside
 * `.github/workflows/release-macos.yml` — neither `checks.yml` nor
 * `deploy-pages.yml` runs `desktop:check` / `desktop:smoke` / `mcp:build-binary` /
 * `test:desktop:bridge`. So these steps **are first executed only by pushing a
 * tag**, and you learn one failure per round trip, at roughly 20 minutes of human
 * time each.
 *
 * This script moves that round trip to before the tag.
 *
 * **Why it reads the workflow file.** Copying the step list in here means this file
 * goes quietly stale when the workflow changes — a failure mode this repository has
 * hit repeatedly (a gate verifying its own constants). So the list is not written
 * down; it is **read straight from the workflow's `build-macos` job**, and a new
 * step in the workflow is picked up by the next rehearsal automatically. Both the
 * protected `admit-release` and `build-macos` are covered.
 *
 * **It says what it cannot do.** Signing and notarisation need Apple secrets; the
 * release slot and draft verification need a real tag. Such steps are not skipped
 * quietly — they are **listed as `SKIP` with the reason**. If green came to mean
 * "everything was checked", this script would be reassurance rather than a gate.
 *
 *   node scripts/release-rehearsal.mjs            # everything through the build
 *   node scripts/release-rehearsal.mjs --fast     # stop before app compile / DMG
 *   node scripts/release-rehearsal.mjs --list     # only show what would run
 *   node scripts/release-rehearsal.mjs --tag=vX.Y.Z # also admit an existing tag
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_WORKFLOW_PATH = ".github/workflows/release-macos.yml";
const FULL_SHA = /^[0-9a-f]{40}$/i;

/**
 * Steps that only hold with secrets, a real tag, or GitHub state.
 *
 * The key is the workflow's `name:`. The value is **why it cannot run here** — a
 * person must be able to answer "then where do I check it" immediately.
 */
export const REHEARSAL_SKIPS = {
  "Require protected main dispatch context":
    "workflow_dispatch 의 ref·event SHA·workflow SHA 는 GitHub가 만든 실행 문맥에서만 비교할 수 있다. --tag 리허설은 아래의 tag/current-main admission 검사까지 실행한다.",
  "Verify requested release version":
    "ADMISSION SKIP — 기존 태그를 만든 뒤 --tag=vX.Y.Z 를 주면 desktop:release-tag 를 실행한다.",
  "Admit tag at current main SHA":
    "ADMISSION SKIP — 기존 태그를 만든 뒤 --tag=vX.Y.Z 를 주면 현재 HEAD 전체 SHA로 desktop:release-source --mode=admit 를 실행한다.",
  "Verify release source commit":
    "build-macos 의 pin 검사는 admit-release 가 고정해 전달한 RELEASE_SHA 를 다시 확인한다. pin 모드에서는 main 이 그 뒤로 전진해도 된다. --tag 리허설은 그보다 앞선 admit 검사를 현재 HEAD로 실행하지만, 호스팅된 잡 사이 전달값은 이 기계에서 재현할 수 없다.",
  "Verify release tag version":
    "실제 태그 이름이 필요하다. 대신 아래에서 package.json · tauri.conf.json · Cargo.toml 세 버전이 서로 맞는지 확인한다.",
  "Require signed release credentials":
    "레포에 Apple 시크릿 5종이 모두 등록돼 있어야 러너가 이 게이트를 통과한다. 이 기계에는 Actions secret 이 없으므로 실제 값 검사는 태그 워크플로에서만 성립한다.",
  "Import Apple Developer ID certificate":
    "APPLE_CERTIFICATE_P12_BASE64 로 임시 키체인을 만드는 단계다. 시크릿 없이는 밟을 수 없고, 밟아도 이 기계의 키체인을 건드리게 되므로 리허설에서 일부러 하지 않는다.",
  "Enable Corepack pnpm":
    "러너에 pnpm 을 심는 단계다. 이 기계에는 이미 pnpm 이 있고, 버전이 러너와 같은지는 위의 도구 점검이 답한다.",
  "Build signed and notarized release artifact":
    "codesign(Developer ID) + notarytool 이 필요하다. 대신 같은 단계의 로컬 대체 명령이 ad-hoc 서명 경로를 끝까지 돌려 빌드·스모크·사이드카 동봉·DMG·체크섬·설치 스모크를 증명한다. Developer ID 서명·공증·DMG 컨테이너 서명만 실제 태그에서 처음 밟힌다.",
  "Summarize macOS release assets": "GITHUB_STEP_SUMMARY 에 표를 쓸 뿐이라 성립 여부가 없다.",
  "Cleanup Apple signing keychain": "서명 경로에서만 만들어진 키체인을 지운다.",
};

/**
 * Gives **something to run instead** for steps whose runner command cannot be used
 * verbatim.
 *
 * Skipping and checking by proxy are different things. Tag/version consistency can
 * be checked among the three files without a tag name, and the signed build path is
 * mostly proven by the unsigned one.
 */
export const REHEARSAL_SUBSTITUTES = {
  "Verify release tag version": {
    argv: ["node", "scripts/release-rehearsal.mjs", "--check-versions"],
    note: "태그 이름 대신 package.json · tauri.conf.json · Cargo.toml 세 버전이 서로 맞는지 본다.",
  },
  "Build signed and notarized release artifact": {
    argv: ["pnpm", "desktop:release-artifact:unsigned"],
    note: "공개 workflow에는 unsigned 폴백이 없다. 로컬에서만 ad-hoc 서명 대체 경로를 끝까지 돌려 Developer ID 서명·공증 외의 체인을 증명한다.",
  },
};

/** App compile, DMG, and install smoke are slow — `--fast` stops here. */
export const REHEARSAL_SLOW_STEPS = new Set([
  "Build signed and notarized release artifact",
]);

/**
 * Extracts the `build-macos` job's `run:` steps **in the order the file lists
 * them**.
 *
 * No YAML parser is added: this workflow's step shape is fixed (`- name:` followed
 * by `run:`), and being self-explanatory beats carrying another dependency. The
 * number of steps extracted is guarded by a contract test.
 */
/**
 * Timeout for a tool probe, in ms.
 *
 * **Why a timeout was needed (2026-08-21).** `--list` shows what would run and what
 * does not work on this machine (`docs/DEPLOYMENT.md`), so it really invokes four
 * tools — that part is right. What was missing was **any bound**.
 *
 * Measured: **0.18 s** on this machine, **9.75 s** on the CI runner. On the runner
 * `cargo`/`rustc` start through rustup shims, so the first call is slow. Those
 * 9.75 s exceeded vitest's default 5 s test timeout and **turned one contract red
 * at random** (observed in `#1178`, 2026-08-21 → passed on re-run).
 *
 * This repository's rule applies: **a gate bound to machine speed is not a gate**
 * (`.claude/rules/architecture.md`). A slow tool is not the question this check
 * answers, so when it cannot wait it **says it could not wait** and moves on.
 *
 * It is opened via env so a test can lower it and actually produce the third state
 * — a state you cannot produce is a state you cannot check, and an uncheckable
 * branch rots quietly.
 */
export const PROBE_TIMEOUT_MS = Number(process.env.RELEASE_REHEARSAL_PROBE_TIMEOUT_MS) || 5_000;

/**
 * Probes one tool. Returns **one of three** results — `ok`, `missing`, or
 * `unknown` (hit the timeout). Not folding "unknown" into "missing" is the point of
 * this function.
 *
 * ⚠️ `spawn`'s type is narrowed to **only the four fields this function actually
 * reads**. With `typeof spawnSync` a test stub would have to fill in `pid`,
 * `output`, `stderr` and other fields **nothing here looks at**, which makes the
 * stub invent values that are not facts. A seam should be exactly as wide as its
 * consumer really requires.
 *
 * @param {string} tool
 * @param {string[]} args
 * @param {{
 *   spawn?: (tool: string, args: string[], options: Record<string, unknown>) => {
 *     status?: number | null,
 *     signal?: NodeJS.Signals | string | null,
 *     stdout?: string | null,
 *     error?: { code?: string } | null,
 *   },
 *   timeout?: number,
 * }} [options]
 */
export function probeTool(tool, args, { spawn = spawnSync, timeout = PROBE_TIMEOUT_MS } = {}) {
  const probe = spawn(tool, args, { encoding: "utf8", timeout });
  if (probe.status === 0) {
    return { state: "ok", version: String(probe.stdout ?? "").trim().split("\n")[0] };
  }
  // On timeout Node kills the child with a signal (`SIGTERM`). When the executable
  // is absent entirely it is `error.code === 'ENOENT'` — two different facts.
  const timedOut = probe.signal != null || probe.error?.code === "ETIMEDOUT";
  return { state: timedOut ? "unknown" : "missing" };
}

export function parseReleaseJobSteps(workflow, jobName) {
  const jobStart = workflow.indexOf(`\n  ${jobName}:`);
  if (jobStart < 0) throw new Error(`release-macos.yml 에 ${jobName} 잡이 없다.`);
  // This job extends up to the next job (another key at 2-space indent).
  const rest = workflow.slice(jobStart + 1);
  const nextJob = rest.slice(1).search(/\n {2}[a-z][a-z0-9-]*:\n/);
  const job = nextJob < 0 ? rest : rest.slice(0, nextJob + 1);

  const steps = [];
  const stepPattern = /^ {6}- name: (.+)$/gm;
  for (const match of job.matchAll(stepPattern)) {
    const name = match[1].trim();
    const body = job.slice(match.index + match[0].length);
    const end = body.search(/^ {6}- name: /m);
    const block = end < 0 ? body : body.slice(0, end);
    const uses = block.match(/^ {8}uses: (.+)$/m)?.[1]?.trim() ?? null;
    // Accepts both a `run: |` block and a single-line `run:`.
    const runInline = block.match(/^ {8}run: (?!\|)(.+)$/m)?.[1]?.trim() ?? null;
    const runBlock = /^ {8}run: \|/m.test(block);
    steps.push({ name, uses, run: runInline, isRunBlock: runBlock });
  }
  return steps;
}

export function parseAdmitReleaseSteps(workflow) {
  return parseReleaseJobSteps(workflow, "admit-release");
}

export function parseBuildMacosSteps(workflow) {
  return parseReleaseJobSteps(workflow, "build-macos");
}

/** Translates one workflow `run:` line into argv runnable on this machine. */
export function localCommandFor(step, { arch = hostArch() } = {}) {
  const substitute = REHEARSAL_SUBSTITUTES[step.name];
  if (substitute) return substitute.argv;
  if (!step.run) return null;
  // A line containing runner variables such as `${GITHUB_SHA}` cannot hold here.
  if (/\$\{?GITHUB_/.test(step.run)) return null;
  // `TAURI_ARCH` is set by the matrix; on this machine it is the host architecture.
  const command = step.run
    .replace(/\$\{TAURI_ARCH\}/g, arch)
    .replace(/"/g, "")
    .replace(/\s+/g, " ")
    .trim();
  if (!command.startsWith("pnpm ") && !command.startsWith("node ")) return null;
  return command.split(" ");
}

export function hostArch() {
  return process.arch === "arm64" ? "aarch64" : "x64";
}

/** Returns the current checkout's commit as a full, unabbreviated SHA. */
export function currentHeadSha(root = process.cwd()) {
  const result = spawnSync("git", ["rev-parse", "--verify", "HEAD^{commit}"], {
    cwd: root,
    encoding: "utf8",
  });
  const sha = result.status === 0 ? result.stdout.trim() : "";
  if (!FULL_SHA.test(sha)) {
    throw new Error(
      `현재 HEAD의 전체 commit SHA를 읽지 못했다: ${(result.stderr || result.stdout || "git rev-parse failed").trim()}`,
    );
  }
  return sha;
}

/** Builds local commands for admit-release's two real checks, only when a tag is given. */
export function admissionCheckCommands(tag, sha) {
  if (!tag) return [];
  if (!FULL_SHA.test(sha)) throw new Error("admission에는 전체 40자 commit SHA가 필요하다.");
  return [
    {
      name: "Verify requested release version",
      argv: ["pnpm", "desktop:release-tag", "--", `--tag=${tag}`],
    },
    {
      name: "Admit tag at current main SHA",
      argv: [
        "pnpm",
        "desktop:release-source",
        "--",
        "--mode=admit",
        `--tag=${tag}`,
        `--sha=${sha}`,
      ],
    },
  ];
}

/** What can be checked without a tag name: whether the three versions agree. */
export function checkVersionsAgree(root = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const tauri = JSON.parse(
    fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
  ).version;
  const cargo = fs
    .readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8")
    .match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];
  const versions = { package: pkg, tauri, cargo };
  const distinct = new Set(Object.values(versions));
  return { versions, agree: distinct.size === 1 && !distinct.has(undefined) };
}

function color(code, text) {
  return process.stdout.isTTY ? `[${code}m${text}[0m` : text;
}

function run(argv, { cwd, env }) {
  const [command, ...args] = argv;
  const started = Date.now();
  const result = spawnSync(command, args, { cwd, env, stdio: "inherit", encoding: "utf8" });
  return { ok: result.status === 0, status: result.status, seconds: (Date.now() - started) / 1000 };
}

/**
 * Repacking the updater archive is fail-closed without a minisign key — correct,
 * since the app silently refuses an unsigned update package. But **that key exists
 * only in secrets**, so left alone the rehearsal stops where CI would pass.
 *
 * So the rehearsal mints a **throwaway key** to walk that step. What is proven is
 * "the archive is rebuilt from the signed app and a signature is attached", not
 * "it was signed with our key" — the latter is only true on a real tag.
 *
 * @param {string} root
 * @param {{
 *   existingKey?: string,
 *   tempRoot?: string,
 *   generate?: (keyPath: string) => { status: number | null },
 * }} [options]
 */
export function ephemeralUpdaterKey(
  root,
  {
    existingKey = process.env.TAURI_SIGNING_PRIVATE_KEY ?? "",
    tempRoot = os.tmpdir(),
    generate = (keyPath) =>
      spawnSync(
        "pnpm",
        ["exec", "tauri", "signer", "generate", "-w", keyPath, "--password", "", "--force"],
        { cwd: root, encoding: "utf8" },
      ),
  } = {},
) {
  if (existingKey.trim()) return null;
  const privateDir = fs.mkdtempSync(path.join(tempRoot, "ontology-atlas-rehearsal-updater-"));
  const keyPath = path.join(privateDir, "updater.key");
  try {
    const generated = generate(keyPath);
    if (generated.status !== 0) return null;
    fs.chmodSync(keyPath, 0o600);
    return {
      TAURI_SIGNING_PRIVATE_KEY: fs.readFileSync(keyPath, "utf8"),
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "",
    };
  } finally {
    fs.rmSync(privateDir, { recursive: true, force: true });
  }
}

function main() {
  const argv = process.argv.slice(2);
  if (argv.includes("--check-versions")) {
    const { versions, agree } = checkVersionsAgree();
    const rendered = Object.entries(versions)
      .map(([source, version]) => `${source}=${version ?? "(없음)"}`)
      .join(", ");
    if (!agree) {
      console.error(
        `[rehearsal] 버전이 서로 다르다: ${rendered}. 태그를 찍으면 "Verify release tag version" 이 여기서 멈춘다.`,
      );
      return 1;
    }
    console.log(`[rehearsal] package.json · tauri.conf.json · Cargo.toml 모두 ${versions.package}`);
    return 0;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage: pnpm desktop:release-rehearsal [--fast] [--list] [--tag=vX.Y.Z]",
        "",
        "Walks the release-macos.yml `admit-release` and `build-macos` jobs on this machine,",
        "in file order. Without --tag, admission is explicitly SKIP; after creating an",
        "existing tag, --tag runs the workflow's release-tag and source-admit checks locally.",
        "",
        "  --fast   stop before the long app compile / DMG steps",
        "  --list   print the plan without running anything",
        "  --tag    existing v-prefixed release tag to admit against the current HEAD",
      ].join("\n"),
    );
    return 0;
  }

  const tagArgs = argv.filter((arg) => arg.startsWith("--tag="));
  const unsupported = argv.find(
    (arg) =>
      arg !== "--fast" &&
      arg !== "--list" &&
      arg !== "--check-versions" &&
      !arg.startsWith("--tag="),
  );
  if (tagArgs.length > 1 || unsupported) {
    console.error(`[rehearsal] unknown or repeated argument: ${unsupported ?? "--tag"}`);
    return 1;
  }
  const tag = tagArgs[0]?.slice("--tag=".length).trim() ?? "";
  if (tagArgs.length === 1 && !tag) {
    console.error("[rehearsal] --tag requires an existing v-prefixed release tag.");
    return 1;
  }

  const root = process.cwd();
  const workflow = fs.readFileSync(path.join(root, RELEASE_WORKFLOW_PATH), "utf8");
  const admissionSteps = parseAdmitReleaseSteps(workflow);
  const buildSteps = parseBuildMacosSteps(workflow);
  const fast = argv.includes("--fast");
  let admissionCommands = new Map();
  if (tag) {
    try {
      admissionCommands = new Map(
        admissionCheckCommands(tag, currentHeadSha(root)).map((command) => [command.name, command.argv]),
      );
    } catch (error) {
      console.error(`[rehearsal] ${error.message}`);
      return 1;
    }
  }

  const plan = [];
  for (const step of admissionSteps) {
    const argvForAdmission = admissionCommands.get(step.name);
    if (argvForAdmission) {
      plan.push({ ...step, job: "admit-release", kind: "run", argv: argvForAdmission });
      continue;
    }
    if (REHEARSAL_SKIPS[step.name] && !REHEARSAL_SUBSTITUTES[step.name]) {
      plan.push({ ...step, job: "admit-release", kind: "skip", reason: REHEARSAL_SKIPS[step.name] });
      continue;
    }
    if (step.uses) {
      plan.push({
        ...step,
        job: "admit-release",
        kind: "skip",
        reason: `GitHub Action(${step.uses}) — 러너 전용 단계다. 이 도구가 이 기계에 있는지는 아래 도구 점검이 대신 답한다.`,
      });
      continue;
    }
    plan.push({
      ...step,
      job: "admit-release",
      kind: "skip",
      reason: "러너 환경 변수에 기대는 셸 단계라 이 기계에서 그대로 옮길 수 없다.",
    });
  }

  let reachedSlow = false;
  for (const step of buildSteps) {
    if (REHEARSAL_SKIPS[step.name] && !REHEARSAL_SUBSTITUTES[step.name]) {
      plan.push({ ...step, job: "build-macos", kind: "skip", reason: REHEARSAL_SKIPS[step.name] });
      continue;
    }
    if (step.uses) {
      plan.push({
        ...step,
        job: "build-macos",
        kind: "skip",
        reason: `GitHub Action(${step.uses}) — 러너 전용 단계다. 이 도구가 이 기계에 있는지는 아래 도구 점검이 대신 답한다.`,
      });
      continue;
    }
    const argvForStep = localCommandFor(step);
    if (!argvForStep) {
      plan.push({
        ...step,
        job: "build-macos",
        kind: "skip",
        reason: "러너 환경 변수에 기대는 셸 단계라 이 기계에서 그대로 옮길 수 없다.",
      });
      continue;
    }
    if (fast && (reachedSlow || REHEARSAL_SLOW_STEPS.has(step.name))) {
      reachedSlow = true;
      plan.push({ ...step, job: "build-macos", kind: "skip", argv: argvForStep, reason: "--fast 로 생략했다." });
      continue;
    }
    plan.push({
      ...step,
      job: "build-macos",
      kind: "run",
      argv: argvForStep,
      note: REHEARSAL_SUBSTITUTES[step.name]?.note,
    });
  }

  // Tools that may exist on the runner but not here, or the reverse. The 3rd and
  // 4th failures were exactly this — with the order fully correct, a missing tool
  // still stops you in the same place.
  const tools = [
    ["pnpm", ["--version"]],
    ["bun", ["--version"]],
    ["cargo", ["--version"]],
    ["rustc", ["--version"]],
  ];

  console.log(color(1, "[rehearsal] release-macos.yml · admit-release + build-macos — 이 기계에서 순서대로"));
  console.log("");
  for (const [tool, args] of tools) {
    const probe = probeTool(tool, args);
    if (probe.state === "ok") {
      console.log(`${color(32, "  tool ok  ")} ${tool} — ${probe.version}`);
    } else if (probe.state === "unknown") {
      // **Do not report unknown as missing.** Hitting the timeout means "no answer in
      // time", not "absent on this machine". Calling both the same thing sends the next
      // person off to install a tool that is already there.
      console.log(
        `${color(33, "  tool ?    ")} ${tool} — ${PROBE_TIMEOUT_MS}ms 안에 답이 없어 확인 못 했다(없다는 뜻이 아니다).`,
      );
    } else {
      console.log(
        `${color(31, "  tool MISSING")} ${tool} — 러너에는 설치 단계가 있다. 이 기계에 없으면 아래 단계가 여기서 멈춘다.`,
      );
    }
  }
  console.log("");

  if (argv.includes("--list")) {
    for (const step of plan) {
      console.log(
        `${step.kind === "run" ? color(36, "  RUN") : color(33, "  SKIP")} [${step.job}] ${step.name}` +
          (step.kind === "run"
            ? ` — ${step.argv.join(" ")}${step.note ? `\n        ${step.note}` : ""}`
            : ` — ${step.reason}`),
      );
    }
    return 0;
  }

  const throwaway = ephemeralUpdaterKey(root);
  if (throwaway) {
    console.log(
      color(
        33,
        "  note  TAURI_SIGNING_PRIVATE_KEY 가 없어 **버리는 업데이터 키**를 만들어 쓴다.\n" +
          "        증명되는 것은 '아카이브가 서명된 앱으로 다시 만들어지고 서명이 붙는가' 이지\n" +
          "        '우리 키로 서명됐는가' 가 아니다 — 후자는 실제 태그에서만 참이 된다.",
      ),
    );
    console.log("");
  }
  const childEnv = { ...process.env, ...(throwaway ?? {}) };

  const results = [];
  for (const step of plan) {
    if (step.kind === "skip") {
      results.push({ name: step.name, job: step.job, state: "skip", reason: step.reason });
      continue;
    }
    console.log(color(1, `\n[rehearsal] ▸ ${step.name} — ${step.argv.join(" ")}`));
    const outcome = run(step.argv, { cwd: root, env: childEnv });
    results.push({
      name: step.name,
      job: step.job,
      state: outcome.ok ? "pass" : "fail",
      seconds: outcome.seconds,
      status: outcome.status,
    });
    if (!outcome.ok) break;
  }

  console.log(color(1, "\n[rehearsal] 결과"));
  for (const result of results) {
    const label =
      result.state === "pass"
        ? color(32, "PASS")
        : result.state === "fail"
          ? color(31, "FAIL")
          : color(33, "SKIP");
    console.log(
      `  ${label}  [${result.job}] ${result.name}` +
        (result.state === "skip"
          ? `\n        ${result.reason}`
          : ` (${result.seconds.toFixed(1)}s)`),
    );
  }

  const failed = results.find((result) => result.state === "fail");
  const skipped = results.filter((result) => result.state === "skip").length;
  console.log("");
  if (failed) {
    console.log(
      color(31, `[rehearsal] blocked at "${failed.name}". 태그를 찍으면 러너도 같은 자리에서 멈춘다.`),
    );
    return 1;
  }
  console.log(
    color(32, `[rehearsal] 이 기계에서 돌 수 있는 단계는 전부 통과했다 (${skipped}개는 SKIP).`),
  );
  console.log(
    "[rehearsal] SKIP 은 '확인했다' 가 아니다 — 위 목록에서 각 이유를 읽고, 서명 경로는 실제 태그에서 처음 밟힌다는 것을 알고 찍어라.",
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
