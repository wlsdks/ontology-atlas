// What `git log` and friends say about this repository, shaped the way the
// desktop app's native commands answer.
import { execFileSync } from "node:child_process";
import { existsSync, statSync } from "node:fs";
import path from "node:path";

import { FAKE_SOURCE_ROOT, REPO, sha256 } from "./capture-context.mjs";

function git(...gitArgs) {
  return execFileSync("git", ["-C", REPO, ...gitArgs], { encoding: "utf8", maxBuffer: 64 << 20 });
}

const STATUS = { A: "added", M: "modified", D: "deleted", R: "renamed" };

export function changeEntry(repoPath, code, previous) {
  const vaultPath = repoPath.replace(/^docs\/ontology\//, "");
  const slug = vaultPath.replace(/\.md$/, "");
  const folder = slug.includes("/") ? slug.split("/")[0] : null;
  const kind = folder ? folder.replace(/s$/, "") : slug === "ontology-atlas" ? "project" : null;
  return {
    path: vaultPath,
    status: STATUS[code[0]] ?? "modified",
    kind,
    slug,
    renamedFrom: previous ? previous.replace(/^docs\/ontology\//, "") : null,
  };
}

export function relativeTime(iso) {
  const days = Math.round((Date.parse("2026-09-24T09:00:00Z") - Date.parse(iso)) / 86_400_000);
  if (days <= 0) return "today";
  if (days === 1) return "yesterday";
  if (days < 7) return `${days} days ago`;
  const weeks = Math.round(days / 7);
  return weeks === 1 ? "1 week ago" : `${weeks} weeks ago`;
}

const NODE_SLUG = /^[a-z0-9][a-z0-9/-]*$/;
const REVISION = /^[0-9a-f]{40}$/;

/** A concept's commits newest first, as the desktop app's `vault_node_revisions` lists them. */
export function nodeRevisions(slug, maxRevisions) {
  if (!NODE_SLUG.test(slug)) return [];
  const count = Number.isInteger(maxRevisions) && maxRevisions > 0 ? maxRevisions : 8;
  return git("log", `-n${count}`, "--pretty=format:%H %cI", "--no-renames", "--", `docs/ontology/${slug}.md`)
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [revision, isoTime] = line.trim().split(" ");
      return { slug, isoTime, revision };
    });
}

export function nodeRevisionContent(slug, revision) {
  if (!NODE_SLUG.test(slug) || !REVISION.test(revision)) return null;
  try {
    return git("show", `${revision}:docs/ontology/${slug}.md`);
  } catch {
    return null;
  }
}

export function gitHistory(limit, onlyPath) {
  const pathspec = onlyPath ? `docs/ontology/${onlyPath}` : "docs/ontology";
  const raw = git(
    "log",
    `-n${limit ?? 50}`,
    "--name-status",
    "--format=%x1e%H%x1f%h%x1f%s%x1f%cI",
    "--",
    pathspec,
  );
  return raw
    .split("\x1e")
    .filter((block) => block.trim())
    .map((block) => {
      const [head, ...lines] = block.split("\n");
      const [hash, shortHash, subject, isoTime] = head.split("\x1f");
      const files = lines
        .filter((line) => line.trim())
        .map((line) => {
          const [code, first, second] = line.split("\t");
          const target = second ?? first;
          if (!target.startsWith("docs/ontology/")) return null;
          return changeEntry(target, code, second ? first : null);
        })
        .filter(Boolean);
      return { shortHash, hash, subject, relativeTime: relativeTime(isoTime), isoTime, files };
    });
}

export function commitDiff(hash) {
  const diff = git("show", "--format=", hash, "--", "docs/ontology");
  const files = git("show", "--format=", "--name-status", hash, "--", "docs/ontology")
    .split("\n")
    .filter((line) => line.trim())
    .map((line) => {
      const [code, first, second] = line.split("\t");
      return changeEntry(second ?? first, code, second ? first : null);
    });
  return { count: files.length, files, diff: diff.slice(0, 200_000), truncated: diff.length > 200_000 };
}

export function lastChange(repoPaths, vaultPaths) {
  const out = [];
  const probe = (repoPath, reported) => {
    const full = path.join(REPO, repoPath);
    const exists = existsSync(full);
    let lastChangedAt = null;
    try {
      lastChangedAt = git("log", "-1", "--format=%cI", "--", repoPath).trim() || null;
    } catch {
      lastChangedAt = null;
    }
    out.push({ path: reported, exists, isDir: exists && statSync(full).isDirectory(), lastChangedAt });
  };
  for (const repoPath of repoPaths ?? []) probe(repoPath, repoPath);
  for (const vaultPath of vaultPaths ?? []) probe(`docs/ontology/${vaultPath}`, vaultPath);
  return out;
}

export function changeBriefing(startEpoch, endEpoch) {
  const raw = git(
    "log",
    "--first-parent",
    "--diff-merges=first-parent",
    "--name-only",
    "--format=%x1e%H%x1f%ct%x1f%s%x1f%B%x1f",
    `--since-as-filter=@${startEpoch - 1}`,
    `--until=@${endEpoch - 1}`,
    "HEAD",
    "--",
  );
  const commits = raw
    .split("\x1e")
    .filter((block) => block.trim())
    .map((block) => {
      const [hash, committed, subject, message, rest] = block.split("\x1f");
      return {
        hash,
        subject,
        message: message.trim(),
        messageComplete: true,
        committedAt: new Date(Number(committed) * 1000).toISOString(),
        paths: rest.split("\n").filter((line) => line.trim()),
      };
    });
  const head = git("rev-parse", "HEAD").trim();
  const tip = commits[0]?.hash ?? null;
  const base = tip ? git("rev-parse", `${commits.at(-1).hash}^`).trim() : null;
  return {
    status: "measured",
    sourceRoot: FAKE_SOURCE_ROOT,
    snapshot: sha256(`${head}:${startEpoch}:${endEpoch}`),
    head,
    base,
    tip,
    commits,
    netPaths: tip ? git("diff", "--name-only", base, tip).split("\n").filter(Boolean) : null,
    limit: 200,
    partialReasons: [],
  };
}
