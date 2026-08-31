import {
  generateNodeUid,
  inspectMergedUids,
  nodeUidIssue,
} from "../../cli/src/lib/schema.mjs";
import { parseFrontmatter } from "../lib/parse-frontmatter.mjs";

export const id = "2026-08-02-add-node-uids";
export const description =
  "Mint an immutable lowercase UUIDv4 uid on every kind node and verify the existing identity claims.";

function insertUid(raw, uid) {
  if (raw.startsWith("---\r\n")) {
    return `---\r\nuid: ${uid}\r\n${raw.slice(5)}`;
  }
  if (raw.startsWith("---\n")) {
    return `---\nuid: ${uid}\n${raw.slice(4)}`;
  }
  throw new Error("ontology node frontmatter must start with an opening --- delimiter");
}

export function prepare(files) {
  const assignments = new Map();
  const claims = new Map();
  for (const file of files) {
    const { frontmatter } = parseFrontmatter(file.raw);
    if (typeof frontmatter.kind !== "string" || !frontmatter.kind.trim()) continue;
    if (frontmatter.uid === undefined || frontmatter.uid === null || frontmatter.uid === "") {
      let uid = generateNodeUid();
      while (claims.has(uid)) uid = generateNodeUid();
      assignments.set(file.relativePath, uid);
      claims.set(uid, file.relativePath);
      continue;
    }
    const issue = nodeUidIssue(frontmatter.uid);
    if (issue) throw new Error(`invalid UID in ${file.relativePath}: ${issue}`);
    const merged = inspectMergedUids(frontmatter.uid, frontmatter.merged_uids);
    if (merged.invalidIssue) {
      throw new Error(
        `invalid merged UID history in ${file.relativePath}: ${merged.invalidIssue}`,
      );
    }
    if (merged.nonCanonical) {
      throw new Error(`non-canonical merged UID history in ${file.relativePath}`);
    }
    for (const uid of [frontmatter.uid, ...merged.canonical]) {
      const owner = claims.get(uid);
      if (owner) throw new Error(`duplicate UID ${uid} in ${owner} and ${file.relativePath}`);
      claims.set(uid, file.relativePath);
    }
  }
  return { assignments };
}

export function migrate(file, context = prepare([file])) {
  const uid = context.assignments.get(file.relativePath);
  if (!uid) return null;
  return { raw: insertUid(file.raw, uid) };
}
