#!/usr/bin/env node
/**
 * Promotes a published beta release to the stable release of the same version, with the same bytes.
 * Nothing here builds or signs: `stage` downloads the beta's assets, checks every one against the
 * SHA-256 GitHub recorded for it and against its `.sha256` sibling, adds the one file a beta never
 * carries (`latest.json`, pinned to the stable tag), and creates the stable draft from those files.
 */
import { spawnSync } from "node:child_process";
import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

import { parseSha256Checksum } from "../lib/macos-artifact/macos-checksum.mjs";
import { isReleaseTag, parseReleaseTag } from "../lib/release-tag.mjs";
import { validateHostedUpdaterManifest } from "../download/stage-hosted-updater-manifest.mjs";
import { buildManifest, findUpdaterArtifacts } from "./build-updater-manifest.mjs";
import { resolveTagCommit } from "./tag-commit.mjs";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const MANIFEST = "latest.json";

function printHelp() {
  console.log(`Usage: pnpm desktop:release-promote -- --from=vX.Y.Z-beta.N --mode=admit [--github-output] [--repo=${DEFAULT_REPO}]
       pnpm desktop:release-promote -- --from=vX.Y.Z-beta.N --mode=stage --dir=PATH [--repo=${DEFAULT_REPO}]
       pnpm desktop:release-promote -- --from=vX.Y.Z-beta.N --mode=verify [--repo=${DEFAULT_REPO}]

admit writes nothing. It refuses unless vX.Y.Z and the beta tag peel to one
commit; the beta release is published, a GitHub pre-release, carries no
latest.json, and has no asset uploaded after it was published; no newer beta of
X.Y.Z is published; and no stable release is at X.Y.Z or above.
--github-output appends release_tag and release_sha.

stage downloads every asset of the beta release into PATH, which must be absent
or empty, checks each against the SHA-256 GitHub recorded and against its .sha256
sibling, builds latest.json pinned to vX.Y.Z, and creates the draft vX.Y.Z
release from exactly those files. It never builds, signs or creates a tag: push
vX.Y.Z at the beta's commit first.

verify writes nothing. It refuses unless the draft vX.Y.Z holds exactly the beta's
assets plus latest.json, every one with a SHA-256 GitHub recorded, and each beta
asset's digest equal on both releases.
`);
}

