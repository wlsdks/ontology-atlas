#!/usr/bin/env node
import crypto from "node:crypto";
import http from "node:http";
import https from "node:https";

const DEFAULT_REPO = "wlsdks/ontology-atlas";
const DEFAULT_API_BASE = "https://api.github.com";
const REQUIRED_MACOS_ARCHES = ["aarch64", "x64"];
const WINDOWS_NAME_PATTERN = /^ontology-atlas_([^/]+)_windows_(x64)-setup\.exe$/;
/** 설치된 앱이 `latest.json` 에서 자기 자리를 찾을 때 쓰는 키. Rust 타깃 이름이다. */
const REQUIRED_UPDATER_PLATFORMS = ["darwin-aarch64", "darwin-x86_64"];
const MAX_DOWNLOAD_HASH_BYTES = 2 * 1024 * 1024 * 1024;

function printHelp() {
  console.log(`Usage: pnpm desktop:verify-download [--repo=${DEFAULT_REPO}] [--tag=vX.Y.Z] [--allow-prerelease] [--allow-draft] [--require-updater]

Verifies that a public GitHub Release exposes reachable Apple Silicon
(aarch64) and Intel (x64) macOS DMGs with exactly one DMG per architecture and
one Windows x64 setup executable, all with matching .sha256 checksums. With
--require-updater it also opens latest.json and
checks that every platform URL points at an archive (and .sig) that actually
exists in this release. Draft releases are never accepted because the
hosted landing page cannot serve them as a real user download unless
--allow-draft is explicitly passed for the pre-publish CI gate.
`);
}

function parseArgs(argv) {
  const options = {
    repo: DEFAULT_REPO,
    tag: null,
    allowPrerelease: false,
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
    if (arg === "--allow-prerelease") {
      options.allowPrerelease = true;
      continue;
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
    /^ontology-atlas_[^/]+_(aarch64|x64)\.dmg$/.test(asset.name) &&
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
  const match = name.match(/^ontology-atlas_([^/]+)_(aarch64|x64)\.dmg$/);
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

/**
 * 이름을 대고 찾은 draft 인가.
 *
 * 프리릴리스 여부로 거르지 **않는다**. `allowPrerelease` 는 태그 없이 "지금
 * 릴리스" 를 **고를 때** 프리릴리스가 뽑히지 않게 하는 장치이고, 호출자가
 * `--tag=v1.0.0-rc.1` 이라고 이름을 댄 순간 그 장치는 할 일이 없다 — 무엇을
 * 원하는지 이미 말했다.
 *
 * 직접 조회(`releases/tags/<tag>`)에는 이 필터가 없다. 즉 같은 질문에 두 경로가
 * 다르게 답하고 있었고, 그 비대칭이 결함이었다. RC 초안은 draft 라 404 로
 * 떨어져 이 폴백을 타는데, 거기서 프리릴리스라는 이유로 다시 걸러져 "태그를 못
 * 찾았다" 는 엉뚱한 메시지로 끝났다.
 * (2026-07-27 v1.0.0-rc.1 에서 실측 — 정식 태그로는 드러나지 않는다.)
 */
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
// 이름을 대지 않았을 때만 프리릴리스를 막는다.
//
// 태그 없이 부르면 이 스크립트는 "지금 공개된 릴리스" 를 **고르고**, 그 자리에
// RC 가 뽑히면 안 된다 — 랜딩 페이지가 광고할 대상이 아니기 때문이다. 그러나
// 호출자가 `--tag=v1.0.0-rc.1` 이라고 이름을 댔다면 무엇을 검증하려는지 이미
// 말했고, 그걸 프리릴리스라는 이유로 거절하면 **RC 를 영영 검증할 수 없다.**
// 릴리스 워크플로가 자기 태그의 초안을 확인하는 경로가 정확히 이것이다.
if (!options.tag && release.prerelease && !options.allowPrerelease) {
  fail(`release ${release.tag_name ?? "(unknown tag)"} is a prerelease; pass --allow-prerelease to accept it.`);
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
 * `latest.json` 이 가리키는 곳에 실제로 파일이 있는지 본다.
 *
 * 설치된 앱은 이 파일 하나로 갱신을 찾는다. URL 이 한 글자만 어긋나도 앱은
 * **오류를 내지 않는다** — 사용자에게는 "최신입니다" 로 보인다. DMG 검사만으로는
 * 이 경로가 통째로 무검증이었다: 매니페스트가 없어도, 없는 파일을 가리켜도,
 * 두 아키텍처가 같은 파일을 가리켜도 전부 초록이었다.
 *
 * 어긋나는 방식이 실제로 둘 있었다. Tauri 는 두 아치 모두 `<제품명>.app.tar.gz`
 * 로 내는데 ① 이름이 같아 한쪽이 다른 쪽을 덮고 ② 이름의 공백을 GitHub 이 점으로
 * 바꿔 매니페스트의 URL 과 실제 자산 이름이 달라진다.
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
  const seenArchives = new Set();
  for (const platform of REQUIRED_UPDATER_PLATFORMS) {
    const entry = manifest?.platforms?.[platform];
    if (!entry?.url || !entry?.signature) {
      fail(`latest.json is missing a url/signature pair for ${platform}.`);
    }
    if (!entry.url.includes(`/releases/download/${release.tag_name}/`)) {
      // `latest` 로 두면 다음 릴리스가 나오는 순간 이 URL 이 가리키는 파일이 바뀐다.
      fail(`latest.json ${platform} url is not pinned to ${release.tag_name}: ${entry.url}`);
    }
    const archiveName = decodeURIComponent(entry.url.split("/").pop() ?? "");
    if (!assetNames.has(archiveName)) {
      fail(
        `latest.json ${platform} url points at ${archiveName}, which is not an asset of ${release.tag_name}. GitHub rewrites spaces in asset names, so an archive named with a space never matches the manifest.`,
      );
    }
    if (!assetNames.has(`${archiveName}.sig`)) {
      fail(`release ${release.tag_name} is missing ${archiveName}.sig; the app refuses unsigned update packages.`);
    }
    if (seenArchives.has(archiveName)) {
      fail(
        `latest.json points both platforms at ${archiveName}. One architecture would download the other's app.`,
      );
    }
    seenArchives.add(archiveName);
  }
  return [...seenArchives];
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
