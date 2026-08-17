#!/usr/bin/env node
/**
 * 태그를 찍기 **전에** 릴리스 러너의 단계를 이 기계에서 순서대로 밟아 본다.
 *
 * ## 왜 이 스크립트가 있나
 *
 * `v1.0.0-rc.2` 는 네 번 찍혔고 네 번 다 빌드에서 멈췄다. 매번 하나 고치면
 * **바로 다음 칸**에서 멈췄다:
 *
 *   1차  Desktop readiness            게이트가 어제의 문서 문장을 요구  (#743)
 *   2차  Native vault bridge tests    externalBin 사이드카를 나중에 만듦 (#744)
 *   3차  Build bundled MCP sidecar    굽는 도구 bun 이 러너에 없음       (#745)
 *   4차  Build bundled MCP sidecar    mcp/ 의존이 러너에 없음            (#746)
 *
 * 넷 다 **로컬에서는 통과했다.** 사람 머신에는 이미 다 있기 때문이다. 그리고
 * 이 단계들은 `.github/workflows/release-macos.yml` 밖 어디에도 걸려 있지
 * 않다 — `checks.yml` 도 `deploy-pages.yml` 도 `desktop:check` /
 * `desktop:smoke` / `mcp:build-binary` / `test:desktop:bridge` 를 돌리지 않는다.
 * 그래서 이 칸들은 **태그를 찍어야만 처음 밟히고**, 한 번에 하나씩만 배우게
 * 된다. 왕복 한 번에 사람 시간이 20분씩 든다.
 *
 * 이 스크립트는 그 왕복을 태그 전으로 옮긴다.
 *
 * ## 왜 워크플로 파일을 읽나
 *
 * 단계 목록을 여기 베껴 두면 워크플로가 바뀔 때 이 파일이 조용히 낡는다 —
 * 그건 이 저장소가 이미 여러 번 당한 실패 모드다(게이트가 자기 상수를
 * 확인하는 것). 그래서 목록을 적지 않고 **워크플로의 `build-macos` 잡에서
 * 직접 읽는다.** 새 단계가 워크플로에 들어오면 다음 리허설에 저절로 따라온다.
 * 보호된 `admit-release` 와 `build-macos` 둘 다 대상이다.
 *
 * ## 못 하는 것을 스스로 말한다
 *
 * 서명·공증은 Apple 시크릿이 있어야 하고 릴리스 슬롯·초안 검증은 실제 태그가
 * 있어야 한다. 그런 단계는 조용히 건너뛰지 않고 **`SKIP` 으로 세워 두고 이유를
 * 적는다.** 초록이 "전부 확인했다" 는 뜻이 되면 이 스크립트도 게이트가 아니라
 * 위안이 된다.
 *
 *   node scripts/release-rehearsal.mjs            # 빌드까지 전부
 *   node scripts/release-rehearsal.mjs --fast     # 앱 컴파일/DMG 전 단계까지
 *   node scripts/release-rehearsal.mjs --list     # 무엇을 돌릴지만 보여준다
 *   node scripts/release-rehearsal.mjs --tag=vX.Y.Z # 기존 태그 admission도 함께
 */
import { spawnSync } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

export const RELEASE_WORKFLOW_PATH = ".github/workflows/release-macos.yml";
const FULL_SHA = /^[0-9a-f]{40}$/i;

/**
 * 시크릿·실제 태그·GitHub 상태가 있어야만 성립하는 단계.
 *
 * 키는 워크플로의 `name:` 이다. 값은 **왜 여기서 못 도는지**다 — 사람이 "그럼
 * 어디서 확인하지" 를 바로 답할 수 있어야 한다.
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
 * 러너의 명령을 그대로 못 쓰는 단계에 **대신 돌 것**을 준다.
 *
 * 건너뛰는 것과 대신 확인하는 것은 다르다. 태그 버전 정합은 태그 이름 없이도
 * 세 파일끼리 확인할 수 있고, 서명 경로의 빌드는 미서명 경로로 대부분 증명된다.
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

/** 앱 컴파일·DMG·설치 스모크는 오래 걸린다 — `--fast` 는 여기서 멈춘다. */
export const REHEARSAL_SLOW_STEPS = new Set([
  "Build signed and notarized release artifact",
]);

