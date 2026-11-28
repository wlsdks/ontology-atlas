import { readFileSync } from "node:fs";
import { join } from "node:path";

/**
 * The addresses a committed route tree knows: `/$locale/topology`, with the trailing slash dropped. The default
 * tree holds every route; `app-route-tree.gen.ts` is the installed app's, without the website-only pages.
 */
export function routeTreeAddresses(root: string, treeFile = "route-tree.gen.ts"): Set<string> {
  const tree = readFileSync(join(root, "src/app", treeFile), "utf8");
  const interfaceBody = tree.split("export interface FileRoutesByFullPath {")[1]?.split("}")[0] ?? "";
  return new Set([...interfaceBody.matchAll(/'(\/[^']*)'/g)].map((match) => match[1].replace(/(.)\/$/, "$1")));
}
