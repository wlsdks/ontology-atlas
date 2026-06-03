import assert from "node:assert/strict";
import test from "node:test";
import { parseSha256Checksum } from "./macos-checksum.mjs";

const checksum = "5db637830cf5fd02ce2ed0a0803033946a8941bb6c73d4509cf1511f2cf3e219";
const filename = "context-atlas_0.1.0_aarch64.dmg";

test("parses the generated DMG checksum format", () => {
  assert.deepEqual(
    parseSha256Checksum(`${checksum}  ${filename}\n`, { expectedFilename: filename }),
    { checksum, filename },
  );
});

test("accepts binary-mode checksum filenames", () => {
  assert.deepEqual(
    parseSha256Checksum(`${checksum.toUpperCase()} *${filename}\n`, { expectedFilename: filename }),
    { checksum, filename },
  );
});

test("rejects checksum files that do not name the expected DMG", () => {
  assert.throws(
    () => parseSha256Checksum(`${checksum}  other.dmg\n`, { expectedFilename: filename }),
    /checksum file names other\.dmg, expected context-atlas_0\.1\.0_aarch64\.dmg/,
  );
});

test("rejects malformed checksum payloads", () => {
  assert.throws(
    () => parseSha256Checksum("not-a-checksum\n", { expectedFilename: filename }),
    /<64 hex sha256>/,
  );
  assert.throws(
    () => parseSha256Checksum(`${checksum}  ${filename}\n${checksum}  other.dmg\n`, { expectedFilename: filename }),
    /exactly one non-empty line/,
  );
});
