#!/usr/bin/env node
// Dogfood walk: asks this checkout's MCP server what an agent asks after registering it, on the
// repository's own ontology vault. Never writes; the destructive tools are previews only. The walk
// lives in scripts/lib/dogfood-walk/.

import { fileURLToPath } from "node:url";
import { resolve } from "node:path";
import { runDogfoodWalk } from "../lib/dogfood-walk/run-dogfood-walk.mjs";

if (fileURLToPath(import.meta.url) === resolve(process.argv[1] ?? "")) {
  process.exitCode = await runDogfoodWalk().catch((error) => {
    console.error("dogfood walk failed:", error);
    return 1;
  });
}
