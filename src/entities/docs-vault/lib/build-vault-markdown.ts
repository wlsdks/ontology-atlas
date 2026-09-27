/** Serializes a new ontology node to vault markdown; edits to existing nodes use the patch path. */

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

/** Quotes a YAML scalar, folding newlines to `
`; four writers must agree on this rule. */
function quoteYamlScalar(v: string): string {
  // Boolean- and number-shaped strings are quoted, or they read back retyped.
  if (v === 'true' || v === 'false' || (v !== '' && !Number.isNaN(Number(v)))) {
    return `"${v}"`;
  }
  if (!/[:,#[\]{}"'&|*!%@`\n\t]|^\s|\s$/.test(v)) return v;
  const escaped = v
    .replace(/\\/g, '\\\\')
    .replace(/"/g, '\\"')
    .replace(/\n/g, '\\n')
    .replace(/\t/g, '\\t');
  return `"${escaped}"`;
}

/**
 * `created_by` mirrors `mcp/src/schema.mjs` (`created-by-provenance.contract.test.ts`). Values are
 * `human` and `agent:<name>`; absence is unknown and never filled in as a person.
 */
const VAULT_CREATED_BY_KEY = "created_by";
export const VAULT_CREATED_BY_HUMAN = "human";
const VAULT_CREATED_BY_AGENT_PREFIX = "agent:";
const VAULT_CREATED_BY_AGENT_UNKNOWN = `${VAULT_CREATED_BY_AGENT_PREFIX}unknown`;

/** An unknown name becomes `agent:unknown`, still not a person. */
export function vaultAgentCreatedBy(agentName: string | null | undefined): string {
  const name = typeof agentName === "string" ? agentName.trim() : "";
  return name ? `${VAULT_CREATED_BY_AGENT_PREFIX}${name}` : VAULT_CREATED_BY_AGENT_UNKNOWN;
}

export function buildVaultMarkdown(args: {
  /** Set only by tests and explicit restores; creation mints a fresh UUIDv4. */
  uid?: string;
  kind: string;
  title: string;
  slug: string;
  /** Omitted when absent. */
  domain?: string;
  /** `{ ko, en }` → `display_ko` / `display_en`; `title` stays the search truth. */
  localeLabels?: Record<string, string>;
  /** Only the actor the writing path proves; omit when unknown. */
  createdBy?: string;
}): string {
  const lines = ["---"];
  lines.push(`uid: ${generateNodeUid(args.uid)}`);
  lines.push(`slug: ${args.slug}`);
  lines.push(`kind: ${args.kind}`);
  // One canonical `domains/<name>` spelling so every writer agrees.
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
  // Quoted exactly as the MCP writer quotes it, so both produce the same bytes.
  if (createdBy) lines.push(`${VAULT_CREATED_BY_KEY}: ${quoteYamlScalar(createdBy)}`);
  lines.push("---");
  lines.push("");
  lines.push(`# ${args.title}`);
  lines.push("");
  return lines.join("\n");
}

/** Plural vault folder for a kind; `${kind}s` for anything unlisted. */
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

/** New node document: slug `${folder}/${slugify(title)}`; throws when no slug can be made. */
export function buildNewNodeDoc(args: {
  uid?: string;
  title: string;
  kind: string;
  domain?: string;
  localeLabels?: Record<string, string>;
  /** `human` from the on-screen create path, which proves a person; omitted means unknown. */
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
