import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const VAULT_HOOKS = [
  ["useLocalVaultInternal", "src/entities/vault-session/model/local-vault/use-local-vault.ts"],
  ["useVaultChoice", "src/entities/vault-session/model/local-vault/use-vault-choice.ts"],
  ["useVaultDocWrites", "src/entities/vault-session/model/local-vault/use-vault-doc-writes.ts"],
] as const;
const MAP_PAGE = "src/views/home/ui/HomePage.tsx";
const LINT_TIMEOUT_MS = 30_000;
const eslint = new ESLint({ cwd: REPO_ROOT });

async function closureScopeErrors(code: string, filePath: string): Promise<string[]> {
  const [result] = await eslint.lintText(code, { filePath });
  return result.messages
    .filter((message) => message.ruleId === "no-restricted-syntax")
    .filter((message) => /stateRef|derived hook|HomePageImpl/.test(message.message))
    .map((message) => `${message.line}: ${message.message}`);
}

function sourceFiles(dir: string): string[] {
  return readdirSync(path.join(REPO_ROOT, dir), { withFileTypes: true, recursive: true })
    .filter((entry) => entry.isFile() && /\.tsx?$/.test(entry.name) && !/\.(test|spec)\.tsx?$/.test(entry.name))
    .map((entry) => path.join(entry.parentPath, entry.name));
}

describe("closure scope lint", () => {
  it("the vault hooks and the map page the rules name still exist", () => {
    for (const [name, file] of VAULT_HOOKS) {
      expect(readFileSync(path.join(REPO_ROOT, file), "utf8")).toMatch(new RegExp(`export function ${name}\\(`));
    }
    expect(readFileSync(path.join(REPO_ROOT, MAP_PAGE), "utf8")).toMatch(/function HomePageImpl\(/);
  });

  it("derived hooks exist for the module-level rule to guard", () => {
    const calls = sourceFiles("src").filter((file) => /\bderivedHook\(/.test(readFileSync(file, "utf8")));
    expect(calls.length).toBeGreaterThan(0);
  });

  it.each(VAULT_HOOKS)("refuses a callback in %s that reads state", async (name, file) => {
    const planted = [
      `export function ${name}() {`,
      "  const [state] = useState(null);",
      "  const refresh = useCallback(() => state.handle, []);",
      "  const status = state.status;",
      "  return { refresh, status };",
      "}",
    ].join("\n");
    expect(await closureScopeErrors(planted, file)).toHaveLength(1);
  }, LINT_TIMEOUT_MS);

  it("refuses a callback in the map page that reads the vault read model", async () => {
    const planted = [
      "export function HomePageImpl() {",
      "  const topologyVaultReadModel = useTopologyVaultReadModel();",
      "  const gitVaultPath = topologyVaultReadModel.gitVaultPath;",
      "  const onPrepare = () => open(topologyVaultReadModel.gitVaultPath);",
      "  const onOpen = () => open(gitVaultPath);",
      "  return { onPrepare, onOpen };",
      "}",
    ].join("\n");
    expect(await closureScopeErrors(planted, MAP_PAGE)).toHaveLength(1);
  }, LINT_TIMEOUT_MS);

  it("refuses a derived hook made inside a function and allows one at module level", async () => {
    const planted = [
      "const useAtModuleLevel = derivedHook((a: number) => a);",
      "export function useInside(a: number) {",
      "  return derivedHook((b: number) => b)(a) + useAtModuleLevel(a);",
      "}",
    ].join("\n");
    expect(await closureScopeErrors(planted, "src/views/home/model/probe.ts")).toHaveLength(1);
  }, LINT_TIMEOUT_MS);
});
