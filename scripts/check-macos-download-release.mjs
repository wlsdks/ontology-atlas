#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

import { LAST_INTEL_VERSION, isAfterLastIntel } from "./lib/last-intel-release.mjs";
import { updaterArchiveName } from "./stage-macos-release-assets.mjs";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const DEFAULT_API_BASE = "https://api.github.com";
const REQUIRED_MACOS_ARCHES = ["aarch64"];
const DMG_NAME_PATTERN = /^ontology-atlas_([^/]+)_(aarch64|x64)\.dmg$/;
const WINDOWS_NAME_PATTERN = /^ontology-atlas_([^/]+)_windows_(x64)-setup\.exe$/;
/** The key an installed app uses to find its own slot in `latest.json`. A Rust target name. */
const REQUIRED_UPDATER_PLATFORMS = ["darwin-aarch64"];
const MAX_DOWNLOAD_HASH_BYTES = 2 * 1024 * 1024 * 1024;

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-download [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] [--allow-draft] [--require-updater]

Verifies that a public GitHub Release exposes a reachable Apple Silicon
(aarch64) macOS DMG, exactly one per architecture, and
one Windows x64 setup executable, all with matching .sha256 checksums. With
--require-updater it also opens latest.json and
checks that every platform URL points at an archive (and .sig) that actually
exists in this release. Draft releases are never accepted because the
hosted landing page cannot serve them as a real user download unless
--allow-draft is explicitly passed for the pre-publish CI gate.
A release GitHub marks as a pre-release is always refused.
`);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: null,
    allowDraft: false,
    requireUpdater: false,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--allow-draft") {
      options.allowDraft = true;
      continue;
    }
    if (arg === "--require-updater") {
      options.requireUpdater = true;
      continue;
    }
    if (arg.startsWith("--repo=")) {
      options.repo = arg.slice("--repo=".length).trim();
      continue;
    }
    if (arg.startsWith("--tag=")) {
      options.tag = arg.slice("--tag=".length).trim();
      continue;
    }
    fail(`unknown argument: ${arg}`);
  }

  if (!/^[^/\s]+\/[^/\s]+$/.test(options.repo)) {
    fail("--repo must use owner/name format.");
  }
  if (options.tag !== null && options.tag.length === 0) {
    fail("--tag must not be empty.");
  }
  return options;
}

function fail(message) {
  console.error(`[desktop-download-verify] ${message}`);
  process.exit(1);
}

function apiBase() {
  return (process.env.OATLAS_GITHUB_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

function githubToken() {
  return (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
}

function userAgentHeaders(extra = {}) {
  return {
    "User-Agent": "ontology-atlas-desktop-download-verify",
    ...extra,
  };
}

function githubApiHeaders(extra = {}) {
  const headers = {
    Accept: "application/vnd.github+json",
    ...userAgentHeaders({
      "X-GitHub-Api-Version": "2022-11-28",
    }),
    ...extra,
  };
  const token = githubToken();
  if (token) {
    headers.Authorization = `Bearer ${token}`;
  }
  return headers;
}

function githubAssetHeaders() {
  return githubApiHeaders({ Accept: "application/octet-stream" });
}

function headersForRedirect(headers, fromUrl, toUrl) {
  if (new URL(fromUrl).origin === new URL(toUrl).origin) return headers;
  const sensitive = new Set(["authorization", "cookie", "proxy-authorization"]);
  return Object.fromEntries(
    Object.entries(headers).filter(([name]) => !sensitive.has(name.toLowerCase())),
  );
}

function requestRaw(url, { headers = {}, method = "GET", maxBytes = 1024 * 1024, redirects = 5 } = {}) {
  const parsed = new URL(url);
  const client = parsed.protocol === "http:" ? http : https;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Promise.reject(new Error(`unsupported URL protocol: ${parsed.protocol}`));
  }

  return new Promise((resolve, reject) => {
    const req = client.request(url, { headers, method }, (res) => {
      const statusCode = res.statusCode ?? 0;
      const location = res.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume();
        if (redirects <= 0) {
          reject(new Error(`too many redirects while requesting ${url}`));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        requestRaw(nextUrl, {
          headers: headersForRedirect(headers, url, nextUrl),
          method,
          maxBytes,
          redirects: redirects - 1,
        })
          .then(resolve, reject);
        return;
      }

      const chunks = [];
      let size = 0;
      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error(`response exceeded ${maxBytes} bytes from ${url}`));
          return;
        }
        chunks.push(chunk);
      });
      res.on("end", () => {
        if (statusCode < 200 || statusCode >= 300) {
          reject(
            new Error(
              `${method} ${url} failed with ${statusCode}: ${Buffer.concat(chunks)
                .toString("utf8")
                .slice(0, 500)}`,
            ),
          );
          return;
        }
        resolve({
          statusCode,
          headers: res.headers,
          body: Buffer.concat(chunks),
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function requestJson(url) {
  return requestRaw(url, { headers: githubApiHeaders(), maxBytes: 1024 * 1024 }).then(({ body }) => {
    try {
      return JSON.parse(body.toString("utf8"));
    } catch (error) {
      throw new Error(`GitHub API returned invalid JSON: ${error.message}`);
    }
  });
}

function requestSha256(url, { headers = {}, maxBytes = MAX_DOWNLOAD_HASH_BYTES, redirects = 5 } = {}) {
  const parsed = new URL(url);
  const client = parsed.protocol === "http:" ? http : https;
  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    return Promise.reject(new Error(`unsupported URL protocol: ${parsed.protocol}`));
  }

  return new Promise((resolve, reject) => {
    const hash = crypto.createHash("sha256");
    let size = 0;
    const req = client.request(url, { headers, method: "GET" }, (res) => {
      const statusCode = res.statusCode ?? 0;
      const location = res.headers.location;
      if (statusCode >= 300 && statusCode < 400 && location) {
        res.resume();
        if (redirects <= 0) {
          reject(new Error(`too many redirects while requesting ${url}`));
          return;
        }
        const nextUrl = new URL(location, url).toString();
        requestSha256(nextUrl, {
          headers: headersForRedirect(headers, url, nextUrl),
          maxBytes,
          redirects: redirects - 1,
        })
          .then(resolve, reject);
        return;
      }

      if (statusCode < 200 || statusCode >= 300) {
        res.resume();
        reject(new Error(`GET ${url} failed with ${statusCode}`));
        return;
      }

      res.on("data", (chunk) => {
        size += chunk.length;
        if (size > maxBytes) {
          req.destroy(new Error(`response exceeded ${maxBytes} bytes from ${url}`));
          return;
        }
        hash.update(chunk);
      });
      res.on("end", () => {
        resolve({
          digest: hash.digest("hex"),
          size,
        });
      });
    });
    req.on("error", reject);
    req.end();
  });
}

function isDmgAsset(asset) {
  return (
    asset &&
    typeof asset.name === "string" &&
    DMG_NAME_PATTERN.test(asset.name) &&
    typeof asset.browser_download_url === "string"
  );
}

function isAnyDmgAsset(asset) {
  return (
    asset &&
    typeof asset.name === "string" &&
    asset.name.endsWith(".dmg")
  );
}

function parseDmgName(name) {
  const match = name.match(DMG_NAME_PATTERN);
  if (!match) return null;
  return { version: match[1], arch: match[2] };
}

function isWindowsInstallerAsset(asset) {
  return (
    asset &&
    typeof asset.name === "string" &&
    WINDOWS_NAME_PATTERN.test(asset.name) &&
    typeof asset.browser_download_url === "string"
  );
}

function parseWindowsInstallerName(name) {
  const match = name.match(WINDOWS_NAME_PATTERN);
  if (!match) return null;
  return { version: match[1], arch: match[2] };
}

function releaseVersionFromTag(tagName) {
  if (typeof tagName !== "string") return null;
  const match = tagName.match(/^v(.+)$/);
  return match ? match[1] : null;
}

function isChecksumFor(asset, artifactName) {
  return (
    asset &&
    typeof asset.name === "string" &&
    asset.name === `${artifactName}.sha256` &&
    typeof asset.browser_download_url === "string"
  );
}

/** A draft is found by its tag in the release list, because the tag endpoint does not return drafts. */
export function isRequestedDraft(release, tag) {
  return release?.tag_name === tag && release?.draft === true;
}

async function findRelease(options) {
  const base = `${apiBase()}/repos/${options.repo}`;
  if (options.tag) {
    try {
      return await requestJson(`${base}/releases/tags/${encodeURIComponent(options.tag)}`);
    } catch (error) {
      const message = error instanceof Error ? error.message : String(error);
      if (!options.allowDraft || !/\b404\b/.test(message)) {
        throw error;
      }
      const releases = await requestJson(`${base}/releases?per_page=100`);
      if (!Array.isArray(releases)) {
        fail("GitHub releases response was not an array.");
      }
      const draftRelease = releases.find((release) => isRequestedDraft(release, options.tag));
      if (draftRelease) {
        return draftRelease;
      }
      throw error;
    }
  }
  const releases = await requestJson(`${base}/releases?per_page=20`);
  if (!Array.isArray(releases)) {
    fail("GitHub releases response was not an array.");
  }
  return releases.find((release) => !release?.prerelease && (options.allowDraft || !release?.draft));
}

function assetRequestTarget(asset, release) {
  if (release?.draft && typeof asset.url === "string") {
    return {
      url: asset.url,
      headers: githubAssetHeaders(),
      isDraftApiAsset: true,
    };
  }
  return {
    url: asset.browser_download_url,
    headers: userAgentHeaders(),
    isDraftApiAsset: false,
  };
}

async function verifyReachableAsset(asset, label, release) {
  const target = assetRequestTarget(asset, release);
  if (target.isDraftApiAsset) {
    return;
  }

  const { headers } = await requestRaw(target.url, {
    method: "HEAD",
    headers: target.headers,
    maxBytes: 0,
  }).catch((error) => {
    throw new Error(`${label} asset URL is not reachable: ${error.message}`);
  });

  const contentLength = headers["content-length"];
  if (typeof contentLength === "string" && Number.parseInt(contentLength, 10) === 0) {
    throw new Error(`${label} asset URL returned an empty file.`);
  }

  const contentType = String(headers["content-type"] ?? "").toLowerCase();
  if (label === "DMG" && contentType && !/application\/(x-apple-diskimage|octet-stream)|binary\/octet-stream/.test(contentType)) {
    throw new Error(`${label} asset URL returned unexpected content-type: ${contentType}.`);
  }
  if (
    label === "Windows installer" &&
    contentType &&
    !/application\/(octet-stream|x-msdownload|vnd\.microsoft\.portable-executable)|binary\/octet-stream/.test(contentType)
  ) {
    throw new Error(`${label} asset URL returned unexpected content-type: ${contentType}.`);
  }
  if (label === "checksum" && contentType && !/text\/plain|application\/octet-stream/.test(contentType)) {
    throw new Error(`${label} asset URL returned unexpected content-type: ${contentType}.`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function verifyChecksumAsset(checksum, artifactName, release) {
  const target = assetRequestTarget(checksum, release);
  const { body } = await requestRaw(target.url, {
    headers: target.headers,
    maxBytes: 4096,
  });
  const text = body.toString("utf8");
  const expectedLine = new RegExp(`^([a-fA-F0-9]{64})\\s+${escapeRegExp(artifactName)}$`);
  const matchingLine = text
    .split(/\r?\n/)
    .map((line) => line.trim().match(expectedLine))
    .find(Boolean);
  if (!matchingLine) {
    throw new Error(`${checksum.name} does not contain a SHA-256 line for ${artifactName}.`);
  }
  return matchingLine[1].toLowerCase();
}

async function verifyArtifactHash(asset, expectedDigest, release) {
  const target = assetRequestTarget(asset, release);
  const { digest, size } = await requestSha256(target.url, { headers: target.headers });
  if (size === 0) {
    throw new Error(`${asset.name} downloaded as an empty file.`);
  }
  if (digest !== expectedDigest) {
    throw new Error(`${asset.name} SHA-256 ${digest} does not match checksum ${expectedDigest}.`);
  }
}

const options = parseArgs(process.argv.slice(2));
let release;
try {
  release = await findRelease(options);
} catch (error) {
  const message = error instanceof Error ? error.message : String(error);
  if (options.tag && /\b404\b/.test(message)) {
    fail(
      `release tag ${options.tag} was not found for ${options.repo}. Push the v-prefixed tag and let .github/workflows/release-macos.yml publish the signed, notarized Apple Silicon DMG before running desktop:verify-download.`,
    );
  }
  if (/rate limit exceeded/i.test(message) || /\b403\b/.test(message)) {
    fail(
      "GitHub API request failed or hit a rate limit. Set GITHUB_TOKEN or GH_TOKEN, then rerun desktop:verify-download.",
    );
  }
  fail(message);
}

if (!release) {
  fail(`no ${options.allowDraft ? "release" : "public release"} found for ${options.repo}.`);
}

if (release.draft && !options.allowDraft) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} is a draft and is not downloadable from the hosted landing page.`);
}
if (release.prerelease) {
  fail(
    `release ${release.tag_name ?? "(unknown tag)"} is marked as a pre-release on GitHub. Atlas publishes only plain releases, which the updater and the download page serve; clear the flag or publish a plain tag.`,
  );
}

