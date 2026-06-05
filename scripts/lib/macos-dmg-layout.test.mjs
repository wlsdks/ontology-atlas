import assert from "node:assert/strict";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import { afterEach, describe, it } from "node:test";
import { parseHdiutilMountDir, verifyApplicationsSymlink } from "./macos-dmg-layout.mjs";

const tempDirs = [];

function makeTempDir() {
  const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), "ontology-atlas-dmg-layout-"));
  tempDirs.push(tempDir);
  return tempDir;
}

afterEach(() => {
  for (const tempDir of tempDirs.splice(0)) {
    fs.rmSync(tempDir, { recursive: true, force: true });
  }
});

describe("parseHdiutilMountDir", () => {
  it("extracts the mounted volume path from hdiutil attach output", () => {
    const output = [
      "/dev/disk4           Apple_partition_scheme",
      "/dev/disk4s1         Apple_partition_map",
      "/dev/disk4s2         Apple_HFS                       /Volumes/Ontology Atlas",
      "",
    ].join("\n");

    assert.equal(parseHdiutilMountDir(output), "/Volumes/Ontology Atlas");
  });

  it("preserves spaces inside the volume name and trims trailing whitespace", () => {
    const output = "/dev/disk5s1\tApple_HFS\t/Volumes/Ontology Atlas 0.1.0   \n";

    assert.equal(parseHdiutilMountDir(output), "/Volumes/Ontology Atlas 0.1.0");
  });

  it("returns null when hdiutil does not report a mounted volume", () => {
    assert.equal(parseHdiutilMountDir("/dev/disk4 Apple_partition_scheme\n"), null);
  });
});

describe("verifyApplicationsSymlink", () => {
  it("accepts an Applications symlink that points to /Applications", () => {
    const tempDir = makeTempDir();
    const linkPath = path.join(tempDir, "Applications");
    fs.symlinkSync("/Applications", linkPath);

    assert.doesNotThrow(() => verifyApplicationsSymlink(linkPath));
  });

  it("rejects an Applications directory", () => {
    const tempDir = makeTempDir();
    const linkPath = path.join(tempDir, "Applications");
    fs.mkdirSync(linkPath);

    assert.throws(
      () => verifyApplicationsSymlink(linkPath),
      /mounted DMG is missing Applications symlink/,
    );
  });

  it("rejects a symlink to the wrong target", () => {
    const tempDir = makeTempDir();
    const linkPath = path.join(tempDir, "Applications");
    fs.symlinkSync("/tmp", linkPath);

    assert.throws(
      () => verifyApplicationsSymlink(linkPath),
      /points to \/tmp, expected \/Applications/,
    );
  });
});
