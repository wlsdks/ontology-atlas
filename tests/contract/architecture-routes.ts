import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The route list of `docs/ARCHITECTURE.md` (the first code block under "Routes"): one path per line. */
export function architectureRoutes(root: string): string[] {
  const architecture = readFileSync(join(root, "docs/ARCHITECTURE.md"), "utf8");
  const section = architecture.split(/^## Routes$/m)[1] ?? "";
  const block = section.split("```")[1] ?? "";
  return block
    .split("\n")
    .filter((line) => line.startsWith("/"))
    .map((line) => line.split(/\s+/)[0]);
}
