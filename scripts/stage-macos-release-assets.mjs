#!/usr/bin/env node
/**
 * Collects the four release assets into one folder — **so that we decide the
 * artifact's root.**
 *
 * **Why this step exists.** Giving `actions/upload-artifact` several paths makes
 * the root their **lowest common ancestor**. Passing `bundle/dmg/*` and
 * `bundle/macos/*` together makes the root `bundle/`, adding an extra `dmg/` /
 * `macos/` layer inside the artifact that the downloading side never chose and
 * cannot know about. v1.0.0-rc.1 stalled there three times — build, signing, and
 * notarisation all passed while the manifest ended with "architectures with no
 * updater artifact: aarch64, x64".
 *
 * Uploading **one** path makes that folder the root. So the assets are gathered
 * here: the producing side declares the layout, and the consuming side (manifest
 * builder, release upload glob) knows only that.
 *
 * **Why the updater archive is renamed.** Tauri emits it as
 * `<product name>.app.tar.gz` — **the same name for both architectures**, and
 * containing a **space**. Left alone there are two ways to fail silently:
 *
 * 1. Both architectures upload under the same name into one release and one
 *    overwrites the other. Users on the overwritten side either get the app for
 *    another architecture or fail signature verification and never receive an
 *    update again.
 * 2. GitHub converts spaces in asset names to dots. The URL recorded in
 *    `latest.json` still has the space, so it no longer matches the real asset,
 *    and the installed app shows the 404 as "no update available".
 *
 * So it is renamed under the same rule as the DMG
 * (`ontology-atlas_<version>_<arch>`). Version and architecture are **read from
 * the DMG file name** — the asset users actually download already treats that
 * rule as the source of truth (`check-macos-download-release.mjs` checks the
 * name), and recomputing them separately creates a place for the two to
 * diverge.
 */

import { spawnSync } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { pathToFileURL } from "node:url";

/** The folder CI builds the artifact from. One path = a predictable root. */
export const STAGING_DIR = "release-upload";

/** Where Tauri puts its output. */
export const DEFAULT_BUNDLE_DIR = "src-tauri/target/release/bundle";

/** On download the folder is the only thing carrying the architecture, so the folder name is the artifact name. */
export function artifactNameForArch(arch) {
  return `ontology-atlas-macos-${arch}`;
}

/** Same rule as the DMG. The architecture must be in the name for both to survive one release. */
export function updaterArchiveName(version, arch) {
  return `ontology-atlas_${version}_${arch}.app.tar.gz`;
}

/** The debug-info bundle Cargo writes beside the binary under `split-debuginfo = "packed"`. */
export const DSYM_BUNDLE_NAME = "ontology-atlas.dSYM";

/**
 * The symbol archive's name. Architecture is in the name for the same reason the DMG carries it:
 * one release holds both, and a crash report can only be symbolicated against the dSYM of the
 * build the reporter actually ran.
 */
export function dsymArchiveName(version, arch) {
  return `Ontology-Atlas-${version}-${arch}.dSYM.zip`;
}

/**
 * Zips the dSYM bundle so the shipped app keeps no symbols while a crash report stays readable.
 *
 * The release binary is stripped, so `.ips` reports name addresses and nothing else. The dSYM is
 * what turns those addresses back into file and line — it is never inside the `.app`, only beside
 * it in the release, for whoever is holding the crash report.
 */
function stageDsymArchive(dsymDir, outDir, archiveName) {
  const bundle = path.join(dsymDir, DSYM_BUNDLE_NAME);
  if (!fs.existsSync(bundle)) {
    return null;
  }
  const target = path.resolve(outDir, archiveName);
  // `-r` because a dSYM is a directory; `-q` keeps the release log about assets, not file lists.
  const zipped = spawnSync("zip", ["-q", "-r", target, DSYM_BUNDLE_NAME], { cwd: dsymDir });
  if (zipped.error || zipped.status !== 0) {
    throw new Error(
      `${bundle} could not be zipped: ${zipped.error?.message ?? `zip exited with ${zipped.status}`}`,
    );
  }
  return archiveName;
}

/** `ontology-atlas_1.0.0-rc.2_aarch64.dmg` → `{ version, arch }`. */
export function parseDmgName(name) {
  const match = name.match(/^ontology-atlas_(.+)_(aarch64|x64)\.dmg$/);
  return match ? { version: match[1], arch: match[2] } : null;
}

function exactlyOneFile(dir, matches, label) {
  if (!fs.existsSync(dir)) {
    throw new Error(`no folder to look for ${label} in: ${dir}`);
  }
  const hits = fs
    .readdirSync(dir, { withFileTypes: true })
    .filter((entry) => entry.isFile() && matches(entry.name))
    .map((entry) => entry.name);
  if (hits.length === 0) {
    throw new Error(`${dir} has no ${label}.`);
  }
  if (hits.length > 1) {
    throw new Error(
      `${dir} has ${hits.length} ${label} candidates: ${hits.join(", ")} - cannot decide which one to ship.`,
    );
  }
  return hits[0];
}

