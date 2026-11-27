#!/usr/bin/env node
/**
 * Walks the release workflow's `admit-release`, `test-release-gates`, `test-macos`, `build-macos` and `sign-macos` steps on this machine
 * before a tag is pushed, reading them from the workflow so a new step is never missed;
 * a step that needs Apple secrets or a real tag is listed as SKIP with its reason.
 *
 *   node scripts/desktop-release/release-rehearsal.mjs            # everything through the build
 *   node scripts/desktop-release/release-rehearsal.mjs --fast     # stop before app compile / DMG
 *   node scripts/desktop-release/release-rehearsal.mjs --list     # only show what would run
 *   node scripts/desktop-release/release-rehearsal.mjs --tag=vX.Y.Z # also admit an existing tag
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_WORKFLOW_PATH = ".github/workflows/release-macos.yml";
const FULL_SHA = /^[0-9a-f]{40}$/i;

/** Steps that only hold with secrets, a real tag, or GitHub state. The key is the workflow's `name:`; the value says why it cannot run here, so a person knows where to check it instead. */
export const REHEARSAL_SKIPS = {
  "Require protected main dispatch context":
    "The ref, event SHA and workflow SHA of workflow_dispatch can only be compared inside the execution context GitHub builds. A --tag rehearsal also runs the tag/current-main admission checks below.",
  "Verify requested release version":
    "ADMISSION SKIP — create the tag first, then pass --tag=vX.Y.Z to run desktop:release-tag.",
  "Admit tag at current main SHA":
    "ADMISSION SKIP — create the tag first, then pass --tag=vX.Y.Z to run desktop:release-source --mode=admit against the full SHA of the current HEAD.",
  "Verify release source commit":
    "The pin check in build-macos re-verifies the RELEASE_SHA that admit-release pinned and handed over. In pin mode main may move ahead afterwards. A --tag rehearsal runs the earlier admit check against the current HEAD, but the value handed between hosted jobs cannot be reproduced on this machine.",
  "Recheck release source commit before signing":
    "The same pin check as in build-macos, repeated on the signing runner against the value admit-release handed over; it cannot be reproduced on this machine.",
  "Archive unsigned app bundle":
    "It tars the unsigned bundle and its dSYM for the hand-off between two runners. On this machine the build and the signing substitute share one working tree, so there is nothing to hand over.",
  "Restore the unsigned app bundle that build-macos archived":
    "It checks the archive digest that build-macos reported and unpacks it on the signing runner. This machine never left the build's working tree.",
  "Verify release tag version":
    "A real tag name is required. Instead, the check below confirms that the package.json, tauri.conf.json, Cargo.toml and mcp/package.json versions agree with each other.",
  "Require signed release credentials":
    "All five Apple secrets must be registered on the repository for the runner to pass this gate. This machine holds no Actions secret, so checking the real values only holds in the tag workflow.",
  "Import Apple Developer ID certificate":
    "This step builds a temporary keychain from APPLE_CERTIFICATE_P12_BASE64. It cannot run without the secrets, and running it would touch this machine's keychain, so the rehearsal deliberately leaves it out.",
  "Enable Corepack pnpm":
    "This step installs pnpm on the runner. This machine already has pnpm, and whether the version matches the runner is answered by the tool probe above.",
  "Sign and notarize release artifact":
    "codesign (Developer ID) plus notarytool are required. The substitute on the build step already walked ad-hoc signing, the updater repack, DMG, checksum and install smoke; only Developer ID signing, notarization and DMG container signing are first stepped on by a real tag.",
  "Summarize macOS release assets": "It only writes a table into GITHUB_STEP_SUMMARY, so there is nothing here that can hold or fail.",
  "Cleanup Apple signing keychain": "It removes a keychain that only the signing path creates.",
};

/** What to run instead for steps whose runner command cannot be used verbatim: tag/version consistency is checkable among the four files without a tag name, and the unsigned build mostly proves the signed one. */
export const REHEARSAL_SUBSTITUTES = {
  "Verify release tag version": {
    argv: ["node", "scripts/desktop-release/release-rehearsal.mjs", "--check-versions"],
    note: "Instead of a tag name, it checks that the package.json, tauri.conf.json, Cargo.toml and mcp/package.json versions agree with each other.",
  },
  "Build release app bundle": {
    argv: ["pnpm", "desktop:release-artifact:unsigned"],
    note: "The public workflow has no unsigned fallback. Only locally does the ad-hoc signing substitute run the build and the signing chain end to end, apart from Developer ID signing and notarization.",
  },
};

/** App compile, DMG, and install smoke are slow — `--fast` stops here. */
export const REHEARSAL_SLOW_STEPS = new Set([
  "Build release app bundle",
]);

