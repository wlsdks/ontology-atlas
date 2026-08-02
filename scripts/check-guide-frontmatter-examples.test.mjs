import assert from "node:assert/strict";
import test from "node:test";
import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");
const GUIDE_DIR = path.join(ROOT, "docs", "guide");
const UID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

test("every complete ontology frontmatter example in the public guide carries a valid UID", () => {
  const nodeExamples = [];
  for (const name of readdirSync(GUIDE_DIR).filter((entry) => entry.endsWith(".md"))) {
    const raw = readFileSync(path.join(GUIDE_DIR, name), "utf8");
    for (const match of raw.matchAll(/```markdown\n([\s\S]*?)```/g)) {
      const block = match[1];
      if (!/^kind:\s*\S+/m.test(block)) continue;
      nodeExamples.push({ name, block });
    }
  }

  assert.ok(nodeExamples.length > 0, "public guide node example census must not be empty");
  for (const { name, block } of nodeExamples) {
    const uid = block.match(/^uid:\s*(\S+)$/m)?.[1];
    assert.ok(uid && UID_RE.test(uid), `${name}: complete node example requires lowercase UUIDv4 uid`);
  }
});
