// What every part of the gateway capture agrees on: where the real repository is,
// the fake roots the app is told about, and one timestamp for every file it reads.
import { createHash } from "node:crypto";
import path from "node:path";
import { fileURLToPath } from "node:url";

export const REPO = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "../../..");
export const FAKE_SOURCE_ROOT = "/work/ontology-atlas";
export const FAKE_VAULT_ROOT = `${FAKE_SOURCE_ROOT}/docs/ontology`;
export const VAULT_DIR = path.join(REPO, "docs/ontology");
export const MTIME = Date.parse("2026-09-23T09:00:00Z");

export const sha256 = (text) => createHash("sha256").update(text).digest("hex");
