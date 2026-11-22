// The fake Tauri bridge: one handler per native command the app calls, answered
// from the sample library, the real repository and its git history.
import { createHash } from "node:crypto";
import { existsSync, readFileSync, statSync } from "node:fs";
import path from "node:path";

import { FAKE_SOURCE_ROOT, FAKE_VAULT_ROOT, MTIME, REPO, sha256 } from "./capture-context.mjs";
import { listDirectory, readText, realPath } from "./fake-filesystem.mjs";
import { readPlanningFile, walkPlanningFolder } from "../planning-inventory.mjs";
import {
  changeBriefing,
  commitDiff,
  gitHistory,
  lastChange,
  nodeRevisionContent,
  nodeRevisions,
} from "./repo-history.mjs";

const PLANNING_ROOT = `${FAKE_SOURCE_ROOT}/docs`;
const PLANNING_DIR = path.join(REPO, "docs");

const planningInventory = () => walkPlanningFolder(PLANNING_DIR, Math.floor(MTIME / 1000));
const planningBytes = (relativePath) => readPlanningFile(PLANNING_DIR, relativePath);

export function makeBridge(overlay, unstubbed) {
  const vaultRootOf = (input) => input.rootPath ?? input.vaultPath ?? FAKE_VAULT_ROOT;
  return async (command, input = {}) => {
    switch (command) {
      case "pick_vault_directory":
        return FAKE_VAULT_ROOT;
      case "vault_path_exists": {
        const root = vaultRootOf(input);
        const { full, rel } = realPath(root, input.relativePath);
        if (input.kind === "directory") {
          if (existsSync(full) && statSync(full).isDirectory()) return true;
          return root === FAKE_VAULT_ROOT && [...overlay.keys()].some((file) => file.startsWith(`${rel}/`));
        }
        if (root === FAKE_VAULT_ROOT && overlay.has(rel)) return true;
        return existsSync(full) && statSync(full).isFile();
      }
      case "list_vault_directory":
        return listDirectory(vaultRootOf(input), input.relativePath, overlay);
      case "read_vault_text_file":
        return { text: readText(vaultRootOf(input), input.relativePath, overlay), lastModified: MTIME };
      case "read_vault_binary_file": {
        const text = readText(vaultRootOf(input), input.relativePath, overlay);
        return { base64: Buffer.from(text, "utf8").toString("base64"), lastModified: MTIME };
      }
      case "write_vault_text_file":
      case "create_vault_text_file": {
        const { rel } = realPath(vaultRootOf(input), input.relativePath);
        overlay.set(rel, String(input.content ?? input.contents ?? input.text ?? ""));
        return null;
      }
      case "vault_fingerprint":
        return `capture-${overlay.size}`;
      case "hash_vault_files":
        return (input.relativePaths ?? []).map((relativePath) => {
          try {
            return { relativePath, sha256: sha256(readText(vaultRootOf(input), relativePath, overlay)) };
          } catch {
            return { relativePath, sha256: null };
          }
        });
      case "git_probe":
        return { installed: true, version: "git version 2.49.0", platform: "macos" };
      case "git_status":
        return {
          ok: true,
          initialized: true,
          repoRoot: FAKE_SOURCE_ROOT,
          branch: "main",
          upstream: "origin/main",
          changedCount: 0,
          changes: [],
          ahead: 0,
          behind: 0,
          stagedOutsideVault: [],
        };
      case "git_history":
        return gitHistory(input.limit, input.path);
      case "vault_node_revisions":
        return input.slugs.flatMap((slug) => nodeRevisions(slug, input.maxRevisions));
      case "vault_node_revision_content":
        return nodeRevisionContent(input.slug, input.revision);
      case "git_diff":
        return { count: 0, files: [], diff: "", truncated: false };
      case "git_commit_diff":
        return commitDiff(input.hash);
      case "git_document_diff":
        return { path: input.relativePath, diff: "", untracked: false, tooLarge: false };
      case "git_paths_last_change":
        return lastChange(input.repoPaths, input.vaultPaths);
      case "list_harness_source_directory": {
        const { full } = realPath(FAKE_SOURCE_ROOT, input.relativePath);
        if (!existsSync(full)) throw new Error("harness-path-missing");
        if (!statSync(full).isDirectory()) throw new Error("harness-not-a-directory");
        return listDirectory(FAKE_SOURCE_ROOT, input.relativePath, overlay).filter((entry) => !entry.name.startsWith(".env"));
      }
      case "read_harness_source_text": {
        const { full } = realPath(FAKE_SOURCE_ROOT, input.relativePath);
        if (!existsSync(full)) throw new Error("harness-path-missing");
        if (!statSync(full).isFile()) throw new Error("harness-not-a-file");
        const text = readFileSync(full, "utf8");
        return { text, lastModified: MTIME, bytes: Buffer.byteLength(text) };
      }
      case "harness_source_path_exists":
        return existsSync(realPath(FAKE_SOURCE_ROOT, input.relativePath).full);
      case "read_vault_text_files":
        return {
          binary: vaultTextFrames(
            (input.relativePaths ?? []).map((relativePath) => {
              try {
                return { relativePath, text: readText(vaultRootOf(input), relativePath, overlay), error: null };
              } catch (error) {
                return { relativePath, text: null, error: String(error.message ?? error) };
              }
            }),
          ),
        };
      case "read_vault_text_tail":
        return readText(vaultRootOf(input), input.relativePath, overlay).split("\n").slice(-input.maxLines).join("\n");
      case "git_bound_evidence_dates":
        return {
          status: "measured",
          vaultChanges: lastChange([], input.vaultPaths).map((row) => ({ ...row, dirty: false })),
          sourceChanges: lastChange(input.sourcePaths, []).map((row) => ({ ...row, dirty: false })),
          omittedVaultPaths: [], omittedSourcePaths: [],
        };
      case "planning_supported":
        return true;
      case "planning_pick_folder":
        return { generation: 1, folder: "docs", path: PLANNING_ROOT };
      case "planning_scan":
        return planningInventory();
      case "planning_read_file":
        return { binary: planningBytes(input.path) };
      case "planning_open_document":
        return {
          binary: Buffer.concat([
            Buffer.from(createHash("md5").update(planningBytes(input.path)).digest("hex")),
            planningBytes(input.path),
          ]),
        };
      case "git_change_briefing":
        return changeBriefing(input.startEpoch, input.endEpoch);
      case "git_briefing_repositories":
        return [];
      case "git_briefing_saved_pull_descriptions":
        return { status: "unsupported", pulls: null, omitted: 0, ignored: 0 };
      case "git_change_briefing_patch":
        return { status: "unavailable", patch: "", truncated: false };
      case "plugin:event|listen":
        return Number(input.handler);
      case "plugin:event|unlisten":
        return null;
      case "acp_detect_runtimes":
        return [];
      case "acp_start":
        return new Promise(() => {});
      case "discover_mcp_connectors":
        return { servers: [], problems: [] };
      case "discover_source_candidates":
        return { candidates: [], truncated: false, unreadableRoots: [] };
      case "mcp_bundled_server":
        return { path: `${FAKE_SOURCE_ROOT}/mcp`, available: true, reason: null };
      case "secret_status":
      case "connector_secret_status":
        return { provider: input.provider, stored: false, last4: null };
      case "start_vault_watch":
      case "ensure_vault_directory":
      case "log_webview_error":
        return null;
      default:
        unstubbed.add(command);
        throw new Error(`unstubbed native command: ${command}`);
    }
  };
}

/** The framing `read_vault_text_files` answers; `src/shared/lib/vault-folder/vault-text-frames.ts` decodes it. */
export function vaultTextFrames(reads) {
  const framed = (text) => {
    const bytes = Buffer.from(text, "utf8");
    const length = Buffer.alloc(4);
    length.writeUInt32LE(bytes.length);
    return [length, bytes];
  };
  const count = Buffer.alloc(4);
  count.writeUInt32LE(reads.length);
  const parts = [count];
  for (const read of reads) {
    parts.push(Buffer.of(read.text === null ? 1 : 0), ...framed(read.relativePath));
    if (read.text === null) {
      parts.push(...framed(read.error));
      continue;
    }
    const stamp = Buffer.alloc(8);
    stamp.writeDoubleLE(MTIME);
    parts.push(stamp, ...framed(read.text));
  }
  return Buffer.concat(parts);
}