function fail(message) {
  console.error(`[release-promote] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  const options = { repo: DEFAULT_REPO, from: "", mode: "", dir: "", githubOutput: false };
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--github-output") options.githubOutput = true;
    else if (arg.startsWith("--repo=")) options.repo = arg.slice("--repo=".length).trim();
    else if (arg.startsWith("--from=")) options.from = arg.slice("--from=".length).trim();
    else if (arg.startsWith("--mode=")) options.mode = arg.slice("--mode=".length).trim();
    else if (arg.startsWith("--dir=")) options.dir = arg.slice("--dir=".length).trim();
    else fail(`unknown argument: ${arg}`);
  }
  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) fail("--repo must use owner/name format.");
  if (!isReleaseTag(options.from) || parseReleaseTag(options.from).channel !== "beta") {
    fail(`--from must name a beta tag vX.Y.Z-beta.N, got ${options.from || "(empty)"}.`);
  }
  if (!["admit", "stage", "verify"].includes(options.mode)) fail("--mode must be admit, stage or verify.");
  if (options.mode === "stage" && !options.dir) fail("--mode=stage needs --dir for the downloaded assets.");
  return options;
}

function gh(args, { json = false } = {}) {
  const result = spawnSync(process.env.OATLAS_GH_BIN || "gh", args, {
    encoding: "utf8",
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) fail(`failed to run gh ${args.join(" ")}: ${result.error.message}`);
  if (result.status !== 0) fail(`gh ${args.join(" ")} failed: ${(result.stderr || result.stdout).trim()}`);
  if (!json) return result.stdout;
  try {
    return JSON.parse(result.stdout);
  } catch (error) {
    fail(`gh ${args.join(" ")} returned invalid JSON: ${error.message}`);
  }
  return null;
}

/** The tags endpoint returns published releases only, so a draft beta reads as missing here. */
function readPublishedRelease(repo, tag) {
  return gh(["api", `repos/${repo}/releases/tags/${tag}`], { json: true });
}

function requirePromotableBeta(release, betaTag) {
  if (!release || release.tag_name !== betaTag) fail(`GitHub returned no published release for ${betaTag}.`);
  if (release.draft === true) fail(`${betaTag} is still a draft; publish the beta before promoting it.`);
  if (release.prerelease !== true) {
    fail(`${betaTag} is not a GitHub pre-release, so it is not a beta release this command can promote.`);
  }
  const assets = Array.isArray(release.assets) ? release.assets : [];
  if (assets.some((asset) => asset?.name === MANIFEST)) {
    fail(`${betaTag} carries ${MANIFEST}; a beta release never does. Delete the asset and find the stage that uploaded it.`);
  }
  if (assets.length === 0) fail(`${betaTag} has no assets to promote.`);
  const publishedAt = Date.parse(release.published_at ?? "");
  if (!Number.isFinite(publishedAt)) fail(`${betaTag} has no publication time to compare its assets with.`);
  const late = assets.filter((asset) => !(Date.parse(asset?.created_at ?? "") <= publishedAt)).map((asset) => asset?.name);
  if (late.length > 0) {
    fail(
      `${betaTag} has assets uploaded after it was published (${late.join(", ")}): they are not the bytes anyone installed as the beta. Cut a new beta instead.`,
    );
  }
  return assets;
}

function compareVersions(a, b) {
  const left = a.split(".").map(Number);
  const right = b.split(".").map(Number);
  for (let index = 0; index < 3; index += 1) {
    if (left[index] !== right[index]) return left[index] - right[index];
  }
  return 0;
}

/** A newer beta of the same version, or a stable release at or above it, makes this beta stale. */
function requireNotSuperseded(releases, betaTag) {
  const beta = parseReleaseTag(betaTag);
  for (const release of Array.isArray(releases) ? releases : []) {
    if (release?.draft !== false || !isReleaseTag(release?.tag_name)) continue;
    const other = parseReleaseTag(release.tag_name);
    if (other.channel === "beta" && other.version === beta.version && other.beta > beta.beta) {
      fail(`${release.tag_name} is published after ${betaTag}; promote the newest beta of ${beta.version}.`);
    }
    if (other.channel === "stable" && compareVersions(other.version, beta.version) >= 0) {
      fail(`stable release ${release.tag_name} is already published at or above ${beta.version}; ${betaTag} is superseded.`);
    }
  }
}

/**
 * The stable draft must hold the beta's assets and `latest.json`, each with the digest GitHub
 * recorded, and every beta asset's digest must be equal on both releases. A missing digest fails.
 */
function compareDraftWithBeta(betaAssets, draftAssets, stableTag) {
  const draft = new Map((draftAssets ?? []).map((asset) => [asset.name, asset]));
  const expected = [...betaAssets.map((asset) => asset.name), MANIFEST].sort();
  if (JSON.stringify([...draft.keys()].sort()) !== JSON.stringify(expected)) {
    fail(`the draft ${stableTag} holds ${[...draft.keys()].sort().join(", ")}, not ${expected.join(", ")}.`);
  }
  for (const [name, asset] of draft) {
    if (!recordedDigest(asset)) fail(`the draft ${stableTag} asset ${name} has no SHA-256 recorded by GitHub.`);
  }
  for (const asset of betaAssets) {
    const beta = recordedDigest(asset);
    if (!beta) fail(`the beta asset ${asset.name} has no SHA-256 recorded by GitHub to compare the draft with.`);
    const promoted = recordedDigest(draft.get(asset.name));
    if (promoted !== beta) fail(`the draft ${stableTag} asset ${asset.name} has SHA-256 ${promoted}, not the beta's ${beta}.`);
  }
}

