import { describe, expect, it } from "vitest";
import {
  BUILD_FM_CASES,
  MISSING_FIELDS_CASES,
  FOLDER_CASES,
  FLAT_SLUG_CASES,
} from "../../fixtures/vault-schema-cases.mjs";
import {
  buildFrontmatter as buildMcp,
  missingExpectedFields as missingMcp,
  folderForKind as folderMcp,
  normalizeLocaleLabels as localeMcp,
  NODE_ELIGIBILITY_GATE as gateMcp,
  flatSlugIssue as flatSlugMcp,
  generateNodeUid as generateUidMcp,
  nodeUidIssue as uidIssueMcp,
  mergeNodeIdentityHistory as mergeIdentityMcp,
  containmentKeyFor as containmentKeyForMcp,
  CONTAINMENT_KEY_FOR_KIND,
  VAULT_KINDS,
  VAULT_KIND_SCHEMA,
} from "../../../mcp/src/schema.mjs";
import {
  CONTAINMENT_KEYS,
  containmentKeyFor as containmentKeyForApp,
  kindForContainmentKey as kindForContainmentKeyApp,
} from "@/shared/lib/vault-document/containment-keys";
import { KIND_EXPECTED_EXTRAS } from "@/shared/lib/vault-document/validate-vault-document";
import { PRODUCT_DISCIPLINE } from "@/features/vault-agent/model/system-prompt";
import {
  CHAT_RULES_DELTA_EN,
  CONSTRUCTION_RULES_EN,
  META_MODEL_RULES_EN,
} from "../../../mcp/src/construction/construction-rules.mjs";
import { KNOWN_VAULT_KINDS } from "../../../mcp/src/validate.mjs";

/**
 * Vault schema contract: `mcp/src/schema.mjs` (the one schema `add_concept` writes with)
 * against fixed cases, cross-checked with KIND_EXPECTED_EXTRAS in
 * src/shared/lib/vault-document/validate-vault-document.ts (the app's advisory).
 */

