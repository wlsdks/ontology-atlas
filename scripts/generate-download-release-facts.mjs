#!/usr/bin/env node
/**
 * Fill `/download`'s macOS release facts from the real published GitHub
 * Release.
 *
 * The download page may only state a DMG size and a SHA-256 that actually
 * exist. Rather than hand-copying them out of a release page (which drifts
 * the moment a new version ships), this reads the release the workflow just
 * published and writes a generated module the page imports.
 *
 * Usage:
 *   pnpm download:release-facts                 # tag defaults to v<package.json version>
 *   pnpm download:release-facts -- --tag=v1.0.0
 *   pnpm download:release-facts -- --unpublished  # reset to the pre-release state
 *   pnpm download:release-facts -- --tag=v1.0.0-rc.4 --allow-missing-windows
 *   pnpm download:release-facts:check           # committed facts vs the newest published release
 *
 * ⚠️ **`--check` exists because the write half is not enough.** The release
 * workflow generates this module but cannot commit it: the release token may
 * not push to protected `main`, so it uploads the file as an artifact for a
 * person to apply in an ordinary pull request. On 2026-08-29 the owner found
 * the download page still naming `v1.0.0-rc.14` while `v1.0.0-rc.15` had been
 * published and the repository was already on `rc.16` — the handoff had simply
 * been forgotten, twice, and nothing anywhere went red. `--check` regenerates
 * the module for the newest published release and compares it with the
 * committed one, so the forgotten handoff fails the release gate instead of
 * quietly telling visitors to download an older build.
 *
 * Requires the `gh` CLI to be authenticated for a private/unpublished draft;
 * a public release needs no auth.
 */

import { execFileSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { parseSha256Checksum } from "./lib/macos-checksum.mjs";

const ROOT = process.cwd();
const OUTPUT_PATH = path.join(
  ROOT,
  "src",
  "views",
  "download",
  "model",
  "macos-release.generated.ts",
);
const REPOSITORY = "wlsdks/ontology-atlas";
const RELEASES_URL = `https://github.com/${REPOSITORY}/releases`;
const DMG_NAME_PATTERN = /^ontology-atlas_(?<version>[^_]+)_(?<arch>aarch64|x64)\.dmg$/;
const WINDOWS_NAME_PATTERN = /^ontology-atlas_(?<version>[^_]+)_windows_(?<arch>x64)-setup\.exe$/;

function fail(message) {
  console.error(`[download-release-facts] ${message}`);
  process.exit(1);
}

function parseArgs(argv) {
  let tag = "";
  let unpublished = false;
  let allowPrerelease = false;
  let allowDraft = false;
  let allowMissingWindows = false;
  let check = false;
  for (const arg of argv) {
    if (arg === "--") continue;
    if (arg === "--help" || arg === "-h") {
      console.log(
        `Usage: pnpm download:release-facts [-- --tag=vX.Y.Z] [--unpublished] [--allow-draft] [--allow-prerelease] [--allow-missing-windows] [--check]\n\n` +
          `--check writes nothing. It regenerates the module for the newest published\n` +
          `release (or --tag) and fails when the committed file differs, so a release\n` +
          `whose facts were never applied cannot ship quietly.\n`,
      );
      process.exit(0);
    }
    if (arg === "--unpublished") {
      unpublished = true;
      continue;
    }
    if (arg === "--allow-prerelease") {
      allowPrerelease = true;
      continue;
    }
    if (arg === "--allow-draft") {
      allowDraft = true;
      continue;
    }
    if (arg === "--allow-missing-windows") {
      allowMissingWindows = true;
      continue;
    }
    if (arg === "--check") {
      check = true;
      continue;
    }
    if (arg.startsWith("--tag=")) {
      tag = arg.slice("--tag=".length).trim();
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }
  return { tag, unpublished, allowDraft, allowPrerelease, allowMissingWindows, check };
}

function defaultTag() {
  const pkg = JSON.parse(fs.readFileSync(path.join(ROOT, "package.json"), "utf8"));
  return `v${pkg.version}`;
}

/**
 * The newest release a visitor can actually download.
 *
 * `--check` cannot default to the package version the way writing does: between
 * the version bump and the release that follows it, the repository is ahead of
 * every published build, and comparing against a tag nobody has published yet
 * would fail for the one reason that is not a mistake. What the page owes its
 * reader is the newest **published** release, draft or not-yet-run releases
 * excluded, so that is what the check regenerates from.
 */
function latestPublishedTag() {
  const tagName = gh([
    "api",
    `repos/${REPOSITORY}/releases`,
    "--jq",
    "[.[] | select(.draft == false)] | first | .tag_name // \"\"",
  ]).trim();
  if (!tagName) {
    fail(`${REPOSITORY} has no published (non-draft) release to compare against.`);
  }
  return tagName;
}

function gh(args) {
  try {
    return execFileSync("gh", args, { encoding: "utf8", maxBuffer: 32 * 1024 * 1024 });
  } catch (error) {
    const stderr = typeof error?.stderr === "string" ? error.stderr.trim() : "";
    fail(`gh ${args.join(" ")} failed${stderr ? `: ${stderr}` : ""}`);
    return "";
  }
}

/**
 * The workflow uploads `<dmg>.sha256` beside every DMG, in `shasum` output
 * form (`<hash>  <filename>`). Taking the hash from that published asset —
 * rather than recomputing it locally — means the page shows exactly the
 * checksum a user verifies against.
 */
function sha256FromChecksumAsset(assetId, expectedFilename) {
  const body = gh([
    "api",
    `repos/${REPOSITORY}/releases/assets/${assetId}`,
    "-H",
    "Accept: application/octet-stream",
  ]);
  try {
    return parseSha256Checksum(body, { expectedFilename }).checksum;
  } catch (error) {
    fail(
      `checksum asset ${assetId} is invalid: ${error instanceof Error ? error.message : String(error)}`,
    );
    return "";
  }
}

function stringLiteral(value, label) {
  if (typeof value !== "string") {
    fail(`${label} must be a string.`);
  }
  return JSON.stringify(value);
}

function sizeLiteral(value, label) {
  if (!Number.isSafeInteger(value) || value < 0) {
    fail(`${label} must be a non-negative safe integer.`);
  }
  return String(value);
}

function renderModule(release) {
  const assets = release.assets
    .map(
      (asset) => `    {
      arch: ${stringLiteral(asset.arch, "macOS asset architecture")},
      fileName: ${stringLiteral(asset.fileName, "macOS asset filename")},
      sizeBytes: ${sizeLiteral(asset.sizeBytes, "macOS asset size")},
      sha256: ${stringLiteral(asset.sha256, "macOS asset checksum")},
      downloadUrl: ${stringLiteral(asset.downloadUrl, "macOS asset download URL")},
    },`,
    )
    .join("\n");
  const windowsAssets = release.windowsAssets
    .map(
      (asset) => `    {
      arch: ${stringLiteral(asset.arch, "Windows asset architecture")},
      fileName: ${stringLiteral(asset.fileName, "Windows asset filename")},
      sizeBytes: ${sizeLiteral(asset.sizeBytes, "Windows asset size")},
      sha256: ${stringLiteral(asset.sha256, "Windows asset checksum")},
      downloadUrl: ${stringLiteral(asset.downloadUrl, "Windows asset download URL")},
      signed: false,
    },`,
    )
    .join("\n");

  return `// Generated by \`pnpm download:release-facts\` — do not edit by hand.
//
// Source of truth: the published GitHub Release for the tag below. The
// generator reads each desktop asset's real byte size and download URL, and
// its real SHA-256 from the sibling \`.sha256\` asset that the release workflow
// uploads. Nothing here is hand-typed, so \`/download\` can state a size and a
// checksum without inventing either.
//
// \`published: false\` is the honest pre-release state: the page then says the
// build is not out yet instead of rendering placeholder facts. Re-run the
// generator after the release publishes and commit the result.

export interface MacosReleaseAsset {
  readonly arch: 'aarch64' | 'x64';
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly downloadUrl: string;
}

export interface MacosRelease {
  readonly published: boolean;
  /**
   * Whether this release is a **candidate** rather than a final one. The page says
   * so rather than hiding it: that a build passed the same signing and
   * notarisation path but has not been widely used yet is something the person
   * downloading needs to know beforehand.
   */
  readonly prerelease: boolean;
  readonly tag: string;
  readonly publishedAt: string | null;
  readonly releaseUrl: string;
  readonly assets: readonly MacosReleaseAsset[];
}

export interface WindowsReleaseAsset {
  readonly arch: 'x64';
  readonly fileName: string;
  readonly sizeBytes: number;
  readonly sha256: string;
  readonly downloadUrl: string;
  /** Authenticode status verified by the Windows release job. */
  readonly signed: false;
}

export interface WindowsRelease {
  readonly published: boolean;
  readonly prerelease: boolean;
  readonly tag: string;
  readonly publishedAt: string | null;
  readonly releaseUrl: string;
  readonly assets: readonly WindowsReleaseAsset[];
}

export const MACOS_RELEASE: MacosRelease = {
  published: ${release.published},
  prerelease: ${release.prerelease === true},
  tag: ${stringLiteral(release.tag, "release tag")},
  publishedAt: ${release.publishedAt === null ? "null" : stringLiteral(release.publishedAt, "release publication time")},
  releaseUrl: ${stringLiteral(release.releaseUrl, "release URL")},
  assets: [${assets ? `\n${assets}\n  ` : ""}],
};

export const WINDOWS_RELEASE: WindowsRelease = {
  published: ${release.published && release.windowsAssets.length > 0},
  prerelease: ${release.prerelease === true},
  tag: ${stringLiteral(release.tag, "release tag")},
  publishedAt: ${release.publishedAt === null ? "null" : stringLiteral(release.publishedAt, "release publication time")},
  releaseUrl: ${stringLiteral(release.releaseUrl, "release URL")},
  assets: [${windowsAssets ? `\n${windowsAssets}\n  ` : ""}],
};
`;
}

/** The tag the committed module currently advertises, for a message worth reading. */
function committedTag() {
  if (!fs.existsSync(OUTPUT_PATH)) return "nothing committed";
  const text = fs.readFileSync(OUTPUT_PATH, "utf8");
  const match = text.match(/MACOS_RELEASE[\s\S]*?tag:\s*"([^"]+)"/);
  return match ? match[1] : "unreadable";
}

/**
 * `--check`: regenerate into memory and compare, never write.
 *
 * Byte comparison rather than a tag comparison, because a re-cut release keeps
 * its tag while its assets, sizes, and checksums change — and a page publishing
 * a checksum that no longer matches the file behind it is worse than one naming
 * an old version.
 */
function compareModule(release) {
  const expected = renderModule(release);
  const actual = fs.existsSync(OUTPUT_PATH) ? fs.readFileSync(OUTPUT_PATH, "utf8") : "";
  const relative = path.relative(ROOT, OUTPUT_PATH);
  if (actual === expected) {
    console.log(
      `[download-release-facts] ${relative} matches the published ${release.tag} — ${release.assets.length} DMG asset(s), ${release.windowsAssets.length} Windows asset(s)`,
    );
    return;
  }
  fail(
    `${relative} does not describe the newest published release.\n` +
      `  committed: ${committedTag()}\n` +
      `  published: ${release.tag}\n` +
      `The release workflow uploads this file as an artifact because its token cannot push to main.\n` +
      `Apply it, or regenerate locally:\n` +
      `  pnpm download:release-facts -- --tag=${release.tag}${release.prerelease ? " --allow-prerelease" : ""}`,
  );
}

function writeModule(release) {
  fs.writeFileSync(OUTPUT_PATH, renderModule(release), "utf8");
  const relative = path.relative(ROOT, OUTPUT_PATH);
  if (release.published) {
    console.log(
      `[download-release-facts] wrote ${relative} — ${release.tag}, ${release.assets.length} DMG asset(s), ${release.windowsAssets.length} Windows asset(s)`,
    );
    for (const asset of release.assets) {
      console.log(
        `[download-release-facts]   ${asset.fileName} · ${asset.sizeBytes} bytes · ${asset.sha256}`,
      );
    }
    for (const asset of release.windowsAssets) {
      console.log(
        `[download-release-facts]   ${asset.fileName} · ${asset.sizeBytes} bytes · ${asset.sha256}`,
      );
    }
  } else {
    console.log(`[download-release-facts] wrote ${relative} — pre-release state for ${release.tag}`);
  }
}

const { tag: tagArg, unpublished, allowDraft, allowPrerelease, allowMissingWindows, check } =
  parseArgs(process.argv.slice(2));

if (check && unpublished) {
  fail("--check and --unpublished ask for opposite things: one compares, the other rewrites.");
}

const tag = tagArg || (check ? latestPublishedTag() : defaultTag());

/**
 * `--check` does not re-litigate the prerelease decision.
 *
 * Blocking a prerelease is an editorial guard on the *write* — nobody should
 * advertise an RC by accident. Whether this page features one has already been
 * decided by whoever ran the write with `--allow-prerelease`; the check's only
 * question is whether the committed facts still describe what is published.
 */
const emit = check ? compareModule : writeModule;
const prereleaseAllowed = allowPrerelease || check;

if (!/^v/.test(tag)) {
  fail(`release tag must be v-prefixed, got ${tag}.`);
}

if (unpublished) {
  emit({
    published: false,
    prerelease: false,
    tag,
    publishedAt: null,
    releaseUrl: RELEASES_URL,
    assets: [],
    windowsAssets: [],
  });
  process.exit(0);
}

const release = JSON.parse(
  gh([
    "api",
    `repos/${REPOSITORY}/releases/tags/${tag}`,
    "--jq",
    "{draft, prerelease, published_at, html_url, assets: [.assets[] | {id, name, size, browser_download_url}]}",
  ]),
);

if (release.draft && !allowDraft) {
  fail(
    `release ${tag} is still a draft — publish it first, or pass --allow-draft to record draft facts.`,
  );
}

/**
 * A prerelease is not what this page advertises.
 *
 * This script queried `prerelease` but never used it. In that state, running it
 * after publishing an RC stamped `published: true` and **the download page
 * presented a release candidate as the official build.** That is why GitHub
 * excludes prereleases from `releases/latest` — an RC is for people who came
 * looking for it, not something to push at a first-time visitor.
 *
 * Blocked, but with a door: deliberately featuring an RC has to be said with a
 * flag.
 */
if (release.prerelease && !prereleaseAllowed) {
  fail(
    `release ${tag} is a prerelease — the download page advertises the stable build.\n` +
      `프리릴리스를 일부러 걸려면 --allow-prerelease 를 붙여라. 정식 릴리스를 기다리는 중이면 --unpublished 로 두라.`,
  );
}

const checksumAssets = new Map(
  release.assets
    .filter((asset) => asset.name.endsWith(".dmg.sha256"))
    .map((asset) => [asset.name.replace(/\.sha256$/, ""), asset]),
);
const windowsChecksumAssets = new Map(
  release.assets
    .filter((asset) => asset.name.endsWith('.exe.sha256'))
    .map((asset) => [asset.name.replace(/\.sha256$/, ''), asset]),
);

const assets = release.assets
  .filter((asset) => DMG_NAME_PATTERN.test(asset.name))
  .map((asset) => {
    const match = asset.name.match(DMG_NAME_PATTERN);
    if (match.groups.version !== tag.slice(1)) {
      fail(`release ${tag} has mismatched macOS asset version: ${asset.name}.`);
    }
    const checksumAsset = checksumAssets.get(asset.name);
    if (!checksumAsset) {
      fail(`release ${tag} has ${asset.name} but no ${asset.name}.sha256 beside it.`);
    }
    return {
      arch: match.groups.arch,
      fileName: asset.name,
      sizeBytes: asset.size,
      sha256: sha256FromChecksumAsset(checksumAsset.id, asset.name),
      downloadUrl: asset.browser_download_url,
    };
  })
  // Apple Silicon first, matching the page's ARCH_ORDER.
  .sort((a, b) => (a.arch === b.arch ? 0 : a.arch === "aarch64" ? -1 : 1));

if (assets.length === 0) {
  fail(`release ${tag} has no ontology-atlas_<version>_<arch>.dmg assets.`);
}

const windowsAssets = release.assets
  .filter((asset) => WINDOWS_NAME_PATTERN.test(asset.name))
  .map((asset) => {
    const match = asset.name.match(WINDOWS_NAME_PATTERN);
    if (match.groups.version !== tag.slice(1)) {
      fail(`release ${tag} has mismatched Windows asset version: ${asset.name}.`);
    }
    const checksumAsset = windowsChecksumAssets.get(asset.name);
    if (!checksumAsset) {
      fail(`release ${tag} has ${asset.name} but no ${asset.name}.sha256 beside it.`);
    }
    return {
      arch: match.groups.arch,
      fileName: asset.name,
      sizeBytes: asset.size,
      sha256: sha256FromChecksumAsset(checksumAsset.id, asset.name),
      downloadUrl: asset.browser_download_url,
    };
  });

if (windowsAssets.length !== 1 && !(allowMissingWindows && windowsAssets.length === 0)) {
  fail(`release ${tag} must have exactly one ontology-atlas_<version>_windows_x64-setup.exe asset, found ${windowsAssets.length}.`);
}

emit({
  published: true,
  prerelease: release.prerelease === true,
  tag,
  publishedAt: release.published_at ?? null,
  releaseUrl: release.html_url ?? RELEASES_URL,
  assets,
  windowsAssets,
});
