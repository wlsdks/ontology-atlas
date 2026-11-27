import fs from "node:fs";
import path from "node:path";

/**
 * Every file that declares the app version. The MCP server ships the app's version so the
 * registry takes each release (docs/records/decisions/2026-11-28-mcp-version-follows-app-3ef6b195-7e4f-400f-a928-76ed621a31f2.md).
 */
const APP_VERSION_FILES = {
  package: "package.json",
  tauri: "src-tauri/tauri.conf.json",
  cargo: "src-tauri/Cargo.toml",
  mcp: "mcp/package.json",
};

function readIfPresent(root, relativePath) {
  const absolute = path.join(root, relativePath);
  return fs.existsSync(absolute) ? fs.readFileSync(absolute, "utf8") : null;
}

/** Reads the declared version from each file in `APP_VERSION_FILES`; a missing file or field is `undefined`. */
export function readAppVersions(root) {
  const jsonVersion = (relativePath) => {
    const text = readIfPresent(root, relativePath);
    return text === null ? undefined : JSON.parse(text).version;
  };
  const cargoToml = readIfPresent(root, APP_VERSION_FILES.cargo);
  return {
    package: jsonVersion(APP_VERSION_FILES.package),
    tauri: jsonVersion(APP_VERSION_FILES.tauri),
    cargo: cargoToml?.match(/\[package\][\s\S]*?\nversion\s*=\s*"([^"]+)"/)?.[1],
    mcp: jsonVersion(APP_VERSION_FILES.mcp),
  };
}

/** Each declaration that differs from `expected`, as `source=version` (`missing` when absent). */
export function versionMismatches(versions, expected) {
  return Object.entries(versions)
    .filter(([, version]) => version !== expected)
    .map(([source, version]) => `${source}=${version ?? "missing"}`);
}

/** The files a person edits together, for a message that tells them what to change. */
export const APP_VERSION_FILE_LIST = Object.values(APP_VERSION_FILES).join(", ");
