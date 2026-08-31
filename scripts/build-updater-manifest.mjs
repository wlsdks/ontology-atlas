#!/usr/bin/env node
/**
 * Builds `latest.json`, the single file an installed app checks for updates.
 *
 * The app knows only one stable endpoint in `tauri.conf.json`:
 *
 *   https://ontologyatlas.com/update/latest.json
 *
 * GitHub's `releases/latest` excludes pre-releases, resulting in 404s during RC-only periods.
 * Pages deployment copies this file from the newest non-draft release (including pre-releases) to the stable
 * address above (`stage-hosted-updater-manifest.mjs`). Pre-install minisign verification
 * remains unchanged, so the trust boundary does not change even if the publication address changes.
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
  x64: "darwin-x86_64",
};

export const REQUIRED_ARCHES = ["aarch64", "x64"];

function fail(message) {
  console.error(`[updater-manifest] ${message}`);
  process.exit(1);
}

/**
 * Finds the per-arch artifact folder.
 *
 * In CI the folder name is the **artifact name**, not the arch
 * (`ontology-atlas-macos-aarch64`), because `merge-multiple: false` turns that name
 * straight into a folder. The first version looked for `<dir>/aarch64` and stopped a
 * real release with "architectures with no updater artifact: aarch64, x64"
 * (v1.0.0-rc.1, 2026-07-27). The build was fine; the place being searched was wrong.
 *
 * Rather than pinning the name, it looks for **a folder ending in the arch**, which
 * survives an artifact rename. There must be exactly one: with several there is no
 * way to know which belongs to that arch, and choosing wrong ships users an app for
 * a different architecture.
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
    fail(`${arch} 에 해당하는 폴더가 ${matches.length}개다: ${matches.join(", ")} — 어느 것인지 정할 수 없다.`);
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
 * Finds the updater artifact **anywhere under** the arch folder.
 *
 * The depth was never our choice. Given several paths,
 * `actions/upload-artifact` takes their lowest common ancestor as the artifact root,
 * and while `bundle/dmg/*` and `bundle/macos/*` were uploaded together that root was
 * `bundle/` — directly under the arch folder there were only `dmg/` and `macos/`,
 * with `.app.tar.gz` one level deeper. That is what stopped v1.0.0-rc.1 with
 * "architectures with no updater artifact".
 *
 * Today `scripts/stage-macos-release-assets.mjs` gathers everything into one flat
 * folder before upload. The finder still avoids depending on depth, because a rule
 * that lives in one person's head goes out of step again.
 *
 * There must be **exactly one** archive for that arch — with several there is no way
 * to know which is this arch's, and choosing wrong ships users an app for a
 * different architecture.
 */
export function findUpdaterArtifacts(dir) {
  if (!dir || !fs.existsSync(dir)) return null;
  const archives = collectArchives(dir);
  if (archives.length === 0) return null;
  if (archives.length > 1) {
    fail(
      `${dir} 아래에 .app.tar.gz 가 ${archives.length}개다: ` +
        `${archives.map((file) => path.relative(dir, file)).join(", ")} — 어느 것을 낼지 정할 수 없다.`,
    );
  }
  const archivePath = archives[0];
  const archive = path.basename(archivePath);
  const signaturePath = `${archivePath}.sig`;
  if (!fs.existsSync(signaturePath)) {
    fail(
      `${dir} 에 ${archive} 는 있는데 ${archive}.sig 가 없다.\n` +
        "TAURI_SIGNING_PRIVATE_KEY 없이 빌드하면 아카이브만 나오고 서명이 빠진다 — " +
        "그 상태로 배포하면 앱이 갱신을 거부한다(조용히 '갱신 없음' 으로 보인다).",
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
      `업데이터 아티팩트가 없는 아키텍처: ${missing.join(", ")}.\n` +
        "한쪽만 내면 그 아키텍처 사용자는 영영 갱신을 못 받는다 — 오류도 없이 조용히.",
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
  if (!options.tag) fail("--tag 또는 GITHUB_REF_NAME 이 필요하다.");
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
