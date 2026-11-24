import { readFileSync } from "node:fs";
import path from "node:path";

import { ESLint } from "eslint";
import { describe, expect, it } from "vitest";

const REPO_ROOT = path.resolve(__dirname, "../../..");
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
    .filter((message) => /stateRef|HomePageImpl/.test(message.message))
    .map((message) => `${message.line}: ${message.message}`);
}

describe("closure scope lint", () => {
  it("the vault hooks and the map page the rules name still exist", () => {
    for (const [name, file] of VAULT_HOOKS) {
      expect(readFileSync(path.join(REPO_ROOT, file), "utf8")).toMatch(new RegExp(`export function ${name}\\(`));
    }
    expect(readFileSync(path.join(REPO_ROOT, MAP_PAGE), "utf8")).toMatch(/function HomePageImpl\(/);
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
});
