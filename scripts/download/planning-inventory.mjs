import { lstatSync, readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Mirrors `src-tauri/src/planning/scan.rs`.
const PLANNING_MAX_DEPTH = 12;
const PLANNING_ENTRY_BUDGET = 10_000;
const PLANNING_DENIED = [
  "credential", "secret", "password", "passwd", "token", "apikey", "api-key", "api_key",
  "id_rsa", "id_ed25519", "id_dsa", "id_ecdsa", ".env", ".pem", ".key", ".p12", ".pfx",
  ".keystore", ".jks", ".htpasswd",
];
const PLANNING_PRUNED = new Set([
  "node_modules", "target", "dist", "build", "out", "coverage", "vendor", "Pods", "DerivedData",
  "__pycache__", "venv",
]);
const PLANNING_EXTENSIONS = new Set(["md", "png", "jpg", "jpeg", "webp", "avif"]);
const PLANNING_BUNDLE = /\.(app|bundle|framework)$/i;

const allowedComponent = (name) => {
  const lower = name.toLowerCase();
  return !name.startsWith(".") && !PLANNING_DENIED.some((word) => lower.includes(word)) && !PLANNING_PRUNED.has(name);
};
const supportedFile = (name) => {
  const dot = name.lastIndexOf(".");
  return dot >= 0 && PLANNING_EXTENSIONS.has(name.slice(dot + 1).toLowerCase());
};
const comparePaths = (left, right) => {
  const a = left.split("/");
  const b = right.split("/");
  for (let i = 0; i < Math.min(a.length, b.length); i += 1) {
    const order = Buffer.compare(Buffer.from(a[i]), Buffer.from(b[i]));
    if (order) return order;
  }
  return a.length - b.length;
};

export function readPlanningFile(dir, relativePath) {
  const full = path.resolve(dir, String(relativePath));
  if (!full.startsWith(`${dir}${path.sep}`)) throw new Error("outside-folder");
  return readFileSync(full);
}

let cache = null;
export function walkPlanningFolder(dir, modifiedSeconds) {
  if (cache) return cache;
  const result = {
    files: [],
    skipped: 0,
    partial: false,
    visited: 0,
    limit_reached: false,
    depth_limited: false,
    unknown_remainder: false,
    omitted: { excluded: 0, linked: 0, symlink: 0, unsupported: 0, unreadable: 0 },
  };
  let seen = 0;
  const walk = (relative, depth) => {
    if (depth > PLANNING_MAX_DEPTH) {
      result.partial = true;
      result.depth_limited = true;
      return;
    }
    let entries;
    try {
      entries = readdirSync(path.join(dir, relative)).sort((x, y) => Buffer.compare(Buffer.from(x), Buffer.from(y)));
    } catch {
      result.partial = true;
      result.omitted.unreadable += 1;
      return;
    }
    const remaining = Math.max(PLANNING_ENTRY_BUDGET - seen, 0);
    if (entries.length > remaining) {
      entries = entries.slice(0, remaining);
      result.partial = true;
      result.limit_reached = true;
    }
    for (const name of entries) {
      if (seen >= PLANNING_ENTRY_BUDGET) {
        result.partial = true;
        result.limit_reached = true;
        break;
      }
      seen += 1;
      if (!allowedComponent(name)) {
        result.omitted.excluded += 1;
        continue;
      }
      const child = relative ? `${relative}/${name}` : name;
      const stat = lstatSync(path.join(dir, child));
      if (stat.isSymbolicLink()) {
        result.omitted.symlink += 1;
      } else if (stat.isDirectory()) {
        if (PLANNING_BUNDLE.test(name)) result.omitted.excluded += 1;
        else walk(child, depth + 1);
      } else if (stat.isFile()) {
        if (!supportedFile(name)) result.omitted.unsupported += 1;
        else if (stat.nlink !== 1) result.omitted.linked += 1;
        else result.files.push({ path: child, size: stat.size, modified_seconds: modifiedSeconds });
      } else {
        result.omitted.excluded += 1;
      }
    }
  };
  walk("", 0);
  result.files.sort((x, y) => comparePaths(x.path, y.path));
  result.visited = seen;
  result.unknown_remainder = result.partial;
  const { excluded, linked, symlink, unsupported } = result.omitted;
  result.skipped = excluded + linked + symlink + unsupported;
  cache = result;
  return result;
}
