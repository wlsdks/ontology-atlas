#!/usr/bin/env node
/**
 * Prepares the Developer ID signing credentials and prints the commands for
 * loading them into the protected GitHub environment.
 *
 * **Why a script and not prose**: this procedure runs once every five years (the
 * Developer ID certificate lifetime), and prose written for that occasion is
 * guaranteed to be stale by the time it is needed. Only an executable form stays
 * exact.
 *
 * **What stays manual**: the App Store Connect API key/issuer and the updater key
 * material. Everything else — key pair generation, CSR, `.p12` assembly and
 * verification — is here. GitHub changes are reviewed and run by a person.
 *
 * **Why not the Keychain Access GUI.** The common instructions say to make a CSR
 * in Keychain Access, install the certificate, and export a `.p12`. That path has
 * a silent trap: **exporting from the "Certificates" category instead of "My
 * Certificates" drops the private key**, and the file is still produced
 * successfully. The failure first surfaces minutes later in CI's codesign step.
 * Here we generate and hold the private key ourselves, so that mistake is
 * **structurally impossible** — the `.p12` always contains both key and
 * certificate.
 *
 * **Secrets are never printed.** The `.p12` export password is generated here and
 * **nobody sees it** — not a person, not the log, not a model. Its only job is to
 * wrap the file on its way to GitHub, and the receiving side (CI) gets the same
 * value as a secret. Showing a person a value they have no reason to remember
 * only adds a leak path.
 */

import { spawnSync, execFileSync } from "node:child_process";
import { randomBytes } from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** Outside the repository. The private key never enters the working tree. */
export const DEFAULT_DIR = path.join(os.homedir(), ".ontology-atlas-signing");

export const REPO = "wlsdks/ontology-atlas";
export const SIGNING_ENVIRONMENT = "release-signing";

/** Created and discarded inside CI on each run. A local/CI value, not a GitHub secret. */
export const LOCAL_ONLY_VALUES = ["APPLE_KEYCHAIN_PASSWORD", "APPLE_SIGNING_IDENTITY"];

/**
 * The 7 that `release-macos.yml` actually reads from the protected environment.
 * Only the 5 Apple values and 2 Tauri updater values are hosted secrets;
 * local-only values never appear here.
 */
export const ENVIRONMENT_SECRETS = [
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
];
export const REPOSITORY_SECRETS = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];
export const OBSOLETE_REPOSITORY_SECRETS = [
  "APPLE_ID",
  "APPLE_APP_SPECIFIC_PASSWORD",
  "APPLE_TEAM_ID",
];
export const REQUIRED_SECRETS = [...ENVIRONMENT_SECRETS, ...REPOSITORY_SECRETS];

/** Apple/Tauri credentials the helper does not generate are entered by a person. */
export const OWNER_ENTERED_SECRETS = [
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];

export function parseArgs(argv) {
  const command = argv.find((arg) => !arg.startsWith("-")) ?? "help";
  const flag = (name) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length).trim() : undefined;
  };
  return {
    command,
    dir: flag("dir") ?? DEFAULT_DIR,
    cer: flag("cer"),
    name: flag("name"),
    email: flag("email"),
    repo: flag("repo") ?? REPO,
  };
}

function fail(message) {
  console.error(`[apple-signing] ${message}`);
  process.exit(1);
}

export function setupSecretCommand(name, repo, inputPath = `/path/to/${name}`) {
  const scope = ENVIRONMENT_SECRETS.includes(name)
    ? ` --env ${SIGNING_ENVIRONMENT}`
    : "";
  return `gh secret set ${name}${scope} --repo ${repo} < ${inputPath}`;
}

function repositoryCleanupCommand(name, repo) {
  // Deliberately no --env: this removes the same-name repository copy, not the
  // protected environment value.
  return `gh secret delete ${name} --repo ${repo}`;
}

