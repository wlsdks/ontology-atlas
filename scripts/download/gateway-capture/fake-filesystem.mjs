// Answers the app's file reads from the real repository plus the in-memory
// overlay, and refuses any path that would leave the repository.
import { existsSync, readdirSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { FAKE_SOURCE_ROOT, FAKE_VAULT_ROOT, REPO, VAULT_DIR } from "./capture-context.mjs";

/** Maps a fake root plus relative path to a real path, refusing anything outside the repo. */
export function realPath(root, relativePath = "") {
  const rel = String(relativePath ?? "").replace(/^\/+/, "").replace(/\/+$/, "");
  let base;
  if (root === FAKE_VAULT_ROOT) base = VAULT_DIR;
  else if (root === FAKE_SOURCE_ROOT) base = REPO;
  else throw new Error(`unknown root ${root}`);
  const full = path.resolve(base, rel);
  if (!full.startsWith(REPO)) throw new Error(`outside the repository: ${rel}`);
  return { full, rel };
}

/** Folders a real scan would never want from this checkout. */
const SKIP = new Set(["node_modules", ".next", "out", "output", ".git", "target", "coverage"]);

export function listDirectory(root, relativePath, overlay) {
  const { full, rel } = realPath(root, relativePath);
  const entries = new Map();
  if (existsSync(full) && statSync(full).isDirectory()) {
    for (const name of readdirSync(full)) {
      if (SKIP.has(name)) continue;
      const kind = statSync(path.join(full, name)).isDirectory() ? "directory" : "file";
      entries.set(name, kind);
    }
  }
  if (root === FAKE_VAULT_ROOT) {
    const prefix = rel ? `${rel}/` : "";
    for (const file of overlay.keys()) {
      if (!file.startsWith(prefix)) continue;
      const [name, child] = file.slice(prefix.length).split("/");
      if (name) entries.set(name, child ? "directory" : "file");
    }
  }
  if (!entries.size && !(existsSync(full) && statSync(full).isDirectory())) {
    throw new Error(`missing directory ${rel}`);
  }
  return [...entries].map(([name, kind]) => ({ name, kind }));
}

export function readText(root, relativePath, overlay) {
  const { full, rel } = realPath(root, relativePath);
  if (root === FAKE_VAULT_ROOT && overlay.has(rel)) return overlay.get(rel);
  if (existsSync(full) && statSync(full).isFile()) return readFileSync(full, "utf8");
  throw new Error(`missing ${rel}`);
}
