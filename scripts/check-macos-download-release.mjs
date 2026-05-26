#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

const DEFAULT_REPO = "wlsdks/oh-my-ontology";
const DEFAULT_API_BASE = "https://api.github.com";
const REQUIRED_MACOS_ARCHES = ["aarch64", "x64"];
const MAX_DMG_HASH_BYTES = 2 * 1024 * 1024 * 1024;

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-download [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] [--allow-prerelease] [--allow-draft]

Verifies that a public GitHub Release exposes reachable Apple Silicon
(aarch64) and Intel (x64) macOS DMGs with matching .sha256 checksums. Draft
releases are never accepted because the hosted landing page cannot serve them
as a real user download unless --allow-draft is explicitly passed for the
pre-publish CI gate.
`);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: null,
    allowPrerelease: false,
    allowDraft: false,
  };

  for (const arg of argv) {
    if (arg === "--") {
      continue;
    }
    if (arg === "--help" || arg === "-h") {
      printHelp();
      process.exit(0);
    }
    if (arg === "--allow-prerelease") {
      options.allowPrerelease = true;
      continue;
    }
    if (arg === "--allow-draft") {
      options.allowDraft = true;
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
  return (process.env.OMOT_GITHUB_API_BASE ?? DEFAULT_API_BASE).replace(/\/+$/, "");
}

function githubToken() {
  return (process.env.GITHUB_TOKEN || process.env.GH_TOKEN || "").trim();
}

function userAgentHeaders(extra = {}) {
  return {
    "User-Agent": "oh-my-ontology-desktop-download-verify",
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
        requestRaw(nextUrl, { headers, method, maxBytes, redirects: redirects - 1 })
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

function requestSha256(url, { headers = {}, maxBytes = MAX_DMG_HASH_BYTES, redirects = 5 } = {}) {
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
        requestSha256(nextUrl, { headers, maxBytes, redirects: redirects - 1 })
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
    /^oh-my-ontology_[^/]+_(aarch64|x64)\.dmg$/.test(asset.name) &&
    typeof asset.browser_download_url === "string"
  );
}

function isOhMyOntologyDmgAsset(asset) {
  return (
    asset &&
    typeof asset.name === "string" &&
    /^oh-my-ontology_[^/]+_[^/]+\.dmg$/.test(asset.name)
  );
}

function parseDmgName(name) {
  const match = name.match(/^oh-my-ontology_([^/]+)_(aarch64|x64)\.dmg$/);
  if (!match) return null;
  return { version: match[1], arch: match[2] };
}

function releaseVersionFromTag(tagName) {
  if (typeof tagName !== "string") return null;
  const match = tagName.match(/^v(.+)$/);
  return match ? match[1] : null;
}

function isChecksumFor(asset, dmgName) {
  return (
    asset &&
    typeof asset.name === "string" &&
    asset.name === `${dmgName}.sha256` &&
    typeof asset.browser_download_url === "string"
  );
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
      const draftRelease = releases.find((release) => {
        if (release?.tag_name !== options.tag) return false;
        if (!release?.draft) return false;
        if (!options.allowPrerelease && release?.prerelease) return false;
        return true;
      });
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
  return releases.find((release) => {
    if (release?.draft && !options.allowDraft) return false;
    if (!options.allowPrerelease && release?.prerelease) return false;
    return true;
  });
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
  if (label === "checksum" && contentType && !/text\/plain|application\/octet-stream/.test(contentType)) {
    throw new Error(`${label} asset URL returned unexpected content-type: ${contentType}.`);
  }
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

async function verifyChecksumAsset(checksum, dmgName, release) {
  const target = assetRequestTarget(checksum, release);
  const { body } = await requestRaw(target.url, {
    headers: target.headers,
    maxBytes: 4096,
  });
  const text = body.toString("utf8");
  const expectedLine = new RegExp(`^([a-fA-F0-9]{64})\\s+${escapeRegExp(dmgName)}$`);
  const matchingLine = text
    .split(/\r?\n/)
    .map((line) => line.trim().match(expectedLine))
    .find(Boolean);
  if (!matchingLine) {
    throw new Error(`${checksum.name} does not contain a SHA-256 line for ${dmgName}.`);
  }
  return matchingLine[1].toLowerCase();
}

async function verifyDmgHashAsset(dmg, expectedDigest, release) {
  const target = assetRequestTarget(dmg, release);
  const { digest, size } = await requestSha256(target.url, { headers: target.headers });
  if (size === 0) {
    throw new Error(`${dmg.name} downloaded as an empty file.`);
  }
  if (digest !== expectedDigest) {
    throw new Error(`${dmg.name} SHA-256 ${digest} does not match checksum ${expectedDigest}.`);
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
      `release tag ${options.tag} was not found for ${options.repo}. Push the v-prefixed tag and let .github/workflows/release-macos.yml publish signed, notarized Apple Silicon and Intel DMGs before running desktop:verify-download.`,
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
  fail(
    options.allowPrerelease
      ? `no ${options.allowDraft ? "release" : "public non-draft release"} found for ${options.repo}.`
      : `no ${options.allowDraft ? "stable release" : "public stable release"} found for ${options.repo}; pass --allow-prerelease to accept prereleases.`,
  );
}

if (release.draft && !options.allowDraft) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} is a draft and is not downloadable from the hosted landing page.`);
}
if (release.prerelease && !options.allowPrerelease) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} is a prerelease; pass --allow-prerelease to accept it.`);
}

const assets = Array.isArray(release.assets) ? release.assets : [];
const unsupportedDmgs = assets
  .filter(isOhMyOntologyDmgAsset)
  .filter((asset) => !isDmgAsset(asset))
  .map((asset) => asset.name);
if (unsupportedDmgs.length > 0) {
  fail(
    `release ${release.tag_name ?? "(unknown tag)"} has unsupported macOS DMG asset names: ${unsupportedDmgs.join(", ")}. Expected oh-my-ontology_<version>_<aarch64|x64>.dmg.`,
  );
}
const dmgs = assets.filter(isDmgAsset);
if (dmgs.length === 0) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} has no supported oh-my-ontology_*.dmg asset.`);
}
const parsedDmgs = dmgs.map((dmg) => ({ asset: dmg, ...parseDmgName(dmg.name) }));
const arches = new Set(parsedDmgs.map((dmg) => dmg.arch).filter(Boolean));
const missingArches = REQUIRED_MACOS_ARCHES.filter((arch) => !arches.has(arch));
if (missingArches.length > 0) {
  fail(
    `release ${release.tag_name ?? "(unknown tag)"} is missing macOS DMG assets for: ${missingArches.join(", ")}.`,
  );
}
const requiredVersionByArch = new Map(
  parsedDmgs
    .filter((dmg) => REQUIRED_MACOS_ARCHES.includes(dmg.arch))
    .map((dmg) => [dmg.arch, dmg.version]),
);
const versions = new Set(requiredVersionByArch.values());
if (versions.size > 1) {
  fail(
    `release ${release.tag_name ?? "(unknown tag)"} has mismatched macOS DMG versions: ${Array.from(requiredVersionByArch.entries())
      .map(([arch, version]) => `${arch}=${version}`)
      .join(", ")}.`,
  );
}
const releaseVersion = releaseVersionFromTag(release.tag_name);
if (!releaseVersion) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} must use a v-prefixed tag so DMG versions can be verified.`);
}
const mismatchedReleaseVersions = parsedDmgs
  .filter((dmg) => dmg.version !== releaseVersion)
  .map((dmg) => `${dmg.arch}=${dmg.version}`);
if (mismatchedReleaseVersions.length > 0) {
  fail(
    `release ${release.tag_name} has macOS DMG versions that do not match the tag version ${releaseVersion}: ${mismatchedReleaseVersions.join(", ")}.`,
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
    await verifyDmgHashAsset(dmg, expectedDigest, release);
  }
} catch (error) {
  fail(error instanceof Error ? error.message : String(error));
}

console.log(
  [
    `[desktop-download-verify] ${options.repo} ${release.tag_name} exposes reachable ${release.draft ? "draft" : "public"} macOS download assets`,
    `DMGs: ${dmgs.map((dmg) => dmg.browser_download_url).join(", ")}`,
  ].join("\n"),
);
