import assert from "node:assert/strict";
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import test from "node:test";

const BETA = "v1.2.3-beta.1";
const STABLE = "v1.2.3";
const COMMIT = "a".repeat(40);
const OTHER_COMMIT = "b".repeat(40);

const sha = (body) => crypto.createHash("sha256").update(body).digest("hex");

/** The beta's assets as `release-macos.yml` stages them: plain version in every name, no manifest. */
function betaFiles() {
  const files = {
    "ontology-atlas_1.2.3_aarch64.dmg": "dmg bytes",
    "ontology-atlas_1.2.3_aarch64.app.tar.gz": "updater archive bytes",
    "ontology-atlas_1.2.3_aarch64.app.tar.gz.sig": "minisign signature line",
    "Ontology-Atlas-1.2.3-aarch64.dSYM.zip": "symbols",
    "ontology-atlas_1.2.3_windows_x64-setup.exe": "installer bytes",
    "ontology-atlas-mcp-0.9.0.mcpb": "bundle bytes",
  };
  for (const name of ["ontology-atlas_1.2.3_aarch64.dmg", "ontology-atlas_1.2.3_windows_x64-setup.exe", "ontology-atlas-mcp-0.9.0.mcpb"]) {
    files[`${name}.sha256`] = `${sha(files[name])}  ${name}\n`;
  }
  return files;
}

function scenarioDefaults(overrides = {}) {
  const files = betaFiles();
  return {
    tags: { [BETA]: COMMIT, [STABLE]: COMMIT },
    prerelease: true,
    files,
    recorded: files,
    downloaded: files,
    extraBetaAssets: [],
    ...overrides,
  };
}

function setup(overrides) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), "atlas-promote-"));
  const scenario = scenarioDefaults(overrides);
  const statePath = path.join(root, "state.json");
  fs.writeFileSync(statePath, JSON.stringify({ created: null }));
  const bin = path.join(root, "fake-gh.mjs");
  fs.writeFileSync(
    bin,
    `#!/usr/bin/env node
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
const scenario = ${JSON.stringify(scenario)};
const statePath = ${JSON.stringify(statePath)};
const args = process.argv.slice(2);
const state = JSON.parse(fs.readFileSync(statePath, "utf8"));
const sha = (body) => crypto.createHash("sha256").update(body).digest("hex");
const out = (value) => process.stdout.write(JSON.stringify(value));
const assetsOf = (files) => Object.entries(files).map(([name, body]) => ({ name, digest: scenario.noDigests ? null : "sha256:" + sha(body) }));
const tagRef = /^repos\\/wlsdks\\/ontology-atlas\\/git\\/ref\\/tags\\/(.+)$/.exec(args[1] ?? "");
if (args[0] === "api" && tagRef) {
  const commit = scenario.tags[tagRef[1]];
  if (!commit) { process.stderr.write("HTTP 404: Not Found"); process.exit(1); }
  out({ object: { type: "commit", sha: commit } });
} else if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/releases/tags/${BETA}") {
  out({ tag_name: "${BETA}", draft: false, prerelease: scenario.prerelease, assets: [...assetsOf(scenario.recorded), ...scenario.extraBetaAssets] });
} else if (args[0] === "release" && args[1] === "download") {
  const dir = args[args.indexOf("--dir") + 1];
  for (const [name, body] of Object.entries(scenario.downloaded)) fs.writeFileSync(path.join(dir, name), body);
} else if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/releases?per_page=50") {
  out([{ tag_name: "${BETA}", draft: false, prerelease: true }, { tag_name: "v1.2.2", draft: false, prerelease: false }]);
} else if (args[0] === "release" && args[1] === "create") {
  const files = args.filter((arg) => arg.includes(path.sep) && fs.existsSync(arg));
  state.created = { args, files: Object.fromEntries(files.map((file) => [path.basename(file), fs.readFileSync(file, "utf8")])) };
  fs.writeFileSync(statePath, JSON.stringify(state));
} else if (args[0] === "api" && args[1] === "repos/wlsdks/ontology-atlas/releases?per_page=20") {
  out(state.created ? [{ tag_name: "${STABLE}", draft: true, assets: assetsOf(state.created.files) }] : []);
} else {
  process.stderr.write("unexpected gh call: " + args.join(" "));
  process.exit(2);
}
`,
  );
  fs.chmodSync(bin, 0o755);
  const run = (args) =>
    spawnSync(process.execPath, ["scripts/desktop-release/promote-beta-release.mjs", ...args], {
      encoding: "utf8",
      env: { ...process.env, OATLAS_GH_BIN: bin, GITHUB_OUTPUT: path.join(root, "github-output") },
    });
  const created = () => JSON.parse(fs.readFileSync(statePath, "utf8")).created;
  return { root, run, created, dir: path.join(root, "assets"), outputPath: path.join(root, "github-output") };
}

function withSetup(overrides, body) {
  const context = setup(overrides);
  try {
    body(context);
  } finally {
    fs.rmSync(context.root, { recursive: true, force: true });
  }
}

test("admit passes when both tags peel to one commit and the beta is a published pre-release", () => {
  withSetup({}, ({ run, outputPath }) => {
    const result = run(["--", `--from=${BETA}`, "--mode=admit", "--github-output"]);
    assert.equal(result.status, 0, result.stderr);
    assert.match(result.stdout, /both resolve to a{40}/);
    assert.equal(fs.readFileSync(outputPath, "utf8"), `release_tag=${STABLE}\nrelease_sha=${COMMIT}\n`);
  });
});