/**
 * `build-macos` 잡의 `run:` 단계를 **파일에 적힌 순서 그대로** 뽑는다.
 *
 * YAML 파서를 새로 들이지 않는다 — 이 워크플로의 단계 모양은 고정돼 있고
 * (`- name:` 다음 `run:`), 의존 하나를 더 지는 것보다 이 파일이 스스로
 * 설명되는 편이 낫다. 뽑히는 단계 수는 계약 테스트가 지킨다.
 */
export function parseReleaseJobSteps(workflow, jobName) {
  const jobStart = workflow.indexOf(`\n  ${jobName}:`);
  if (jobStart < 0) throw new Error(`release-macos.yml 에 ${jobName} 잡이 없다.`);
  // 다음 잡(들여쓰기 2칸의 다른 키)까지가 이 잡의 범위다.
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
    // `run: |` 블록도, 한 줄 `run:` 도 받는다.
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

/** 워크플로의 `run:` 한 줄을 이 기계에서 돌 수 있는 argv 로 옮긴다. */
export function localCommandFor(step, { arch = hostArch() } = {}) {
  const substitute = REHEARSAL_SUBSTITUTES[step.name];
  if (substitute) return substitute.argv;
  if (!step.run) return null;
  // `${GITHUB_SHA}` 같은 러너 변수가 든 줄은 여기서 성립할 수 없다.
  if (/\$\{?GITHUB_/.test(step.run)) return null;
  // `TAURI_ARCH` 는 매트릭스가 정하는 값이고, 이 기계에서는 호스트 아키텍처다.
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

/** 현재 checkout의 commit을 축약하지 않은 SHA로만 돌려준다. */
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

/** 태그가 있을 때만 admit-release의 두 실제 검사를 로컬 명령으로 만든다. */
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

/** 태그 이름 없이 확인할 수 있는 것: 세 버전이 서로 맞는가. */
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
 * 업데이터 아카이브 재포장은 minisign 키 없이는 fail-closed 다 — 서명 없는
 * 갱신 패키지는 앱이 조용히 거부하므로 그게 옳다. 그런데 **그 키는 시크릿에만
 * 있다.** 그대로 두면 리허설은 CI 가 통과할 자리에서 멈춘다.
 *
 * 그래서 리허설은 **버리는 키**를 하나 만들어 그 단계를 밟게 한다. 증명되는
 * 것은 "아카이브가 서명된 앱으로 다시 만들어지고 서명이 붙는가" 이지 "우리
 * 키로 서명됐는가" 가 아니다 — 후자는 실제 태그에서만 참이 된다.
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

  // 러너에는 있고 여기에는 없을 수 있는(그 반대도) 도구. 3·4차 실패가 정확히
  // 여기였다 — 순서를 다 맞춰도 부를 도구가 없으면 같은 자리에서 멈춘다.
  const tools = [
    ["pnpm", ["--version"]],
    ["bun", ["--version"]],
    ["cargo", ["--version"]],
    ["rustc", ["--version"]],
  ];

  console.log(color(1, "[rehearsal] release-macos.yml · admit-release + build-macos — 이 기계에서 순서대로"));
  console.log("");
  for (const [tool, args] of tools) {
    const probe = spawnSync(tool, args, { encoding: "utf8" });
    const ok = probe.status === 0;
    console.log(
      `${ok ? color(32, "  tool ok  ") : color(31, "  tool MISSING")} ${tool}${ok ? ` — ${probe.stdout.trim().split("\n")[0]}` : " — 러너에는 설치 단계가 있다. 이 기계에 없으면 아래 단계가 여기서 멈춘다."}`,
    );
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
