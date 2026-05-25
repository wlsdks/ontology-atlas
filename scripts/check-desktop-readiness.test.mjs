import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

test("desktop readiness check proves Tauri macOS shell prerequisites", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-desktop-readiness.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /macOS desktop Tauri-shell readiness/);
  assert.match(result.stdout, /✓ Next\.js uses static export output/);
  assert.match(result.stdout, /✓ Next\.js image optimization is disabled/);
  assert.match(result.stdout, /✓ Next\.js emits trailing-slash routes/);
  assert.match(result.stdout, /✓ build script refreshes docs-vault before next build/);
  assert.match(
    result.stdout,
    /✓ desktop package, Tauri, and Rust crate versions stay aligned for release tags/,
  );
  assert.match(result.stdout, /✓ CLI\/MCP setup gate is available/);
  assert.match(result.stdout, /✓ desktop runtime doctor is available/);
  assert.match(result.stdout, /✓ desktop packaged-route smoke is available/);
  assert.match(result.stdout, /✓ desktop app launch verifier is available after \.app builds/);
  assert.match(
    result.stdout,
    /✓ desktop app launch smokes run from the installed app executable directory/,
  );
  assert.match(
    result.stdout,
    /✓ desktop native vault bridge tests cover WebView handle shim, agent config validation, and Rust path guard/,
  );
  assert.match(
    result.stdout,
    /✓ desktop checker tests cover the GitHub release operator and completion gates/,
  );
  assert.match(
    result.stdout,
    /✓ desktop native vault bridge rejects symlink escapes without outside-vault side effects/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri capability grants only core defaults to the main local workbench window/,
  );
  assert.match(result.stdout, /✓ desktop DMG verifier is available after packaging/);
  assert.match(
    result.stdout,
    /✓ desktop install verifier copies the DMG app and launch-smokes the installed copy/,
  );
  assert.match(result.stdout, /✓ desktop release DMG verifier requires signing and notarization/);
  assert.match(
    result.stdout,
    /✓ desktop release DMG verifier runs Gatekeeper assessment for the app and DMG/,
  );
  assert.match(
    result.stdout,
    /✓ desktop public download verifier is available after release publishing/,
  );
  assert.match(
    result.stdout,
    /✓ desktop download verifier rejects stale DMG versions, unsupported DMG names, and checksum mismatches, including tagged draft pre-publish assets/,
  );
  assert.match(
    result.stdout,
    /✓ desktop local release preflight runs readiness, tests, runtime doctor, MCP handoff, build, route smoke, DMG, and install smoke/,
  );
  assert.match(
    result.stdout,
    /✓ hosted download CTAs separate the GitHub Releases download path from the source-code link without a broken latest-release dependency/,
  );
  assert.match(
    result.stdout,
    /✓ hosted landing secondary CTA points to the app installation guide, not the web workbench/,
  );
  assert.match(
    result.stdout,
    /✓ hosted pages do not route users into the browser workbench, and \/docs local vault work is desktop-only/,
  );
  assert.match(
    result.stdout,
    /✓ local vault picker and shortcut copy describe the installed app path, not browser File System Access/,
  );
  assert.match(
    result.stdout,
    /✓ root README presents the hosted site as promo\/download and the macOS app as the local workbench/,
  );
  assert.match(
    result.stdout,
    /✓ product and architecture docs frame the installed app as the writable local workbench/,
  );
  assert.match(
    result.stdout,
    /✓ workflow, troubleshooting, publish, and launch docs route writable vault work through the desktop app/,
  );
  assert.match(
    result.stdout,
    /✓ dogfood ontology docs mirror the desktop-app and hosted-download split/,
  );
  assert.match(
    result.stdout,
    /✓ static ontology and topology empty states route hosted users to the app download while preserving desktop vault picking/,
  );
  assert.match(
    result.stdout,
    /✓ hosted download page names first-release gates and can hide the checklist after verified DMGs publish/,
  );
  assert.match(
    result.stdout,
    /✓ mobile bottom navigation is hidden on public marketing and download surfaces/,
  );
  assert.match(
    result.stdout,
    /✓ pull request CI uses Node 24-compatible checkout, pnpm, and setup-node actions/,
  );
  assert.match(
    result.stdout,
    /✓ macOS release workflow uses Node 24-compatible GitHub action majors/,
  );
  assert.match(
    result.stdout,
    /✓ tag release workflow builds Apple Silicon and Intel DMGs on Node 24, requires a clean release slot, verifies draft assets, then publishes and re-verifies public stable assets/,
  );
  assert.match(result.stdout, /✓ desktop release secret gate blocks unsigned public releases/);
  assert.match(
    result.stdout,
    /✓ desktop release docs include gh secret set commands for every required Apple secret/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release slot gate blocks stale same-tag GitHub Release assets before upload/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release tag gate fails before signing when the v-prefixed tag differs from app versions/,
  );
  assert.match(
    result.stdout,
    /✓ desktop GitHub release readiness gate checks workflow, Apple secret names, and release slot before tag push/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release status gate audits PR readiness, Apple secrets, public release state, and download assets/,
  );
  assert.match(result.stdout, /✓ desktop signing script is available for release builds/);
  assert.match(result.stdout, /✓ desktop notarization script is available for release builds/);
  assert.match(result.stdout, /✓ Tauri CLI alias is available through pnpm tauri/);
  assert.match(result.stdout, /✓ desktop dev script launches the Tauri shell/);
  assert.match(result.stdout, /✓ desktop app-only build script is available before release signing/);
  assert.match(result.stdout, /✓ desktop build script targets macOS \.app and \.dmg artifacts/);
  assert.match(result.stdout, /✓ Tauri CLI dependency is installed/);
  assert.match(result.stdout, /✓ Tauri JavaScript API dependency is installed/);
  assert.match(
    result.stdout,
    /✓ desktop quality bar names native launch, vault permissions, recent vaults, local data, agent setup, offline routes, and local ontology handoff/,
  );
  assert.match(
    result.stdout,
    /✓ desktop prototype smoke names download, docs, ontology, topology, and builder routes/,
  );
  assert.match(result.stdout, /✓ Tauri scaffold exists/);
  assert.match(result.stdout, /✓ Tauri loads the Next\.js static export from out\//);
  assert.match(result.stdout, /✓ Tauri bundle target includes macOS \.app/);
  assert.match(
    result.stdout,
    /✓ macOS Info\.plist explains selected vault-folder access for protected locations/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri CSP is enabled for local app assets, images, styles, and IPC only/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri native vault commands and browser handle shim are wired, including file and directory removal/,
  );
  assert.match(result.stdout, /✓ Tauri vault bridge uses the supported JavaScript invoke API/);
  assert.match(
    result.stdout,
    /✓ desktop root entry routes first launch and stale restored vaults into the local picker flow without rendering marketing/,
  );
  assert.match(
    result.stdout,
    /✓ desktop docs intent opens the native vault picker once/,
  );
  assert.match(
    result.stdout,
    /✓ desktop empty-vault workspace surfaces the ontology starter in the main pane and opens README after creation/,
  );
  assert.match(
    result.stdout,
    /✓ desktop local vault tools expose, copy, and reveal the selected absolute vault path/,
  );
  assert.match(
    result.stdout,
    /✓ desktop local vault picker exposes recent vault recall, stale-path cleanup, and vault-local agent config validation/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri Rust entrypoint, default capability files, app icons, and release packagers exist/,
  );
  assert.match(
    result.stdout,
    /ready: Tauri scaffold can wrap the static frontend for a macOS prototype/,
  );
});

