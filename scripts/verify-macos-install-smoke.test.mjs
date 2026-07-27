import assert from "node:assert/strict";
import test from "node:test";
import { execFileSync, spawnSync } from "node:child_process";
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import {
  buildInstalledAppVerifyArgs,
  parseVerifyInstallArgs,
  verifyBundleSignature,
} from "./verify-macos-install-smoke.mjs";

test("verify install args use named DMG and hold duration", () => {
  assert.deepEqual(
    parseVerifyInstallArgs(["/tmp/Ontology_Atlas_0.1.0_aarch64.dmg", "--hold-ms=8000"], {
      defaultDmgPath: "/tmp/default.dmg",
    }),
    {
      dmgPath: "/tmp/Ontology_Atlas_0.1.0_aarch64.dmg",
      holdMs: 8000,
    },
  );
});

test("verify install args fall back to generated release DMG path", () => {
  assert.deepEqual(parseVerifyInstallArgs([], { defaultDmgPath: "/tmp/default.dmg" }), {
    dmgPath: "/tmp/default.dmg",
    holdMs: 5000,
  });
});

test("installed app verification reuses the LaunchServices app content gate", () => {
  assert.deepEqual(
    buildInstalledAppVerifyArgs("/tmp/install/Ontology Atlas.app", 9000),
    [
      "scripts/verify-macos-app-launch.mjs",
      "/tmp/install/Ontology Atlas.app",
      "--hold-ms=9000",
      "--kill-existing",
      "--open-app",
      "--require-window",
      "--require-owner-name=Ontology Atlas",
      "--min-window-size=1040x720",
      "--require-accessibility-text=Ontology Atlas",
    ],
  );
});

/**
 * v1.0.0 draft 가 설치 검증을 통과하고도 사용자에게 "손상되었습니다" 로 보였던
 * 회귀의 게이트.
 *
 * 검증이 앱을 **실행**은 했지만 복사본에 quarantine 이 없어 Gatekeeper 평가가
 * 아예 일어나지 않았다. 서명 구조가 깨진 번들도 조용히 실행됐다. 이 두 케이스는
 * 실제 `codesign` 을 부르므로 macOS 에서만 의미가 있다.
 */
const darwin = process.platform === "darwin";

function makeBundle(dir, { sign }) {
  const app = join(dir, "Probe.app");
  mkdirSync(join(app, "Contents", "MacOS"), { recursive: true });
  writeFileSync(join(app, "Contents", "Info.plist"), `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0"><dict>
<key>CFBundleExecutable</key><string>probe</string>
<key>CFBundleIdentifier</key><string>dev.jinan.probe</string>
</dict></plist>
`);
  // 실제 Mach-O 가 있어야 codesign 이 번들로 취급한다.
  execFileSync("cp", ["/bin/echo", join(app, "Contents", "MacOS", "probe")]);
  if (sign) execFileSync("codesign", ["--force", "--deep", "--sign", "-", app]);
  return app;
}

test("bundle signature gate accepts an ad-hoc signed bundle", { skip: !darwin }, () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-sig-ok-"));
  try {
    assert.doesNotThrow(() => verifyBundleSignature(makeBundle(dir, { sign: true }), { label: "Probe.app" }));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("bundle signature gate rejects a bundle whose signature is structurally broken", { skip: !darwin }, () => {
  const dir = mkdtempSync(join(tmpdir(), "oa-sig-bad-"));
  try {
    const app = makeBundle(dir, { sign: true });
    // Tauri 가 낸 번들의 실제 형태를 재현한다: 바이너리는 서명돼 있는데
    // 번들의 _CodeSignature 가 없다.
    rmSync(join(app, "Contents", "_CodeSignature"), { recursive: true, force: true });
    // 사전 조건 확인 — 이 상태가 정말 codesign 에게 거절당하는지 먼저 본다.
    const probe = spawnSync("codesign", ["--verify", "--deep", "--strict", app], { encoding: "utf8" });
    assert.notEqual(probe.status, 0, "fixture is supposed to be a broken bundle");

    assert.throws(
      () => verifyBundleSignature(app, { label: "Probe.app" }),
      /codesign --verify rejected Probe\.app/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
