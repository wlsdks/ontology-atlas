import fs from "node:fs";

const KIB_PER_MIB = 1024;
const IMAGE_HEADROOM_RATIO = 1.25;
const IMAGE_HEADROOM_FLOOR_MIB = 64;

/**
 * The size handed to `hdiutil create -size` for a staged folder of `stagedKiB` kibibytes.
 * hdiutil's own estimate for `-srcfolder` can come out smaller than the bundle and fail the copy
 * with "No space left on device"; the compressed image stores the spare room as almost nothing.
 */
export function dmgImageSizeMiB(stagedKiB) {
  if (!Number.isFinite(stagedKiB) || stagedKiB <= 0) {
    throw new Error(`staged folder size must be a positive number of KiB, got ${stagedKiB}`);
  }
  return Math.ceil((stagedKiB / KIB_PER_MIB) * IMAGE_HEADROOM_RATIO) + IMAGE_HEADROOM_FLOOR_MIB;
}

/** Reads the kibibyte total from `du -sk <path>` output. */
export function parseDuKiB(output) {
  const total = Number.parseInt(output.trim().split(/\s+/)[0] ?? "", 10);
  return Number.isInteger(total) ? total : null;
}

export function parseHdiutilMountDir(output) {
  const mountLine = output.split("\n").find((line) => line.includes("/Volumes/"));
  if (!mountLine) return null;

  return mountLine.slice(mountLine.indexOf("/Volumes/")).trim() || null;
}

export function verifyApplicationsSymlink(linkPath, fsLike = fs) {
  if (!fsLike.lstatSync(linkPath).isSymbolicLink()) {
    throw new Error("mounted DMG is missing Applications symlink");
  }

  const target = fsLike.readlinkSync(linkPath);
  if (target !== "/Applications") {
    throw new Error(
      `mounted DMG Applications symlink points to ${target}, expected /Applications`,
    );
  }
}
