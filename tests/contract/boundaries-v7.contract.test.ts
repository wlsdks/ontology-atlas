import { ESLint } from "eslint";
import { beforeAll, describe, expect, it } from "vitest";

const ROOT = process.cwd();

const ALLOWED_VALUE_DIRECTIONS = [
  ["src/app/__boundaries-probe__.ts", "import '@/views/home';"],
  ["src/views/__boundaries-probe__.ts", "import '@/widgets/topology-map-v2';"],
  ["src/widgets/__boundaries-probe__.ts", "import '@/features/ontology-blocks';"],
  ["src/features/__boundaries-probe__.ts", "import '@/entities/knowledge-graph';"],
  ["src/entities/__boundaries-probe__.ts", "import '@/shared/lib/cn';"],
  ["src/shared/__boundaries-probe__.ts", "import '@/shared/lib/cn';"],
] as const;

let eslint: ESLint;

beforeAll(() => {
  eslint = new ESLint({ cwd: ROOT });
});

async function lintText(text: string, filePath: string) {
  const [result] = await eslint.lintText(text, { filePath });
  return result;
}

describe("FSD boundaries — v7 policy migration", () => {
  it("uses v7 policies and object entity selectors", async () => {
    const config = await eslint.calculateConfigForFile("src/entities/__boundaries-probe__.ts");
    const options = config.rules["boundaries/dependencies"]?.[1] as
      | {
          policies?: Array<{
            from?: { element?: unknown };
            allow?: { to?: { element?: unknown } };
          }>;
          rules?: unknown;
        }
      | undefined;

    expect(options?.policies).toBeDefined();
    expect(options?.rules).toBeUndefined();
    expect(options?.policies).toHaveLength(7);
    for (const policy of options?.policies ?? []) {
      expect(policy.from?.element).toBeDefined();
      expect(policy.allow?.to?.element).toBeDefined();
    }
  });

  it("preserves all six value-import directions plus the type-only exception", async () => {
    for (const [filePath, text] of ALLOWED_VALUE_DIRECTIONS) {
      const result = await lintText(text, filePath);
      expect(result.errorCount, filePath).toBe(0);
    }

    const typeOnly = await lintText(
      "import type { KnowledgeGraphNode } from '@/entities/knowledge-graph';\nexport type Probe = KnowledgeGraphNode;\n",
      "src/shared/__boundaries-probe__.ts",
    );
    expect(typeOnly.errorCount).toBe(0);

    const sameDirectionValueImport = await lintText(
      "import { getOntologyKindTone } from '@/entities/ontology-class';\nexport const probe = getOntologyKindTone;\n",
      "src/shared/__boundaries-probe__.ts",
    );
    expect(sameDirectionValueImport.errorCount).toBe(1);
    expect(sameDirectionValueImport.messages[0]?.ruleId).toBe("boundaries/dependencies");
  });

  it.each([
    [
      "entities → features",
      "src/entities/__boundaries-probe__.ts",
      "import { BlockImportModule } from '@/features/ontology-blocks';\nexport const probe = BlockImportModule;\n",
    ],
    [
      "views → app-layer",
      "src/views/__boundaries-probe__.ts",
      "import { AppShell } from '@/app-providers/providers/AppShell';\nexport const probe = AppShell;\n",
    ],
  ])("still blocks the upward value dependency %s", async (_label, filePath, source) => {
    const result = await lintText(source, filePath);

    expect(result.errorCount).toBe(1);
    expect(result.messages[0]?.ruleId).toBe("boundaries/dependencies");
  });
});