function printEnvironmentPolicy(repo, inputPaths = {}) {
  console.log(`
[apple-signing] GitHub was not changed. Review and run the commands below yourself.
[apple-signing] Store the three App Store Connect API values in ${SIGNING_ENVIRONMENT}.
[apple-signing] Retain the Developer ID certificate pair and Tauri updater pair at repository scope.
[apple-signing] Configure ${SIGNING_ENVIRONMENT} to admit main only, use no signing-stage reviewer, and keep admin bypass disabled.
[apple-signing] Keep the human install approval on the separate release publication environment.
[apple-signing] Remove repository copies of the API credentials before release. Keep obsolete Apple ID/password/team values only through the first API-key proof release, then delete them.

[apple-signing] Set protected environment secrets:
${ENVIRONMENT_SECRETS.map((name) => `  ${setupSecretCommand(name, repo, inputPaths[name])}`).join("\n")}

[apple-signing] Set retained repository secrets:
${REPOSITORY_SECRETS.map((name) => `  ${setupSecretCommand(name, repo, inputPaths[name])}`).join("\n")}

[apple-signing] Cleanup commands (API copies now; obsolete Apple values only after the proof release passes):
${[...ENVIRONMENT_SECRETS, ...OBSOLETE_REPOSITORY_SECRETS].map((name) => `  ${repositoryCleanupCommand(name, repo)}`).join("\n")}`);
}

function run(command, args, options = {}) {
  const result = spawnSync(command, args, { encoding: "utf8", ...options });
  if (result.status !== 0) {
    fail(
      [
        `${command} ${args.join(" ")} failed with exit ${result.status}`,
        result.stderr?.trim(),
      ]
        .filter(Boolean)
        .join("\n"),
    );
  }
  return result;
}

function printHelp() {
  console.log(`Usage: node scripts/apple-signing-setup.mjs <command>

  csr      개인키 + CSR 을 만든다. 그다음 Apple 에 업로드하는 것은 사람 몫.
             --name="법적 실명"  --email="Apple 계정 이메일"
  bundle   Apple 이 준 .cer 을 개인키와 합쳐 local secret files와 .p12 를 만든다.
             --cer=~/Downloads/developerID_application.cer
  verify   ${SIGNING_ENVIRONMENT}의 7개 secret과 repository-scope 복사본을 읽는다.

공통: --dir=<경로> (기본 ${DEFAULT_DIR}) · --repo=<owner/name>

이 스크립트는 비밀 값을 화면에 찍거나 GitHub를 변경하지 않는다.
${SIGNING_ENVIRONMENT}은 main 전용이고 admin bypass 없이 승인되어야 한다.
APPLE_KEYCHAIN_PASSWORD와 APPLE_SIGNING_IDENTITY는 CI/local keychain에서만
생성·유도되는 값이므로 GitHub secret으로 등록하지 않는다.`);
}

/** Step 1 — key pair and CSR. Needs no credentials, so it is fully automatic. */
export function commandCsr({ dir, name, email }) {
  if (!name || !email) {
    fail(
      'csr 에는 --name 과 --email 이 필요하다.\n' +
        '  --name 은 Apple 계정의 **법적 실명**이어야 한다 (별명이면 심사가 지연된다).\n' +
        '  예: node scripts/apple-signing-setup.mjs csr --name="Hong Gildong" --email="me@example.com"',
    );
  }

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dir, "developer-id.key");
  const csrPath = path.join(dir, "developer-id.certSigningRequest");

  if (fs.existsSync(keyPath)) {
    fail(
      `개인키가 이미 있다: ${keyPath}\n` +
        "덮어쓰면 그 키로 발급받은 인증서가 전부 쓸모없어진다. 다시 만들려면 먼저 옮겨 두라.",
    );
  }

  // Apple requires 2048-bit RSA.
  //
  // **Do not use `-nodes`** (leave unencrypted). This private key will eventually
  // be backed up off this disk — losing it makes the certificate useless, so a
  // backup is unavoidable. An unencrypted private key file means **whoever obtains
  // the file holds the signing authority**: they can sign apps under the owner's
  // real name.
  //
  // So openssl asks for the passphrase itself. **Only the person knows it** — if
  // the script chose it, the person would not, and the backup would be unusable.
  // That is why only this call uses `stdio: inherit`.
  console.log("[apple-signing] 개인키를 보호할 비밀번호를 입력하라 (화면에 표시되지 않는다).");
  run("openssl", ["req", "-new", "-newkey", "rsa:2048",
    "-keyout", keyPath,
    "-out", csrPath,
    "-subj", `/emailAddress=${email}/CN=${name}/C=KR`,
  ], { stdio: "inherit" });

  fs.chmodSync(keyPath, 0o600);

  console.log(`[apple-signing] 개인키: ${keyPath} (0600)`);
  console.log(`[apple-signing] CSR:   ${csrPath}`);
  console.log(`
[apple-signing] 여기서부터 사람 차례다 — Apple 로그인이 필요하다.

  1. https://developer.apple.com/account/resources/certificates/add
  2. 종류: **Developer ID Application** (앱스토어용이 아니다)
  3. 위 CSR 파일을 업로드하고 .cer 을 내려받는다
  4. 돌아와서:  node scripts/apple-signing-setup.mjs bundle --cer=<내려받은 .cer 경로>

[apple-signing] 개인키를 잃어버리면 그 인증서는 못 쓴다. 이 폴더를 지우지 마라.`);
}