const assets = Array.isArray(release.assets) ? release.assets : [];
const unsupportedDmgs = assets
  .filter(isAnyDmgAsset)
  .filter((asset) => !isDmgAsset(asset))
  .map((asset) => asset.name);
if (unsupportedDmgs.length > 0) {
  fail(
    `release ${release.tag_name ?? "(unknown tag)"} has unsupported macOS DMG asset names: ${unsupportedDmgs.join(", ")}. Expected ontology-atlas_<version>_<aarch64|x64>.dmg.`,
  );
}
const dmgs = assets.filter(isDmgAsset);
if (dmgs.length === 0) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} has no supported ontology-atlas_*.dmg asset.`);
}
const parsedDmgs = dmgs.map((dmg) => ({ asset: dmg, ...parseDmgName(dmg.name) }));
const arches = new Set(parsedDmgs.map((dmg) => dmg.arch).filter(Boolean));
const missingArches = REQUIRED_MACOS_ARCHES.filter((arch) => !arches.has(arch));
if (missingArches.length > 0) {
  fail(
    `release ${release.tag_name ?? "(unknown tag)"} is missing macOS DMG assets for: ${missingArches.join(", ")}.`,
  );
}
const duplicateArches = REQUIRED_MACOS_ARCHES
  .map((arch) => ({
    arch,
    assets: parsedDmgs.filter((dmg) => dmg.arch === arch).map((dmg) => dmg.asset.name),
  }))
  .filter((entry) => entry.assets.length > 1);
if (duplicateArches.length > 0) {
  fail(
    `release ${release.tag_name ?? "(unknown tag)"} has duplicate macOS DMG assets for: ${duplicateArches
      .map((entry) => `${entry.arch}=${entry.assets.join("|")}`)
      .join(", ")}. Keep exactly one DMG per architecture.`,
  );
}
const releaseVersion = releaseVersionFromTag(release.tag_name);
if (!releaseVersion) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} must use a v-prefixed tag so DMG versions can be verified.`);
}
if (parsedDmgs.some((dmg) => dmg.arch === "x64") && isAfterLastIntel(releaseVersion)) {
  fail(
    `release ${release.tag_name} carries an Intel (x64) DMG, but v${LAST_INTEL_VERSION.join(".")} was the last Intel build.`,
  );
}
const mismatchedReleaseVersions = parsedDmgs
  .filter((dmg) => dmg.version !== releaseVersion)
  .map((dmg) => `${dmg.arch}=${dmg.version}`);
