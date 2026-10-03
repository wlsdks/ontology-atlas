#!/usr/bin/env node
/**
 * Builds `latest.json`, the single file an installed app checks for updates.
 *
 * The app knows only one stable endpoint in `tauri.conf.json`:
 *
 *   https://ontologyatlas.com/update/latest.json
 *
 * Pages deployment copies this file from the newest published plain release (drafts and
 * GitHub pre-releases are skipped) to the stable address above
 * (`stage-hosted-updater-manifest.mjs`). Pre-install minisign verification remains
 * unchanged, so the trust boundary does not change even if the publication address changes.
 *
 * **Why two layers of signature.** The Apple certificate attests who built it; the
 * minisign key attests that this update package is ours. Those are different
 * questions. The app swaps the bundle only after verifying the `.sig` against
 * `pubkey`, so a package not signed with our key installs by no route at all — even
 * if the releases page is compromised.
 *
 * **Why a script.** The `.sig` is one base64 line and the platform key
 * (`darwin-aarch64`) fails silently on a typo — the app just says "no update", so a
 * hand-built manifest gives no sign of being wrong. It is built here and checked
 * here.
 */

import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The platform keys Tauri uses on macOS. These are Rust target names, not our arch notation. */
export const PLATFORM_BY_ARCH = {
  aarch64: "darwin-aarch64",
};

export const REQUIRED_ARCHES = ["aarch64"];

function fail(message) {
  console.error(`[updater-manifest] ${message}`);
  process.exit(1);
}

/**
 * Finds the per-arch artifact folder. CI names it after the artifact
 * (`ontology-atlas-macos-aarch64`), so exactly one folder ending in the arch must
 * match: with several, a wrong-architecture app could ship.
 */
export function resolveArchDir(root, arch) {
  if (!fs.existsSync(root)) return null;
  const exact = path.join(root, arch);
  if (fs.existsSync(exact) && fs.statSync(exact).isDirectory()) return exact;

  const matches = fs
    .readdirSync(root)
    .filter((name) => name.endsWith(`-${arch}`) || name === arch)
    .filter((name) => fs.statSync(path.join(root, name)).isDirectory());

  if (matches.length > 1) {
    fail(`${matches.length} folders match ${arch}: ${matches.join(", ")} — cannot decide which one.`);
  }
  return matches.length === 1 ? path.join(root, matches[0]) : null;
}

/** Collects every `.app.tar.gz` under a folder, at any depth. */
function collectArchives(dir) {
  const found = [];
  for (const entry of fs.readdirSync(dir, { withFileTypes: true })) {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) {
      found.push(...collectArchives(full));
    } else if (entry.isFile() && entry.name.endsWith(".app.tar.gz")) {
      found.push(full);
    }
  }
  return found;
}

/**
 * Finds the updater archive at any depth under the arch folder, because the upload
 * step's common-ancestor root decides the depth. Exactly one archive per arch: with
 * several, a wrong-architecture app could ship.
 */
export function findUpdaterArtifacts(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const archives = collectArchives(dir);
  if (archives.length === 0) return null;
  if (archives.length > 1) {
    fail(
      `${dir} holds ${archives.length} .app.tar.gz files: ` +
        `${archives.map((file) => path.relative(dir, file)).join(", ")} — cannot decide which one to ship.`,
    );
  }
  const archivePath = archives[0];
  const archive = path.basename(archivePath);
  const signaturePath = `${archivePath}.sig`;
  if (!fs.existsSync(signaturePath)) {
    fail(
      `${dir} has ${archive} but no ${archive}.sig.\n` +
        "Building without TAURI_SIGNING_PRIVATE_KEY produces the archive without its signature — " +
        "shipping it that way makes the app refuse the update (it silently looks like 'no update').",
    );
  }
  return {
    archivePath,
    signaturePath,
    archiveName: archive,
  };
}

/**
 * Builds the manifest. The download URL is **pinned to the tag** — with `latest`,
 * the file this manifest points at changes the moment the next release ships.
 */
export function buildManifest({ version, pubDate, notes, repo, tag, platforms }) {
  const missing = REQUIRED_ARCHES.filter((arch) => !platforms[arch]);
  if (missing.length > 0) {
    fail(
      `Architectures with no updater artifact: ${missing.join(", ")}.\n` +
        "Shipping only one leaves that architecture's users without updates forever — silently, with no error.",
    );
  }

  return {
    version,
    notes: notes ?? "",
    pub_date: pubDate,
    platforms: Object.fromEntries(
      REQUIRED_ARCHES.map((arch) => [
        PLATFORM_BY_ARCH[arch],
        {
          signature: platforms[arch].signature,
          url: `https://github.com/${repo}/releases/download/${tag}/${platforms[arch].archiveName}`,
        },
      ]),
    ),
  };
}

function parseArgs(argv) {
  const flag = (name) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length).trim() : undefined;
  };
  return {
    dir: flag("dir") ?? "release-assets",
    out: flag("out") ?? "release-assets/latest.json",
    tag: flag("tag") ?? process.env.GITHUB_REF_NAME,
    repo: flag("repo") ?? process.env.GITHUB_REPOSITORY ?? "wlsdks/ontology-atlas",
    pubDate: flag("pub-date"),
    notes: flag("notes"),
  };
}

function main() {
  const options = parseArgs(process.argv.slice(2));
  if (!options.tag) fail("--tag or GITHUB_REF_NAME is required.");
  const version = options.tag.replace(/^v/, "");

  const platforms = {};
  for (const arch of REQUIRED_ARCHES) {
    // The folder name is the artifact name (`ontology-atlas-macos-<arch>`), so look for
    // a folder ending in the arch. Merging them flat makes the two arches
    // indistinguishable.
    const found = findUpdaterArtifacts(resolveArchDir(options.dir, arch));
    if (!found) continue;
    platforms[arch] = {
      archiveName: found.archiveName,
      signature: fs.readFileSync(found.signaturePath, "utf8").trim(),
    };
  }

  const manifest = buildManifest({
    version,
    pubDate: options.pubDate ?? new Date().toISOString(),
    notes: options.notes,
    repo: options.repo,
    tag: options.tag,
    platforms,
  });

  fs.mkdirSync(path.dirname(options.out), { recursive: true });
  fs.writeFileSync(options.out, `${JSON.stringify(manifest, null, 2)}\n`);
  console.log(`[updater-manifest] wrote ${options.out} for ${options.tag}`);
  for (const key of Object.keys(manifest.platforms)) {
    console.log(`[updater-manifest]   ${key} → ${manifest.platforms[key].url}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
