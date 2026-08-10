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
  // 구 `bundle guard covers the hosted download and local-first app routes` 는
  // 웹 호스팅이 GitHub Pages 단일로 정리되면서 `check-bundle.mjs` 와 함께
  // 제거됐다(architecture.md 참고). SDK 재도입 금지는 아래 의존성 검사가 잡는다.
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
    /✓ desktop performance budget gate covers static assets and packaged \.app size/,
  );
  assert.match(
    result.stdout,
    /✓ desktop app launch verifier requires packaged WebView content, optional Accessibility text, and a single-run lock after \.app builds/,
  );
  assert.match(
    result.stdout,
    /✓ desktop app launch verifier can request Add Concept through route intent when Relief command chrome is collapsed/,
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
    /✓ desktop localized Add Concept visual proof script checks the installed Korean Relief composer/,
  );
  assert.match(
    result.stdout,
    /✓ desktop localized topology composer blocking proof script checks relation focus, transient dismissal, dimmed map, screenshot evidence, and the installed Korean Add Concept composer/,
  );
  assert.match(
    result.stdout,
    /✓ desktop app launch verifier writes Add Concept composer blocking proof and saved\/unavailable screenshot handoff into WebView evidence for agents/,
  );
  assert.match(
    result.stdout,
    /✓ desktop localized topology design proof script checks selected relation, path result, and blocking composer states/,
  );
  assert.match(
    result.stdout,
    /✓ desktop localized topology focus motion proof script checks bounded selected-focus camera movement/,
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
    /✓ desktop checker tests cover the GitHub release operator, source, run-watch, checksum, and completion gates/,
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
    /✓ hosted website verifier sources expected download copy from the message catalog and requires both platform statuses/,
  );
  // Firebase Hosting 배포 프리플라이트/폴백 워크플로 검사는 #617 (Firebase 전면
  // 제거 → GitHub Pages 단일 호스트) 에서 사라졌다. 호스팅 배포 계약은 바로 위
  // hosted website verifier 와 아래 Pages 워크플로 검사가 대신 잡는다.
  assert.match(
    result.stdout,
    /✓ GitHub Pages workflow builds the base-path static export, deploys the sole hosted download site on push\/release, and verifies the hosted download route/,
  );
  assert.match(
    result.stdout,
    /✓ desktop download verifier requires explicit one-per-architecture Apple Silicon and Intel DMGs with checksum byte verification/,
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
    /✓ hosted download CTAs separate the GitHub Releases download path from the source-code link without a broken latest-release dependency/,
  );
  assert.match(
    result.stdout,
    /✓ the hosted download page does not route into the browser workbench, and \/docs's own local-source tab stays desktop-only/,
  );
  assert.match(
    result.stdout,
    // 문장이 아니라 **표식**을 본다. 2026-08-08 에 이 줄이 문구를 통째로 못박고
  // 있어서, 강등 고지와 단축키 설명을 성격에 맞게 가르는 정당한 개선에서
  // 빨개졌다 — `documentation.md` 가 금지한 방향(문구가 나아졌는데 게이트가
  // 막는 것)이다. 검사기 자신이 그 실패를 자기 머리말에 적어 두고 있었다.
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
    // [개정 2026-08-01] 종전 라벨은 「dogfood ontology docs mirror the
    // desktop-app and hosted-download split」 였고, 그 검사는 사라진 두 볼트
    // 파일의 **정확한 문장**을 핀했다. 볼트는 에이전트가 자기 말로 쓰는
    // 표면이라 문장 핀이 유지되지 않는다 — 이제 개념의 존재만 본다.
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
  assert.match(
    result.stdout,
    /✓ tag release workflow builds Apple Silicon and Intel DMGs on Node 24, decodes signing certificates with macOS base64, cleans up the signing keychain, and publishes verified public assets without Firebase Hosting dependencies/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release source gate blocks tags from unmerged or stale commits before signing/,
  );
  assert.match(result.stdout, /✓ desktop release secret gate blocks unsigned releases and malformed PKCS#12 certificates/);
  assert.match(
    result.stdout,
    /✓ desktop release docs include Developer ID direct-download secret commands and exclude the website deploy from the app gate/,
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
    /✓ desktop GitHub release readiness gate checks the release workflow, Developer ID direct-download secret names, local and remote Git tag slots, and release slot before tag push/,
  );
  assert.match(
    result.stdout,
    /✓ desktop release run watcher waits for the tag-push workflow run before watching it/,
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
    /✓ desktop agent setup surface derives the absolute Tauri vault path and is actually mounted by the settings sheet/,
  );
  assert.match(
    result.stdout,
    /✓ desktop workspace settings expose recent vault recall, absolute vault path copy\/reveal, stale-path cleanup, and vault-local agent config validation/,
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
  // 신원은 인증서에서 파생한다 — 사람이 등록할 secret 이 하나 줄었다.
  assert.match(sign.stdout, /find-identity|Required codesign identity|APPLE_SIGNING_IDENTITY/);

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
  assert.match(releaseSource.stdout, /unmerged PR branch/);

  assert.equal(releaseSlot.status, 0, releaseSlot.stderr);
  assert.match(releaseSlot.stdout, /GitHub Release already exists/);
  assert.match(releaseSlot.stdout, /stale DMG assets/);
});

/**
 * 이 게이트는 **로컬 git 태그**도 본다 — 그리고 그 부분만 실제 저장소를 읽고
 * 있었다. `APP_TAG` 는 package.json 버전에서 나오므로, 저장소가 실제로 그
 * 버전을 태깅하는 순간(v1.0.0, 2026-07-27) 픽스처가 현실과 충돌해 케이스가
 * 깨졌다 — 하필 릴리스 워크플로 안에서, 릴리스를 막으면서.
 *
 * 원격은 가짜 `gh` 로 이미 격리돼 있었는데 git 만 새고 있었다. 스크립트가
 * `OATLAS_GIT_BIN` 주입을 이미 지원하므로 여기서도 그걸 쓴다. 테스트는 이제
 * 이 머신의 태그 상태가 아니라 **스크립트의 논리**를 검사한다.
 *
 * `tagExists: false` → `git rev-parse --verify --quiet` 가 1(없음)로 답한다.
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
    assert.match(result.stderr, /missing GitHub Actions secrets/);
    assert.match(result.stderr, /APPLE_CERTIFICATE_P12_BASE64/);
    assert.match(result.stderr, /APPLE_TEAM_ID/);
    assert.match(result.stderr, /gh secret set APPLE_CERTIFICATE_P12_BASE64 --repo wlsdks\/ontology-atlas/);
    assert.match(result.stderr, /gh secret set APPLE_TEAM_ID --repo wlsdks\/ontology-atlas/);
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
  const secretNames = [
    "APPLE_CERTIFICATE_P12_BASE64",
    "APPLE_CERTIFICATE_PASSWORD",
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
  if (args[1] && args[1].includes('/git/ref/tags/')) {
    console.error('gh: Not Found (HTTP 404)');
    process.exit(1);
  }
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
    assert.match(result.stdout, /has the active macOS release workflow/);
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} matches package, Tauri, and Cargo versions`));
    assert.match(result.stdout, new RegExp(`${APP_TAG_PATTERN} has no existing GitHub Release`));
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop GitHub release readiness gate rejects an occupied release slot", () => {
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-"));
  const ghPath = join(dir, "gh");
  const secretNames = [
    "APPLE_CERTIFICATE_P12_BASE64",
    "APPLE_CERTIFICATE_PASSWORD",
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
  if (args[1] && args[1].includes('/git/ref/tags/')) {
    console.error('gh: Not Found (HTTP 404)');
    process.exit(1);
  }
  console.log(JSON.stringify({ state: 'active' }));
  process.exit(0);
}
if (args[0] === 'secret' && args[1] === 'list') {
  console.log(JSON.stringify(${JSON.stringify(secretNames.map((name) => ({ name })))}));
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

test("desktop GitHub release readiness gate rejects a tag that already exists locally", () => {
  // 가짜 git 을 넣으면서 이 분기의 커버리지가 사라질 뻔했다. 실제 저장소를
  // 읽던 시절에는 "태그 없음" 만 우연히 검사됐고, 태그가 생기자 그 우연이
  // 다른 케이스를 깨뜨렸다. 이제 두 상태를 **의도적으로** 각각 검사한다.
  const dir = mkdtempSync(join(tmpdir(), "ontology-atlas-gh-"));
  const ghPath = join(dir, "gh");
  writeFileSync(
    ghPath,
    `#!/usr/bin/env node
const args = process.argv.slice(2);
if (args[0] === 'auth' && args[1] === 'status') process.exit(0);
if (args[0] === 'api') { console.log(JSON.stringify({ state: 'active' })); process.exit(0); }
if (args[0] === 'secret' && args[1] === 'list') {
  console.log(JSON.stringify([
    { name: 'APPLE_CERTIFICATE_P12_BASE64' },
    { name: 'APPLE_CERTIFICATE_PASSWORD' },
    { name: 'APPLE_ID' },
    { name: 'APPLE_APP_SPECIFIC_PASSWORD' },
    { name: 'APPLE_TEAM_ID' },
  ]));
  process.exit(0);
}
console.error('unexpected gh args: ' + args.join(' '));
process.exit(1);
`,
  );
  chmodSync(ghPath, 0o755);
  const gitPath = writeFakeGit(dir, { tagExists: true });
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
    assert.match(result.stderr, new RegExp(`local git tag ${APP_TAG_PATTERN} already exists`));
    assert.match(result.stderr, /git tag -d/);
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});

test("desktop readiness checker enforces release workflow order", () => {
  const checker = readFileSync("scripts/check-desktop-readiness.mjs", "utf8");

  assert.match(checker, /const releaseBuildOrder = orderedIndexes\(releaseWorkflow, \[/);
  assert.match(
    checker,
    /"name: Verify release source commit",\s+"name: Verify release tag version",\s+"name: Decide signing path"/,
  );
  assert.match(
    checker,
    // 스테이징이 업로드 **앞**이어야 한다 — 올릴 폴더를 만들기 전에 올리면
    // 아무것도 안 올라가거나, 예전 실행이 남긴 것이 올라간다.
    /"name: Build unsigned release artifact",\s+"name: Stage release assets",\s+"name: Upload workflow artifact"/,
  );
  assert.match(checker, /node scripts\\\/stage-macos-release-assets\\\.mjs/);
  assert.match(checker, /pnpm desktop:release-artifact/);
  assert.match(checker, /base64 -D > "\\\$CERTIFICATE_PATH"/);
  assert.match(checker, /!\/base64 --decode\/\.test\(releaseWorkflow\)/);
  assert.match(checker, /"name: Upload workflow artifact",\s+"name: Cleanup Apple signing keychain"/);
  assert.match(checker, /security delete-keychain "\$KEYCHAIN_PATH" 2>\\\/dev\\\/null \\|\\| true/);
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

// 2026-07-25 (opus5 검수): 이 게이트가 삭제된 `VaultToolsMenu.tsx` 를 계속
// readFileSync 하다 ENOENT 스택트레이스로 죽어 있었다. 크래시는 "게이트 실패"
// 가 아니라 "게이트 부재"로 읽히기 때문에, 검사 대상 파일이 사라지면 반드시
// 읽을 수 있는 [desktop-check] 실패 메시지로 끝나야 한다.
test("desktop readiness check fails readably when a tracked source file disappears", () => {
  const checker = readFileSync("scripts/check-desktop-readiness.mjs", "utf8");

  // readText 는 파일 부재를 fail() 로 강등해야 한다 — raw readFileSync 크래시 금지.
  assert.match(checker, /function readText\(relativePath\)/);
  assert.match(checker, /existsSync\(absolute\)/);
  assert.match(checker, /tracked source file is missing/);

  // 이 게이트가 실제로 이동한 표면(설정 메뉴의 에이전트 패널)을 겨냥해야 한다.
  // 삭제 경위를 설명하는 주석 언급은 허용하되, 그 경로를 *읽는* 것은 금지.
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
  assert.match(result.stderr, /missing required Developer ID direct-download secrets/);
  assert.match(result.stderr, /not Mac App Store submission/);
  assert.match(result.stderr, /APPLE_ID — Apple Developer account email for notarytool submission/);
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
  assert.match(result.stdout, /APPLE_ID — Apple Developer account email for notarytool submission/);
  assert.match(result.stdout, /APPLE_APP_SPECIFIC_PASSWORD — app-specific password for notarytool/);
  assert.match(result.stdout, /APPLE_TEAM_ID — Apple Developer Team ID for notarization/);
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
      APPLE_ID: "developer@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "app-specific-password",
      APPLE_TEAM_ID: "ABCDE12345",
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
      APPLE_ID: "developer@example.com",
      APPLE_APP_SPECIFIC_PASSWORD: "app-specific-password",
      APPLE_TEAM_ID: "ABCDE12345",
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