if (mismatchedReleaseVersions.length > 0) {
  fail(
    `release ${release.tag_name} has macOS DMG versions that do not match the tag version ${releaseVersion}: ${mismatchedReleaseVersions.join(", ")}.`,
  );
}

const windowsInstallers = assets.filter(isWindowsInstallerAsset);
if (windowsInstallers.length !== 1) {
  fail(
    `release ${release.tag_name} must have exactly one ontology-atlas_<version>_windows_x64-setup.exe asset, found ${windowsInstallers.length}.`,
  );
}
const windowsInstaller = windowsInstallers[0];
const parsedWindowsInstaller = parseWindowsInstallerName(windowsInstaller.name);
if (parsedWindowsInstaller.version !== releaseVersion) {
  fail(
    `release ${release.tag_name} has a Windows installer version that does not match the tag version ${releaseVersion}: ${windowsInstaller.name}.`,
  );
}

try {
  for (const dmg of dmgs) {
    const checksum = assets.find((asset) => isChecksumFor(asset, dmg.name));
    if (!checksum) {
      fail(`release ${release.tag_name ?? "(unknown tag)"} is missing ${dmg.name}.sha256.`);
    }
    await verifyReachableAsset(dmg, "DMG", release);
    await verifyReachableAsset(checksum, "checksum", release);
    const expectedDigest = await verifyChecksumAsset(checksum, dmg.name, release);
    await verifyArtifactHash(dmg, expectedDigest, release);
  }
  const windowsChecksum = assets.find((asset) => isChecksumFor(asset, windowsInstaller.name));
  if (!windowsChecksum) {
    fail(`release ${release.tag_name} is missing ${windowsInstaller.name}.sha256.`);
  }
  await verifyReachableAsset(windowsInstaller, "Windows installer", release);
  await verifyReachableAsset(windowsChecksum, "checksum", release);
  const expectedWindowsDigest = await verifyChecksumAsset(
    windowsChecksum,
    windowsInstaller.name,
    release,
  );
  await verifyArtifactHash(windowsInstaller, expectedWindowsDigest, release);
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

/**
 * Checks that a file really exists where `latest.json` points.
 *
 * An installed app finds updates through this one file. If the URL is off by a
 * single character the app **raises no error** — the user simply sees "you are up
 * to date". GitHub replaces spaces in asset names with dots, so a manifest URL
 * built from Tauri's `<product name>.app.tar.gz` diverges from the real asset.
 * The platform keys must be exactly the required ones: an extra key is an entry
 * nothing verified, which could hand an app another architecture's archive.
 */
async function verifyUpdaterManifest() {
  const manifestAsset = assets.find((asset) => asset?.name === "latest.json");
  if (!manifestAsset) {
    fail(
      `release ${release.tag_name ?? "(unknown tag)"} has no latest.json asset. The installed app looks for exactly that file; without it every user silently stays on the old build.`,
    );
  }

  const target = assetRequestTarget(manifestAsset, release);
  const { body } = await requestRaw(target.url, { headers: target.headers, maxBytes: 64 * 1024 });
  let manifest;
  try {
    manifest = JSON.parse(body.toString("utf8"));
  } catch (error) {
    fail(`latest.json is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
  }

  const assetNames = new Set(assets.map((asset) => asset?.name).filter(Boolean));
  const platformKeys = Object.keys(manifest?.platforms ?? {}).sort();
  if (platformKeys.join(",") !== [...REQUIRED_UPDATER_PLATFORMS].sort().join(",")) {
    fail(
      `latest.json platforms must be exactly ${REQUIRED_UPDATER_PLATFORMS.join(", ")}; found ${platformKeys.join(", ") || "none"}.`,
    );
  }
  const archives = [];
  for (const platform of REQUIRED_UPDATER_PLATFORMS) {
    const entry = manifest?.platforms?.[platform];
    if (!entry?.url || !entry?.signature) {
      fail(`latest.json is missing a url/signature pair for ${platform}.`);
    }
    const archiveName = updaterArchiveName(releaseVersion, platform.replace(/^darwin-/, ""));
    const expectedUrl = `https://github.com/${options.repo}/releases/download/${release.tag_name}/${archiveName}`;
    if (entry.url !== expectedUrl) {
      fail(`latest.json ${platform} url is not pinned to ${release.tag_name} as ${expectedUrl}: ${entry.url}`);
    }
    if (!assetNames.has(archiveName)) {
      fail(
        `latest.json ${platform} url points at ${archiveName}, which is not an asset of ${release.tag_name}. GitHub rewrites spaces in asset names, so an archive named with a space never matches the manifest.`,
      );
    }
    if (!assetNames.has(`${archiveName}.sig`)) {
      fail(`release ${release.tag_name} is missing ${archiveName}.sig; the app refuses unsigned update packages.`);
    }
    archives.push(archiveName);
  }
  return archives;
}

let updaterArchives = [];
if (options.requireUpdater) {
  try {
    updaterArchives = await verifyUpdaterManifest();
  } catch (error) {
    fail(error instanceof Error ? error.message : String(error));
  }
}

console.log(
  [
    `[desktop-download-verify] ${options.repo} ${release.tag_name} exposes reachable ${release.draft ? "draft" : "public"} macOS download assets and Windows installer`,
    `DMGs: ${dmgs.map((dmg) => dmg.browser_download_url).join(", ")}`,
    `Windows: ${windowsInstaller.browser_download_url}`,
    ...(options.requireUpdater ? [`Updater: latest.json → ${updaterArchives.join(", ")}`] : []),
  ].join("\n"),
);
