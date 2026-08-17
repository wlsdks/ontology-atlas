import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_DIR,
  ENVIRONMENT_SECRETS,
  LOCAL_ONLY_VALUES,
  OBSOLETE_REPOSITORY_SECRETS,
  OWNER_ENTERED_SECRETS,
  REPOSITORY_SECRETS,
  REQUIRED_SECRETS,
  missingSecrets,
  parseArgs,
  repositoryScopedSecrets,
  setupSecretCommand,
} from "./apple-signing-setup.mjs";

test("required secret list mirrors the hosted workflow's seven names", () => {
  const workflow = readFileSync(".github/workflows/release-macos.yml", "utf8");
  const workflowNames = [...workflow.matchAll(/secrets\.([A-Z0-9_]+)/g)].map((match) => match[1]);
  const uniqueNames = [...new Set(workflowNames)];

  assert.equal(uniqueNames.length, 7, "the workflow must expose exactly five Apple and two updater secrets");
  assert.deepEqual([...REQUIRED_SECRETS].sort(), uniqueNames.sort());
});

test("owner-entered secrets are the credential ones", () => {
  // 인증서 번들만 local helper가 만들고, Apple/Tauri 자격증명은 사람이 protected env에 넣는다.
  for (const name of OWNER_ENTERED_SECRETS) {
    assert.ok(REQUIRED_SECRETS.includes(name), `${name} is not in the required set`);
  }
  assert.deepEqual(OWNER_ENTERED_SECRETS, [
    "APPLE_API_KEY_P8_BASE64",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER_ID",
    "TAURI_SIGNING_PRIVATE_KEY",
    "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
  ]);
});

test("setup commands keep API credentials in release-signing and retained identities at repository scope", () => {
  const commands = REQUIRED_SECRETS.map((name) => setupSecretCommand(name, "me/fork"));

  assert.equal(commands.length, 7);
  for (const command of ENVIRONMENT_SECRETS.map((name) => setupSecretCommand(name, "me/fork"))) {
    assert.match(command, /gh secret set [A-Z0-9_]+ --env release-signing --repo me\/fork/);
  }
  for (const command of REPOSITORY_SECRETS.map((name) => setupSecretCommand(name, "me/fork"))) {
    assert.match(command, /gh secret set [A-Z0-9_]+ --repo me\/fork/);
    assert.doesNotMatch(command, /--env/);
  }
  for (const command of commands) {
    for (const localOnly of LOCAL_ONLY_VALUES) {
      assert.doesNotMatch(command, new RegExp(localOnly));
    }
  }
});

test("helper does not mutate GitHub while generating setup instructions", () => {
  const source = readFileSync("scripts/apple-signing-setup.mjs", "utf8");
  assert.doesNotMatch(source, /spawnSync\(\s*["']gh["'][\s\S]*?secret["']\s*,\s*["']set/);
  assert.doesNotMatch(source, /execFileSync\(\s*["']gh["'][\s\S]*?secret["']\s*,\s*["']set/);
  for (const localOnly of LOCAL_ONLY_VALUES) {
    assert.ok(!REQUIRED_SECRETS.includes(localOnly), `${localOnly} must remain local`);
  }
});

test("private key default location is outside the working tree", () => {
  // 개인키가 작업 트리에 들어가면 커밋될 수 있다. 홈 디렉토리 밖으로 나갈
  // 이유가 없고, 저장소 안으로 들어올 이유는 더 없다.
  assert.ok(DEFAULT_DIR.startsWith("/"), "must be absolute");
  assert.ok(!DEFAULT_DIR.includes("oh-my-ontology"), "must not sit in the repo");
  assert.match(DEFAULT_DIR, /\.ontology-atlas-signing$/);
});

test("args parse command, paths, and repo override", () => {
  assert.deepEqual(parseArgs(["csr", '--name=Hong Gildong', "--email=me@example.com"]), {
    command: "csr",
    dir: DEFAULT_DIR,
    cer: undefined,
    name: "Hong Gildong",
    email: "me@example.com",
    repo: "wlsdks/ontology-atlas",
  });

  const bundle = parseArgs(["bundle", "--cer=/tmp/x.cer", "--dir=/tmp/keys", "--repo=me/fork"]);
  assert.equal(bundle.command, "bundle");
  assert.equal(bundle.cer, "/tmp/x.cer");
  assert.equal(bundle.dir, "/tmp/keys");
  assert.equal(bundle.repo, "me/fork");
});

test("no command falls back to help rather than acting", () => {
  assert.equal(parseArgs([]).command, "help");
  assert.equal(parseArgs(["--dir=/tmp"]).command, "help");
});

test("verify reports exactly what is still missing", () => {
  const header = "NAME                          UPDATED\n";
  assert.deepEqual(missingSecrets(header + REQUIRED_SECRETS.join("  2026-07-27\n")), []);

  assert.deepEqual(
    missingSecrets(`${header}APPLE_CERTIFICATE_P12_BASE64  2026-07-27\nAPPLE_CERTIFICATE_PASSWORD  2026-07-27\n`),
    ENVIRONMENT_SECRETS,
  );

  assert.deepEqual(missingSecrets(""), ENVIRONMENT_SECRETS);
  assert.deepEqual(missingSecrets("", REPOSITORY_SECRETS), REPOSITORY_SECRETS);
});

test("repository copies are reported without treating them as environment secrets", () => {
  const header = "NAME                          UPDATED\n";
  assert.deepEqual(
    repositoryScopedSecrets(
      `${header}APPLE_API_KEY_ID  2026-07-27\nAPPLE_ID  2026-07-27\nTAURI_SIGNING_PRIVATE_KEY  2026-07-27\nUNRELATED  2026-07-27\n`,
    ),
    ["APPLE_API_KEY_ID", "APPLE_ID"],
  );
  assert.ok(OBSOLETE_REPOSITORY_SECRETS.includes("APPLE_ID"));
});