/** Step 2 — .cer + key → .p12 + local secret files. Changes nothing on GitHub. */
export function commandBundle({ dir, cer, repo }) {
  if (!cer) fail("bundle 에는 --cer=<Apple 이 준 .cer 경로> 가 필요하다.");

  const cerPath = cer.replace(/^~/, os.homedir());
  const keyPath = path.join(dir, "developer-id.key");
  if (!fs.existsSync(cerPath)) fail(`.cer 을 찾을 수 없다: ${cerPath}`);
  if (!fs.existsSync(keyPath)) fail(`개인키가 없다: ${keyPath} — 먼저 csr 명령을 실행하라.`);

  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "apple-signing-"));
  const pemPath = path.join(tempDir, "cert.pem");
  const p12Path = path.join(tempDir, "developer-id.p12");

  try {
    // Apple hands back a DER .cer; openssl pkcs12 wants PEM.
    run("openssl", ["x509", "-inform", "DER", "-in", cerPath, "-out", pemPath]);

    // This password is born here and used only by GitHub. Nobody sees it.
    const password = randomBytes(24).toString("base64");

    // The private key is encrypted, so openssl prompts for its passphrase — the
    // prompt has to reach the person, hence `stdio: inherit`. The password wrapping
    // the `.p12` (`-passout`) is the random value we generated, so it is passed via
    // a file. The two passwords are different, and confusing them makes diagnosis
    // hard.
    const passOutPath = path.join(tempDir, "p12-pass");
    fs.writeFileSync(passOutPath, password, { mode: 0o600 });
    console.log("[apple-signing] 개인키 비밀번호를 입력하라 (csr 단계에서 정한 것).");
    run("openssl", ["pkcs12", "-export",
      "-inkey", keyPath,
      "-in", pemPath,
      "-out", p12Path,
      "-passout", `file:${passOutPath}`,
    ], { stdio: "inherit" });

    const p12Base64 = fs.readFileSync(p12Path).toString("base64");

    const certificateSecretPath = path.join(dir, "APPLE_CERTIFICATE_P12_BASE64");
    const certificatePasswordPath = path.join(dir, "APPLE_CERTIFICATE_PASSWORD");
    fs.writeFileSync(certificateSecretPath, p12Base64, { mode: 0o600 });
    fs.writeFileSync(certificatePasswordPath, password, { mode: 0o600 });
    fs.chmodSync(certificateSecretPath, 0o600);
    fs.chmodSync(certificatePasswordPath, 0o600);

    console.log(`[apple-signing] generated protected inputs were written outside the repository:
  ${certificateSecretPath}
  ${certificatePasswordPath}`);
    printEnvironmentPolicy(repo, {
      APPLE_CERTIFICATE_P12_BASE64: certificateSecretPath,
      APPLE_CERTIFICATE_PASSWORD: certificatePasswordPath,
    });
    console.log("\n[apple-signing] Then run: node scripts/apple-signing-setup.mjs verify");
  } finally {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
}

