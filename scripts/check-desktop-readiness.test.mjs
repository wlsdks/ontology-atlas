import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import { chmodSync, mkdtempSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";

// The release gates compare a tag against package.json/Tauri/Cargo, so the
// fixtures have to follow the repo version instead of freezing one.
const APP_VERSION = JSON.parse(readFileSync("package.json", "utf8")).version;
const APP_TAG = `v${APP_VERSION}`;
const APP_TAG_PATTERN = APP_TAG.replace(/\./g, "\\.");
const STRUCTURALLY_VALID_P8 = Buffer.from(
  "-----BEGIN PRIVATE KEY-----\nprivate-key-material\n-----END PRIVATE KEY-----\n",
).toString("base64");
const ENVIRONMENT_SECRET_NAMES = [
  "APPLE_API_KEY_P8_BASE64",
  "APPLE_API_KEY_ID",
  "APPLE_API_ISSUER_ID",
];
const REPOSITORY_SECRET_NAMES = [
  "APPLE_CERTIFICATE_P12_BASE64",
  "APPLE_CERTIFICATE_PASSWORD",
  "TAURI_SIGNING_PRIVATE_KEY",
  "TAURI_SIGNING_PRIVATE_KEY_PASSWORD",
];

test("desktop readiness check proves Tauri macOS shell prerequisites", () => {
  const result = spawnSync(
    process.execPath,
    ["scripts/check-desktop-readiness.mjs"],
    {
      cwd: process.cwd(),
      encoding: "utf8",
    },
  );

  // The release workflow may be changing in another worktree while this suite
  // runs. This test proves the readiness checker can name each durable
  // protected-release marker; the checker itself stays red until the live
  // workflow supplies every marker.
  assert.notEqual(result.signal, "SIGTERM", result.stderr);
  const readinessOutput = `${result.stdout}\n${result.stderr}`;
  assert.match(result.stdout, /macOS desktop Tauri-shell readiness/);
  assert.match(result.stdout, /✓ Next\.js uses static export output/);
  assert.match(result.stdout, /✓ Next\.js image optimization is disabled/);
  assert.match(result.stdout, /✓ Next\.js emits trailing-slash routes/);
  assert.match(result.stdout, /✓ build script refreshes docs-vault before next build/);
  assert.match(
    result.stdout,
    /✓ TypeScript excludes Tauri target artifacts from Next\.js type checks/,
  );
  assert.match(
    result.stdout,
    /✓ desktop package, Tauri, and Rust crate versions stay aligned for release tags/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri Rust package builds a ontology-atlas executable, not an ontology-atlas app binary/,
  );
  // The old `bundle guard covers the hosted download and local-first app routes`
  // was removed together with `check-bundle.mjs` when web hosting collapsed to
  // GitHub Pages alone (see docs/ARCHITECTURE.md). The ban on reintroducing SDKs is
  // caught by the dependency check below.
  assert.match(
    result.stdout,
    /✓ root package dependencies stay Firebase SDK and Firebase CLI free for the local-only app/,
  );
  assert.match(result.stdout, /✓ CLI\/MCP setup gate is available/);
  assert.match(
    result.stdout,
    /✓ agent workflow guide cites official Claude Code and Codex MCP client contracts/,
  );
  assert.match(result.stdout, /✓ desktop runtime doctor is available/);
  assert.match(result.stdout, /✓ desktop packaged-route smoke is available/);
  assert.match(
    result.stdout,
    /✓ desktop performance gate keeps static asset hard limits, report-only artifact totals, and explicit runtime\/MCP evidence boundaries/,
  );
  assert.match(
    result.stdout,
    /✓ desktop app launch verifier requires packaged WebView content, optional Accessibility text, and a single-run lock after \.app builds/,
  );
  assert.match(
    result.stdout,
    /✓ Codex Run action builds, launches, and verifies the freshly built macOS app bundle/,
  );
  assert.match(
    result.stdout,
    /✓ Codex Run action syncs an existing Applications copy before Computer Use dogfood/,
  );
  assert.match(
    result.stdout,
    /✓ desktop local deploy command builds without release updater signing, installs, and verifies Relief health from \/Applications with default best-effort visual and WebView evidence/,
  );
  assert.match(
    result.stdout,
    /✓ desktop app launch verifier writes Add Concept composer blocking proof and saved\/unavailable screenshot handoff into WebView evidence for agents/,
  );
  assert.match(
    result.stdout,
    /✓ agent guide requires the Product Design gate, design council, graph engine fit gate, allowed reference policy, and installed-app proof for Relief work/,
  );
  assert.match(
    result.stdout,
    /✓ desktop install smoke reuses the LaunchServices app content verifier for copied DMG apps/,
  );
  assert.match(
    result.stdout,
    /✓ desktop native vault bridge tests cover WebView handle shim, agent config validation, and Rust path guard/,
  );
  assert.match(
    result.stdout,
    /✓ desktop runtime split tests cover local intent, first-run routing, and hosted download routing/,
  );
  assert.match(
    result.stdout,
    /✓ desktop checker tests cover the GitHub release operator, source, run-watch, checksum filename, and completion gates/,
  );
  assert.match(
    result.stdout,
    /✓ desktop native vault bridge rejects symlink escapes without outside-vault side effects/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri capability grants only reviewed permissions to the main local workbench window/,
  );
  assert.match(result.stdout, /✓ desktop DMG verifier is available after packaging and checks the checksum filename/);
  assert.match(
    result.stdout,
    /✓ desktop DMG packager puts the Ontology Atlas app bundle into ontology-atlas release assets/,
  );
  assert.match(
    result.stdout,
    /✓ desktop install verifier checks the checksum filename, copies the DMG app, and launch-smokes the installed copy/,
  );
  assert.match(result.stdout, /✓ desktop release DMG verifier requires signing and notarization/);
  assert.match(
    result.stdout,
    /✓ desktop release DMG verifier treats notarization as requiring strict app signing/,
  );
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
    /✓ hosted website verifier sources expected download copy from the message catalog and requires the trust line plus both release-state CTAs/,
  );
  // The Firebase Hosting deploy preflight and fallback workflow checks went away in
  // #617 (Firebase removed entirely, GitHub Pages as the single host). The hosting
  // deployment contract is now covered by the hosted website verifier just above and
  // the Pages workflow check below.
  assert.match(
    result.stdout,
    /✓ GitHub Pages workflow builds the base-path static export, deploys the sole hosted download site on push\/release, and verifies the hosted download route/,
  );
  assert.match(
    result.stdout,
    /✓ desktop download verifier re-downloads and hashes the required macOS and Windows installers/,
  );
  assert.match(
    result.stdout,
    /✓ desktop local release preflight runs readiness, tests, runtime doctor, MCP handoff, agent JSON setup gate, build, route smoke, performance budget, LaunchServices app content proof, DMG, and install smoke/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release artifact command signs the app, packages, signs the DMG container, notarizes, and verifies the direct-download DMG/,
  );
  assert.match(
    result.stdout,
    /✓ hosted download CTAs avoid a broken latest-release URL and never call the GitHub API from the static export/,
  );
  assert.match(
    result.stdout,
    /✓ the hosted download page does not route into the browser workbench, and \/docs's own local-source tab stays desktop-only/,
  );
  assert.match(
    result.stdout,
    // Check the **marker**, not the sentence. On 2026-08-08 this line pinned the
    // whole wording and went red on a legitimate improvement — splitting the
    // degradation notice from the shortcut description according to their different
    // natures. That is the direction .claude/rules/documentation.md forbids: better
    // copy blocked by the gate. The gate had written that very failure into its own
    // preamble.
  /✓ .*(?:강등 고지|degrad).*(?:FSA|File System Access)/,
  );
  assert.match(
    result.stdout,
    /✓ root README states the brand, hosted demo, desktop Tauri bridge, and browser local-folder path without routing users to retired surfaces/,
  );
  assert.match(
    result.stdout,
    /✓ product and architecture docs frame the installed app as the daily heavy-lift local workbench while the hosted root map offers its own direct local-folder open path/,
  );
  assert.match(
    result.stdout,
    /✓ workflow, troubleshooting, publish, and launch docs route writable vault work through the desktop app/,
  );
  assert.match(
    result.stdout,
    // [revised 2026-08-01] The old label was "dogfood ontology docs mirror the
    // desktop-app and hosted-download split", and that check pinned the **exact
    // sentences** of two vault files that no longer exist. The vault is a surface
    // agents write in their own words, so sentence pins do not survive — this now
    // checks only that the concept exists.
    /✓ dogfood ontology carries the desktop-app install decision/,
  );
  assert.match(
    result.stdout,
    /✓ the topology empty state routes hosted users to the app download while preserving desktop vault picking/,
  );
  assert.match(
    result.stdout,
    /✓ hosted download page states per-platform installability from the generated release state and keeps release-pipeline status internal/,
  );
  assert.match(
    result.stdout,
    /✓ mobile bottom navigation hides only on the standalone download page, keeping global nav on the root map/,
  );
  assert.match(
    result.stdout,
    /✓ macOS release workflow uses Node 24 action majors and Corepack pnpm without pnpm\/action-setup/,
  );
  assert.match(readinessOutput, /protected release trigger accepts only a dispatched tag input and names that tag in the run|release-macos\.yml must have only workflow_dispatch/);
  assert.match(readinessOutput, /unprivileged release admission binds a protected branch dispatch to its trusted workflow commit|admit-release must be unprivileged/);
  assert.match(readinessOutput, /macOS and Windows signing builds consume the admitted commit from release-signing|build-macos and build-windows must need admit-release/);
  assert.match(readinessOutput, /staging and publication use the admitted commit and requested release tag|stage-macos and publish-macos must need admit-release/);
  assert.match(readinessOutput, /Windows checks updater-only signing credentials before its installer build|build-windows must run desktop:release-secrets -- --updater-only/);
  assert.match(result.stdout, /✓ desktop release secret gate blocks unsigned releases and malformed PKCS#12 or App Store Connect \.p8 credentials/);
  assert.match(readinessOutput, /desktop release docs and preflight route signing setup through the release-signing environment|docs\/DESKTOP-MACOS\.md, desktop:release-preflight, and desktop:release-github must describe release-signing/);
  assert.match(
    result.stdout,
    /✓ desktop release slot gate blocks stale same-tag GitHub Release assets before upload/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release tag gate receives the dispatched release tag before signing/,
  );
  assert.match(readinessOutput, /desktop GitHub release readiness gate checks the protected workflow and release-signing secret scope before dispatch|must check the protected workflow, branch-only release-signing environment/);
  assert.match(
    result.stdout,
    /✓ desktop release run watcher dispatches the protected ref and watches its workflow_dispatch run/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release status gate audits version alignment, PR readiness, release workflow availability, tag slots, Developer ID direct-download secrets, public release state, and download assets in JSON blocker snapshots and markdown operator checklists, with no Firebase Hosting dependency/,
  );
  assert.match(
    result.stdout,
    /✓ desktop goal audit requires PR and tag evidence before chaining local preflight with public release and hosted download blockers while writing default JSON and markdown evidence/,
  );
  assert.match(result.stdout, /✓ desktop signing script deeply signs the release app with hardened runtime and strict verification/);
  assert.match(result.stdout, /✓ desktop notarization script is available for release builds/);
  assert.match(result.stdout, /✓ Tauri CLI alias is available through pnpm tauri/);
  assert.match(result.stdout, /✓ desktop dev script launches the Tauri shell/);
  assert.match(
    result.stdout,
    /✓ desktop app-only build compiles the bundled MCP server and cleans stale macOS app bundles before Tauri rebuilds/,
  );
  assert.match(
    result.stdout,
    /✓ desktop local deploy command builds without release updater signing, installs, and verifies Relief health from \/Applications with default best-effort visual and WebView evidence/,
  );
  assert.match(result.stdout, /✓ desktop build script targets macOS \.app and \.dmg artifacts/);
  assert.match(result.stdout, /✓ Tauri CLI dependency is installed/);
  assert.match(result.stdout, /✓ Tauri JavaScript API dependency is installed/);
  assert.match(
    result.stdout,
    /✓ desktop quality bar names native launch, vault permissions, recent vaults, local data, agent setup, offline routes, and local ontology handoff/,
  );
  assert.match(
    result.stdout,
    /✓ desktop prototype smoke names download, docs, ontology, topology, builder, and insights routes/,
  );
  assert.match(result.stdout, /✓ Tauri scaffold exists/);
  assert.match(result.stdout, /✓ Tauri loads the Next\.js static export from out\//);
  assert.match(result.stdout, /✓ Tauri bundle target includes macOS \.app/);
  assert.match(
    result.stdout,
    /✓ Tauri bundle config wires the Ontology Atlas app icons into \.app builds/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri presents Ontology Atlas with a Ontology Atlas bundle id, app bundle, executable, and DMG basename/,
  );
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
    /✓ desktop root entry renders the first-run surface for first launch and stale restored vaults without rendering marketing/,
  );
  assert.match(
    result.stdout,
    /✓ desktop docs intent shows a vault setup welcome before opening the native picker/,
  );
  assert.match(
    result.stdout,
    /✓ desktop empty-vault workspace surfaces the ontology starter in the main pane and opens README after creation/,
  );
  assert.match(
    result.stdout,
    /✓ desktop ontology starter copies path-aware CLI and JSON agent gates/,
  );
  assert.match(
    result.stdout,
    /✓ desktop agent setup panel copies path-aware setup packets, CLI runbooks, and JSON gates/,
  );
  assert.match(
    result.stdout,
    /✓ desktop agent setup surface derives the absolute Tauri vault path and is actually mounted by the Agents destination/,
  );
  assert.match(
    result.stdout,
    /✓ desktop workspace settings expose recent vault recall, absolute vault path copy\/reveal, stale-path cleanup, and vault-local agent config validation/,
  );
  assert.match(
    result.stdout,
    /✓ Tauri Rust entrypoint, default capability files, app icons, and release packagers exist/,
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
  const releaseSource = spawnSync(
    process.execPath,
    ["scripts/check-macos-release-source.mjs", "--help"],
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
  assert.match(sign.stdout, /hardened runtime/);
  // The identity is derived from the certificate — one fewer secret for a person to
  // register.
  assert.match(sign.stdout, /find-identity|Required codesign identity|APPLE_SIGNING_IDENTITY/);

  assert.equal(notarize.status, 0, notarize.stderr);
  assert.match(notarize.stdout, /APPLE_API_KEY_ID/);
  assert.match(notarize.stdout, /Password authentication is\s+not accepted/);
  assert.match(notarize.stdout, /staples the/);

  assert.equal(releaseSecrets.status, 0, releaseSecrets.stderr);
  assert.match(releaseSecrets.stdout, /APPLE_CERTIFICATE_P12_BASE64/);
  assert.match(releaseSecrets.stdout, /APPLE_API_ISSUER_ID/);
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
  assert.match(verifyDownload.stdout, /Apple Silicon/);
  assert.match(verifyDownload.stdout, /aarch64/);
  assert.match(verifyDownload.stdout, /exactly one DMG per architecture/);
  assert.match(verifyDownload.stdout, /Intel/);
  assert.match(verifyDownload.stdout, /x64/);
  assert.match(verifyDownload.stdout, /--allow-prerelease/);

  assert.equal(releaseGithub.status, 0, releaseGithub.stderr);
  assert.match(releaseGithub.stdout, /GitHub-side prerequisites/);
  assert.match(releaseGithub.stdout, /APPLE_CERTIFICATE_P12_BASE64/);
  assert.doesNotMatch(releaseGithub.stdout, /FIREBASE_SERVICE_ACCOUNT_JSON/);
  assert.match(releaseGithub.stdout, /hosted website deploy is intentionally excluded/);

  assert.equal(releaseSource.status, 0, releaseSource.stderr);
  assert.match(releaseSource.stdout, /default-branch head/);
  assert.match(releaseSource.stdout, /admitted SHA|default-branch head/);

  assert.equal(releaseSlot.status, 0, releaseSlot.stderr);
  assert.match(releaseSlot.stdout, /GitHub Release already exists/);
  assert.match(releaseSlot.stdout, /stale DMG assets/);
});

/**
 * This gate also reads **local git tags** — and that was the one part still
 * reading the real repository. `APP_TAG` comes from the package.json version, so
 * the moment the repository actually tagged that version (v1.0.0, 2026-07-27) the
 * fixture collided with reality and the case broke — inside the release workflow,
 * blocking the release.
 *
 * The remote was already isolated behind a fake `gh`; only git was leaking. The
 * script already supports injecting `OATLAS_GIT_BIN`, so that is used here too.
 * The test now checks **the script's logic** rather than this machine's tag state.
 *
 * `tagExists: false` → `git rev-parse --verify --quiet` answers 1 (absent).
 */
function writeFakeGit(dir, { tagExists = false } = {}) {
  const gitPath = join(dir, "git");
  writeFileSync(
    gitPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'rev-parse' && args.includes('--verify')) {
  process.exit(${tagExists ? 0 : 1});
}
console.error('unexpected git args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(gitPath, 0o755);
  return gitPath;
}

test("desktop GitHub release readiness gate reports missing Developer ID direct-download secrets", () => {
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'repo' && args[1] === 'view') { console.log('main'); process.exit(0); }
if (args[0] === 'api' && args[1] && args[1].includes('/deployment-branch-policies')) {
  console.log(JSON.stringify({ branch_policies: [{ name: 'main', type: 'branch' }] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].includes('/environments/release-signing')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].endsWith('/environments/release')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { login: 'owner' } }] }] })); process.exit(0);
}
if (args[0] === 'api') {
  if (args[1] && args[1].includes('/git/ref/tags/')) {
    console.error('gh: Not Found (HTTP 404)');
    process.exit(1);
  }
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
  const gitPath = writeFakeGit(dir);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", `--tag=${APP_TAG}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OATLAS_GH_BIN: ghPath, OATLAS_GIT_BIN: gitPath },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, /missing release-signing environment secrets/);
    assert.doesNotMatch(result.stderr, /APPLE_CERTIFICATE_P12_BASE64/);
    assert.match(result.stderr, /APPLE_API_ISSUER_ID/);
    assert.doesNotMatch(result.stderr, /gh secret set APPLE_CERTIFICATE_P12_BASE64/);
    assert.match(result.stderr, /gh secret set APPLE_API_ISSUER_ID --env release-signing --repo wlsdks\/ontology-atlas/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop GitHub release readiness gate reports missing workflow on GitHub", () => {
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'repo' && args[1] === 'view') { console.log('main'); process.exit(0); }
if (args[0] === 'api' && args[1] && args[1].includes('/deployment-branch-policies')) {
  console.log(JSON.stringify({ branch_policies: [{ name: 'main', type: 'branch' }] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].includes('/environments/release-signing')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].endsWith('/environments/release')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { login: 'owner' } }] }] })); process.exit(0);
}
if (args[0] === 'api') {
  console.error('gh: Not Found (HTTP 404)');
  process.exit(1);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  const gitPath = writeFakeGit(dir);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", `--tag=${APP_TAG}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OATLAS_GH_BIN: ghPath, OATLAS_GIT_BIN: gitPath },
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
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-"));
  const ghPath = join(dir, "gh");
  const secretNames = ENVIRONMENT_SECRET_NAMES;
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'repo' && args[1] === 'view') { console.log('main'); process.exit(0); }
if (args[0] === 'api' && args[1] && args[1].includes('/deployment-branch-policies')) {
  console.log(JSON.stringify({ branch_policies: [{ name: 'main', type: 'branch' }] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].includes('/environments/release-signing')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].endsWith('/environments/release')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { login: 'owner' } }] }] })); process.exit(0);
}
if (args[0] === 'api') {
  if (args[1] && args[1].includes('/git/ref/tags/')) {
    console.error('gh: Not Found (HTTP 404)');
    process.exit(1);
  }
  console.log(JSON.stringify({ state: 'active' }));
  process.exit(0);
}
if (args[0] === 'secret' && args[1] === 'list') {
  console.log(JSON.stringify(args.includes('--env') ? ${JSON.stringify(secretNames.map((name) => ({ name })))} : ${JSON.stringify(REPOSITORY_SECRET_NAMES.map((name) => ({ name })))}));
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
  const gitPath = writeFakeGit(dir);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", "--", `--tag=${APP_TAG}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OATLAS_GH_BIN: ghPath, OATLAS_GIT_BIN: gitPath },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /all required split-scope signing secret names/);
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} matches package, Tauri, and Cargo versions`));
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} has no existing GitHub Release`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop GitHub release readiness gate rejects an occupied release slot", () => {
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-"));
  const ghPath = join(dir, "gh");
  const secretNames = ENVIRONMENT_SECRET_NAMES;
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'repo' && args[1] === 'view') { console.log('main'); process.exit(0); }
if (args[0] === 'api' && args[1] && args[1].includes('/deployment-branch-policies')) {
  console.log(JSON.stringify({ branch_policies: [{ name: 'main', type: 'branch' }] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].includes('/environments/release-signing')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [] })); process.exit(0);
}
if (args[0] === 'api' && args[1] && args[1].endsWith('/environments/release')) {
  console.log(JSON.stringify({ can_admins_bypass: false, deployment_branch_policy: { protected_branches: false, custom_branch_policies: true }, protection_rules: [{ type: 'required_reviewers', reviewers: [{ reviewer: { login: 'owner' } }] }] })); process.exit(0);
}
if (args[0] === 'api') {
  if (args[1] && args[1].includes('/git/ref/tags/')) {
    console.error('gh: Not Found (HTTP 404)');
    process.exit(1);
  }
  console.log(JSON.stringify({ state: 'active' }));
  process.exit(0);
}
if (args[0] === 'secret' && args[1] === 'list') {
  console.log(JSON.stringify(args.includes('--env') ? ${JSON.stringify(secretNames.map((name) => ({ name })))} : ${JSON.stringify(REPOSITORY_SECRET_NAMES.map((name) => ({ name })))}));
  process.exit(0);
}
if (args[0] === 'release' && args[1] === 'view') {
  console.log(JSON.stringify({ tagName: '${APP_TAG}', isDraft: false, isPrerelease: false, url: 'https://example.test/release' }));
  process.exit(0);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  const gitPath = writeFakeGit(dir);
  try {
    const result = spawnSync(
      process.execPath,
      ["scripts/check-macos-release-github.mjs", `--tag=${APP_TAG}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OATLAS_GH_BIN: ghPath, OATLAS_GIT_BIN: gitPath },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`release ${APP_TAG_PATTERN} already exists`));
    assert.match(result.stderr, /Delete the existing public release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop readiness checker defines durable protected-release markers", () => {
  const checker = readFileSync("scripts/check-desktop-readiness.mjs", "utf8");

  assert.ok(checker.includes("github\\.workflow_sha"));
  assert.ok(checker.includes("github\\.ref_type"));
  assert.ok(checker.includes("needs\\.admit-release\\.outputs\\.release_sha"));
  assert.ok(checker.includes("desktop:release-secrets -- --updater-only"));
  assert.ok(checker.includes("workflow_dispatch"));
});

// Git for Windows checks tracked YAML out with CRLF by default. The readiness
// checker parses workflow sections with line-anchored regular expressions, so
// its read boundary must normalize line endings before those contracts run.
test("desktop readiness checker normalizes Windows line endings", () => {
  const checker = readFileSync("scripts/check-desktop-readiness.mjs", "utf8");

  assert.ok(checker.includes('.replace(/\\r\\n?/g, "\\n")'));
});

// 2026-07-25 (review): this gate kept readFileSync-ing the deleted
// `VaultToolsMenu.tsx` and died on an ENOENT stack trace. A crash reads as "no
// gate", not "gate failed", so a missing target file must always end in a readable
// [desktop-check] failure message.
test("desktop readiness check fails readably when a tracked source file disappears", () => {
  const checker = readFileSync("scripts/check-desktop-readiness.mjs", "utf8");

  // readText must downgrade a missing file to fail() — never a raw readFileSync
  // crash.
  assert.match(checker, /function readText\(relativePath\)/);
  assert.match(checker, /existsSync\(absolute\)/);
  assert.match(checker, /tracked source file is missing/);

  // The gate must aim at the surface that actually replaced it (the agent panel in
  // the settings menu). Mentioning the old path in a comment that explains the
  // deletion is allowed; *reading* that path is not.
  assert.doesNotMatch(checker, /readText\([^)]*VaultToolsMenu/);
  assert.match(
    checker,
    /readText\("src\/widgets\/app-settings-menu\/ui\/VaultAgentSetupPanel\.tsx"\)/,
  );
});

test("desktop release slot gate rejects an existing same-tag release", () => {
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-slot-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'release' && args[1] === 'view') {
  console.log(JSON.stringify({ tagName: '${APP_TAG}', isDraft: true, isPrerelease: false, url: 'https://example.test/release' }));
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
      ["scripts/check-macos-release-slot.mjs", `--tag=${APP_TAG}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OATLAS_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 1);
    assert.match(result.stderr, new RegExp(`release ${APP_TAG_PATTERN} already exists`));
    assert.match(result.stderr, /Delete the existing draft release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop release slot gate accepts a missing same-tag release", () => {
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-slot-"));
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
      ["scripts/check-macos-release-slot.mjs", "--", `--tag=${APP_TAG}`],
      {
        cwd: process.cwd(),
        encoding: "utf8",
        env: { ...process.env, OATLAS_GH_BIN: ghPath },
      },
    );

    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /has no existing GitHub Release/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop release secret gate fails closed when Developer ID direct-download secrets are absent", () => {
  const env = { ...process.env };
  for (const key of [
    "APPLE_CERTIFICATE_P12_BASE64",
    "APPLE_CERTIFICATE_PASSWORD",
    "APPLE_API_KEY_P8_BASE64",
    "APPLE_API_KEY_ID",
    "APPLE_API_ISSUER_ID",
  ]) {
    delete env[key];
  }

  const result = spawnSync(process.execPath, ["scripts/check-macos-release-secrets.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env,
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /missing required Developer ID direct-download secrets/);
  assert.match(result.stderr, /not Mac App Store submission/);
  assert.match(result.stderr, /APPLE_API_KEY_P8_BASE64 — App Store Connect API private key/);
  assert.match(result.stderr, /refusing to publish an unsigned or unnotarized direct-download macOS release artifact/);
});

test("desktop release secret gate help explains each direct-download secret role", () => {
  const result = spawnSync(process.execPath, ["scripts/check-macos-release-secrets.mjs", "--help"], {
    cwd: process.cwd(),
    encoding: "utf8",
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /not Mac App Store submission credentials/);
  assert.match(result.stdout, /APPLE_CERTIFICATE_P12_BASE64 — Developer ID Application certificate exported as base64 PKCS#12/);
  assert.match(result.stdout, /APPLE_CERTIFICATE_PASSWORD — password for that exported \.p12 file/);
  assert.match(result.stdout, /APPLE_API_KEY_P8_BASE64 — App Store Connect API private key/);
  assert.match(result.stdout, /APPLE_API_KEY_ID — App Store Connect API key ID for notarytool/);
  assert.match(result.stdout, /APPLE_API_ISSUER_ID — App Store Connect API issuer UUID for notarization/);
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
      APPLE_API_KEY_P8_BASE64: STRUCTURALLY_VALID_P8,
      APPLE_API_KEY_ID: "KEYID12345",
      APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
      TAURI_SIGNING_PRIVATE_KEY: "updater-private-key",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "updater-password",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /APPLE_CERTIFICATE_P12_BASE64 must be a base64-encoded/);
  assert.match(result.stderr, /cannot import its signing certificate/);
});

test("desktop release secret gate rejects base64 that is not a PKCS#12 DER certificate", () => {
  const result = spawnSync(process.execPath, ["scripts/check-macos-release-secrets.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      APPLE_CERTIFICATE_P12_BASE64: Buffer.from("not-a-pkcs12-certificate-but-long-enough").toString("base64"),
      APPLE_CERTIFICATE_PASSWORD: "certificate-password",
      APPLE_KEYCHAIN_PASSWORD: "keychain-password",
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
      APPLE_API_KEY_P8_BASE64: STRUCTURALLY_VALID_P8,
      APPLE_API_KEY_ID: "KEYID12345",
      APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
      TAURI_SIGNING_PRIVATE_KEY: "updater-private-key",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "updater-password",
    },
  });

  assert.equal(result.status, 1);
  assert.match(result.stderr, /APPLE_CERTIFICATE_P12_BASE64 must decode to a PKCS#12 DER sequence with a valid length envelope/);
  assert.match(result.stderr, /cannot import its signing certificate/);
});

test("desktop release secret gate accepts structurally valid release secrets", () => {
  const pkcs12DerLikeBytes = Buffer.from([
    0x30, 0x1e, 0x02, 0x01, 0x03, 0x30, 0x19, 0x06,
    0x09, 0x2a, 0x86, 0x48, 0x86, 0xf7, 0x0d, 0x01,
    0x07, 0x01, 0xa0, 0x0c, 0x04, 0x0a, 0x30, 0x08,
    0x02, 0x01, 0x00, 0x04, 0x03, 0x70, 0x31, 0x32,
  ]);
  const result = spawnSync(process.execPath, ["scripts/check-macos-release-secrets.mjs"], {
    cwd: process.cwd(),
    encoding: "utf8",
    env: {
      ...process.env,
      APPLE_CERTIFICATE_P12_BASE64: pkcs12DerLikeBytes.toString("base64"),
      APPLE_CERTIFICATE_PASSWORD: "certificate-password",
      APPLE_KEYCHAIN_PASSWORD: "keychain-password",
      APPLE_SIGNING_IDENTITY: "Developer ID Application: Example",
      APPLE_API_KEY_P8_BASE64: STRUCTURALLY_VALID_P8,
      APPLE_API_KEY_ID: "KEYID12345",
      APPLE_API_ISSUER_ID: "11111111-2222-3333-4444-555555555555",
      TAURI_SIGNING_PRIVATE_KEY: "updater-private-key",
      TAURI_SIGNING_PRIVATE_KEY_PASSWORD: "updater-password",
    },
  });

  assert.equal(result.status, 0, result.stderr);
  assert.match(result.stdout, /structurally valid/);
});

test("desktop release tag gate requires the v-prefixed tag to match app versions", () => {
  // Read the version rather than hardcoding it: this gate exists so a version
  // bump cannot ship without the tag following, and a test frozen at one
  // version would fail on the bump it is supposed to protect.
  const { version } = JSON.parse(readFileSync("package.json", "utf8"));
  const [major, minor, patch] = version.split(".");
  const otherVersion = `${major}.${Number(minor) + 1}.${patch}`;

  const run = (tag) =>
    spawnSync(process.execPath, ["scripts/check-macos-release-tag.mjs", `--tag=${tag}`], {
      cwd: process.cwd(),
      encoding: "utf8",
    });

  const ok = run(`v${version}`);
  const mismatch = run(`v${otherVersion}`);
  const invalid = run(version);

  assert.equal(ok.status, 0, ok.stderr);
  assert.match(ok.stdout, /matches package, Tauri, Cargo, and release-facts versions/);

  assert.equal(mismatch.status, 1);
  assert.match(mismatch.stderr, /does not match macOS app versions/);
  for (const field of ["package", "tauri", "cargo"]) {
    assert.ok(
      mismatch.stderr.includes(`${field}=${version}`),
      `expected ${field}=${version} in ${mismatch.stderr}`,
    );
  }

  assert.equal(invalid.status, 1);
  assert.match(invalid.stderr, /must be v-prefixed/);
});
