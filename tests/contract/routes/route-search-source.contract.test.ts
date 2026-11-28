import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import { describe, expect, it } from "vitest";

/**
 * A route's critical chunk carries its `validateSearch`, and the bundler splits only `component`. A schema
 * imported through a view's public file drags that whole view into the chunk every page of the site loads
 * (the download page's first load grew by 700 KB brotli this way), so a route takes each schema from
 * `shared/lib/navigation/screen-searches` or from a file in `src/app` beside its screen.
 */
const ROUTES = join(process.cwd(), "src", "app", "routes");

function routeFiles(dir: string, out: string[] = []): string[] {
  for (const name of readdirSync(dir)) {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) routeFiles(path, out);
    else if (name.endsWith(".tsx") && !name.endsWith(".test.tsx")) out.push(path);
  }
  return out;
}

const FILES = routeFiles(ROUTES).map((path) => ({ rel: relative(process.cwd(), path), text: readFileSync(path, "utf8") }));
const VALIDATE = /validateSearch:\s*([A-Za-z]\w*)/u;

describe("a route's search schema comes from a light module", () => {
  it("finds the routes that declare a schema, so the check does not idle", () => {
    expect(FILES.filter((f) => VALIDATE.test(f.text)).length).toBeGreaterThanOrEqual(8);
  });

  it("no route imports its schema from a view", () => {
    const offenders = FILES.flatMap((f) => {
      const name = VALIDATE.exec(f.text)?.[1];
      if (!name) return [];
      const fromView = new RegExp(`import\\s*\\{[^}]*\\b${name}\\b[^}]*\\}\\s*from\\s*['"]@/(?:views|widgets|features)/`, "u");
      return fromView.test(f.text) ? [`${f.rel}: ${name}`] : [];
    });
    expect(offenders).toEqual([]);
  });
});
