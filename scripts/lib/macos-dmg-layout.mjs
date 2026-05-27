import fs from "node:fs";

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