describe("vault kind schema contract", () => {
  describe("node UID — immutable identity format", () => {
    it("the generator locally issues a new lowercase UUIDv4 on every call", () => {
      const first = generateUidMcp();
      const second = generateUidMcp();

      expect(uidIssueMcp(first)).toBeNull();
      expect(uidIssueMcp(second)).toBeNull();
      // Minted locally per call — never one shared constant.
      expect(first).not.toBe(second);
    });

    it.each([
      ["missing", undefined],
      ["blank", ""],
      ["uppercase", "01890F3E-7B5D-4C0A-8F14-123456789ABC"],
      ["not v4", "01890f3e-7b5d-7c0a-8f14-123456789abc"],
      ["not uuid", "node-12"],
    ])("%s UID is judged invalid", (_name, uid) => {
      expect(uidIssueMcp(uid)).toBeTruthy();
    });

    it("a valid lowercase UUIDv4 passes", () => {
      const uid = "01890f3e-7b5d-4c0a-8f14-123456789abc";
      expect(uidIssueMcp(uid)).toBeNull();
    });

    it("merge preserves the survivor UID and absorbs the source identity history", () => {
      const from = {
        uid: "01890f3e-7b5d-4c0a-8f14-123456789abc",
        merged_uids: ["11890f3e-7b5d-4c0a-8f14-123456789abc"],
      };
      const into = {
        uid: "21890f3e-7b5d-4c0a-8f14-123456789abc",
        merged_uids: ["31890f3e-7b5d-4c0a-8f14-123456789abc"],
      };
      const expected = {
        survivorUid: into.uid,
        absorbedUids: [from.uid, ...from.merged_uids],
        merged_uids: [from.uid, ...from.merged_uids, ...into.merged_uids].sort(),
      };
      expect(mergeIdentityMcp(from, into)).toEqual(expected);
    });
  });

  /*
   * Which list a kind change moves an entry into: the app reclassify and MCP `rename_concept` with `newKind` /
   * `merge_concepts` use two copies of one table, so a drift would move an entry on one surface only.
   */
  describe("containment lists — app and MCP place an entry in the same list", () => {
    const kinds = [...VAULT_KINDS, "vault-readme", "unknown", ""];
    for (const holder of kinds) {
      it(`${holder || "(no kind)"} keeps the same lists`, () => {
        for (const child of kinds) {
          expect(containmentKeyForApp(holder, child), `${holder} → ${child}`).toBe(
            containmentKeyForMcp(holder, child),
          );
        }
      });
    }

    it("names the same kind for every list, and holds spec §5's rows", () => {
      const kindForKeyMcp = (key: string) =>
        Object.entries(CONTAINMENT_KEY_FOR_KIND).find(([, listKey]) => listKey === key)?.[0] ?? null;
      expect(CONTAINMENT_KEYS).toEqual(Object.values(CONTAINMENT_KEY_FOR_KIND));
      for (const key of [...CONTAINMENT_KEYS, "contains", "relates", "domain"]) {
        expect(kindForContainmentKeyApp(key), key).toBe(kindForKeyMcp(key));
      }
      // Spec §5: a project or domain keeps capabilities; a capability keeps elements and never
      // capabilities (a same-kind bridge is a person's decision, not a rewrite's).
      expect(containmentKeyForMcp("domain", "element")).toBe("elements");
      expect(containmentKeyForMcp("capability", "capability")).toBeNull();
      expect(containmentKeyForMcp("domain", "domain")).toBeNull();
      expect(containmentKeyForMcp("project", "domain")).toBe("domains");
      expect(containmentKeyForMcp("project", "document")).toBeNull();
    });
  });

  it("capability path is the canonical implementation basis for both write paths", () => {
    expect(VAULT_KIND_SCHEMA.capability.optional.length).toBeGreaterThan(0);
    expect(VAULT_KIND_SCHEMA.capability.optional).toContain("path");
    expect(VAULT_KIND_SCHEMA.capability.preferredOrder.indexOf("path")).toBeGreaterThan(
      VAULT_KIND_SCHEMA.capability.preferredOrder.indexOf("elements"),
    );
  });

  describe("buildFrontmatter", () => {
    for (const c of BUILD_FM_CASES) {
      it(`${c.name} (mcp)`, () => {
        expect(buildMcp(c.input)).toEqual(c.expected);
      });
    }
  });

  describe("missingExpectedFields", () => {
    for (const c of MISSING_FIELDS_CASES) {
      it(`${c.name} (mcp)`, () => {
        expect(missingMcp(c.kind, c.frontmatter)).toEqual(c.expected);
      });
    }
  });

  describe("folderForKind", () => {
    for (const c of FOLDER_CASES) {
      it(`${c.kind} (mcp)`, () => {
        expect(folderMcp(c.kind)).toBe(c.expected);
      });
    }
  });

  describe("flatSlugIssue: a slug is a flat identifier (decided 2026-08-01)", () => {
    for (const c of FLAT_SLUG_CASES) {
      it(`${c.name} (mcp)`, () => {
        const issue = flatSlugMcp(c.kind, c.slug);
        if (c.expected === null) expect(issue).toBeNull();
        else expect(issue).toBeTruthy();
      });
    }
  });

  describe("UI KIND_EXPECTED_EXTRAS aligns with mcp requiredExtras", () => {
    // The UI dictionary must produce the same missing-fields decision as mcp.
    // Both capability and element expect ['domain'].
    it("capability requires domain", () => {
      expect(KIND_EXPECTED_EXTRAS.capability).toEqual(["domain"]);
      expect(missingMcp("capability", { slug: "x", kind: "capability", title: "X" })).toEqual([
        "domain",
      ]);
    });
    it("element requires domain", () => {
      expect(KIND_EXPECTED_EXTRAS.element).toEqual(["domain"]);
      expect(missingMcp("element", { slug: "x", kind: "element", title: "X" })).toEqual([
        "domain",
      ]);
    });
    it("project / domain / document have no extras", () => {
      expect(KIND_EXPECTED_EXTRAS.project).toEqual([]);
      expect(KIND_EXPECTED_EXTRAS.domain).toEqual([]);
      expect(KIND_EXPECTED_EXTRAS.document).toEqual([]);
    });
  });
});

// Per-locale display names land as display_<locale> keys.
describe("display_<locale> normalization", () => {
  it("emits display_<locale> keys", () => {
    const args = {
      uid: "31890f3e-7b5d-4c0a-8f14-123456789abc",
      slug: "domains/payment",
      kind: "domain",
      title: "결제",
      ...localeMcp({ ko: "결제", en: "Payments" }),
    };
    expect(buildMcp(args)).toMatchObject({ display_ko: "결제", display_en: "Payments" });
  });
});

/**
 * Value authority for the node qualification gate. The logic lives in `commitDoc` (`mcp/src/vault/`)
 * and the text in `mcp/src/construction/construction-rules.mjs`.
 */
