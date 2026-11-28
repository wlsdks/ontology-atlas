import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { describe, expect, it } from "vitest";
import GOLDEN from "../../fixtures/containment-golden.json";
import {
  CONTAINMENT_KEYS,
  containmentKeyFor,
  kindForContainmentKey,
} from "@/shared/lib/vault-document/containment-keys";
import { KIND_EXPECTED_EXTRAS } from "@/shared/lib/vault-document/validate-vault-document";
import { PRODUCT_DISCIPLINE } from "@/features/vault-agent/model/system-prompt";

/**
 * Vault schema contract between the app and the MCP server: the tables the app keeps its own copy
 * of. `tests/fixtures/containment-golden.json` holds what the script server's schema answered when
 * it was recorded (2026-11-28). The server's own write helpers (node UID, frontmatter order, folder
 * for a kind, flat slugs, the qualification gate) are tested in its crates.
 */

const serverSurface = resolve(__dirname, "../../../src-tauri/crates/mcp-server/surface");
const serverSchema = readFileSync(
  resolve(__dirname, "../../../src-tauri/crates/vault-document/src/schema.rs"),
  "utf8",
);

describe("vault kind schema contract", () => {
  /*
   * Which list a kind change moves an entry into: the app reclassify and the server's `rename_concept`
   * with `newKind` / `merge_concepts` use two copies of one table, so a drift would move an entry on
   * one surface only.
   */
  describe("containment lists — the app places an entry in the list the server does", () => {
    const kinds = Object.keys(GOLDEN.keyHeldBy);
    for (const holder of kinds) {
      it(`${holder || "(no kind)"} keeps the same lists`, () => {
        const recorded = (GOLDEN.keyHeldBy as Record<string, Record<string, string | null>>)[holder];
        for (const child of kinds) {
          expect(containmentKeyFor(holder, child), `${holder} → ${child}`).toBe(recorded[child]);
        }
      });
    }

    it("names the same kind for every list, and holds spec §5's rows", () => {
      expect(CONTAINMENT_KEYS).toEqual(Object.values(GOLDEN.keyForKind));
      const kindForKey = (key: string) =>
        Object.entries(GOLDEN.keyForKind).find(([, listKey]) => listKey === key)?.[0] ?? null;
      for (const key of [...CONTAINMENT_KEYS, "contains", "relates", "domain"]) {
        expect(kindForContainmentKey(key), key).toBe(kindForKey(key));
      }
      // Spec §5: a project or domain keeps capabilities; a capability keeps elements and never
      // capabilities (a same-kind bridge is a person's decision, not a rewrite's).
      expect(containmentKeyFor("domain", "element")).toBe("elements");
      expect(containmentKeyFor("capability", "capability")).toBeNull();
      expect(containmentKeyFor("domain", "domain")).toBeNull();
      expect(containmentKeyFor("project", "domain")).toBe("domains");
      expect(containmentKeyFor("project", "document")).toBeNull();
    });
  });

  describe("UI KIND_EXPECTED_EXTRAS aligns with the server's required extras", () => {
    // The UI dictionary must produce the same missing-fields decision as the server:
    // capability and element expect ['domain'].
    it.each(GOLDEN.authorableKinds)("%s expects what the server recorded", (kind) => {
      const recorded = (GOLDEN.requiredExtras as Record<string, string[]>)[kind];
      expect(KIND_EXPECTED_EXTRAS[kind as keyof typeof KIND_EXPECTED_EXTRAS]).toEqual(recorded);
    });
  });
});

/**
 * The construction text the app's chat prompt carries, against the texts the server authors: the
 * meta-model boundary is the server's guide, copied byte for byte into the prompt (`src/` and the
 * server are separate programs and cannot cross-import).
 */
describe("construction spec text: the server's guide against the app chat prompt", () => {
  it("the meta-model boundary is carried byte for byte and separates authorable from reserved", () => {
    const guides = JSON.parse(readFileSync(resolve(serverSurface, "guides.json"), "utf8")) as {
      texts: Record<string, string>;
    };
    expect(PRODUCT_DISCIPLINE).toContain(guides.texts.meta_model);
    // The schema decides project's ownership scope. A prompt saying "domains only"
    // stops the agent proposing a capability or element directly under it.
    expect(["domains", "capabilities", "elements"].map((key) => containmentKeyFor("project", kindForContainmentKey(key)!))).toEqual([
      "domains",
      "capabilities",
      "elements",
    ]);
    expect(GOLDEN.authorableKinds).toEqual(["project", "domain", "capability", "element", "document"]);
    expect(PRODUCT_DISCIPLINE).toContain("Atlas has five authorable kinds");
    // `vault-readme` is generated-only and no agent may propose it. The server's guidance
    // carries this warning; the chat prompt must too.
    expect(serverSchema).toContain('"vault-readme"');
    expect(PRODUCT_DISCIPLINE).toContain("`vault-readme` is a reserved reader kind");
  });

  it("the point of the chat-only delta: before calling a tool, tell the person first", () => {
    // The server returns structured warnings to a program; chat speaks to a person. Without
    // this sentence the app quietly restructures the user's ontology and records it
    // only where the user will not look.
    expect(PRODUCT_DISCIPLINE).toContain("say so in the conversation first");
  });

  it("does not confuse element with a file list, and the structure audit reads the real parent", () => {
    const discipline = PRODUCT_DISCIPLINE.replace(/\s+/g, " ");
    expect(discipline).toContain(
      "A bare path is evidence for an element role, not a concept by itself",
    );
    expect(discipline).toContain(
      "folder, package, team, workflow, technology, or README heading is",
    );
    expect(PRODUCT_DISCIPLINE).toContain(
      "For a structure audit, census and list results only choose suspects",
    );
    expect(PRODUCT_DISCIPLINE).toContain(
      "read each suspect parent with `get_concept` or `get_concepts`",
    );
    expect(PRODUCT_DISCIPLINE).toContain(
      "Spend at most three rounds gathering audit evidence",
    );
    expect(PRODUCT_DISCIPLINE).not.toContain(
      "element — a concrete piece: a library, an API, a schema, a file",
    );
  });

  it("the prompt the model reads has no Hangul, a different channel from on-screen wording", () => {
    expect(PRODUCT_DISCIPLINE).not.toMatch(/[가-힣]/);
  });
});