function readDraft(repo, stableTag) {
  const drafts = gh(["api", `repos/${repo}/releases?per_page=20`], { json: true });
  const draft = (Array.isArray(drafts) ? drafts : []).find((release) => release?.tag_name === stableTag && release?.draft === true);
  if (!draft) fail(`no draft ${stableTag} release exists.`);
  return draft;
}

function admit(options) {
  const { stableTag } = parseReleaseTag(options.from);
  const betaSha = resolveTagCommit({ repo: options.repo, tag: options.from, readJson: (args) => gh(args, { json: true }), fail });
  const stableSha = resolveTagCommit({ repo: options.repo, tag: stableTag, readJson: (args) => gh(args, { json: true }), fail });
  if (betaSha !== stableSha) {
    fail(
      `${stableTag} resolves to ${stableSha} but ${options.from} resolves to ${betaSha}; promotion publishes the beta's own commit. ` +
        `Delete ${stableTag} and push it again with: git tag ${stableTag} "${options.from}^{commit}" && git push origin ${stableTag}`,
    );
  }
  requirePromotableBeta(readPublishedRelease(options.repo, options.from), options.from);
  requireNotSuperseded(gh(["api", `repos/${options.repo}/releases?per_page=100`], { json: true }), options.from);
  if (options.githubOutput) {
    if (!process.env.GITHUB_OUTPUT) fail("--github-output needs GITHUB_OUTPUT to name a file.");
    fs.appendFileSync(process.env.GITHUB_OUTPUT, `release_tag=${stableTag}\nrelease_sha=${betaSha}\n`);
  }
  console.log(`[release-promote] ${options.from} and ${stableTag} both resolve to ${betaSha}; the beta release is published, a pre-release, the newest of ${stableTag.slice(1)}, and carries no ${MANIFEST}`);
}

function sha256Of(file) {
  return crypto.createHash("sha256").update(fs.readFileSync(file)).digest("hex");
}

/** GitHub's `digest` is `sha256:<hex>`; an asset uploaded before GitHub recorded digests has none. */
function recordedDigest(asset) {
  const match = /^sha256:([0-9a-f]{64})$/i.exec(asset?.digest ?? "");
  return match ? match[1].toLowerCase() : null;
}

/**
 * Every file must match what GitHub recorded for the beta's asset, and a file with a `.sha256`
 * sibling must match that too. A file neither covers is refused: its bytes cannot be told apart
 * from other bytes.
 */
function verifyDownloadedAssets(dir, assets) {
  const names = assets.map((asset) => asset.name).sort();
  const files = fs.readdirSync(dir).sort();
  if (JSON.stringify(files) !== JSON.stringify(names)) {
    throw new Error(`downloaded files ${files.join(", ") || "(none)"} differ from the beta's assets ${names.join(", ")}`);
  }
  const hashes = new Map();
  for (const asset of assets) {
    const file = path.join(dir, asset.name);
    const actual = sha256Of(file);
    hashes.set(asset.name, actual);
    const recorded = recordedDigest(asset);
    if (recorded && recorded !== actual) {
      throw new Error(`${asset.name} SHA-256 ${actual} differs from the ${recorded} GitHub recorded for the beta asset`);
    }
    const siblingName = `${asset.name}.sha256`;
    const sibling = assets.find((candidate) => candidate.name === siblingName);
    if (sibling) {
      const { checksum } = parseSha256Checksum(fs.readFileSync(path.join(dir, siblingName), "utf8"), {
        expectedFilename: asset.name,
      });
      if (checksum !== actual) {
        throw new Error(`${asset.name} SHA-256 ${actual} differs from ${siblingName} (${checksum})`);
      }
    }
    if (!recorded && !sibling && !asset.name.endsWith(".sha256")) {
      throw new Error(`${asset.name} has neither a GitHub digest nor a .sha256 sibling, so its bytes cannot be checked`);
    }
  }
  return hashes;
}

