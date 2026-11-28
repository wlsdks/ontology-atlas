import { readFileSync } from "node:fs";
import { join } from "node:path";

/** The addresses the router knows, from the committed route tree: `/$locale/topology`, with the trailing slash dropped. */
export function routeTreeAddresses(root: string): Set<string> {
  const tree = readFileSync(join(root, "src/app/route-tree.gen.ts"), "utf8");
  const interfaceBody = tree.split("export interface FileRoutesByFullPath {")[1]?.split("}")[0] ?? "";
  return new Set([...interfaceBody.matchAll(/'(\/[^']*)'/g)].map((match) => match[1].replace(/(.)\/$/, "$1")));
}