describe("node qualification gate constants: the value source", () => {
  it("locked values", () => {
    // Unresolved references are reported from the first one — an unresolved item is not
    // a "small child" but a different category (evidence), so there is no tolerable count.
    expect(gateMcp.NOTICE_THRESHOLD).toBe(1);
    // Fires once at the threshold and then only at multiples. Repeating on every write
    // makes the reader filter the channel out.
    expect(gateMcp.NOTICE_REPEAT_MULTIPLE).toBe(10);
    expect(gateMcp.BULK_PROVENANCE_SIBLING_TRIGGER).toBe(5);
    expect(gateMcp.REFERENCE_SAMPLE_LIMIT).toBe(5);
  });

  // The researched starting range is a trigger, not a hard cap, and steps aside once a vault has grown
  // enough to produce its own p90.
  it("the bootstrap trigger is 8/6 and there is no project to domain", () => {
    expect(gateMcp.BOOTSTRAP_FANOUT_TRIGGER).toEqual({
      domain_to_capability: 8,
      capability_to_element: 6,
    });
    // Deliberately empty because the sample is meaningless. A value appearing here was invented without evidence.
    expect(gateMcp.BOOTSTRAP_FANOUT_TRIGGER).not.toHaveProperty("project_to_domain");
    expect(gateMcp.MIN_PARENTS_FOR_LIVE_PERCENTILE).toBe(10);
    // The threshold that keeps fully-resolved broad parents (schema.org CreativeWork
    // shape) untouched. Without it the density warning fires on every legitimate large
    // fan-out, and a channel that cries is filtered out — which is how a fan-out cap
    // returns through the side door.
    expect(gateMcp.DENSE_PARENT_RESOLUTION_FLOOR).toBe(0.7);
  });

  it("nested constants are frozen too, since Object.freeze is shallow", () => {
    expect(Object.isFrozen(gateMcp.BOOTSTRAP_FANOUT_TRIGGER)).toBe(true);
  });

  it("no value is a cap on child count, since the council rejected a cap in every form", () => {
    // What this test protects is the *meaning*, not the number. A name of the "keep it
    // under N" kind appearing in this block is the fan-out cap returning under a new
    // name, and a model will satisfy that metric with two empty buckets.
    for (const key of Object.keys(gateMcp)) {
      expect(key).not.toMatch(/MAX|LIMIT_PER|CAP|CHILDREN/i);
    }
  });
});

/**
 * Three-way check on the construction-rules text, mcp authority against the in-app chat prompt: `src/`
 * and `mcp/` are separate packages that cannot cross-import, so the text exists as literal copies.
 */
describe("construction spec text 3-way: mcp canonical to app chat prompt", () => {
  it("the full procedure is carried byte for byte", () => {
    expect(PRODUCT_DISCIPLINE).toContain(CONSTRUCTION_RULES_EN);
  });

  it("the chat-only delta is carried byte for byte too", () => {
    expect(PRODUCT_DISCIPLINE).toContain(CHAT_RULES_DELTA_EN);
  });

  it("the point of the delta: before calling a tool, tell the person first", () => {
    // MCP returns structured warnings to a program; chat speaks to a person. Without
    // this sentence the app quietly restructures the user's ontology and records it
    // only where the user will not look.
    expect(CHAT_RULES_DELTA_EN).toContain("say so in the conversation first");
    expect(PRODUCT_DISCIPLINE).toContain("say so in the conversation first");
  });

  it("the meta-model boundary is carried byte for byte and separates authorable from reserved", () => {
    expect(PRODUCT_DISCIPLINE).toContain(META_MODEL_RULES_EN);
    // The schema decides project's ownership scope. A prompt saying "domains only"
    // stops the agent proposing a capability or element directly under it.
    expect(VAULT_KIND_SCHEMA.project.arrayDefaults).toEqual([
      "domains",
      "capabilities",
      "elements",
    ]);
    expect(VAULT_KINDS).toEqual([
      "project",
      "domain",
      "capability",
      "element",
      "document",
    ]);
    expect(PRODUCT_DISCIPLINE).toContain("Atlas has five authorable kinds");
    // `vault-readme` is generated-only and no agent may propose it. The MCP guidance
    // carried this warning; the chat prompt did not.
    expect(KNOWN_VAULT_KINDS).toContain("vault-readme");
    expect(PRODUCT_DISCIPLINE).toContain("`vault-readme` is a reserved reader kind");
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
