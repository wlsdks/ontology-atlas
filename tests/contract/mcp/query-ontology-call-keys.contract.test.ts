import { readFileSync, readdirSync, statSync } from "node:fs";
import { join, relative, resolve } from "node:path";
import { describe, expect, it } from "vitest";

import { surfaceTools } from "../server-session/tool-surface";

const repoRoot = resolve(__dirname, "../../..");

/**
 * Every `query_ontology({...})` call an agent is shown (the app's agent packets and
 * prompts, the vault templates, the skills) must use only arguments the tool
 * accepts. A cut argument left in a packet is a call the server refuses the first
 * time an agent copies it.
 */
const ROOTS = ["src", "cli/templates", "cli/src", ".agents/skills", ".claude/skills"];
const TEXT_FILE = /\.(ts|tsx|mjs|md)$/;
const NOT_A_PACKET = /\.(test|spec)\.(ts|tsx|mjs)$/;

function filesUnder(directory: string): string[] {
  const found: string[] = [];
  for (const entry of readdirSync(directory)) {
    if (entry === "node_modules" || entry === "data") continue;
    const path = join(directory, entry);
    if (statSync(path).isDirectory()) found.push(...filesUnder(path));
    else if (TEXT_FILE.test(entry) && !NOT_A_PACKET.test(entry)) found.push(path);
  }
  return found;
}

/** The text of the `{...}` that opens at `start`, braces balanced, quoted text skipped. */
function balancedObject(text: string, start: number): string | null {
  let depth = 0;
  let quote: string | null = null;
  for (let index = start; index < text.length; index += 1) {
    const char = text[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
    else if (char === "{") depth += 1;
    else if (char === "}") {
      depth -= 1;
      if (depth === 0) return text.slice(start, index + 1);
    }
  }
  return null;
}

/** Keys written at the top level of one object literal, quoted or bare. */
function topLevelKeys(object: string): string[] {
  const keys: string[] = [];
  let depth = 0;
  let quote: string | null = null;
  for (let index = 0; index < object.length; index += 1) {
    const char = object[index];
    if (quote) {
      if (char === "\\") index += 1;
      else if (char === quote) quote = null;
      continue;
    }
    if (char === "{" || char === "[") depth += 1;
    else if (char === "}" || char === "]") depth -= 1;
    else if (depth === 1) {
      const key = /^(?:"([A-Za-z_]\w*)"|'([A-Za-z_]\w*)'|([A-Za-z_]\w*))\s*:/.exec(object.slice(index));
      const previous = object[index - 1] ?? "";
      if (key && /[{,\s]/.test(previous)) {
        keys.push(key[1] ?? key[2] ?? key[3]);
        index += key[0].length - 1;
        continue;
      }
    }
    if (char === '"' || char === "'" || char === "`") quote = char;
  }
  return keys;
}

const queryOntology = surfaceTools().find((tool) => tool.name === "query_ontology")!;
const accepted = new Set(Object.keys(queryOntology.inputSchema.properties));
const operations = new Set(queryOntology.inputSchema.properties.operation?.enum ?? []);

const calls: { file: string; call: string }[] = [];
for (const root of ROOTS) {
  for (const file of filesUnder(join(repoRoot, root))) {
    const text = readFileSync(file, "utf8");
    for (const match of text.matchAll(/query_ontology\(\{/g)) {
      const object = balancedObject(text, match.index + "query_ontology(".length);
      if (object) calls.push({ file: relative(repoRoot, file), call: object });
    }
  }
}

describe("query_ontology calls shown to agents use only arguments the tool accepts", () => {
  it("finds the calls, so the scan is not empty", () => {
    expect(calls.length).toBeGreaterThan(20);
  });

  it("the scanner reads bare and quoted keys and skips nested ones", () => {
    expect(topLevelKeys(`{operation:'path', from:A, "to":B, filter:{minDegree:2}}`)).toEqual([
      "operation",
      "from",
      "to",
      "filter",
    ]);
  });

  it.each(calls.map(({ file, call }) => [`${file}: ${call.replace(/\s+/g, " ").slice(0, 90)}`, call]))(
    "%s",
    (_label, call) => {
      const unknown = topLevelKeys(call as string).filter((key) => !accepted.has(key));
      expect(unknown, `not an argument of query_ontology: ${unknown.join(", ")}`).toEqual([]);
      const operation = /operation\s*:\s*['"]([a-z_]+)['"]/.exec(call as string)?.[1];
      if (operation) expect(operations.has(operation), `${operation} is not an operation`).toBe(true);
    },
  );
});