test("admit refuses two tags on different commits", () => {
  withSetup({ tags: { [BETA]: COMMIT, [STABLE]: OTHER_COMMIT } }, ({ run, outputPath }) => {
    const result = run([`--from=${BETA}`, "--mode=admit", "--github-output"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /v1\.2\.3 resolves to b{40} but v1\.2\.3-beta\.1 resolves to a{40}/);
    assert.match(result.stderr, /git tag v1\.2\.3 "v1\.2\.3-beta\.1\^\{commit\}"/);
    assert.equal(fs.existsSync(outputPath), false);
  });
});

test("admit refuses before the stable tag is pushed", () => {
  withSetup({ tags: { [BETA]: COMMIT } }, ({ run }) => {
    const result = run([`--from=${BETA}`, "--mode=admit"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /404/);
  });
});

test("admit refuses a beta that is not a pre-release or that carries latest.json", () => {
  withSetup({ prerelease: false }, ({ run }) => {
    const result = run([`--from=${BETA}`, "--mode=admit"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /is not a GitHub pre-release/);
  });
  withSetup({ extraBetaAssets: [{ name: "latest.json", digest: null }] }, ({ run }) => {
    const result = run([`--from=${BETA}`, "--mode=admit"]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /carries latest\.json; a beta release never does/);
  });
});

test("only a beta tag can be promoted", () => {
  withSetup({}, ({ run }) => {
    for (const from of [STABLE, "v1.2.3-rc.1", ""]) {
      const result = run([`--from=${from}`, "--mode=admit"]);
      assert.equal(result.status, 1, from);
      assert.match(result.stderr, /--from must name a beta tag/);
    }
  });
});

test("stage creates the stable draft from the beta's own bytes plus a manifest pinned to the stable tag", () => {
  withSetup({}, ({ run, created, dir }) => {
    const result = run([`--from=${BETA}`, "--mode=stage", `--dir=${dir}`]);
    assert.equal(result.status, 0, result.stderr);

    const release = created();
    assert.ok(release, "no draft was created");
    assert.deepEqual(release.args.slice(0, 10), ["release", "create", STABLE, "--repo", "wlsdks/ontology-atlas", "--draft", "--verify-tag", "--title", STABLE, "--generate-notes"]);
    assert.ok(release.args.includes("--notes-start-tag") && release.args.includes("v1.2.2"));
    assert.equal(release.args.includes("--target"), false, "promotion must not create or move a tag");

    const files = betaFiles();
    for (const [name, body] of Object.entries(files)) assert.equal(release.files[name], body, `${name} changed`);
    const manifest = JSON.parse(release.files["latest.json"]);
    assert.equal(manifest.version, "1.2.3");
    assert.deepEqual(Object.keys(manifest.platforms), ["darwin-aarch64"]);
    assert.equal(
      manifest.platforms["darwin-aarch64"].url,
      "https://github.com/wlsdks/ontology-atlas/releases/download/v1.2.3/ontology-atlas_1.2.3_aarch64.app.tar.gz",
    );
    assert.equal(manifest.platforms["darwin-aarch64"].signature, "minisign signature line");
    assert.equal(Object.keys(release.files).length, Object.keys(files).length + 1);
  });
});

test("stage refuses one changed byte in an asset and creates nothing", () => {
  const tampered = { ...betaFiles(), "ontology-atlas_1.2.3_aarch64.app.tar.gz": "updater archive byteS" };
  withSetup({ downloaded: tampered }, ({ run, created, dir }) => {
    const result = run([`--from=${BETA}`, "--mode=stage", `--dir=${dir}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ontology-atlas_1\.2\.3_aarch64\.app\.tar\.gz SHA-256 [0-9a-f]{64} differs from the [0-9a-f]{64} GitHub recorded/);
    assert.match(result.stderr, /Nothing was created/);
    assert.equal(created(), null);
  });
});

test("stage refuses a changed byte the .sha256 sibling catches when GitHub recorded no digest", () => {
  const tampered = { ...betaFiles(), "ontology-atlas_1.2.3_aarch64.dmg": "dmg byteS" };
  withSetup({ downloaded: tampered, noDigests: true }, ({ run, created, dir }) => {
    const result = run([`--from=${BETA}`, "--mode=stage", `--dir=${dir}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /ontology-atlas_1\.2\.3_aarch64\.dmg SHA-256 [0-9a-f]{64} differs from ontology-atlas_1\.2\.3_aarch64\.dmg\.sha256/);
    assert.equal(created(), null);
  });
});

test("stage refuses an asset whose bytes nothing can check", () => {
  withSetup({ noDigests: true }, ({ run, created, dir }) => {
    const result = run([`--from=${BETA}`, "--mode=stage", `--dir=${dir}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /has neither a GitHub digest nor a \.sha256 sibling/);
    assert.equal(created(), null);
  });
});

test("stage refuses a download that adds or drops a file", () => {
  const { "Ontology-Atlas-1.2.3-aarch64.dSYM.zip": _dropped, ...missing } = betaFiles();
  withSetup({ downloaded: missing }, ({ run, created, dir }) => {
    const result = run([`--from=${BETA}`, "--mode=stage", `--dir=${dir}`]);
    assert.equal(result.status, 1);
    assert.match(result.stderr, /differ from the beta's assets/);
    assert.equal(created(), null);
  });
});

test("the promotion script names no build, signing or tag-creating step", () => {
  const source = fs.readFileSync("scripts/desktop-release/promote-beta-release.mjs", "utf8");
  assert.doesNotMatch(source, /TAURI_SIGNING|APPLE_|codesign|notar|tauri build|desktop:release-artifact|git", \["tag|--target/);
});