test("desktop release helper scripts expose credential-aware help", () => {
  const sign = spawnSync(process.execPath, ["scripts/sign-macos-app.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const notarize = spawnSync(process.execPath, ["scripts/notarize-macos-dmg.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const releaseSecrets = spawnSync(
    process.execPath,
    ["scripts/check-macos-release-secrets.mjs", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const verifyDmg = spawnSync(process.execPath, ["scripts/verify-macos-dmg.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });
  const verifyApp = spawnSync(
    process.execPath,
    ["scripts/verify-macos-app-launch.mjs", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const verifyInstall = spawnSync(
    process.execPath,
    ["scripts/verify-macos-install-smoke.mjs", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const verifyDownload = spawnSync(
    process.execPath,
    ["scripts/check-macos-download-release.mjs", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const releaseGithub = spawnSync(
    process.execPath,
    ["scripts/check-macos-release-github.mjs", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const releaseSlot = spawnSync(
    process.execPath,
    ["scripts/check-macos-release-slot.mjs", "--help"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(sign.status, 0, sign.stderr);
  assert.match(sign.stdout, /APPLE_SIGNING_IDENTITY/);
  assert.match(sign.stdout, /hardened runtime/);

  assert.equal(notarize.status, 0, notarize.stderr);
  assert.match(notarize.stdout, /APPLE_APP_SPECIFIC_PASSWORD/);
  assert.match(notarize.stdout, /staples the/);

  assert.equal(releaseSecrets.status, 0, releaseSecrets.stderr);
  assert.match(releaseSecrets.stdout, /APPLE_CERTIFICATE_P12_BASE64/);
  assert.match(releaseSecrets.stdout, /APPLE_TEAM_ID/);
  assert.match(releaseSecrets.stdout, /base64-encoded Developer ID/);

  assert.equal(verifyDmg.status, 0, verifyDmg.stderr);
  assert.match(verifyDmg.stdout, /--require-signed/);
  assert.match(verifyDmg.stdout, /--require-notarized/);

  assert.equal(verifyApp.status, 0, verifyApp.stderr);
  assert.match(verifyApp.stdout, /--hold-ms=5000/);
  assert.match(verifyApp.stdout, /early/);

  assert.equal(verifyInstall.status, 0, verifyInstall.stderr);
  assert.match(verifyInstall.stdout, /temporary install/);
  assert.match(verifyInstall.stdout, /--hold-ms=5000/);

  assert.equal(verifyDownload.status, 0, verifyDownload.stderr);
  assert.match(verifyDownload.stdout, /public GitHub Release/);
  assert.match(verifyDownload.stdout, /reachable macOS DMG/);
  assert.match(verifyDownload.stdout, /--allow-prerelease/);

  assert.equal(releaseGithub.status, 0, releaseGithub.stderr);
  assert.match(releaseGithub.stdout, /GitHub-side prerequisites/);
  assert.match(releaseGithub.stdout, /APPLE_CERTIFICATE_P12_BASE64/);

  assert.equal(releaseSlot.status, 0, releaseSlot.stderr);
  assert.match(releaseSlot.stdout, /GitHub Release already exists/);
  assert.match(releaseSlot.stdout, /stale DMG assets/);
});

test("desktop GitHub release readiness gate reports missing Apple secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "omot-gh-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'api') {
  console.log(JSON.stringify({ state: 'active' }));
  process.exit(0);
}
if (args[0] === 'secret' && args[1] === 'list') {
  console.log(JSON.stringify([]));
  process.exit(0);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", "--tag=v0.1.0"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OMOT_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing GitHub Actions secrets/);
    assert.match(result.stderr, /APPLE_CERTIFICATE_P12_BASE64/);
    assert.match(result.stderr, /APPLE_TEAM_ID/);
    assert.match(result.stderr, /gh secret set APPLE_CERTIFICATE_P12_BASE64 --repo wlsdks\/oh-my-ontology/);
    assert.match(result.stderr, /gh secret set APPLE_TEAM_ID --repo wlsdks\/oh-my-ontology/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop GitHub release readiness gate reports missing workflow on GitHub", () => {
  const dir = mkdtempSync(join(tmpdir(), "omot-gh-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'api') {
  console.error('gh: Not Found (HTTP 404)');
  process.exit(1);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", "--tag=v0.1.0"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OMOT_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release-macos\.yml is not available to GitHub/);
    assert.match(result.stderr, /merge that PR into the default branch/);
    assert.match(result.stderr, /commit and push \.github\/workflows\/release-macos\.yml/i);
    assert.doesNotMatch(result.stderr, /gh api repos/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop GitHub release readiness gate accepts active workflow and required secret names", () => {
  const dir = mkdtempSync(join(tmpdir(), "omot-gh-"));
  const ghPath = join(dir, "gh");
  const secretNames = [
    "APPLE_CERTIFICATE_P12_BASE64",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_KEYCHAIN_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ];
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'api') {
  console.log(JSON.stringify({ state: 'active' }));
  process.exit(0);
}
if (args[0] === 'secret' && args[1] === 'list') {
  console.log(JSON.stringify(${JSON.stringify(secretNames.map((name) => ({ name })))}));
  process.exit(0);
}
if (args[0] === 'release' && args[1] === 'view') {
  console.error('release not found (HTTP 404)');
  process.exit(1);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", "--", "--tag=v0.1.0"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OMOT_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /has an active release workflow/);
    assert.match(result.stdout, /v0\.1\.0 matches package, Tauri, and Cargo versions/);
    assert.match(result.stdout, /v0\.1\.0 has no existing GitHub Release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop GitHub release readiness gate rejects an occupied release slot", () => {
  const dir = mkdtempSync(join(tmpdir(), "omot-gh-"));
  const ghPath = join(dir, "gh");
  const secretNames = [
    "APPLE_CERTIFICATE_P12_BASE64",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_KEYCHAIN_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ];
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'api') {
  console.log(JSON.stringify({ state: 'active' }));
  process.exit(0);
}
if (args[0] === 'secret' && args[1] === 'list') {
  console.log(JSON.stringify(${JSON.stringify(secretNames.map((name) => ({ name })))}));
  process.exit(0);
}
if (args[0] === 'release' && args[1] === 'view') {
  console.log(JSON.stringify({ tagName: 'v0.1.0', isDraft: false, isPrerelease: false, url: 'https://example.test/release' }));
  process.exit(0);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", "--tag=v0.1.0"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OMOT_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release v0\.1\.0 already exists/);
    assert.match(result.stderr, /Delete the existing public release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop readiness checker enforces release workflow order", () => {
  const checker = readFileSync("scripts/check-desktop-readiness.mjs", "utf8");

  assert.match(checker, /const releaseBuildOrder = orderedIndexes\(releaseWorkflow, \[/);
  assert.match(
    checker,
    /"name: Verify release tag version",\s+"name: Require Apple release signing secrets"/,
  );
  assert.match(
    checker,
    /"name: Sign macOS app",\s+"name: Package macOS DMG",\s+"name: Notarize and staple DMG"/,
  );
  assert.match(checker, /const releasePublishOrder = orderedIndexes\(releaseWorkflow, \[/);
  assert.match(
    checker,
    /"name: Require clean GitHub Release slot",\s+"name: Upload draft GitHub Release assets"/,
  );
  assert.match(
    checker,
    /"name: Upload draft GitHub Release assets",\s+"name: Verify draft release assets"/,
  );
  assert.match(checker, /hasStrictOrder\(releaseBuildOrder\)/);
  assert.match(checker, /hasStrictOrder\(releasePublishOrder\)/);
});

test("desktop release slot gate rejects an existing same-tag release", () => {
  const dir = mkdtempSync(join(tmpdir(), "omot-gh-slot-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'release' && args[1] === 'view') {
  console.log(JSON.stringify({ tagName: 'v0.1.0', isDraft: true, isPrerelease: false, url: 'https://example.test/release' }));
  process.exit(0);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-slot.mjs", "--tag=v0.1.0"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OMOT_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /release v0\.1\.0 already exists/);
    assert.match(result.stderr, /Delete the existing draft release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop release slot gate accepts a missing same-tag release", () => {
  const dir = mkdtempSync(join(tmpdir(), "omot-gh-slot-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'release' && args[1] === 'view') {
  console.error('release not found (HTTP 404)');
  process.exit(1);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-slot.mjs", "--", "--tag=v0.1.0"],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OMOT_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /has no existing GitHub Release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop release secret gate fails closed when Apple secrets are absent", () => {
  const env = { ...process.env };
  for (const key of [
    "APPLE_CERTIFICATE_P12_BASE64",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_KEYCHAIN_PASSWORD",
    "APPLE_SIGNING_IDENTITY",
    "APPLE_ID",
    "APPLE_APP_SPECIFIC_PASSWORD",
    "APPLE_TEAM_ID",
  ]) {
    delete env[key];
  }

  const result = spawnSync(process.execPath, ["scripts/check-macos-release-secrets.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing required Apple release secrets/);
  assert.match(result.stderr, /refusing to publish an unsigned or unnotarized macOS release artifact/);
});

test("desktop release secret gate rejects invalid certificate base64", () => {
  const result = spawnSync(process.execPath, ["scripts/check-macos-release-secrets.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      APPLE_CERTIFICATE_P12_BASE64: "not base64",
      APPLE_CERTIFICATE_PASSWORD: "certificate-password",
      APPLE_KEYCHAIN_PASSWORD: "keychain-password",
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
      APPLE_ID: "developer@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "app-specific-password",
      APPLE_TEAM_ID: "ABCDE12345",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /APPLE_CERTIFICATE_P12_BASE64 must be a non-empty base64-encoded/);
  assert.match(result.stderr, /cannot import its signing certificate/);
});

test("desktop release secret gate accepts structurally valid release secrets", () => {
  const result = spawnSync(process.execPath, ["scripts/check-macos-release-secrets.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      APPLE_CERTIFICATE_P12_BASE64: Buffer.from("fake-p12-bytes").toString("base64"),
      APPLE_CERTIFICATE_PASSWORD: "certificate-password",
      APPLE_KEYCHAIN_PASSWORD: "keychain-password",
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
      APPLE_ID: "developer@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "app-specific-password",
      APPLE_TEAM_ID: "ABCDE12345",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /structurally valid/);
});

test("desktop release tag gate requires the v-prefixed tag to match app versions", () => {
  const ok = spawnSync(
    process.execPath,
    ["scripts/check-macos-release-tag.mjs", "--tag=v0.1.0"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const mismatch = spawnSync(
    process.execPath,
    ["scripts/check-macos-release-tag.mjs", "--tag=v0.2.0"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );
  const invalid = spawnSync(
    process.execPath,
    ["scripts/check-macos-release-tag.mjs", "--tag=0.1.0"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /matches package, Tauri, and Cargo versions/);

  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /does not match macOS app versions/);
  assert.match(mismatch.stderr, /package=0\.1\.0/);
  assert.match(mismatch.stderr, /tauri=0\.1\.0/);
  assert.match(mismatch.stderr, /cargo=0\.1\.0/);

  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /must be v-prefixed/);
});
