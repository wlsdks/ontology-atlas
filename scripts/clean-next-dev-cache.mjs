#!/usr/bin/env node
import fs from "node:fs";
import path from "node:path";

export function cleanNextDevCache(root = process.cwd()) {
  const devDir = path.join(root, ".next", "dev");
  fs.rmSync(devDir, { recursive: true, force: true });
  return devDir;
}

if (import.meta.url === `file://${process.argv[1]}`) {
  const removed = cleanNextDevCache();
  console.log(`[next-dev-cache] removed ${path.relative(process.cwd(), removed)}`);
}