/**
 * Gathers the four assets flat into `outDir` and returns the names that will be
 * uploaded.
 *
 * Passing `expectArch` cross-checks the architecture the DMG names — if the build
 * output disagrees with the matrix, it stops here. Letting it through ships users
 * the app for another architecture.
 *
 * The dSYM rides along when Cargo produced one, and `requireDsym` turns its absence into a
 * failure: a release whose symbols were silently dropped looks identical to one that kept them,
 * and the difference only surfaces months later, in front of a crash report nobody can read.
 */
export function stageReleaseAssets({ bundleDir, outDir, expectArch, dsymDir, requireDsym } = {}) {
  const bundle = bundleDir ?? DEFAULT_BUNDLE_DIR;
  const out = outDir ?? STAGING_DIR;
  // Cargo writes the dSYM beside the binary, one level above the bundle folder. Derived rather
  // than configured, so the symbols always belong to the build that produced this DMG.
  const symbols = dsymDir ?? path.dirname(bundle);
  const dmgDir = path.join(bundle, "dmg");
  const macosDir = path.join(bundle, "macos");

  const dmg = exactlyOneFile(dmgDir, (name) => name.endsWith(".dmg"), "DMG");
  const parsed = parseDmgName(dmg);
  if (!parsed) {
    throw new Error(
      `DMG name does not follow the rule: ${dmg} - expected ontology-atlas_<version>_<aarch64|x64>.dmg.`,
    );
  }
  if (expectArch && parsed.arch !== expectArch) {
    throw new Error(
      `this job builds ${expectArch} but the DMG is ${parsed.arch}: ${dmg}.`,
    );
  }

  const checksum = `${dmg}.sha256`;
  if (!fs.existsSync(path.join(dmgDir, checksum))) {
    throw new Error(`${dmgDir} has no ${checksum} - the only integrity check an unsigned distribution has.`);
  }

  const archive = exactlyOneFile(
    macosDir,
    (name) => name.endsWith(".app.tar.gz"),
    "updater archive (.app.tar.gz)",
  );
  const signature = `${archive}.sig`;
  if (!fs.existsSync(path.join(macosDir, signature))) {
    throw new Error(
      `${macosDir} has no ${signature} - a build without TAURI_SIGNING_PRIVATE_KEY ` +
        "emits the archive but no signature. Shipped that way, the app refuses the update (it quietly reads as 'no update').",
    );
  }

  const stagedArchive = updaterArchiveName(parsed.version, parsed.arch);
  const copies = [
    [path.join(dmgDir, dmg), dmg],
    [path.join(dmgDir, checksum), checksum],
    [path.join(macosDir, archive), stagedArchive],
    [path.join(macosDir, signature), `${stagedArchive}.sig`],
  ];

  // Leftovers from a previous run would ride along and publish another version into the release.
  fs.rmSync(out, { recursive: true, force: true });
  fs.mkdirSync(out, { recursive: true });
  for (const [from, to] of copies) {
    fs.copyFileSync(from, path.join(out, to));
  }

  const files = copies.map(([, to]) => to);
  const dsym = stageDsymArchive(symbols, out, dsymArchiveName(parsed.version, parsed.arch));
  if (dsym) {
    files.push(dsym);
  } else if (requireDsym) {
    throw new Error(
      `${path.join(symbols, DSYM_BUNDLE_NAME)} is missing — the release binary is stripped, so ` +
        "without it a crash report from this build names only addresses. Check " +
        "`[profile.release]` in src-tauri/Cargo.toml (`debug` and `split-debuginfo`).",
    );
  }

  return {
    outDir: out,
    version: parsed.version,
    arch: parsed.arch,
    artifactName: artifactNameForArch(parsed.arch),
    dsym,
    files,
  };
}

function parseArgs(argv) {
  const flag = (name) => {
    const hit = argv.find((arg) => arg.startsWith(`--${name}=`));
    return hit ? hit.slice(`--${name}=`.length).trim() : undefined;
  };
  return {
    bundleDir: flag("bundle-dir"),
    outDir: flag("out"),
    expectArch: flag("arch") || process.env.TAURI_ARCH || undefined,
    dsymDir: flag("dsym-dir"),
    requireDsym: argv.includes("--require-dsym"),
  };
}

function main() {
  let staged;
  try {
    staged = stageReleaseAssets(parseArgs(process.argv.slice(2)));
  } catch (error) {
    console.error(`[release-stage] ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
    return;
  }
  console.log(`[release-stage] ${staged.artifactName} → ${staged.outDir}`);
  for (const file of staged.files) {
    console.log(`[release-stage]   ${file}`);
  }
}

if (process.argv[1] && import.meta.url === pathToFileURL(process.argv[1]).href) {
  main();
}
