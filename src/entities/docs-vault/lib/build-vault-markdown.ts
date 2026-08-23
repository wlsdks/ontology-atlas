/**
 * Serializes an ontology node into a vault `.md` string — the inverse of
 * `parseFrontmatter`.
 *
 * Kept at the entity layer so several views reuse one serializer without
 * cross-view imports. It writes the minimal shape (slug/kind/title frontmatter
 * plus a `# title` body); editing an *existing* node — which must preserve rich
 * frontmatter and the existing body — goes through the separate patch path.
 */

import { slugify } from "@/shared/lib/slugify";
import { canonicalizeDomainRef } from "@/shared/lib/canonicalize-domain-ref";

const NODE_UID_PATTERN =
  /^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/;

export function generateNodeUid(uid?: string): string {
  const resolved = uid ?? globalThis.crypto.randomUUID();
  if (!NODE_UID_PATTERN.test(resolved)) {
    throw new Error(`uid must be a lowercase UUIDv4: ${resolved}`);
  }
  return resolved;
}

/**
 * Quotes a YAML scalar safely — **four places must agree on the answer.**
 *
 * Reviewed and reproduced 2026-08-16: newline was missing from the rule. That one
 * character destroys the whole frontmatter block — `note\nkind: element` **changes
 * the node's kind**, and `note\n---\nx: 1` ends the frontmatter there. Quoting
 * alone does not help once the line is already broken, so newlines are folded to
 * `\n` and the reader unfolds them.
 */
function quoteYamlScalar(v: string): string {
  if (!/[:,#[\]{}"'&|*!%@`\n\t]|^\s|\s$/.test(v)) return v;
  const escaped = v
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/**
 * The web-side constants for authorship (`created_by`) — 2026-07-31 ledger entry.
 * The source of truth is `mcp/src/schema.mjs` (mirrored in `cli/src/lib/schema.mjs`),
 * and `tests/contract/created-by-provenance.contract.test.ts` catches the three
 * copies drifting apart. The only values are `human` and `agent:<name>`, and
 * **absence is unknown, not a defect** — no path fills it in as a person.
 */
export const VAULT_CREATED_BY_KEY = "created_by";
export const VAULT_CREATED_BY_HUMAN = "human";
const VAULT_CREATED_BY_AGENT_PREFIX = "agent:";
export const VAULT_CREATED_BY_AGENT_UNKNOWN = `${VAULT_CREATED_BY_AGENT_PREFIX}unknown`;

/** Agent name → `agent:<name>`. An unknown name becomes `agent:unknown` — still not a person. */
export function vaultAgentCreatedBy(agentName: string | null | undefined): string {
  const name = typeof agentName === "string" ? agentName.trim() : "";
  return name ? `${VAULT_CREATED_BY_AGENT_PREFIX}${name}` : VAULT_CREATED_BY_AGENT_UNKNOWN;
}

export function buildVaultMarkdown(args: {
  /** Permanent node identity. Injected only by tests and explicit restores; normal creation mints a fresh UUIDv4. */
  uid?: string;
  kind: string;
  title: string;
  slug: string;
  /** The `domain:` key for nodes with a parent domain (capability, element).
   *  Omitted entirely when absent, keeping output byte-identical. */
  domain?: string;
  /**
   * Per-locale display names (owner instruction, 2026-07-24) —
   * `{ ko: "Payment", en: "Payments" }` becomes `display_ko:` / `display_en:` keys.
   * Omitted when absent. `title` stays untouched as the single source of truth for
   * search and matching.
   */
  localeLabels?: Record<string, string>;
  /**
   * Authorship — pass only the actor the **writing path itself proves** (`human`
   * or `agent:<name>`). When unknown, pass nothing: an absent key is the honest
   * expression of unknown, and guessing "a person" is the retroactive inference
   * the 2026-07-31 ledger entry forbids.
   */
  createdBy?: string;
}): string {
  const lines = ["---"];
  lines.push(`uid: ${generateNodeUid(args.uid)}`);
  lines.push(`slug: ${args.slug}`);
  lines.push(`kind: ${args.kind}`);
  // One canonical `domain:` serialization (the bare tail slug) so every writer
  // agrees and analytics do not split one domain across two keys.
  const domain = canonicalizeDomainRef(args.domain);
  if (domain) lines.push(`domain: ${quoteYamlScalar(domain)}`);
  lines.push(`title: ${quoteYamlScalar(args.title)}`);
  for (const [locale, value] of Object.entries(args.localeLabels ?? {})) {
    if (!/^[a-z]{2}$/.test(locale)) continue;
    const trimmed = value.trim();
    if (!trimmed) continue;
    lines.push(`display_${locale}: ${quoteYamlScalar(trimmed)}`);
  }
  const createdBy = args.createdBy?.trim();
  // `agent:<name>` contains a colon, and it must be quoted exactly as the MCP-side
  // writer quotes it, or the two surfaces produce different bytes for one file.
  if (createdBy) lines.push(`${VAULT_CREATED_BY_KEY}: ${quoteYamlScalar(createdBy)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${args.title}`);
  lines.push("");
  return lines.join("\n");
}

/**
 * kind → vault folder (plural). One rule for the dogfood vault and every write
 * path: capability→capabilities, element→elements, domain→domains,
 * project→projects, anything else `${kind}s`.
 */
export function vaultFolderForKind(kind: string): string {
  switch (kind) {
    case "capability":
      return "capabilities";
    case "element":
      return "elements";
    case "domain":
      return "domains";
    case "project":
      return "projects";
    default:
      return `${kind}s`;
  }
}

/**
 * Builds the vault document (slug + markdown) for a new ontology node.
 * slug = `${folder}/${slugify(title)}`. Throws when the title is empty or cannot
 * be reduced to a slug. The caller writes it with `createDoc(slug, markdown)`.
 */
export function buildNewNodeDoc(args: {
  uid?: string;
  title: string;
  kind: string;
  domain?: string;
  localeLabels?: Record<string, string>;
  /**
   * Authorship — a node a person created by hand on screen is `human`
   * (2026-07-31 ledger convention, wired 2026-08-03).
   *
   * The stamp is applied **at write time, and only for the actor the calling path
   * proves**. This function is reached only from "create concept" on screen, which
   * proves a person. Omitted means unstamped, and absence is unknown — that is the
   * ledger's contract.
   */
  createdBy?: string;
}): { slug: string; markdown: string } {
  const title = args.title.trim();
  if (!title) throw new Error("title must not be empty");
  const tail = slugify(title);
  if (!tail) throw new Error("title produced an empty slug");
  const slug = `${vaultFolderForKind(args.kind)}/${tail}`;
  const markdown = buildVaultMarkdown({
    uid: args.uid,
    kind: args.kind,
    title,
    slug,
    domain: args.domain,
    localeLabels: args.localeLabels,
    createdBy: args.createdBy,
  });
  return { slug, markdown };
}
