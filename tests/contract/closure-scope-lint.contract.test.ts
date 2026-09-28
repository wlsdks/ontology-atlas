import { readFileSync, readdirSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../..");
const VAULT_HOOK = "src/entities/vault-session/model/use-local-vault.ts";
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
  it("the vault hook and the map page the rules name still exist", () => {
    expect(readFileSync(path.join(REPO_ROOT, VAULT_HOOK), "utf8")).toMatch(/export function useLocalVaultInternal\(/);
    expect(readFileSync(path.join(REPO_ROOT, MAP_PAGE), "utf8")).toMatch(/function HomePageImpl\(/);
  });

  it("derived hooks exist for the module-level rule to guard", () => {
    const calls = sourceFiles("src").filter((file) => /\bderivedHook\(/.test(readFileSync(file, "utf8")));
    expect(calls.length).toBeGreaterThan(0);
  });

  it("refuses a callback in the vault hook that reads state", async () => {
    const planted = [
      "export function useLocalVaultInternal() {",
      "  const [state] = useState(null);",
      "  const refresh = useCallback(() => state.handle, []);",
      "  const status = state.status;",
      "  return { refresh, status };",
      "}",
    ].join("\n");
    expect(await closureScopeErrors(planted, VAULT_HOOK)).toHaveLength(1);
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
