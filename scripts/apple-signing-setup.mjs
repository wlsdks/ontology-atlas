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

  csr      Creates the private key + CSR. Uploading it to Apple afterwards is a person's job.
             --name="legal full name"  --email="Apple account email"
  bundle   Combines the .cer Apple issued with the private key into local secret files and a .p12.
             --cer=~/Downloads/developerID_application.cer
  verify   Reads the 7 secrets in ${SIGNING_ENVIRONMENT} and their repository-scope copies.

Common: --dir=<path> (default ${DEFAULT_DIR}) · --repo=<owner/name>

This script never prints a secret value and never changes anything on GitHub.
${SIGNING_ENVIRONMENT} is main-only and must be approved without an admin bypass.
APPLE_KEYCHAIN_PASSWORD and APPLE_SIGNING_IDENTITY are created or derived only inside
the CI/local keychain, so they are never registered as GitHub secrets.`);
}

/** Step 1 — key pair and CSR. Needs no credentials, so it is fully automatic. */
export function commandCsr({ dir, name, email }) {
  if (!name || !email) {
    fail(
      'csr needs --name and --email.\n' +
        '  --name must be the **legal full name** on the Apple account (a nickname delays review).\n' +
        '  example: node scripts/apple-signing-setup.mjs csr --name="Hong Gildong" --email="me@example.com"',
    );
  }

  fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
  const keyPath = path.join(dir, "developer-id.key");
  const csrPath = path.join(dir, "developer-id.certSigningRequest");

  if (fs.existsSync(keyPath)) {
    fail(
      `A private key already exists: ${keyPath}\n` +
        "Overwriting it makes every certificate issued for that key useless. Move it aside first if you must recreate it.",
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
  console.log("[apple-signing] Enter a password to protect the private key (it is not shown on screen).");
  run("openssl", ["req", "-new", "-newkey", "rsa:2048",
    "-keyout", keyPath,
    "-out", csrPath,
    "-subj", `/emailAddress=${email}/CN=${name}/C=KR`,
  ], { stdio: "inherit" });

  fs.chmodSync(keyPath, 0o600);

  console.log(`[apple-signing] private key: ${keyPath} (0600)`);
  console.log(`[apple-signing] CSR:   ${csrPath}`);
  console.log(`
[apple-signing] From here it is a person's turn — an Apple login is required.

  1. https://developer.apple.com/account/resources/certificates/add
  2. Type: **Developer ID Application** (not the App Store one)
  3. Upload the CSR file above and download the .cer
  4. Come back and run:  node scripts/apple-signing-setup.mjs bundle --cer=<path to the downloaded .cer>

[apple-signing] Lose the private key and that certificate is unusable. Do not delete this folder.`);
}

/** Step 2 — .cer + key → .p12 + local secret files. Changes nothing on GitHub. */
export function commandBundle({ dir, cer, repo }) {
  if (!cer) fail("bundle needs --cer=<path to the .cer Apple issued>.");

  const cerPath = cer.replace(/^~/, os.homedir());
  const keyPath = path.join(dir, "developer-id.key");
  if (!fs.existsSync(cerPath)) fail(`Cannot find the .cer: ${cerPath}`);
  if (!fs.existsSync(keyPath)) fail(`No private key: ${keyPath} — run the csr command first.`);

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
    console.log("[apple-signing] Enter the private key password (the one you chose in the csr step).");
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
    console.log(`[apple-signing] all ${REQUIRED_SECRETS.length} split-scope signing secrets are registered ✓`);
    console.log("[apple-signing] from the next tag the workflow takes the signing path — no code change is needed.");
    console.log("[apple-signing] check with: pnpm desktop:release-github -- --tag=<next tag>");
    return;
  }

  if (missingEnvironment.length > 0) {
    console.error(`[apple-signing] ${missingEnvironment.length} API secrets still missing from ${SIGNING_ENVIRONMENT}:`);
    for (const name of missingEnvironment) {
      const who = OWNER_ENTERED_SECRETS.includes(name) ? "a person enters it" : "uses the local file the bundle command created";
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
    console.error(`[apple-signing] ${missingRepository.length} signing secrets still missing from repository scope:`);
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
  if (process.platform !== "darwin") fail("Run this procedure on macOS.");

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
