import { createHash } from "node:crypto";
import fs from "node:fs";
import path from "node:path";

function sha256(value) {
  return createHash("sha256").update(value).digest("hex");
}

function relativeEntryPath(root, absolutePath) {
  return path.relative(root, absolutePath).split(path.sep).join("/");
}

function inventoryMacosAppBundle(root) {
  const rootStat = fs.lstatSync(root, { throwIfNoEntry: false });
  if (!rootStat?.isDirectory()) {
    throw new Error(`macOS app bundle is missing or not a directory: ${root}`);
  }

  const entries = [{ path: ".", type: "directory", mode: rootStat.mode & 0o777 }];
  const visit = (directory) => {
    for (const name of fs.readdirSync(directory).sort((left, right) => left.localeCompare(right))) {
      const absolutePath = path.join(directory, name);
      const stat = fs.lstatSync(absolutePath);
      const entryPath = relativeEntryPath(root, absolutePath);
      const mode = stat.mode & 0o777;

      if (stat.isDirectory()) {
        entries.push({ path: entryPath, type: "directory", mode });
        visit(absolutePath);
        continue;
      }
      if (stat.isFile()) {
        entries.push({
          path: entryPath,
          type: "file",
          mode,
          size: stat.size,
          sha256: sha256(fs.readFileSync(absolutePath)),
        });
        continue;
      }
      if (stat.isSymbolicLink()) {
        entries.push({
          path: entryPath,
          type: "symlink",
          mode,
          target: fs.readlinkSync(absolutePath),
        });
        continue;
      }
      throw new Error(`unsupported app bundle entry type: ${absolutePath}`);
    }
  };

  visit(root);
  return entries;
}

export function measureMacosAppBundleIdentity(appPath) {
  const root = path.resolve(appPath);
  const entries = inventoryMacosAppBundle(root);
  return {
    root,
    digest: sha256(JSON.stringify(entries)),
    entries,
  };
}

export function compareMacosAppBundleIdentity(expected, actualAppPath) {
  if (!expected || typeof expected !== "object" || !Array.isArray(expected.entries)) {
    throw new Error("expected macOS app identity must come from measureMacosAppBundleIdentity");
  }
  const actual = measureMacosAppBundleIdentity(actualAppPath);
  const expectedByPath = new Map(expected.entries.map((entry) => [entry.path, entry]));
  const actualByPath = new Map(actual.entries.map((entry) => [entry.path, entry]));
  const mismatches = [];

  for (const entry of expected.entries) {
    const installed = actualByPath.get(entry.path);
    if (!installed) {
      mismatches.push(`missing ${entry.path}`);
      continue;
    }
    if (JSON.stringify(installed) !== JSON.stringify(entry)) {
      mismatches.push(`changed ${entry.path}`);
    }
  }
  for (const entry of actual.entries) {
    if (!expectedByPath.has(entry.path)) mismatches.push(`unexpected ${entry.path}`);
  }

  return {
    match: mismatches.length === 0 && actual.digest === expected.digest,
    expectedDigest: expected.digest,
    actualDigest: actual.digest,
    mismatches,
  };
}