/** Extracts the `build-macos` job's `run:` steps in file order. No YAML parser: the step shape is fixed (`- name:` then `run:`), and a contract test guards the step count. */
/**
 * Timeout for a tool probe, in ms. `--list` really invokes four tools, and slow rustup shims on CI
 * can exceed the default test timeout. A slow tool is reported `unknown`, not `missing`; the env
 * override lets a test produce that state.
 */
export const PROBE_TIMEOUT_MS = Number(process.env.RELEASE_REHEARSAL_PROBE_TIMEOUT_MS) || 5_000;

/**
 * Probes one tool: `ok`, `missing`, or `unknown` (hit the timeout); "unknown" must not fold into "missing".
 * `spawn` is typed as only the four fields read here, so a test stub never invents values nothing reads.
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

export const REHEARSED_JOBS = Object.freeze(["test-release-gates", "test-macos", "build-macos", "sign-macos"]);

export function parseRehearsedSteps(workflow) {
  return REHEARSED_JOBS.flatMap((job) =>
    parseReleaseJobSteps(workflow, job).map((step) => ({ ...step, job })),
  );
}

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

export function checkVersionsAgree(root = process.cwd()) {
  const pkg = JSON.parse(fs.readFileSync(path.join(root, "package.json"), "utf8")).version;
  const tauri = JSON.parse(
    fs.readFileSync(path.join(root, "src-tauri", "tauri.conf.json"), "utf8"),
  ).version;
  const cargo = fs
    .readFileSync(path.join(root, "src-tauri", "Cargo.toml"), "utf8")
    .match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1];
  const mcp = JSON.parse(fs.readFileSync(path.join(root, "mcp", "package.json"), "utf8")).version;
  const versions = { package: pkg, tauri, cargo, mcp };
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
 * Repacking the updater archive fails closed without a minisign key, which exists only in secrets,
 * so the rehearsal mints a throwaway key to walk that step. That proves the archive is rebuilt from
 * the signed app and a signature is attached, not that it was signed with our key.
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
    console.log(`[rehearsal] package.json · tauri.conf.json · Cargo.toml · mcp/package.json all ${versions.package}`);
    return 0;
  }
  if (argv.includes("--help") || argv.includes("-h")) {
    console.log(
      [
        "Usage: pnpm desktop:release-rehearsal [--fast] [--list] [--tag=vX.Y.Z]",
        "",
        "Walks the release-macos.yml `admit-release`, `test-release-gates`, `test-macos`, `build-macos` and `sign-macos` jobs on this",
        "machine, in file order. Without --tag, admission is explicitly SKIP; after creating an",
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
  const macosSteps = parseRehearsedSteps(workflow);
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
  for (const step of macosSteps) {
    if (REHEARSAL_SKIPS[step.name] && !REHEARSAL_SUBSTITUTES[step.name]) {
      plan.push({ ...step, kind: "skip", reason: REHEARSAL_SKIPS[step.name] });
      continue;
    }
    if (step.uses) {
      plan.push({
        ...step,
        kind: "skip",
        reason: `GitHub Action(${step.uses}) — a runner-only step. Whether this tool exists on this machine is answered by the tool probe below instead.`,
      });
      continue;
    }
    const argvForStep = localCommandFor(step);
    if (!argvForStep) {
      plan.push({
        ...step,
        kind: "skip",
        reason: "A shell step that leans on runner environment variables, so it cannot be carried over to this machine verbatim.",
      });
      continue;
    }
    if (fast && (reachedSlow || REHEARSAL_SLOW_STEPS.has(step.name))) {
      reachedSlow = true;
      plan.push({ ...step, kind: "skip", argv: argvForStep, reason: "left out by --fast." });
      continue;
    }
    plan.push({
      ...step,
      kind: "run",
      argv: argvForStep,
      note: REHEARSAL_SUBSTITUTES[step.name]?.note,
    });
  }

  // Tools that may exist on the runner but not here, or the reverse: a missing tool stops the walk
  // even when the order is correct.
  const tools = [
    ["pnpm", ["--version"]],
    ["bun", ["--version"]],
    ["cargo", ["--version"]],
    ["rustc", ["--version"]],
  ];

  console.log(color(1, "[rehearsal] release-macos.yml · admit-release + test-release-gates + test-macos + build-macos + sign-macos — in order, on this machine"));
  console.log("");
  for (const [tool, args] of tools) {
    const probe = probeTool(tool, args);
    if (probe.state === "ok") {
      console.log(`${color(32, "  tool ok  ")} ${tool} — ${probe.version}`);
    } else if (probe.state === "unknown") {
      // Do not report unknown as missing: a timeout means "no answer in time", not "absent", and would
      // send the next person to install a tool that is already there.
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
