import assert from "node:assert/strict";
import test from "node:test";

import {
  migrate,
  prepare,
} from "./2026-08-02-add-node-uids.mjs";

test("UID migration assigns one fresh lowercase UUIDv4 to a kind node that has none", () => {
  const file = {
    path: "/vault/project.md",
    relativePath: "project.md",
    raw: "---\nkind: project\nslug: project\ntitle: Project\n---\n",
  };

  const context = prepare([file]);
  const result = migrate(file, context);

  assert.match(
    result.raw,
    /^---\nuid: [0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}\nkind:/,
  );
});

test("UID migration rejects malformed existing identity before creating a write plan", () => {
  const file = {
    path: "/vault/project.md",
    relativePath: "project.md",
    raw: "---\nuid: project-12\nkind: project\nslug: project\n---\n",
  };

  assert.throws(() => prepare([file]), /invalid UID.*project\.md/i);
});

test("UID migration rejects duplicate primary or merged identity claims before writes", () => {
  const shared = "01890f3e-7b5d-4c0a-8f14-123456789abc";
  const files = [
    {
      path: "/vault/a.md",
      relativePath: "a.md",
      raw: `---\nuid: ${shared}\nkind: project\n---\n`,
    },
    {
      path: "/vault/b.md",
      relativePath: "b.md",
      raw: `---\nuid: 11890f3e-7b5d-4c0a-8f14-123456789abc\nmerged_uids: [${shared}]\nkind: domain\n---\n`,
    },
  ];

  assert.throws(() => prepare(files), /duplicate UID.*a\.md.*b\.md/i);
});