/** Only which names are registered — GitHub never returns the values either. */
export function listedSecretNames(listOutput) {
  return new Set(
    listOutput
      .split("\n")
      .map((line) => line.trim().split(/\s+/)[0])
      .filter(Boolean),
  );
}

export function missingSecrets(listOutput, requiredNames = ENVIRONMENT_SECRETS) {
  const present = listedSecretNames(listOutput);
  return requiredNames.filter((name) => !present.has(name));
}

export function repositoryScopedSecrets(listOutput) {
  const present = listedSecretNames(listOutput);
  return [...ENVIRONMENT_SECRETS, ...OBSOLETE_REPOSITORY_SECRETS].filter((name) => present.has(name));
}

export function commandVerify({ repo, dir = DEFAULT_DIR }) {
  const environmentListed = execFileSync(
    "gh",
    ["secret", "list", "--env", SIGNING_ENVIRONMENT, "--repo", repo],
    { encoding: "utf8" },
  );
  const repositoryListed = execFileSync("gh", ["secret", "list", "--repo", repo], { encoding: "utf8" });
  const missingEnvironment = missingSecrets(environmentListed, ENVIRONMENT_SECRETS);
  const missingRepository = missingSecrets(repositoryListed, REPOSITORY_SECRETS);
  const repositoryCopies = repositoryScopedSecrets(repositoryListed);

  if (missingEnvironment.length === 0 && missingRepository.length === 0 && repositoryCopies.length === 0) {
    console.log(`[apple-signing] split-scope signing secret ${REQUIRED_SECRETS.length}개가 모두 등록됐다 ✓`);
    console.log("[apple-signing] 다음 태그부터 워크플로가 서명 경로로 간다 — 코드 수정은 필요 없다.");
    console.log("[apple-signing] 확인: pnpm desktop:release-github -- --tag=<다음 태그>");
    return;
  }

  if (missingEnvironment.length > 0) {
    console.error(`[apple-signing] ${SIGNING_ENVIRONMENT}에 아직 없는 API secret ${missingEnvironment.length}개:`);
    for (const name of missingEnvironment) {
      const who = OWNER_ENTERED_SECRETS.includes(name) ? "사람이 넣는다" : "bundle 명령이 만든 local file을 사용한다";
      console.error(`[apple-signing]   ${name} (${who})`);
    }
    const localInputNames = new Set([
      "APPLE_CERTIFICATE_P12_BASE64",
      "APPLE_CERTIFICATE_PASSWORD",
    ]);
    const inputPath = (name) => (localInputNames.has(name) ? path.join(dir, name) : undefined);
    console.error(
      `[apple-signing] protected setup commands:\n${missingEnvironment
        .map((name) => `  ${setupSecretCommand(name, repo, inputPath(name))}`)
        .join("\n")}`,
    );
  }
  if (missingRepository.length > 0) {
    console.error(`[apple-signing] repository scope에 아직 없는 signing secret ${missingRepository.length}개:`);
    console.error(
      missingRepository.map((name) => `  ${setupSecretCommand(name, repo, path.join(dir, name))}`).join("\n"),
    );
  }
  if (repositoryCopies.length > 0) {
    console.error(`[apple-signing] repository-scope signing copies must be removed (this helper does not mutate GitHub):`);
    console.error(repositoryCopies.map((name) => `  ${repositoryCleanupCommand(name, repo)}`).join("\n"));
  }
  process.exit(1);
}

async function main() {
  const options = parseArgs(process.argv.slice(2));
  if (process.platform !== "darwin") fail("이 절차는 macOS 에서 실행한다.");

  switch (options.command) {
    case "csr":
      return commandCsr(options);
    case "bundle":
      return commandBundle(options);
    case "verify":
      return commandVerify(options);
    default:
      printHelp();
      process.exit(options.command === "help" ? 0 : 1);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  await main();
}
