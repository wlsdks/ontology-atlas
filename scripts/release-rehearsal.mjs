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
    "The ref, event SHA and workflow SHA of workflow_dispatch can only be compared inside the execution context GitHub builds. A --tag rehearsal also runs the tag/current-main admission checks below.",
  "Verify requested release version":
    "ADMISSION SKIP — create the tag first, then pass --tag=vX.Y.Z to run desktop:release-tag.",
  "Admit tag at current main SHA":
    "ADMISSION SKIP — create the tag first, then pass --tag=vX.Y.Z to run desktop:release-source --mode=admit against the full SHA of the current HEAD.",
  "Verify release source commit":
    "The pin check in build-macos re-verifies the RELEASE_SHA that admit-release pinned and handed over. In pin mode main may move ahead afterwards. A --tag rehearsal runs the earlier admit check against the current HEAD, but the value handed between hosted jobs cannot be reproduced on this machine.",
  "Verify release tag version":
    "A real tag name is required. Instead, the check below confirms that the package.json, tauri.conf.json and Cargo.toml versions agree with each other.",
  "Require signed release credentials":
    "All five Apple secrets must be registered on the repository for the runner to pass this gate. This machine holds no Actions secret, so checking the real values only holds in the tag workflow.",
  "Import Apple Developer ID certificate":
    "This step builds a temporary keychain from APPLE_CERTIFICATE_P12_BASE64. It cannot run without the secrets, and running it would touch this machine's keychain, so the rehearsal deliberately leaves it out.",
  "Enable Corepack pnpm":
    "This step installs pnpm on the runner. This machine already has pnpm, and whether the version matches the runner is answered by the tool probe above.",
  "Build signed and notarized release artifact":
    "codesign (Developer ID) plus notarytool are required. Instead, the local substitute for the same step runs the ad-hoc signing path end to end and proves the build, smoke, sidecar bundling, DMG, checksum and install smoke. Only Developer ID signing, notarization and DMG container signing are first stepped on by a real tag.",
  "Summarize macOS release assets": "It only writes a table into GITHUB_STEP_SUMMARY, so there is nothing here that can hold or fail.",
  "Cleanup Apple signing keychain": "It removes a keychain that only the signing path creates.",
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
    note: "Instead of a tag name, it checks that the package.json, tauri.conf.json and Cargo.toml versions agree with each other.",
  },
  "Build signed and notarized release artifact": {
    argv: ["pnpm", "desktop:release-artifact:unsigned"],
    note: "The public workflow has no unsigned fallback. Only locally does the ad-hoc signing substitute run the path end to end and prove the chain apart from Developer ID signing and notarization.",
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
  if (jobStart < 0) throw new Error(`release-macos.yml has no ${jobName} job.`);
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
      `Could not read the full commit SHA of the current HEAD: ${(result.stderr || result.stdout || "git rev-parse failed").trim()}`,
    );
  }
  return sha;
}

/** Builds local commands for admit-release's two real checks, only when a tag is given. */
export function admissionCheckCommands(tag, sha) {
  if (!tag) return [];
  if (!FULL_SHA.test(sha)) throw new Error("admission needs the full 40-character commit SHA.");
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
      .map(([source, version]) => `${source}=${version ?? "(none)"}`)
      .join(", ");
    if (!agree) {
      console.error(
        `[rehearsal] the versions disagree: ${rendered}. If you tag, "Verify release tag version" stops right here.`,
      );
      return 1;
    }
    console.log(`[rehearsal] package.json · tauri.conf.json · Cargo.toml all ${versions.package}`);
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
        reason: `GitHub Action(${step.uses}) — a runner-only step. Whether this tool exists on this machine is answered by the tool probe below instead.`,
      });
      continue;
    }
    plan.push({
      ...step,
      job: "admit-release",
      kind: "skip",
      reason: "A shell step that leans on runner environment variables, so it cannot be carried over to this machine verbatim.",
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
        reason: `GitHub Action(${step.uses}) — a runner-only step. Whether this tool exists on this machine is answered by the tool probe below instead.`,
      });
      continue;
    }
    const argvForStep = localCommandFor(step);
    if (!argvForStep) {
      plan.push({
        ...step,
        job: "build-macos",
        kind: "skip",
        reason: "A shell step that leans on runner environment variables, so it cannot be carried over to this machine verbatim.",
      });
      continue;
    }
    if (fast && (reachedSlow || REHEARSAL_SLOW_STEPS.has(step.name))) {
      reachedSlow = true;
      plan.push({ ...step, job: "build-macos", kind: "skip", argv: argvForStep, reason: "left out by --fast." });
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

  console.log(color(1, "[rehearsal] release-macos.yml · admit-release + build-macos — in order, on this machine"));
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
        `${color(33, "  tool ?    ")} ${tool} — no answer within ${PROBE_TIMEOUT_MS}ms, so this is unconfirmed (it does not mean absent).`,
      );
    } else {
      console.log(
        `${color(31, "  tool MISSING")} ${tool} — the runner has an install step. If it is missing here, the steps below stop at this point.`,
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
        "  note  TAURI_SIGNING_PRIVATE_KEY is absent, so a **throwaway updater key** is created and used.\n" +
          "        What that proves is 'the archive is rebuilt from a signed app and a signature is attached',\n" +
          "        not 'it was signed with our key' — the latter only becomes true on a real tag.",
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

  console.log(color(1, "\n[rehearsal] result"));
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
      color(31, `[rehearsal] blocked at "${failed.name}". If you tag, the runner stops at the same place.`),
    );
    return 1;
  }
  console.log(
    color(32, `[rehearsal] every step that can run on this machine passed (${skipped} skipped).`),
  );
  console.log(
    "[rehearsal] SKIP is not 'checked' — read each reason in the list above, and tag only knowing that the signing path is first stepped on by a real tag.",
  );
  return 0;
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  process.exitCode = main();
}