function verify(options) {
  const { stableTag } = parseReleaseTag(options.from);
  const assets = requirePromotableBeta(readPublishedRelease(options.repo, options.from), options.from);
  compareDraftWithBeta(assets, readDraft(options.repo, stableTag).assets, stableTag);
  console.log(`[release-promote] draft ${stableTag} holds the ${assets.length} assets of ${options.from} with equal SHA-256 digests, plus ${MANIFEST}`);
}

function newestStableTag(releases, exclude) {
  const stable = (Array.isArray(releases) ? releases : []).find(
    (release) =>
      release?.draft === false &&
      release?.prerelease === false &&
      release?.tag_name !== exclude &&
      isReleaseTag(release?.tag_name) &&
      parseReleaseTag(release.tag_name).channel === "stable",
  );
  return stable?.tag_name ?? null;
}

function stage(options) {
  const { stableTag, version } = parseReleaseTag(options.from);
  const assets = requirePromotableBeta(readPublishedRelease(options.repo, options.from), options.from);

  if (fs.existsSync(options.dir) && fs.readdirSync(options.dir).length > 0) {
    fail(`--dir ${options.dir} already holds files; name an absent or empty directory.`);
  }
  fs.mkdirSync(options.dir, { recursive: true });
  gh(["release", "download", options.from, "--repo", options.repo, "--dir", options.dir]);

  let hashes;
  try {
    hashes = verifyDownloadedAssets(options.dir, assets);
  } catch (error) {
    fail(`${options.from}: ${error.message}. Nothing was created.`);
  }

  const updater = findUpdaterArtifacts(options.dir);
  if (!updater) fail(`${options.from} has no .app.tar.gz updater archive to point ${MANIFEST} at.`);
  const manifest = buildManifest({
    version,
    pubDate: new Date().toISOString(),
    notes: "",
    repo: options.repo,
    tag: stableTag,
    platforms: {
      aarch64: { archiveName: updater.archiveName, signature: fs.readFileSync(updater.signaturePath, "utf8").trim() },
    },
  });
  try {
    validateHostedUpdaterManifest(manifest, stableTag, options.repo);
  } catch (error) {
    fail(error.message);
  }
  const manifestPath = path.join(options.dir, MANIFEST);
  fs.writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);

  const previous = newestStableTag(gh(["api", `repos/${options.repo}/releases?per_page=50`], { json: true }), stableTag);
  const files = [...hashes.keys()].sort().map((name) => path.join(options.dir, name));
  gh([
    "release", "create", stableTag, "--repo", options.repo, "--draft", "--verify-tag", "--title", stableTag,
    "--generate-notes", ...(previous ? ["--notes-start-tag", previous] : []),
    ...files, manifestPath,
  ]);

  const draft = readDraft(options.repo, stableTag);
  compareDraftWithBeta(assets, draft.assets, stableTag);
  const uploaded = new Map(draft.assets.map((asset) => [asset.name, asset]));
  for (const [name, hash] of hashes) {
    if (recordedDigest(uploaded.get(name)) !== hash) fail(`the draft ${stableTag} asset ${name} is not the ${hash} downloaded from the beta.`);
  }

  console.log(`[release-promote] draft ${stableTag} holds the ${hashes.size} assets of ${options.from} unchanged, plus ${MANIFEST} pinned to ${stableTag}`);
  for (const [name, hash] of [...hashes].sort(([a], [b]) => a.localeCompare(b))) {
    console.log(`[release-promote]   ${name} ${hash}`);
  }
}

if (import.meta.url === pathToFileURL(process.argv[1] ?? "").href) {
  const options = parseArgs(process.argv.slice(2));
  if (options.mode === "admit") admit(options);
  else if (options.mode === "stage") stage(options);
  else verify(options);
}
