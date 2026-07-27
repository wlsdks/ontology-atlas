import assert from "node:assert/strict";
import test from "node:test";
import { readFileSync } from "node:fs";
import {
  DEFAULT_DIR,
  OWNER_ENTERED_SECRETS,
  REQUIRED_SECRETS,
  missingSecrets,
  parseArgs,
} from "./apple-signing-setup.mjs";

test("required secret list mirrors the release secret gate", () => {
  // 이 목록이 `check-macos-release-secrets.mjs` 와 어긋나면, 셋업이 "다 끝났다"
  // 고 말한 뒤 태그 워크플로가 secret 이 없다며 실패한다 — 사람이 두 번
  // 헤매는 실패다. 진실원은 게이트 쪽이고 여기는 거울이다.
  const gate = readFileSync("scripts/check-macos-release-secrets.mjs", "utf8");
  // 숫자를 포함한다 — APPLE_CERTIFICATE_P12_BASE64.
  const gateNames = [...gate.matchAll(/name:\s*"(APPLE_[A-Z0-9_]+)"/g)].map((m) => m[1]);
  assert.equal(gateNames.length, 5, "게이트에서 secret 이름을 못 읽었다면 이 거울은 아무것도 지키지 못한다");
  assert.deepEqual([...REQUIRED_SECRETS].sort(), [...new Set(gateNames)].sort());
});

test("owner-entered secrets are the credential ones", () => {
  // 나머지 셋은 스크립트가 넣는다. 자격증명 둘은 사람 몫으로 남는 것이 계약이다.
  for (const name of OWNER_ENTERED_SECRETS) {
    assert.ok(REQUIRED_SECRETS.includes(name), `${name} is not in the required set`);
  }
  assert.deepEqual(OWNER_ENTERED_SECRETS, ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD"]);
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
    ["APPLE_ID", "APPLE_APP_SPECIFIC_PASSWORD", "APPLE_TEAM_ID"],
  );

  assert.deepEqual(missingSecrets(""), REQUIRED_SECRETS);
});
